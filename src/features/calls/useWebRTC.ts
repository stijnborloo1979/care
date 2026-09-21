import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export type CallState = 'idle' | 'ringing' | 'connecting' | 'active' | 'ended' | 'failed'

export interface ActiveCall {
  id: string
  caller_id: string | null
  caller_name: string | null
  status: string
  started_at: string
}

export const GEEN_TURN = 'thuis.geen-turn'

/**
 * Welke servers helpen de twee toestellen elkaar te vinden.
 *
 * STUN laat een toestel zijn publieke adres ontdekken. Zonder STUN kennen
 * de toestellen alleen hun lokale adres, en werkt bellen enkel als ze op
 * hetzelfde wifi zitten. Er gaat geen beeld of geluid via een STUN-server.
 *
 * TURN geeft het beeld door wanneer een rechtstreekse verbinding niet
 * lukt, zoals op 4G en 5G. Het blijft versleuteld van toestel tot
 * toestel; de TURN-server kan niets zien of horen.
 */
export async function ijsservers(): Promise<RTCIceServer[]> {
  // 1. Tijdelijke TURN-gegevens via de edge function, als die bestaat.
  if (sessionStorage.getItem(GEEN_TURN) !== '1') {
    try {
      const { data, error } = await supabase.functions.invoke('turn-credentials')
      const lijst = data?.iceServers as RTCIceServer[] | null | undefined
      if (!error && Array.isArray(lijst) && lijst.length > 0) return lijst
      sessionStorage.setItem(GEEN_TURN, '1')
    } catch {
      // Niet ingesteld: deze sessie niet opnieuw proberen.
      sessionStorage.setItem(GEEN_TURN, '1')
    }
  }

  // 2. Vaste gegevens uit de omgeving, als die gezet zijn.
  const servers: RTCIceServer[] = []
  const stun = import.meta.env.VITE_STUN_URL
  const turn = import.meta.env.VITE_TURN_URL
  if (stun) servers.push({ urls: stun })
  if (turn) {
    servers.push({
      urls: turn,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    })
  }

  // 3. Altijd minstens een STUN-server. Zonder was bellen buiten hetzelfde
  //    wifi-netwerk onmogelijk.
  if (!stun) servers.push({ urls: 'stun:stun.cloudflare.com:3478' })
  return servers
}

export function heeftTurn() {
  return !!import.meta.env.VITE_TURN_URL || sessionStorage.getItem(GEEN_TURN) !== '1'
}

/** Wacht tot alle verbindingsmogelijkheden verzameld zijn, hoogstens even. */
function wachtOpKandidaten(pc: RTCPeerConnection, ms = 3000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((klaar) => {
    const t = window.setTimeout(klaar, ms)
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        window.clearTimeout(t)
        klaar()
      }
    })
  })
}

type Signaal =
  | { soort: 'klaar' }
  | { soort: 'offer'; sdp: RTCSessionDescriptionInit }
  | { soort: 'answer'; sdp: RTCSessionDescriptionInit }
  | { soort: 'hangup' }

/**
 * Het afspreken van de verbinding loopt over een Realtime-kanaal. Dat
 * kanaal bewaart niets: een bericht dat verstuurd wordt voor de andere
 * kant luistert, is weg.
 *
 * Precies daar liep het mis. De beller stuurde zijn voorstel meteen, maar
 * de ontvanger begon pas te luisteren nadat hij had opgenomen — seconden
 * later. Het voorstel was dan al verdwenen, en beide kanten bleven op
 * "Verbinden…" staan. Dat het soms wel lukte, was geluk met de timing.
 *
 * Nu meldt de ontvanger eerst "klaar", en herhaalt dat tot hij een
 * voorstel heeft. De beller stuurt zijn voorstel pas als hij dat hoort, en
 * herhaalt het tot er een antwoord is. Alle verbindingsmogelijkheden gaan
 * in één keer mee in het voorstel en het antwoord, zodat er onderweg geen
 * losse berichten meer verloren kunnen gaan.
 */
