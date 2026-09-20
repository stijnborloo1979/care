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

/**
 * De verbinding loopt rechtstreeks tussen de twee toestellen. Lukt dat
 * niet, dan is een TURN-server nodig: zet die in de omgeving en hij wordt
 * vanzelf gebruikt. Zonder TURN werkt het op de meeste thuisnetwerken,
 * maar niet op elk mobiel netwerk.
 */
function ijsservers(): RTCIceServer[] {
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
  return servers
}

export function heeftTurn() {
  return !!import.meta.env.VITE_TURN_URL
}

type Signaal =
  | { soort: 'offer'; sdp: RTCSessionDescriptionInit }
  | { soort: 'answer'; sdp: RTCSessionDescriptionInit }
  | { soort: 'ice'; kandidaat: RTCIceCandidateInit }
  | { soort: 'hangup' }

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
  // Kandidaten die binnenkomen voor de beschrijving er is, moeten wachten.
  const wachtendRef = useRef<RTCIceCandidateInit[]>([])

  const stop = useCallback(() => {
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

      const pc = new RTCPeerConnection({ iceServers: ijsservers() })
      pcRef.current = pc
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      pc.ontrack = (e) => {
        if (externRef.current) externRef.current.srcObject = e.streams[0]
        setState('active')
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setState('active')
        if (pc.connectionState === 'failed') {
          setState('failed')
          setFout(
            heeftTurn()
              ? 'De verbinding kwam niet tot stand. Probeer het opnieuw.'
              : 'De verbinding kwam niet tot stand. Op dit netwerk is een TURN-server nodig.',
          )
        }
      }

      const kanaal = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false } } })
      kanaalRef.current = kanaal

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          kanaal.send({
            type: 'broadcast',
            event: 'signaal',
            payload: { soort: 'ice', kandidaat: e.candidate.toJSON() },
          })
        }
      }

      kanaal.on('broadcast', { event: 'signaal' }, async ({ payload }) => {
        const s = payload as Signaal
        try {
          if (s.soort === 'offer' && rol === 'ontvanger') {
            await pc.setRemoteDescription(new RTCSessionDescription(s.sdp))
            for (const k of wachtendRef.current) await pc.addIceCandidate(k)
            wachtendRef.current = []
            const antwoord = await pc.createAnswer()
            await pc.setLocalDescription(antwoord)
            kanaal.send({
              type: 'broadcast',
              event: 'signaal',
              payload: { soort: 'answer', sdp: antwoord },
            })
          } else if (s.soort === 'answer' && rol === 'beller') {
            await pc.setRemoteDescription(new RTCSessionDescription(s.sdp))
            for (const k of wachtendRef.current) await pc.addIceCandidate(k)
            wachtendRef.current = []
          } else if (s.soort === 'ice') {
            if (pc.remoteDescription) await pc.addIceCandidate(s.kandidaat)
            else wachtendRef.current.push(s.kandidaat)
          } else if (s.soort === 'hangup') {
            stop()
            setState('ended')
          }
        } catch {
          setFout('Er ging iets mis met de verbinding.')
          setState('failed')
        }
      })

      kanaal.subscribe(async (status) => {
        // De beller doet het voorstel, maar pas als het kanaal echt open
        // staat. Eerder sturen betekent dat de andere kant het mist.
        if (status === 'SUBSCRIBED' && rol === 'beller') {
          const voorstel = await pc.createOffer()
          await pc.setLocalDescription(voorstel)
          kanaal.send({
            type: 'broadcast',
            event: 'signaal',
            payload: { soort: 'offer', sdp: voorstel },
          })
        }
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
