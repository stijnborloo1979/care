/**
 * De beltoon voor een inkomende oproep.
 *
 * Zonder geluidsbestand: twee zachte tonen uit de Web Audio API. Dat
 * scheelt een download op een tablet met hikkende wifi, en het klinkt
 * gelijk op elk toestel.
 *
 * Browsers laten geluid pas toe nadat iemand het scherm één keer heeft
 * aangeraakt. Daarom wordt de audiocontext bij de eerste aanraking al
 * klaargezet, lang voor er iemand belt.
 */

let ctx: AudioContext | null = null
let timer: number | null = null

type AudioContextCtor = typeof AudioContext

function maakContext(): AudioContext | null {
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    return new Ctor()
  } catch {
    return null
  }
}

/**
 * Bij elke aanraking opnieuw proberen. Eén keer volstaat niet: een browser
 * mag een audiocontext later weer stilleggen, bijvoorbeeld nadat de app
 * een tijd op de achtergrond stond.
 */
export function ontgrendelGeluid() {
  if (!ctx) ctx = maakContext()
  if (ctx?.state !== 'running') void ctx?.resume()
}

function toon(start: number, hz: number, duur: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = hz

  // Zacht in- en uitvloeien: een blokgolf die abrupt begint, klinkt als
  // een tik en schrikt iemand op.
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.06)
  gain.gain.setValueAtTime(0.22, start + duur - 0.08)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duur)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duur + 0.02)
}

function rinkelEens() {
  if (!ctx) ctx = maakContext()
  if (!ctx) return
  if (ctx.state !== 'running') {
    void ctx.resume()
    return
  }
  const nu = ctx.currentTime
  toon(nu, 660, 0.4)
  toon(nu + 0.5, 880, 0.5)
  // Trillen waar het toestel dat kan; iPhone en iPad doen dit niet.
  try {
    navigator.vibrate?.([400, 200, 500])
  } catch {
    // Mag niet van de browser: dan alleen geluid.
  }
}

/**
 * Blijft herhalen tot stopBeltoon().
 *
 * Niet afhaken als de context nog niet speelt: resume() duurt even, en
 * dan zou de eerste oproep na het opstarten stil blijven. We zetten de
 * herhaling gewoon aan; elke beurt probeert opnieuw.
 */
export function startBeltoon() {
  if (timer !== null) return
  ontgrendelGeluid()
  void ctx?.resume().then(rinkelEens)
  rinkelEens()
  timer = window.setInterval(rinkelEens, 2600)
}

/** Twee tonen, voor de knop "Beltoon proberen". */
export function testBeltoon() {
  ontgrendelGeluid()
  void ctx?.resume().then(rinkelEens)
}

export function stopBeltoon() {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
  try {
    navigator.vibrate?.(0)
  } catch {
    // Niets aan te doen.
  }
}
