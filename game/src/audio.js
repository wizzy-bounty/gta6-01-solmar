// audio.js — synthesized sound for SOLMAR HEAT, all WebAudio, no audio files.
// Engine hum and police sirens are looping oscillators whose pitch follows the
// game; gunshots, punches and pickups are short noise/oscillator bursts; a slow
// synthwave chord loop plays as background music. Every call is guarded so a
// browser that refuses an AudioContext never breaks the game.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.started = false;
  }

  /** Create the context on the first user gesture (browser autoplay policy). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startEngineNodes();
      this._startSirenNodes();
      this.started = true;
    } catch {
      this.ctx = null;
    }
  }

  _startEngineNodes() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  _startSirenNodes() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.65;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  /** Driving sound: rpm 0..1 while in a car, silent on foot. */
  setEngine(rpm, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + rpm * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    this.engineOsc.frequency.setTargetAtTime(52 + rpm * 165, t, 0.06);
  }

  /** Siren loudness follows the nearest police unit (0 = none audible). */
  setSiren(level) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(Math.min(0.075, level * 0.075), this.ctx.currentTime, 0.15);
  }

  _burst({ type = 'square', from = 800, to = 60, dur = 0.12, gain = 0.22, noise = false }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(gain, t);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    out.connect(this.master);
    if (noise) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2600;
      src.connect(filter).connect(out);
      src.start(t);
    } else {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      osc.connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  shoot() { this._burst({ noise: true, dur: 0.16, gain: 0.30 }); this._burst({ from: 340, to: 70, dur: 0.1, gain: 0.16 }); }
  punch() { this._burst({ noise: true, dur: 0.07, gain: 0.16 }); this._burst({ type: 'sine', from: 130, to: 55, dur: 0.09, gain: 0.22 }); }
  crash(intensity = 1) { this._burst({ noise: true, dur: 0.28, gain: 0.2 + 0.2 * intensity }); }
  pickup() { this._burst({ type: 'sine', from: 660, to: 990, dur: 0.14, gain: 0.14 }); }
  cash() {
    this._burst({ type: 'triangle', from: 880, to: 880, dur: 0.07, gain: 0.12 });
    setTimeout(() => this._burst({ type: 'triangle', from: 1320, to: 1320, dur: 0.1, gain: 0.12 }), 70);
  }
  ui() { this._burst({ type: 'triangle', from: 520, to: 700, dur: 0.06, gain: 0.08 }); }
  busted() { this._burst({ type: 'sawtooth', from: 220, to: 110, dur: 0.5, gain: 0.16 }); }

  /** Slow synthwave loop: a four-chord pad with a soft bass pulse, scheduled per frame. */
  updateMusic(dt, active) {
    if (!this.ctx || !active) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.46;
    const chords = [
      [110.0, 220.0, 261.6, 329.6],   // Am
      [87.3, 174.6, 220.0, 261.6],    // F
      [130.8, 196.0, 261.6, 392.0],   // C
      [98.0, 196.0, 246.9, 293.7],    // G
    ];
    const chord = chords[Math.floor(this.musicStep / 4) % chords.length];
    const beat = this.musicStep % 4;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const play = (freq, dur, gain, type) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };
    if (beat === 0) for (const f of chord.slice(1)) play(f, 1.7, 0.016, 'triangle');
    play(chord[0], 0.4, 0.05, 'sine');
    if (beat === 2) play(chord[0] * 2, 0.25, 0.03, 'sine');
    this.musicStep++;
  }
}
