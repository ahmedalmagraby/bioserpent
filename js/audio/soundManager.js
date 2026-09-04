window.BS = window.BS || {};
(function (BS) {
"use strict";
class SoundManager {  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuf = null;
    this.delay = null;
    this.delayWet = null;
    this.volumes = { music: 0.7, sfx: 0.9, muted: false };
    this._song = null;
    this._intensity = 0;
    this._lastChimeTime = 0;
  }

  setIntensity(v) {
    this._intensity = v;
  }

  setSuspended(s) {
    if (!this.ctx || this.ctx.state === (s ? 'suspended' : 'running')) return;
    const p = s ? this.ctx.suspend() : this.ctx.resume();
    if (p && p.catch) p.catch(() => {});
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      
      // Dynamic compressor to prevent digital clipping & balance master output
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
      this.compressor.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.connect(this.compressor);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.delay = this.ctx.createDelay(1);
      this.delay.delayTime.value = 0.27;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.34;
      this.delay.connect(fb);
      fb.connect(this.delay);
      this.delayWet = this.ctx.createGain();
      this.delayWet.gain.value = 0.25;
      this.delay.connect(this.delayWet);
      this.delayWet.connect(this.master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolumes(v) {
    if (v) {
      if (typeof v.music === 'number' && Number.isFinite(v.music)) this.volumes.music = Math.max(0, Math.min(1, v.music));
      if (typeof v.sfx === 'number' && Number.isFinite(v.sfx)) this.volumes.sfx = Math.max(0, Math.min(1, v.sfx));
      if (typeof v.muted === 'boolean') this.volumes.muted = v.muted;
    }
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : 1, t, 0.05);

    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.08);

    this.sfxBus.gain.cancelScheduledValues(t);
    this.sfxBus.gain.setValueAtTime(this.sfxBus.gain.value, t);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  get time() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone(o) {
    if (!this.ctx || this.volumes.muted) return;
    const t0 = o.t ?? this.time;
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = this.ctx.createGain();
    const peak = o.gain ?? 0.2;
    const atk = o.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let head = osc;
    if (o.lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t0);
      if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t0 + o.dur);
      head.connect(f);
      head = f;
    }
    if (o.bp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = o.q ?? 2;
      f.frequency.setValueAtTime(o.bp, t0);
      if (o.bp2) f.frequency.exponentialRampToValueAtTime(o.bp2, t0 + o.dur);
      head.connect(f);
      head = f;
    }
    head.connect(g);
    this._route(g, o);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.1);
  }

  noise(o) {
    if (!this.ctx || this.volumes.muted) return;
    const t0 = o.t ?? this.time;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const g = this.ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let head = src;
    if (o.bp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = o.q ?? 1.5;
      f.frequency.setValueAtTime(o.bp, t0);
      if (o.bp2) f.frequency.exponentialRampToValueAtTime(o.bp2, t0 + o.dur);
      head.connect(f);
      head = f;
    }
    if (o.hp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = o.hp;
      head.connect(f);
      head = f;
    }
    head.connect(g);
    this._route(g, o);
    src.start(t0);
    src.stop(t0 + o.dur + 0.1);
  }

  _route(g, o) {
    const dest = o.dest ?? this.sfxBus;
    if (o.pan !== undefined && o.pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      p.connect(dest);
      if (o.echo && this.delay) g.connect(this.delay);
    } else {
      g.connect(dest);
      if (o.echo && this.delay) g.connect(this.delay);
    }
  }

  bite(pan) {
    if (!this.ctx || this.volumes.muted) return false;
    // Collapse bite+comboChime overlap: drop bite if a chime played <120ms ago
    if (performance.now() - this._lastChimeTime < 120) return false;
    this.noise({ bp: 900, q: 1, dur: 0.09, gain: 0.45, pan });
    this.tone({ type: 'sine', f: 170, f2: 55, dur: 0.13, gain: 0.4, pan });
    return true;
  }

  golden(pan) {
    if (!this.ctx || this.volumes.muted) return;
    [880, 1174.7, 1568].forEach((f, i) => {
      this.tone({ type: 'triangle', f, dur: 0.32, gain: 0.2, t: this.time + i * 0.07, echo: true, pan });
    });
    this.noise({ hp: 5000, dur: 0.25, gain: 0.06, pan });
  }

  insect(pan) {
    [0, 0.08].forEach(dt => {
      this.tone({ type: 'sine', f: 1400, f2: 2200, dur: 0.05, gain: 0.14, t: this.time + dt, pan });
    });
  }

  dragonfly(pan) {
    [0, 0.05, 0.1].forEach((dt, i) => {
      this.tone({ type: 'triangle', f: 1800 + i * 400, f2: 2600, dur: 0.06, gain: 0.16, t: this.time + dt, echo: true, pan });
    });
    this.noise({ hp: 4500, dur: 0.12, gain: 0.08, pan });
  }

  comboChime(comboLevel, pan) {
    if (!this.ctx || this.volumes.muted) return false;
    const now = performance.now();
    // Voice limiter: skip comboChime below combo 3 when another chime played <120ms ago
    if (comboLevel < 3 && (now - this._lastChimeTime < 120)) {
      return false;
    }
    this._lastChimeTime = now;
    const scale = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    const idx = Math.min(Math.max(0, comboLevel - 1), scale.length - 1);
    const f = scale[idx];
    this.tone({ type: 'sine', f, f2: f * 1.05, dur: 0.22, gain: 0.18, echo: true, pan });
    return true;
  }

  nearMiss(pan) {
    this.noise({ bp: 800, bp2: 2200, q: 3, dur: 0.18, gain: 0.12, pan });
  }

  sliderPreview(type) {
    if (type === 'music') {
      this.tone({ type: 'triangle', f: 440, dur: 0.25, gain: 0.2, dest: this.musicBus });
    } else {
      this.tone({ type: 'sine', f: 880, dur: 0.15, gain: 0.2, dest: this.sfxBus });
    }
  }

  powerup(pan) {
    if (!this.ctx || this.volumes.muted) return;
    this.tone({ type: 'sawtooth', f: 220, f2: 660, dur: 0.35, gain: 0.13, lp: 400, lp2: 2600, pan });
    [523, 659, 784].forEach((f, i) => {
      this.tone({ type: 'sine', f, dur: 0.55, gain: 0.1, attack: 0.12, t: this.time + 0.1 + i * 0.04, echo: true, pan });
    });
  }

  powerExpire() {
    this.tone({ type: 'sine', f: 660, dur: 0.12, gain: 0.12 });
    this.tone({ type: 'sine', f: 440, dur: 0.16, gain: 0.12, t: this.time + 0.11 });
  }

  portal(pan) {
    this.noise({ bp: 300, bp2: 2600, q: 6, dur: 0.28, gain: 0.3, pan });
    this.noise({ bp: 2600, bp2: 350, q: 6, dur: 0.26, gain: 0.24, t: this.time + 0.28, pan });
    this.tone({ type: 'sine', f: 200, f2: 900, dur: 0.5, gain: 0.12, pan });
  }

  rivalDown(pan) {
    // Distinct descending sting so a rival death never reads as a glitch
    this.tone({ type: 'sawtooth', f: 520, f2: 130, dur: 0.42, gain: 0.14, lp: 1800, lp2: 300, pan });
    [392, 311, 233].forEach((f, i) => {
      this.tone({ type: 'triangle', f, dur: 0.5, gain: 0.1, t: this.time + i * 0.09, echo: true, pan });
    });
  }

  death() {
    this.tone({ type: 'sine', f: 200, f2: 38, dur: 0.9, gain: 0.5 });
    [196, 233.1, 293.7].forEach(f => {
      this.tone({ type: 'triangle', f, dur: 1.3, gain: 0.09, attack: 0.05, lp: 900 });
    });
    this.noise({ bp: 250, q: 0.8, dur: 0.4, gain: 0.2 });
  }

  click() {
    this.noise({ hp: 3000, dur: 0.03, gain: 0.15 });
    this.tone({ type: 'sine', f: 700, f2: 520, dur: 0.06, gain: 0.12 });
  }

  star(i = 0) {
    const notes = [784, 987.8, 1318.5];
    this.tone({ type: 'triangle', f: notes[i % 3], dur: 0.4, gain: 0.2, echo: true });
  }

  ticktock() {
    this.tone({ type: 'sine', f: 1150, dur: 0.05, gain: 0.12 });
  }

  duck() {
    if (!this.ctx) return;
    const t = this.time;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.volumes.music * 0.12, t + 0.08);
    g.linearRampToValueAtTime(this.volumes.music * 0.5, t + 1.6);
  }

  achieve() {
    [523, 659, 784, 1046.5].forEach((f, i) => {
      this.tone({ type: 'triangle', f, dur: 0.3, gain: 0.16, t: this.time + i * 0.09, echo: true });
    });
  }

  startMusic(music) {
    this.stopMusic();
    if (!this.ctx) return;
    const songGain = this.ctx.createGain();
    songGain.gain.value = 1;
    songGain.connect(this.musicBus);
    this._song = { gain: songGain, cfg: music, bar: 0, nextBar: this.time + 0.1, nextPluck: this.time + 0.6 };
    this._timer = setInterval(() => this._schedule(), 250);
    this._schedule();
  }

  stopMusic() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._song) {
      const s = this._song;
      const t = this.time;
      s.gain.gain.setTargetAtTime(0, t, 0.3);
      setTimeout(() => {
        try { s.gain.disconnect(); } catch (_) {}
      }, 1500);
      this._song = null;
    }
  }

  _schedule() {
    const s = this._song;
    if (!s || !this.ctx || this.volumes.muted || this.ctx.state !== 'running') return;
    const cfg = s.cfg;
    const lookahead = this.time + 1.2;
    if (s.nextBar < this.time) s.nextBar = this.time + 0.05;
    if (s.nextPluck < this.time) s.nextPluck = this.time + 0.05;
    while (s.nextBar < lookahead) {
      const t = s.nextBar;
      const chord = cfg.chords[s.bar % cfg.chords.length];
      for (const st of chord) {
        const f = cfg.base * Math.pow(2, st / 12);
        this._pad(f, t, cfg.barSec, cfg.wave, s.gain);
      }
      if (this._intensity > 0) {
        for (let i = 0; i < 8; i++) {
          this.noise({ hp: 6500, dur: 0.03, gain: 0.05 * this._intensity, dest: s.gain, t: t + i * cfg.barSec / 8 });
        }
      }
      s.bar++;
      s.nextBar += cfg.barSec;
    }
    while (s.nextPluck < lookahead) {
      const t = s.nextPluck;
      if (Math.random() < (this._intensity > 0 ? 0.8 : 0.55)) {
        const deg = cfg.scale[Math.floor(Math.random() * cfg.scale.length)];
        const oct = 1 + Math.floor(Math.random() * 2);
        const f = cfg.base * Math.pow(2, (deg + 12 * oct) / 12);
        this._pluck(f, t, cfg.wave, s.gain);
      }
      s.nextPluck += cfg.barSec / 4;
    }
  }

  _pad(f, t, barSec, wave, dest) {
    if (!this.ctx || this.volumes.muted) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.4);
    g.gain.setValueAtTime(0.05, t + barSec * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + barSec + 1.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 950;
    lp.connect(g);
    g.connect(dest);
    for (const dt of [-5, 5]) {
      const o = this.ctx.createOscillator();
      o.type = wave;
      o.frequency.value = f;
      o.detune.value = dt;
      o.connect(lp);
      o.start(t);
      o.stop(t + barSec + 1.6);
    }
  }

  _pluck(f, t, wave, dest) {
    if (!this.ctx || this.volumes.muted) return;
    const o = this.ctx.createOscillator();
    o.type = wave;
    o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g);
    g.connect(dest);
    if (this.delay) g.connect(this.delay);
    o.start(t);
    o.stop(t + 0.8);
  }
}

Object.assign(BS, { SoundManager });

})(window.BS);
