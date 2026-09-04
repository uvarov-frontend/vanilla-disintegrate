import snapSoundUrl from '../assets/thanos-snap/gauntlet-snap.mp3?url';
import snapSpriteUrl from '../assets/thanos-snap/gauntlet-snap.png?url';
import timeSoundUrl from '../assets/thanos-snap/gauntlet-time.mp3?url';
import timeSpriteUrl from '../assets/thanos-snap/gauntlet-time.png?url';

const FRAME_SIZE = 80;
const EDGE_FADE = 12;

export type SnapCursorPhase = 'remove' | 'restore';

interface PhaseDefinition {
  readonly cue: number;
  readonly duration: number;
  readonly soundUrl: string;
  readonly spriteUrl: string;
}

interface SpriteStrip {
  readonly frames: number;
  readonly source: CanvasImageSource;
}

interface LoadedPhase extends PhaseDefinition {
  readonly sound: HTMLAudioElement;
  readonly strip: SpriteStrip;
}

export interface SnapCursorPlayback {
  readonly cue: Promise<void>;
  readonly finished: Promise<void>;
}

export interface SnapCursorController {
  readonly ready: Promise<void>;
  play(phase: SnapCursorPhase, event?: MouseEvent): SnapCursorPlayback;
  destroy(): void;
}

const definitions: Readonly<Record<SnapCursorPhase, PhaseDefinition>> = {
  remove: { cue: 950, duration: 2400, soundUrl: snapSoundUrl, spriteUrl: snapSpriteUrl },
  restore: { cue: 1190, duration: 3800, soundUrl: timeSoundUrl, spriteUrl: timeSpriteUrl },
};

function contextFor(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('The snap cursor could not acquire a 2D context.');
  context.imageSmoothingEnabled = false;
  return context;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error(`The snap cursor could not load ${source}.`)), {
      once: true,
    });
    image.src = source;
  });
}

function softenFrameEdges(image: HTMLImageElement): SpriteStrip {
  const frames = Math.max(1, Math.floor(image.naturalWidth / FRAME_SIZE));
  const strip = document.createElement('canvas');
  strip.width = image.naturalWidth;
  strip.height = image.naturalHeight;
  const context = contextFor(strip);
  context.drawImage(image, 0, 0);

  let pixels: ImageData;
  try {
    pixels = context.getImageData(0, 0, strip.width, strip.height);
  } catch {
    return { frames, source: image };
  }

  const data = pixels.data;
  for (let y = 0; y < strip.height; y += 1) {
    for (let x = 0; x < strip.width; x += 1) {
      const index = (y * strip.width + x) * 4;
      const alpha = data[index + 3] ?? 0;
      if (alpha === 0) continue;
      const cellX = x % FRAME_SIZE;
      const distance = Math.min(cellX, FRAME_SIZE - 1 - cellX, y, FRAME_SIZE - 1 - y);
      if (distance >= EDGE_FADE) continue;
      const fade = distance / EDGE_FADE;
      const solid = alpha / 255;
      data[index + 3] = Math.round(alpha * (fade + (1 - fade) * solid));
    }
  }

  context.putImageData(pixels, 0, 0);
  return { frames, source: strip };
}

function rewind(audio: HTMLAudioElement) {
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Metadata may not be available yet; an unloaded sound is already at its beginning.
  }
}

function startClock(audio: HTMLAudioElement) {
  const startedAt = performance.now();
  let followsAudio = false;
  rewind(audio);
  void audio.play().then(
    () => {
      followsAudio = true;
    },
    () => undefined,
  );
  return () => (followsAudio && !audio.paused ? audio.currentTime * 1000 : performance.now() - startedAt);
}

function createSound(source: string) {
  const sound = new Audio(source);
  sound.preload = 'auto';
  sound.load();
  return sound;
}

