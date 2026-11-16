/**
 * Alerts: sound (Web Audio), voice (Speech Synthesis) and vibration.
 * Alertas: sonido (Web Audio), voz (Speech Synthesis) y vibración.
 *
 * - Sounds are generated in code: no audio files, no third-party licences.
 *   Los sonidos se generan por código: sin archivos de audio ni licencias de terceros.
 * - Meant for the phone SPEAKER. Driving with headphones is prohibited in Argentina
 *   (Ley 24.449, art. 48 inc. x). Pensado para el PARLANTE del teléfono.
 * - Cooldowns avoid "alarm fatigue" (people ignore alarms that ring all the time).
 *   Los tiempos de espera evitan la "fatiga de alarmas".
 */
import { DEFAULTS } from './config.js';

const PATTERNS = {
  mild: { tones: [[660, 180]], gain: 0.25, vibrate: [120] },
  moderate: { tones: [[880, 160], [0, 90], [880, 160]], gain: 0.45, vibrate: [200, 100, 200] },
  high: {
    tones: [[1000, 220], [700, 220], [1000, 220], [700, 220], [1000, 320]],
    gain: 0.8,
    vibrate: [400, 120, 400, 120, 700],
  },
};
PATTERNS.critical = PATTERNS.high;

export class AlertManager {
  constructor({ cooldowns = DEFAULTS.alertCooldownMs, speak = true } = {}) {
    this.cooldowns = cooldowns;
    this.voice = speak;
    this.ctx = null;
    this.last = {};
    this.lang = 'es-AR';
  }

  /** Must be called from a user gesture (tap/click) so browsers allow audio. */
  unlock() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setLanguage(lang) {
    this.lang = lang === 'en' ? 'en-US' : 'es-AR';
  }

  playPattern(kind) {
    const p = PATTERNS[kind];
    if (!p || !this.ctx) return;
    let at = this.ctx.currentTime + 0.02;
    for (const [freq, ms] of p.tones) {
      const dur = ms / 1000;
      if (freq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = kind === 'mild' ? 'sine' : 'square';
        osc.frequency.value = freq;
        // Short attack/release to avoid clicks.
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(p.gain, at + 0.015);
        gain.gain.setValueAtTime(p.gain, at + dur - 0.03);
        gain.gain.linearRampToValueAtTime(0, at + dur);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(at);
        osc.stop(at + dur + 0.01);
      }
      at += dur;
    }
    if (navigator.vibrate) navigator.vibrate(p.vibrate);
  }

  say(text) {
    if (!this.voice || !text || !globalThis.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.lang;
    u.rate = 1;
    u.volume = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  /**
   * Fire an alert if its cooldown has passed. Returns true when it fired.
   * kind: 'mild' | 'moderate' | 'high' | 'critical'
   */
  notify(kind, t, message) {
    const wait = this.cooldowns[kind] ?? 30_000;
    if (this.last[kind] != null && t - this.last[kind] < wait) return false;
    this.last[kind] = t;
    this.playPattern(kind);
    if (kind !== 'mild') setTimeout(() => this.say(message), 700);
    return true;
  }

  test(message) {
    this.unlock();
    this.playPattern('moderate');
    setTimeout(() => this.say(message), 700);
  }

  stop() {
    if (globalThis.speechSynthesis) speechSynthesis.cancel();
    if (navigator.vibrate) navigator.vibrate(0);
    this.last = {};
  }
}
