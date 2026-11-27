/**
 * Synthétiseur sonore léger (Web Audio API) pour les notifications SCODI.
 * Fonctionne sur tous les navigateurs Desktop (Windows/macOS/Linux) et Mobiles
 * sans dépendre d'un fichier MP3 externe ni de Firebase côté audio.
 */

let sharedAudioCtx: AudioContext | null = null;
let unlockBound = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

/**
 * Déverrouille l'AudioContext dès la première interaction utilisateur
 * (requis par la politique autoplay de Chrome / Edge / Safari / Firefox).
 */
export function initNotificationAudioUnlock(): void {
  if (typeof window === 'undefined' || unlockBound) return;
  unlockBound = true;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    if (ctx && ctx.state === 'running') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  volume: number,
  wave: OscillatorType = 'sine'
): void {
  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/**
 * Joue un son de notification distinct selon le type :
 * - 'ALERT' : triple bip d'urgence net et audible
 * - autre ('MESSAGE' / standard) : double carillon doux et professionnel
 */
export async function playNotificationSound(type?: string): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    if (ctx.state !== 'running') return;

    const isAlert = String(type || '').toUpperCase() === 'ALERT';
    if (isAlert) {
      // Triple bip urgent pour les alertes
      playTone(ctx, 980, 0.0, 0.14, 0.24, 'triangle');
      playTone(ctx, 1180, 0.18, 0.14, 0.26, 'triangle');
      playTone(ctx, 980, 0.36, 0.22, 0.24, 'triangle');
    } else {
      // Double carillon clair pour les messages et notifications standard
      playTone(ctx, 740, 0.0, 0.16, 0.2, 'sine');
      playTone(ctx, 987.77, 0.14, 0.26, 0.22, 'sine');
    }
  } catch {
    // Ne jamais bloquer l'application si l'audio est indisponible
  }
}