export function mountSnapCursor(target: HTMLElement): SnapCursorController {
  const cursor = document.createElement('div');
  cursor.className = 'snap-cursor';
  cursor.dataset.snapCursor = '';
  cursor.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  canvas.className = 'snap-cursor-canvas';

  const hint = document.createElement('span');
  hint.className = 'snap-cursor-hint';
  const hints: Record<SnapCursorPhase, string> = {
    remove: target.dataset.snapCursorRemoveHint ?? '',
    restore: target.dataset.snapCursorRestoreHint ?? '',
  };
  hint.textContent = hints.remove;
  cursor.append(canvas, hint);
  document.body.append(cursor);
  const context = contextFor(canvas);

  const sounds: Record<SnapCursorPhase, HTMLAudioElement> = {
    remove: createSound(definitions.remove.soundUrl),
    restore: createSound(definitions.restore.soundUrl),
  };

  let phases: Record<SnapCursorPhase, LoadedPhase> | null = null;
  let activeFinish: (() => void) | null = null;
  let animationFrame: number | null = null;
  let busy = false;
  let destroyed = false;
  let pointerInside = false;
  let readyResolved = false;

  const drawFrame = (phase: LoadedPhase, frame: number) => {
    context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    context.drawImage(phase.strip.source, frame * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
  };

  const positionAt = (x: number, y: number) => {
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const positionAtTarget = () => {
    const bounds = target.getBoundingClientRect();
    positionAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  };
  const show = () => {
    if (readyResolved) cursor.dataset.visible = '';
  };
  const hide = () => {
    delete cursor.dataset.visible;
  };
  const syncHint = () => {
    if ((busy || pointerInside) && hint.textContent !== '') cursor.dataset.hint = '';
    else delete cursor.dataset.hint;
  };
  const syncVisibility = () => {
    if (busy || pointerInside) show();
    else hide();
    syncHint();
  };

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    pointerInside = true;
    if (!busy) positionAt(event.clientX, event.clientY);
    syncVisibility();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    positionAt(event.clientX, event.clientY);
  };
  const onWindowPointerMove = (event: PointerEvent) => {
    if (!busy || event.pointerType === 'touch') return;
    positionAt(event.clientX, event.clientY);
    show();
  };
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    pointerInside = false;
    syncVisibility();
  };

  target.addEventListener('pointerenter', onPointerEnter);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerleave', onPointerLeave);

  const loadPhase = async (name: SnapCursorPhase): Promise<LoadedPhase> => {
    const definition = definitions[name];
    return {
      ...definition,
      sound: sounds[name],
      strip: softenFrameEdges(await loadImage(definition.spriteUrl)),
    };
  };
  const ready = Promise.all([loadPhase('remove'), loadPhase('restore')]).then(([remove, restore]) => {
    phases = { remove, restore };
    if (destroyed) return;
    readyResolved = true;
    drawFrame(phases.remove, 0);
    target.dataset.snapCursorReady = '';
    syncVisibility();
  });

  return {
    ready,
    play: (name, event) => {
      if (destroyed || phases === null || busy) {
        throw new Error('The snap cursor is not ready.');
      }

      busy = true;
      hint.textContent = hints[name];
      syncHint();
      document.documentElement.dataset.snapCursorActive = '';
      window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
      const phase = phases[name];
      const next = phases[name === 'remove' ? 'restore' : 'remove'];
      for (const sound of Object.values(sounds)) rewind(sound);
      const useEventPosition =
        event !== undefined && event.detail !== 0 && (event.clientX !== 0 || event.clientY !== 0);
      if (useEventPosition) positionAt(event.clientX, event.clientY);
      else positionAtTarget();
      show();

      let cueResolved = false;
      let finishResolved = false;
      let resolveCue!: () => void;
      let resolveFinished!: () => void;
      const cue = new Promise<void>((resolve) => {
        resolveCue = resolve;
      });
      const animationFinished = new Promise<void>((resolve) => {
        resolveFinished = resolve;
      });
      const completeCue = () => {
        if (cueResolved) return;
        cueResolved = true;
        resolveCue();
      };
      const completeAnimation = () => {
        if (finishResolved) return;
        finishResolved = true;
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
        completeCue();
        resolveFinished();
      };
      activeFinish = completeAnimation;

      const elapsed = startClock(phase.sound);
      let shown = -1;
      const render = () => {
        const time = elapsed();
        if (time >= phase.cue) completeCue();
        const frame = Math.max(
          shown,
          Math.min(phase.strip.frames - 1, Math.floor((time / phase.duration) * phase.strip.frames)),
        );
        if (frame !== shown) {
          drawFrame(phase, frame);
          shown = frame;
        }
        if (time < phase.duration && !destroyed) animationFrame = window.requestAnimationFrame(render);
        else completeAnimation();
      };
      render();

      const finished = animationFinished.finally(() => {
        if (activeFinish === completeAnimation) activeFinish = null;
        busy = false;
        delete document.documentElement.dataset.snapCursorActive;
        window.removeEventListener('pointermove', onWindowPointerMove);
        if (!destroyed) drawFrame(next, 0);
        hint.textContent = hints[name === 'remove' ? 'restore' : 'remove'];
        syncVisibility();
      });
      return { cue, finished };
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      activeFinish?.();
      activeFinish = null;
      for (const sound of Object.values(sounds)) rewind(sound);
      target.removeEventListener('pointerenter', onPointerEnter);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointermove', onWindowPointerMove);
      delete target.dataset.snapCursorReady;
      delete document.documentElement.dataset.snapCursorActive;
      cursor.remove();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
