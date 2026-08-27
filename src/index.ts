import { createSnapdomCapture, type SnapdomOptions } from './capture';
import { CoreDisintegrator } from './core';
import type { CoreDisintegratorOptions, DisintegrationHandle, SoundOptions, SnapshotCapture } from './types';

declare const __VANILLA_DISINTEGRATE_MODULE_URL__: string;

export const defaultSoundUrl = new URL('./sounds/disintegrate.mp3', __VANILLA_DISINTEGRATE_MODULE_URL__).href;

export interface DisintegratorOptions extends Omit<CoreDisintegratorOptions, 'capture' | 'sound'> {
  /** Override the built-in SnapDOM capture implementation. */
  capture?: SnapshotCapture;
  /** Enable the bundled sound with true, configure a sound, or disable it with false. */
  sound?: boolean | SoundOptions;
  /** Options forwarded to the built-in SnapDOM capture. */
  snapdom?: SnapdomOptions;
}

export interface BindOptions {
  /** Root used for event delegation and item discovery. Defaults to document. */
  root?: Document | HTMLElement | ShadowRoot;
  /** Selector matching elements that should be removed. */
  items: string;
  /** Selector matching the remove trigger inside an item. Defaults to [data-disintegrate]. */
  trigger?: string;
  /** Override configured sound for bound interactions. */
  sound?: boolean;
  /** Prevent the trigger's default browser action. Defaults to true. */
  preventDefault?: boolean;
  /** Runs after the original element is removed and the animation handle is available. */
  onRemove?: (handle: DisintegrationHandle, event: Event) => void;
}

export class Disintegrator extends CoreDisintegrator {
  private readonly bindings = new Set<() => void>();

  constructor(options: DisintegratorOptions = {}) {
    const { capture, snapdom, sound, ...coreOptions } = options;
    super({
      ...coreOptions,
      capture: capture ?? createSnapdomCapture(snapdom),
      sound: sound === true ? { src: defaultSoundUrl } : (sound ?? false),
    });
  }

  /** Bind remove triggers with event delegation and keep dynamic items prepared. */
  bind(options: BindOptions) {
    if (options.items.trim() === '') throw new TypeError('bind() requires a non-empty items selector.');
    const root = options.root ?? document;
    const triggerSelector = options.trigger ?? '[data-disintegrate]';
    const registrations = new Map<HTMLElement, () => void>();
    const inFlight = new WeakSet<HTMLElement>();

    const syncRegistrations = () => {
      const current = new Set(root.querySelectorAll<HTMLElement>(options.items));
      for (const [element, unregister] of registrations) {
        if (current.has(element)) continue;
        unregister();
        registrations.delete(element);
      }
      for (const element of current) {
        if (!registrations.has(element)) registrations.set(element, this.register(element));
      }
    };

    const contains = (element: Element) =>
      root instanceof Document ? root.documentElement.contains(element) : root.contains(element);
    const handleClick = (event: Event) => {
      const eventElement = event.target instanceof Element ? event.target : null;
      const trigger = eventElement?.closest(triggerSelector);
      if (trigger === null || trigger === undefined || !contains(trigger)) return;
      const item = trigger.closest<HTMLElement>(options.items);
      if (item === null || !contains(item) || inFlight.has(item)) return;

      if (options.preventDefault ?? true) event.preventDefault();
      inFlight.add(item);
      const operationOptions = options.sound === undefined ? {} : { sound: options.sound };
      void this.remove(item, operationOptions)
        .then((handle) => {
          options.onRemove?.(handle, event);
        })
        .finally(() => {
          inFlight.delete(item);
        });
    };

    syncRegistrations();
    root.addEventListener('click', handleClick);
    const observer = new MutationObserver(syncRegistrations);
    observer.observe(root instanceof Document ? root.documentElement : root, { childList: true, subtree: true });

    let active = true;
    const unbind = () => {
      if (!active) return;
      active = false;
      observer.disconnect();
      root.removeEventListener('click', handleClick);
      for (const unregister of registrations.values()) unregister();
      registrations.clear();
      this.bindings.delete(unbind);
    };
    this.bindings.add(unbind);
    return unbind;
  }

  override destroy() {
    for (const unbind of [...this.bindings]) unbind();
    super.destroy();
  }
}

export { CoreDisintegrator, createSnapdomCapture };
export type * from './types';
export type { SnapdomOptions } from './capture';

export default Disintegrator;
