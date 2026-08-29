import { defineEffect, type AnimationFactory, type SoundFactory } from '../src';

type VortexPhase = 'collapse' | 'expand';

interface VortexParticle {
  readonly angle: number;
  readonly color: string;
  readonly delay: number;
  readonly radius: number;
  readonly size: number;
  readonly twist: number;
}

const PARTICLE_BUDGET = 900;
const TAU = Math.PI * 2;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

function sampleParticles(
  snapshot: HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  centerX: number,
  centerY: number,
  random: () => number,
) {
  const context = snapshot.getContext('2d', { willReadFrequently: true });
  if (context === null) return [];
  const pixels = context.getImageData(0, 0, snapshot.width, snapshot.height).data;
  const step = Math.max(2, Math.ceil(Math.sqrt((snapshot.width * snapshot.height) / PARTICLE_BUDGET)));
  const particles: VortexParticle[] = [];

  for (let y = Math.floor(step / 2); y < snapshot.height; y += step) {
    for (let x = Math.floor(step / 2); x < snapshot.width; x += step) {
      const offset = (y * snapshot.width + x) * 4;
      const alpha = pixels[offset + 3] ?? 0;
      if (alpha < 20) continue;
      const targetX = sourceX + x;
      const targetY = sourceY + y;
      const deltaX = targetX - centerX;
      const deltaY = targetY - centerY;
      const direction = random() < 0.5 ? -1 : 1;
      particles.push({
        angle: Math.atan2(deltaY, deltaX),
        color: `rgb(${String(pixels[offset] ?? 0)} ${String(pixels[offset + 1] ?? 0)} ${String(
          pixels[offset + 2] ?? 0,
        )} / ${String(alpha / 255)})`,
        delay: random() * 0.16,
        radius: Math.hypot(deltaX, deltaY),
        size: step * (0.62 + random() * 0.5),
        twist: direction * TAU * (1.35 + random() * 1.65),
      });
    }
  }

  return particles;
}

function createVortexParticles(phase: VortexPhase): AnimationFactory {
  const duration = phase === 'collapse' ? 720 : 860;
  return ({ bounds, random, signal, snapshot }) => {
    if (snapshot === null) return null;
    const scaleX = snapshot.width / bounds.width;
    const scaleY = snapshot.height / bounds.height;
    const padding = Math.min(150, Math.max(54, Math.max(bounds.width, bounds.height) * 0.3));
    const sourceX = padding * scaleX;
    const sourceY = padding * scaleY;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(snapshot.width + sourceX * 2);
    canvas.height = Math.ceil(snapshot.height + sourceY * 2);
    Object.assign(canvas.style, {
      height: `${bounds.height + padding * 2}px`,
      left: `${-padding}px`,
      pointerEvents: 'none',
      position: 'absolute',
      top: `${-padding}px`,
      width: `${bounds.width + padding * 2}px`,
    });
    const context = canvas.getContext('2d');
    if (context === null) return null;
    const centerX = sourceX + snapshot.width / 2;
    const centerY = sourceY + snapshot.height / 2;
    const particles = sampleParticles(snapshot, sourceX, sourceY, centerX, centerY, random);
    if (particles.length === 0) return null;

    const render = (progress: number) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const snapshotAlpha =
        phase === 'collapse' ? 1 - smoothstep(progress / 0.28) : smoothstep((progress - 0.68) / 0.32);
      const particleBlend =
        phase === 'collapse' ? smoothstep(progress / 0.24) : 1 - smoothstep((progress - 0.74) / 0.26);
      if (snapshotAlpha > 0) {
        context.globalAlpha = snapshotAlpha;
        context.drawImage(snapshot, sourceX, sourceY);
        context.globalAlpha = 1;
      }
      const portalStrength = Math.sin(progress * Math.PI);
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.strokeStyle = `rgb(255 94 190 / ${String(portalStrength * 0.72)})`;
      context.lineWidth = Math.max(2, 5 * scaleX * portalStrength);
      context.beginPath();
      context.arc(centerX, centerY, (12 + portalStrength * 38) * scaleX, 0, TAU);
      context.stroke();
      context.restore();

      for (const particle of particles) {
        const local = clamp((progress - particle.delay) / (1 - particle.delay));
        let radiusFactor: number;
        let angle: number;
        let alpha: number;
        let sizeFactor: number;
        if (phase === 'collapse') {
          const motion = Math.pow(local, 2.35);
          radiusFactor = 1 - motion;
          angle = particle.angle + particle.twist * motion;
          alpha = 1 - smoothstep((local - 0.78) / 0.22);
          sizeFactor = 1 - motion * 0.76;
        } else {
          const motion = 1 - Math.pow(1 - local, 2.8);
          radiusFactor = motion;
          angle = particle.angle - particle.twist * (1 - motion);
          alpha = smoothstep(local / 0.24);
          sizeFactor = 0.24 + motion * 0.76;
        }
        const x = centerX + Math.cos(angle) * particle.radius * radiusFactor;
        const y = centerY + Math.sin(angle) * particle.radius * radiusFactor;
        context.globalAlpha = alpha * particleBlend;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(x, y, Math.max(0.7, particle.size * sizeFactor * 0.5), 0, TAU);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    let frame = 0;
    let startedAt: number | null = null;
    let settled = false;
    let disposed = false;
    let resolveFinished: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const finish = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(frame);
      resolveFinished();
    };
    const tick = (time: number) => {
      if (settled) return;
      startedAt ??= time;
      const progress = clamp((time - startedAt) / duration);
      render(progress);
      if (progress >= 1) {
        finish();
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    const cancel = () => finish();
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      finish();
      signal.removeEventListener('abort', cancel);
      canvas.width = 0;
      canvas.height = 0;
    };

    render(0);
    signal.addEventListener('abort', cancel, { once: true });
    frame = requestAnimationFrame(tick);
    return { element: canvas, duration, finished, cancel, dispose };
  };
}

const createVortexTone: SoundFactory = ({ operation, signal }) => {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const remove = operation === 'remove';
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(remove ? 560 : 150, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(remove ? 110 : 680, context.currentTime + 0.48);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.52);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.54);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    try {
      oscillator.stop();
    } catch {
      // The oscillator may already have reached its scheduled stop.
    }
    void context.close();
  };
  signal.addEventListener('abort', dispose, { once: true });
  oscillator.addEventListener('ended', dispose, { once: true });
  return { stop: dispose, dispose };
};

export const particleVortex = defineEffect({
  remove: {
    animate: createVortexParticles('collapse'),
    sound: createVortexTone,
  },
  restore: {
    animate: createVortexParticles('expand'),
    sound: createVortexTone,
  },
});
