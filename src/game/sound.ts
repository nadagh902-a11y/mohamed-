class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private lastVoiceTime = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopVoice();
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopVoice();
    }
    return this.muted;
  }

  public stopVoice(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.noiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.4);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }

  public playStickSwing(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.08);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.13);
  }

  public playStickBonk(combo: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pitchBoost = Math.min(combo, 8) * 18;

    // Woody cartoon BONK
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340 + pitchBoost, now);
    osc.frequency.exponentialRampToValueAtTime(92, now + 0.14);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);

    // Cartoon boing overtone
    const boing = ctx.createOscillator();
    const boingGain = ctx.createGain();
    boing.type = 'sine';
    boing.frequency.setValueAtTime(220, now + 0.03);
    boing.frequency.exponentialRampToValueAtTime(560 + pitchBoost * 1.4, now + 0.13);
    boing.frequency.exponentialRampToValueAtTime(280, now + 0.25);

    boingGain.gain.setValueAtTime(0.001, now);
    boingGain.gain.linearRampToValueAtTime(0.14, now + 0.05);
    boingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    boing.connect(boingGain);
    boingGain.connect(ctx.destination);
    boing.start(now + 0.02);
    boing.stop(now + 0.27);
  }

  public playPlateThrow(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.09);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playPlateCrash(hitReda: boolean, combo: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;

    // Crisp porcelain shatter noise
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1800, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(hitReda ? 0.28 : 0.16, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    src.connect(hp);
    hp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.24);

    // Ceramic shards clinking
    const freqs = hitReda ? [1450, 2180, 2940, 3420] : [1320, 1980, 2640];
    const boost = Math.min(combo, 6) * 45;
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const start = now + idx * 0.022;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f + boost, start);
      osc.frequency.exponentialRampToValueAtTime(f * 0.88, start + 0.08);
      g.gain.setValueAtTime(hitReda ? 0.1 : 0.06, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    });

    if (hitReda) {
      // Comedic splat thump
      const thump = ctx.createOscillator();
      const tg = ctx.createGain();
      thump.type = 'triangle';
      thump.frequency.setValueAtTime(210, now);
      thump.frequency.exponentialRampToValueAtTime(65, now + 0.11);
      tg.gain.setValueAtTime(0.24, now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      thump.connect(tg);
      tg.connect(ctx.destination);
      thump.start(now);
      thump.stop(now + 0.13);
    }
  }

  public playSlideWhistle(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.42);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  public playGaffeStop(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + i * 0.055;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public playGaffeFail(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    // Sad comedic tuba droop
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.linearRampToValueAtTime(115, now + 0.35);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;

    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);

    // Clatter
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.15, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.26);
  }

  public playBonusPop(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + i * 0.045;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + i * 0.09;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  public playRedaCry(): void {
    const ctx = this.ensureContext();
    if (ctx) {
      const now = ctx.currentTime;

      // Expressive cartoon vocal scream ("Aaaah!") via vocal formant filtering
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const vib = ctx.createOscillator();
      const vibGain = ctx.createGain();

      osc.type = 'sawtooth';
      sub.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(510, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(255, now + 0.28);

      sub.frequency.setValueAtTime(210, now);
      sub.frequency.exponentialRampToValueAtTime(255, now + 0.06);
      sub.frequency.exponentialRampToValueAtTime(128, now + 0.28);

      vib.frequency.value = 26;
      vibGain.gain.value = 18;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);

      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(780, now);
      f1.frequency.exponentialRampToValueAtTime(580, now + 0.26);
      f1.Q.value = 3.2;

      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(1320, now);
      f2.frequency.exponentialRampToValueAtTime(1040, now + 0.26);
      f2.Q.value = 4.0;

      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0.001, now);
      voiceGain.gain.linearRampToValueAtTime(0.24, now + 0.025);
      voiceGain.gain.setValueAtTime(0.22, now + 0.14);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.29);

      osc.connect(f1);
      sub.connect(f1);
      osc.connect(f2);
      f1.connect(voiceGain);
      f2.connect(voiceGain);
      voiceGain.connect(ctx.destination);

      osc.start(now);
      sub.start(now);
      vib.start(now);
      osc.stop(now + 0.3);
      sub.stop(now + 0.3);
      vib.stop(now + 0.3);
    }

    // Spoken voice line: "Selekni larabi !"
    if (this.muted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const nowMs = performance.now();
    if (nowMs - this.lastVoiceTime < 700) {
      return;
    }
    this.lastVoiceTime = nowMs;

    try {
      const synth = window.speechSynthesis;
      synth.cancel();

      const lines = ['Aïe ! Sélékni larabi !', 'Sélékni larabi !', 'Waaah ! Sélékni larabi !'];
      const text = lines[Math.floor(Math.random() * lines.length)];
      const utterance = new SpeechSynthesisUtterance(text);

      const voices = synth.getVoices();
      const preferredVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith('fr')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('ar'));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.lang = preferredVoice?.lang || 'fr-FR';
      utterance.pitch = 1.32;
      utterance.rate = 1.24;
      utterance.volume = 1.0;

      synth.speak(utterance);
    } catch {
      // Ignore speech synthesis errors on restricted browsers
    }
  }

  public playGameOver(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [293.66, 277.18, 261.63, 196.0];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + i * 0.16;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(lp);
      lp.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.27);
    });
  }
}

export const soundEngine = new SoundEngine();
