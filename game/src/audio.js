// Dustline Protocol — synthesized sound effects. WebAudio only, no audio files.
// Every effect is built from oscillators and filtered noise so the game ships zero media.
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
      master.gain.value = 0.42;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass') {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const sounds = {
    pistol() { noise(0.09, 0.5, 2600); tone(210, 0.07, 'square', 0.22, 70); },
    smg() { noise(0.07, 0.4, 3200); tone(260, 0.05, 'square', 0.16, 90); },
    rifle() { noise(0.12, 0.6, 2200); tone(150, 0.1, 'sawtooth', 0.26, 55); },
    sniper() { noise(0.22, 0.8, 1400); tone(110, 0.18, 'sawtooth', 0.34, 40); },
    // Distant bot gunfire: quieter, low-passed, so the player hears fights elsewhere.
    distant(kind) {
      const c = ensure();
      if (!c || muted) return;
      noise(0.1, 0.12, 900);
      if (kind === 'sniper') tone(90, 0.15, 'sawtooth', 0.1, 45);
    },
    reload() { tone(520, 0.06, 'square', 0.12); setTimeout(() => tone(380, 0.06, 'square', 0.12), 160); setTimeout(() => tone(640, 0.05, 'square', 0.14), 320); },
    dryfire() { tone(900, 0.04, 'square', 0.1); },
    hit() { tone(1250, 0.05, 'sine', 0.22); },
    headshot() { tone(1750, 0.07, 'sine', 0.26); tone(2300, 0.05, 'sine', 0.16); },
    kill() { tone(660, 0.09, 'triangle', 0.24); setTimeout(() => tone(990, 0.12, 'triangle', 0.24), 90); },
    hurt() { noise(0.12, 0.3, 700); tone(140, 0.12, 'sawtooth', 0.2, 80); },
    explosion() {
      noise(0.9, 0.9, 500);
      tone(70, 0.7, 'sine', 0.55, 28);
      setTimeout(() => noise(0.5, 0.4, 300), 120);
    },
    plantBeep() { tone(980, 0.08, 'square', 0.2); },
    bombBeep() { tone(1180, 0.06, 'square', 0.18); },
    defuseBeep() { tone(780, 0.08, 'square', 0.18); },
    buy() { tone(880, 0.06, 'triangle', 0.2); setTimeout(() => tone(1320, 0.08, 'triangle', 0.2), 70); },
    deny() { tone(220, 0.12, 'square', 0.18); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.22), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.2), i * 130)); },
    click() { tone(700, 0.04, 'square', 0.1); },
    throwPin() { tone(1500, 0.05, 'sine', 0.14); },
    step() { noise(0.05, 0.07, 500); },
  };

  return {
    unlock() { ensure(); },
    play(name, arg) { const fn = sounds[name]; if (fn) fn(arg); },
    setMuted(v) { muted = !!v; },
    isMuted() { return muted; },
  };
}
