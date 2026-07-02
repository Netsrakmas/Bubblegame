/*
 * audio.js  —  tiny WebAudio chiptune. No assets: every sound is synthesized
 * with plain oscillators, so the whole soundtrack ships as data.
 *
 *   Sfx.jump() / fire() / capture() / pop() / collect() / hurt() / bounce()
 *   / drop() / clear() / win() / lose()   — one-shot effects
 *   Sfx.toggle()                          — mute on/off (persisted)
 *
 * Music: a gentle 4-bar minor-key cave loop (triangle bass + quiet square
 * lead) scheduled ahead of time with setInterval + AudioContext clock.
 * Audio starts on the first key/tap (browser autoplay policy).
 */
const Sfx = (() => {
  let ac = null, started = false, timer = null;
  let muted = false;
  try { muted = localStorage.getItem('bubblegame.muted') === '1'; } catch (e) {}

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch (e) { return null; }
    }
    return ac;
  }
  const now = () => { const c = ctx(); return c ? c.currentTime : 0; };

  // one oscillator, pitch f0→f1, exponential fade out over dur seconds
  function tone(type, f0, f1, t, dur, vol) {
    const c = ctx(); if (!c || muted) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && Math.abs(f1 - f0) > 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const fx = {
    jump:    () => tone('square', 240, 520, now(), 0.10, 0.05),
    bounce:  () => tone('square', 330, 760, now(), 0.09, 0.05),
    drop:    () => tone('triangle', 500, 240, now(), 0.08, 0.05),
    fire:    () => tone('square', 950, 320, now(), 0.07, 0.04),
    capture: () => tone('triangle', 320, 900, now(), 0.12, 0.08),
    pop:     () => { const t = now(); tone('square', 660, 180, t, 0.08, 0.07); tone('square', 990, 330, t, 0.05, 0.04); },
    collect: () => { const t = now(); tone('square', 784, 784, t, 0.06, 0.05); tone('square', 1175, 1175, t + 0.06, 0.10, 0.05); },
    hurt:    () => tone('sawtooth', 300, 70, now(), 0.30, 0.08),
    checkpoint: () => { const t = now(); tone('triangle', 523, 784, t, 0.09, 0.07); tone('triangle', 784, 1047, t + 0.09, 0.14, 0.07); },
    clear:   () => { const t = now(); [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, t + i * 0.09, 0.13, 0.06)); },
    win:     () => { const t = now(); [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, t + i * 0.11, 0.15, 0.06)); },
    lose:    () => { const t = now(); [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.94, t + i * 0.16, 0.22, 0.08)); },
  };

  // ---- music loop ----
  const SPB = 0.15;                                   // seconds per 8th note
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // 4 bars x 8 eighth-notes, 0 = rest.  Am / F / G / Am cave stroll.
  const BASS = [45, 0, 45, 0, 52, 0, 45, 0,  41, 0, 41, 0, 48, 0, 41, 0,
                43, 0, 43, 0, 50, 0, 43, 0,  45, 0, 45, 0, 52, 0, 50, 0];
  const LEAD = [69, 0, 72, 74, 76, 0, 74, 72,  69, 0, 65, 0, 68, 69, 72, 0,
                71, 0, 67, 0, 71, 72, 74, 0,  76, 0, 74, 72, 69, 0, 0, 0];
  let step = 0, nextT = 0;
  function tick() {
    const c = ctx(); if (!c) return;
    while (nextT < c.currentTime + 0.18) {
      const s = step % BASS.length;
      const b = BASS[s]; if (b) tone('triangle', midi(b), midi(b), nextT, SPB * 1.8, 0.05);
      const l = LEAD[s]; if (l) tone('square', midi(l), midi(l), nextT, SPB * 0.9, 0.022);
      nextT += SPB; step++;
    }
  }
  function startMusic() {
    const c = ctx(); if (!c || timer) return;
    if (c.state === 'suspended') c.resume();
    nextT = c.currentTime + 0.1;
    timer = setInterval(tick, 50);
  }
  function unlock() {
    if (started) return;
    started = true;
    startMusic();
  }
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);

  return Object.assign(fx, {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('bubblegame.muted', muted ? '1' : '0'); } catch (e) {}
      return muted;
    },
  });
})();

window.Sfx = Sfx;
