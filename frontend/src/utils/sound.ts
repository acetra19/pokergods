let audioCtx: AudioContext | null = null;
let muted = false;
let debug = (() => { try { return localStorage.getItem('soundDebug') === '1' } catch { return false } })()
type SoundProfile = 'subtle' | 'classic'
let profile: SoundProfile = (() => {
  try { return (localStorage.getItem('soundProfile') as SoundProfile) || 'subtle' } catch { return 'subtle' }
})()

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    audioCtx = new Ctx();
  }
  return audioCtx as AudioContext;
}

function beep(frequency: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.02) {
  if (muted) return;
  const ctx = getCtx();
  try { if (ctx.state !== 'running') { ctx.resume().catch(()=>{}) } } catch {}
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;

  const scale = profile === 'subtle' ? 0.65 : 1.0;
  const now = ctx.currentTime;
  const startAt = now + 0.006; // leicht in die Zukunft schedulen, damit resume greift
  const dur = Math.max(0.05, durationMs / 1000); // Mindestdauer 50ms, sonst zu leise
  const target = Math.max(0.0001, gain * scale);
  // Envelope: quick attack, short release
  g.gain.cancelScheduledValues(startAt);
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.linearRampToValueAtTime(target, startAt + Math.min(0.02, dur * 0.25));
  g.gain.linearRampToValueAtTime(0.0001, startAt + dur);

  // connect directly (lowpass removed to avoid browser/driver quirks)
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.01);
}

export function playChip() {
  // softer, dezent doppeltick
  if (debug) console.debug('[sound] playChip', { profile });
  if (profile === 'subtle') {
    beep(260, 30, 'sine', 0.02);
    setTimeout(() => beep(300, 24, 'sine', 0.018), 38);
  } else {
    beep(260, 34, 'triangle', 0.022);
    setTimeout(() => beep(320, 28, 'square', 0.02), 42);
  }
}

export function playDeal() {
  // kurzer, weicher Impuls
  if (debug) console.debug('[sound] playDeal', { profile });
  if (profile === 'subtle') {
    beep(380, 22, 'sine', 0.015);
  } else {
    beep(480, 26, 'triangle', 0.018);
  }
}

// Shuffle samples rotation
const shuffleSamples = [
  new Audio('/src/sounds/shuffle1.mp3'),
  new Audio('/src/sounds/shuffle2.mp3'),
  new Audio('/src/sounds/shuffle3.mp3'),
  new Audio('/src/sounds/shuffle4.mp3'),
  new Audio('/src/sounds/shuffle5.mp3'),
];
function randIndex(max: number): number { try { return Math.floor(Math.random() * max) } catch { return 0 } }
export function playShuffle() {
  try {
    if (muted) return;
    const a = shuffleSamples[randIndex(shuffleSamples.length)];
    a.volume = 0.3;
    a.currentTime = 0;
    a.play().catch(()=>{});
  } catch {}
}

export function playClick() {
  if (debug) console.debug('[sound] playClick', { profile });
  if (profile === 'subtle') {
    beep(520, 24, 'sine', 0.014);
  } else {
    beep(640, 28, 'square', 0.018);
  }
}

export function playCheck() {
  // eigener, bläulich angehauchter „soft chime“ für Check
  if (debug) console.debug('[sound] playCheck', { profile });
  if (profile === 'subtle') {
    beep(420, 30, 'sine', 0.016);
    setTimeout(() => beep(560, 35, 'sine', 0.016), 46);
  } else {
    beep(392, 36, 'triangle', 0.02);
    setTimeout(() => beep(523, 42, 'triangle', 0.02), 50);
  }
}

export function playWin() {
  // dezentes kurzes Intervall
  if (debug) console.debug('[sound] playWin', { profile });
  if (profile === 'subtle') {
    beep(500, 90, 'sine', 0.018);
    setTimeout(() => beep(650, 110, 'sine', 0.018), 110);
  } else {
    beep(523, 110, 'triangle', 0.022);
    setTimeout(() => beep(659, 130, 'triangle', 0.022), 120);
  }
}

export function playLose() {
  // kurzes absteigendes Intervall
  if (debug) console.debug('[sound] playLose', { profile });
  if (profile === 'subtle') {
    beep(420, 90, 'sine', 0.018);
    setTimeout(() => beep(320, 110, 'sine', 0.018), 110);
  } else {
    beep(392, 110, 'triangle', 0.022);
    setTimeout(() => beep(294, 130, 'triangle', 0.022), 120);
  }
}

export function playWarnTick() {
  // dezent, aber auffällig; kurzer Tick
  if (debug) console.debug('[sound] playWarnTick', { profile });
  if (profile === 'subtle') {
    beep(700, 18, 'sine', 0.014);
  } else {
    beep(820, 22, 'square', 0.018);
  }
}

export function playBankStart() {
  // leicht anderes Timbre, etwas tiefer
  if (debug) console.debug('[sound] playBankStart', { profile });
  if (profile === 'subtle') {
    beep(340, 70, 'sine', 0.014);
  } else {
    beep(380, 90, 'triangle', 0.02);
  }
}

export function playOverlayCue() {
  // kurzer, eindeutiger Cue vor dem Match-Overlay (nach River)
  if (debug) console.debug('[sound] playOverlayCue', { profile });
  if (profile === 'subtle') {
    beep(420, 70, 'sine', 0.016);
    setTimeout(() => beep(540, 80, 'sine', 0.016), 90);
  } else {
    beep(440, 80, 'triangle', 0.02);
    setTimeout(() => beep(587, 90, 'triangle', 0.02), 100);
  }
}

export const SOUND_KEYS = {
  chip: 'chip',
  deal: 'deal',
  shuffle: 'shuffle',
  win: 'win',
  lose: 'lose',
  warn: 'warn',
  bank: 'bank',
  check: 'check',
  overlay: 'overlay',
} as const

export function setMuted(v: boolean) { muted = v; }
export function isMuted() { return muted; }
export function setSoundDebug(v: boolean) { debug = v; try { localStorage.setItem('soundDebug', v ? '1' : '0') } catch {} }
export function setSoundProfile(p: SoundProfile) {
  profile = (p === 'classic' || p === 'subtle') ? p : 'subtle';
  try { localStorage.setItem('soundProfile', profile) } catch {}
}
export function getSoundProfile(): SoundProfile { return profile }

export async function resumeAudio(): Promise<void> {
  try {
    const ctx = getCtx();
    if (debug) console.debug('[sound] resumeAudio state=', ctx.state)
    if (ctx.state !== 'running') {
      await ctx.resume().catch((e) => { if (debug) console.debug('[sound] resume error', e) });
    }
  } catch {}
}

export function hookAutoResume(): void {
  try {
    const handler = () => { try { getCtx(); resumeAudio().catch(() => {}) } catch {} }
    window.addEventListener('pointerdown', handler, { passive: true })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') handler() })
  } catch {}
}


