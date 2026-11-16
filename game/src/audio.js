// audio.js — procedural WebAudio only, no files. Every sound is synthesized:
// gunshots per weapon, reload clicks, hit tick, kill chime, footsteps,
// plant/defuse beeps, round stingers, the sunshot charge chime and zap.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, delay) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; return muted; },
    shot(kind) {
      if (kind === 'sniper') { noise(0.28, 0.5, 900); tone(140, 0.18, 'sawtooth', 0.25, 50); }
      else if (kind === 'smg') { noise(0.09, 0.3, 1800); tone(220, 0.07, 'square', 0.12, 90); }
      else if (kind === 'pistol') { noise(0.12, 0.35, 1500); tone(180, 0.09, 'square', 0.15, 70); }
      else { noise(0.16, 0.4, 1100); tone(160, 0.12, 'sawtooth', 0.2, 60); }
    },
    click() { tone(1200, 0.04, 'square', 0.08); },
    reload() { tone(900, 0.05, 'square', 0.1); tone(600, 0.05, 'square', 0.1, null, 0.12); },
    reloadDone() { tone(1100, 0.06, 'square', 0.12); tone(1400, 0.08, 'square', 0.12, null, 0.08); },
    hit(kill) {
      tone(1800, 0.05, 'sine', 0.18);
      if (kill) { tone(880, 0.14, 'sine', 0.2, null, 0.05); tone(1320, 0.2, 'sine', 0.2, null, 0.12); }
    },
    step() { noise(0.05, 0.06, 500); },
    plantBeep() { tone(1000, 0.07, 'sine', 0.15); },
    defuseBeep() { tone(700, 0.07, 'sine', 0.15); },
    roundStart() { tone(440, 0.15, 'triangle', 0.2); tone(660, 0.2, 'triangle', 0.2, null, 0.14); },
    roundWin() { tone(523, 0.16, 'triangle', 0.22); tone(659, 0.16, 'triangle', 0.22, null, 0.14); tone(784, 0.3, 'triangle', 0.22, null, 0.28); },
    roundLose() { tone(392, 0.2, 'triangle', 0.2); tone(311, 0.3, 'triangle', 0.2, null, 0.18); },
    chargeChime() {
      // Bright rising tone: CELL full, SUNSHOT ready.
      tone(880, 0.12, 'sine', 0.2);
      tone(1174, 0.14, 'sine', 0.2, null, 0.09);
      tone(1568, 0.3, 'sine', 0.22, null, 0.18);
    },
    sunshot() {
      // A searing zap: high sweep down + noise burst.
      tone(2400, 0.35, 'sawtooth', 0.25, 120);
      noise(0.3, 0.35, 3200);
      tone(1568, 0.25, 'sine', 0.2, 2093, 0.02);
    },
    smoke() { noise(0.8, 0.15, 400); },
    explosion() {
      noise(0.7, 0.6, 300);
      tone(90, 0.5, 'sine', 0.4, 30);
    },
    hurt() { tone(140, 0.15, 'sawtooth', 0.18, 70); },
    // A soft tick when the round timer crosses 10 seconds.
    tick() { tone(1500, 0.04, 'sine', 0.1); },
  };
}
