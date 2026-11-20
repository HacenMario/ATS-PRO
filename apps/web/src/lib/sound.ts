'use client';

/**
 * Notification alert sound — generated with WebAudio (no asset download).
 * Autoplay policies are respected: if the context is suspended (no user
 * interaction yet), the call fails silently and the visual toast is the
 * fallback (always shown anyway).
 */
let ctx: AudioContext | null = null;
/** Set to true after the first real user gesture — browsers refuse to start
 * (or resume) an AudioContext created before any interaction, which logged a
 * console warning when a notification arrived on page load. */
let userGestured = false;

if (typeof window !== 'undefined') {
  const markGesture = () => { userGestured = true; };
  window.addEventListener('pointerdown', markGesture, { once: true, capture: true });
  window.addEventListener('keydown', markGesture, { once: true, capture: true });
  window.addEventListener('touchstart', markGesture, { once: true, capture: true });
}

function ensureCtx(): AudioContext | null {
  if (!userGestured) return null; // no gesture yet → stay silent, never warn
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  } catch {
    return null;
  }
}

export function playAlertSound(): void {
  try {
    const audio = ensureCtx();
    if (!audio || audio.state !== 'running') return; // autoplay blocked → visual fallback only
    const now = audio.currentTime;
    const notes = [880, 1174.7]; // A5, D6 — gentle two-tone chime
    notes.forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.16);
      gain.gain.linearRampToValueAtTime(0.22, now + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.3);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.32);
    });
  } catch {
    /* sound is best-effort only */
  }
}

/** Unlock audio after the first user gesture (browser autoplay policy). */
export function primeAudio(): void {
  const audio = ensureCtx();
  if (audio && audio.state === 'suspended') {
    void audio.resume().catch(() => undefined);
  }
}

/** Distinct, insistent three-chime alert for a live delivery offer — longer
 * than the plain notification chime so the delivery worker notices it even
 * away from the screen. Best-effort: silent when autoplay is blocked. */
export function playDeliveryOfferSound(): void {
  try {
    const audio = ensureCtx();
    if (!audio || audio.state !== 'running') return;
    const now = audio.currentTime;
    const notes: Array<[number, number]> = [[659.3, 0], [880, 0.22], [1174.7, 0.44]]; // E5, A5, D6
    notes.forEach(([freq, at]) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(0.26, now + at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.42);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.45);
    });
  } catch {
    /* sound is best-effort only */
  }
}