export function useWebRTC(callId: string | null, rol: 'beller' | 'ontvanger') {
  const [state, setState] = useState<CallState>('idle')
  const [fout, setFout] = useState<string | null>(null)
  const [microfoonAan, setMicrofoonAan] = useState(true)
  const [cameraAan, setCameraAan] = useState(true)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const kanaalRef = useRef<RealtimeChannel | null>(null)
  const lokaalRef = useRef<HTMLVideoElement | null>(null)
  const externRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timersRef = useRef<number[]>([])

  const stop = useCallback(() => {
    timersRef.current.forEach((t) => window.clearInterval(t))
    timersRef.current = []
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    if (kanaalRef.current) {
      supabase.removeChannel(kanaalRef.current)
      kanaalRef.current = null
    }
  }, [])

  const hangUp = useCallback(() => {
    kanaalRef.current?.send({ type: 'broadcast', event: 'signaal', payload: { soort: 'hangup' } })
    stop()
    setState('ended')
  }, [stop])

  useEffect(() => {
    if (!callId) return
    let afgebroken = false

    function stuur(payload: Signaal) {
      kanaalRef.current?.send({ type: 'broadcast', event: 'signaal', payload })
    }

    function herhaal(fn: () => void, ms: number, maxMs = 30_000) {
      const start = Date.now()
      const id = window.setInterval(() => {
        if (Date.now() - start > maxMs) window.clearInterval(id)
        else fn()
      }, ms)
      timersRef.current.push(id)
      return id
    }

    async function opzetten() {
      setFout(null)
      setState('connecting')

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        })
      } catch {
        setFout('Camera of microfoon is geblokkeerd. Zet ze aan in de browser.')
        setState('failed')
        return
      }
      if (afgebroken) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      if (lokaalRef.current) lokaalRef.current.srcObject = stream

      const pc = new RTCPeerConnection({ iceServers: await ijsservers() })
      if (afgebroken) {
        pc.close()
        return
      }
      pcRef.current = pc
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      pc.ontrack = (e) => {
        if (externRef.current) externRef.current.srcObject = e.streams[0]
      }

      // Oudere Safari-versies melden connectionState niet altijd; de
      // ICE-status wel. Beide kijken, dan mis je geen van de twee.
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setState('active')
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setState('active')
        if (pc.connectionState === 'failed') {
          setState('failed')
          setFout(
            'De verbinding kwam niet tot stand. Op mobiel internet (4G of 5G) is daarvoor een TURN-server nodig.',
          )
        }
      }

      // Geen verbinding na 25 seconden: dan zeggen we dat, in plaats van
      // eindeloos "Verbinden…" te tonen.
      const wachttijd = window.setTimeout(() => {
        if (pc.connectionState !== 'connected') {
          setState('failed')
          setFout(
            'Het gesprek kwam niet tot stand. Zitten jullie op verschillende netwerken of op 4G/5G, dan is een TURN-server nodig.',
          )
        }
      }, 25_000)
      timersRef.current.push(wachttijd)

      let voorstel: RTCSessionDescriptionInit | null = null
      let antwoord: RTCSessionDescriptionInit | null = null

      const kanaal = supabase.channel(`call:${callId}`, {
        config: { broadcast: { self: false } },
      })
      kanaalRef.current = kanaal

      kanaal.on('broadcast', { event: 'signaal' }, async ({ payload }) => {
        const s = payload as Signaal
        try {
          if (rol === 'beller' && s.soort === 'klaar') {
            if (!voorstel) {
              await pc.setLocalDescription(await pc.createOffer())
              await wachtOpKandidaten(pc)
              voorstel = pc.localDescription!.toJSON()
              stuur({ soort: 'offer', sdp: voorstel })
              // Blijf het voorstel herhalen tot er een antwoord is.
              herhaal(() => {
                if (pc.signalingState === 'have-local-offer' && voorstel) {
                  stuur({ soort: 'offer', sdp: voorstel })
                }
              }, 2000)
            } else if (pc.signalingState === 'have-local-offer') {
              stuur({ soort: 'offer', sdp: voorstel })
            }
          } else if (rol === 'ontvanger' && s.soort === 'offer') {
            if (!pc.remoteDescription) {
              await pc.setRemoteDescription(s.sdp)
              await pc.setLocalDescription(await pc.createAnswer())
              await wachtOpKandidaten(pc)
              antwoord = pc.localDescription!.toJSON()
            }
            // Ook bij een herhaald voorstel: het antwoord kan onderweg
            // verloren zijn gegaan.
            if (antwoord) stuur({ soort: 'answer', sdp: antwoord })
          } else if (rol === 'beller' && s.soort === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(s.sdp)
            }
          } else if (s.soort === 'hangup') {
            stop()
            setState('ended')
          }
        } catch {
          setFout('Er ging iets mis met de verbinding.')
          setState('failed')
        }
      })

      kanaal.subscribe((status) => {
        if (status !== 'SUBSCRIBED' || rol !== 'ontvanger') return
        // De ontvanger meldt dat hij luistert, en herhaalt dat tot er een
        // voorstel binnen is. Zo maakt het niet uit wie eerst klaar is.
        stuur({ soort: 'klaar' })
        herhaal(() => {
          if (!pc.remoteDescription) stuur({ soort: 'klaar' })
        }, 1500)
      })
    }

    opzetten()

    return () => {
      afgebroken = true
      stop()
    }
  }, [callId, rol, stop])

  function zetMicrofoon(aan: boolean) {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = aan))
    setMicrofoonAan(aan)
  }

  function zetCamera(aan: boolean) {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = aan))
    setCameraAan(aan)
  }

  return {
    state,
    fout,
    lokaalRef,
    externRef,
    hangUp,
    microfoonAan,
    cameraAan,
    zetMicrofoon,
    zetCamera,
  }
}
