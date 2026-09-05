import {
  formatEditableRangeValue,
  stateRangeValue,
  configurationFromPreset,
  isUntouchedPresetState,
  cloneConfiguration,
  configuredSound,
  playgroundEffect,
  findCustomSound,
  customSoundId,
  FALLBACK_SOUND,
  matchingParticlePreset,
  soundNumericKeys,
  stateFromBuiltInPreset,
  type RangeDefinition,
  type NumericKey,
  type PlaygroundUndoSnapshot,
  type PlaygroundCustomSounds,
  type PlaygroundOperation,
  type PlaygroundSoundSource,
} from './playground-state';
import { createDemoCard } from './demo-card';
import { renderParticlePlayground } from './playground-markup';
import { locale, copy, ranges } from './playground-copy';
import { playgroundStateFromHash, writeHash } from './playground-hash';
import Disintegrator, {
  type RemovalId,
  type SoundOptions,
  type EffectOperation,
  type ParticleCurve,
  type ParticleRelease,
  type BuiltInPreset,
} from '../../../src/snapdom';
import { formatFileSize, MAX_LOCAL_AUDIO_BYTES, audioDuration, MAX_LOCAL_AUDIO_SECONDS } from './playground-audio';
import { highlightedEffectSource, effectSource } from './playground-code';
import { PlaygroundPreview } from './playground-preview';
import { mountPlaygroundCardHint } from './playground-card-hint';
import {
  listPlaygroundAudio,
  savePlaygroundAudio,
  deletePlaygroundAudio,
  type StoredPlaygroundAudio,
} from './playground-audio-storage';

function isAbortError(error: unknown) {
  return (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError';
}

async function nextPaint() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function required<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing particle playground element: ${selector}`);
  return element;
}

function createPreviewCard() {
  return createDemoCard('playground-card');
}

/** Attaches behavior to the statically rendered particle configurator. */
export function mountParticlePlayground(root: HTMLElement) {
  if (!root.querySelector('.particle-playground')) root.innerHTML = renderParticlePlayground(locale);
  const cardHint = mountPlaygroundCardHint(root);

  const presetButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const curveSelect = required<HTMLSelectElement>(root, '[data-curve]');
  const releaseSelect = required<HTMLSelectElement>(root, '[data-release]');
  const soundEnabled = required<HTMLInputElement>(root, '[data-sound-enabled]');
  const soundState = required<HTMLOutputElement>(root, '[data-sound-state]');
  const soundSource = required<HTMLSelectElement>(root, '[data-sound-source]');
  const soundReverse = required<HTMLInputElement>(root, '[data-sound-reverse]');
  const localAudioInput = required<HTMLInputElement>(root, '[data-local-audio-input]');
  const localAudioMeta = required<HTMLElement>(root, '[data-local-audio-meta]');
  const localAudioChoose = required<HTMLElement>(root, '[data-local-audio-choose]');
  const localAudioRemove = required<HTMLButtonElement>(root, '[data-local-audio-remove]');
  const slot = required<HTMLElement>(root, '[data-slot]');
  const status = required<HTMLOutputElement>(root, '[data-status]');
  const code = required<HTMLElement>(root, '[data-code]');
  const remove = required<HTMLButtonElement>(root, '[data-action="remove"]');
  const restore = required<HTMLButtonElement>(root, '[data-action="restore"]');
  const reset = required<HTMLButtonElement>(root, '[data-action="reset"]');
  const undo = required<HTMLButtonElement>(root, '[data-action="undo"]');
  const operationButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-operation]')];
  const operationPanel = required<HTMLElement>(root, '#playground-operation-panel');
  const inputs = new Map<NumericKey, HTMLInputElement>();
  const valueInputs = new Map<NumericKey, HTMLInputElement>();
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-option]')) {
    inputs.set(input.dataset.option as NumericKey, input);
  }
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-value]')) {
    valueInputs.set(input.dataset.value as NumericKey, input);
  }
  const viewTabs = [...root.querySelectorAll<HTMLButtonElement>('[data-view-tab]')];
  const viewPanels = [...root.querySelectorAll<HTMLElement>('[data-view-panel]')];
  const activateViewTab = (tab: HTMLButtonElement, focus: boolean) => {
    const selected = tab.dataset.viewTab;
    for (const candidate of viewTabs) {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', String(active));
      candidate.tabIndex = active ? 0 : -1;
    }
    for (const panel of viewPanels) panel.hidden = panel.dataset.viewPanel !== selected;
    if (widthSwitch !== null) widthSwitch.hidden = selected === 'code';
    if (focus) tab.focus();
  };
  viewTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateViewTab(tab, false));
    tab.addEventListener('keydown', (event) => {
      let nextIndex: number;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % viewTabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + viewTabs.length) % viewTabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = viewTabs.length - 1;
      else return;
      event.preventDefault();
      const nextTab = viewTabs[nextIndex];
      if (nextTab) activateViewTab(nextTab, true);
    });
  });
  const widthButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-width-option]')];
  const widthSwitch = root.querySelector<HTMLElement>('.playground-width-tabs');
  // The card carries the width itself, so a node recreated by reset or taken back
  // out of retention keeps whatever the switch last selected.
  const applyCardWidth = (animate: boolean) => {
    const frame = card.querySelector<HTMLElement>('.demo-card-frame');
    const parts =
      frame === null ? [] : [...frame.children].filter((node): node is HTMLElement => node instanceof HTMLElement);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const morph = animate && frame !== null && parts.length > 0 && !reduced;
    // First: the geometry the browser is showing right now.
    const firstCard = morph ? card.getBoundingClientRect() : null;
    const firstFrame = morph && frame !== null ? frame.getBoundingClientRect() : null;
    const firstParts = morph ? parts.map((part) => part.getBoundingClientRect()) : [];

    card.dataset.cardWidth = cardWidth;
    for (const button of widthButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.widthOption === cardWidth));
    }
    if (!morph || firstCard === null || firstFrame === null || frame === null) return;

    // Last: the frame wraps between one column and two, so the cover jumps from
    // above the copy to beside it. Pinning both halves lets them travel instead.
    const lastCard = card.getBoundingClientRect();
    const lastFrame = frame.getBoundingClientRect();
    const lastParts = parts.map((part) => part.getBoundingClientRect());
    const timing: KeyframeAnimationOptions = {
      duration: 320,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both',
    };
    frame.dataset.morphing = '';
    const box = (first: DOMRect, origin: DOMRect) => ({
      // Absolute offsets start inside the frame border, whereas rects include it.
      translate: `${first.left - origin.left - frame.clientLeft}px ${first.top - origin.top - frame.clientTop}px`,
      width: `${first.width}px`,
      height: `${first.height}px`,
    });
    const running = parts.map((part, index) =>
      part.animate([box(firstParts[index]!, firstFrame), box(lastParts[index]!, lastFrame)], timing),
    );
    running.push(
      card.animate(
        [
          { width: `${firstCard.width}px`, height: `${firstCard.height}px` },
          { width: `${lastCard.width}px`, height: `${lastCard.height}px` },
        ],
        timing,
      ),
    );
    void Promise.allSettled(running.map((animation) => animation.finished)).then(() => {
      delete frame.dataset.morphing;
      for (const animation of running) animation.cancel();
      // The prepared snapshot still holds the old geometry.
      void prepare();
    });
  };
  for (const button of widthButtons) {
    button.addEventListener('click', () => {
      const selected = button.dataset.widthOption === 'wide' ? 'wide' : 'narrow';
      if (selected === cardWidth) return;
      previews.cancel();
      if (!reconnectRetainedCard()) return;
      cardWidth = selected;
      applyCardWidth(true);
      flushHash();
    });
  }

  const groupTabs = [...root.querySelectorAll<HTMLButtonElement>('[data-group-tab]')];
  const groupPanels = [...root.querySelectorAll<HTMLElement>('[data-group-panel]')];
  const activateGroupTab = (tab: HTMLButtonElement, focus: boolean) => {
    const selected = tab.dataset.groupTab;
    for (const candidate of groupTabs) {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', String(active));
      candidate.tabIndex = active ? 0 : -1;
    }
    for (const panel of groupPanels) panel.hidden = panel.dataset.groupPanel !== selected;
    if (focus) tab.focus();
  };
  groupTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateGroupTab(tab, false));
    tab.addEventListener('keydown', (event) => {
      let nextIndex: number;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % groupTabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + groupTabs.length) % groupTabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = groupTabs.length - 1;
      else return;
      event.preventDefault();
      const nextTab = groupTabs[nextIndex];
      if (nextTab) activateGroupTab(nextTab, true);
    });
  });
  const hashState = playgroundStateFromHash();
  let configuration = hashState?.configuration ?? configurationFromPreset('dust');
  let activeOperation = hashState?.operation ?? 'remove';
  let cardWidth = hashState?.cardWidth ?? 'narrow';
  let undoSnapshot: PlaygroundUndoSnapshot | null = null;
  const hasCustomizedConfiguration = () =>
    !isUntouchedPresetState(configuration.remove, 'remove') ||
    !isUntouchedPresetState(configuration.restore, 'restore');
  const createUndoSnapshot = (): PlaygroundUndoSnapshot => ({
    configuration: cloneConfiguration(configuration),
    operation: activeOperation,
    cardWidth,
  });
  let customSounds: PlaygroundCustomSounds = [];
  // The store is read asynchronously; until it answers, a `custom:` source from the
  // URL is unresolved rather than unknown, so it must not be replaced yet.
  let customSoundsLoaded = false;
  // Never derived from the list length: a deletion would let the next fallback entry
  // reuse a live id, and both options would then address the same file.
  let sessionAudioCount = 0;
  let card = slot.querySelector<HTMLElement>('.playground-card') ?? createPreviewCard();
  let removalId: RemovalId | null = null;
  let unregister: () => void = () => undefined;
  let busy = false;
  let runningOperation: EffectOperation | null = null;
  let hashTimer: number | null = null;
  const initialSounds = (['remove', 'restore'] as const)
    .map((operation) => configuredSound(configuration[operation], customSounds))
    .filter((sound): sound is SoundOptions => sound !== null);
  const instance = new Disintegrator({
    audioPreparation: initialSounds.length > 0 ? { sounds: initialSounds } : false,
    effect: playgroundEffect(configuration),
    layout: false,
    // Registration begins after the initial stable capture below, then keeps
    // snapshots current after later invalidations.
    preparation: { strategy: 'idle', observeMutations: false },
    random: () => 0.314_159_265,
    onError: (error) => {
      status.textContent = String(error);
    },
  });

  const registerCard = () => {
    unregister();
    unregister = instance.register(card);
  };
  const updateActions = () => {
    root.setAttribute('aria-busy', String(busy));
    if (busy) cardHint.hide();
    const canReconnect = card.isConnected || removalId !== null;
    for (const button of widthButtons) button.disabled = !canReconnect;
    remove.disabled = !canReconnect;
    restore.disabled = !canReconnect;
    restore.textContent = copy.restore;
    reset.disabled = false;
    undo.disabled = undoSnapshot === null;
  };
  const reconnectRetainedCard = () => {
    if (card.isConnected) return true;
    if (removalId === null) return false;
    const retained = instance.take(removalId);
    removalId = null;
    if (!retained) {
      updateActions();
      return false;
    }
    card = retained;
    slot.append(card);
    registerCard();
    updateActions();
    return true;
  };
  const render = () => {
    const state = configuration[activeOperation];
    root.dataset.playgroundOperation = activeOperation;
    root.dataset.soundEnabled = String(state.soundEnabled);
    soundEnabled.checked = state.soundEnabled;
    soundState.textContent = state.soundEnabled ? copy.on : copy.off;
    soundReverse.checked = state.soundReverse;
    // Reverse, the sound source, and the custom-file picker only matter once
    // sound plays, same as the numeric sliders below.
    soundReverse.disabled = !state.soundEnabled;
    soundSource.disabled = !state.soundEnabled;
    localAudioInput.disabled = !state.soundEnabled;
    // Every file in IndexedDB is a real option, so the whole library survives a
    // reload and both operations can pick from it.
    for (const stale of soundSource.querySelectorAll('option[value^="custom:"]')) stale.remove();
    for (const sound of customSounds) {
      const option = soundSource.appendChild(document.createElement('option'));
      option.value = `custom:${sound.id}`;
      option.textContent = sound.name;
    }
    const localSound = findCustomSound(state.soundSource, customSounds);
    // A link may name a file this browser never stored; fall back rather than go silent.
    if (customSoundsLoaded && customSoundId(state.soundSource) !== null && localSound === null) {
      state.soundSource = FALLBACK_SOUND;
    }
    if ([...soundSource.options].some((option) => option.value === state.soundSource)) {
      soundSource.value = state.soundSource;
    }
    localAudioChoose.title = copy.chooseSound;
    // The note describes the selected source, so a bundled sound never claims to be
    // stored locally and the line keeps the same shape either way.
    localAudioMeta.textContent =
      localSound === null
        ? copy.bundledSoundNote
        : `${formatFileSize(localSound.size)} · ${localSound.type || 'audio'} · ${copy.localSoundNote}`;
    localAudioRemove.hidden = localSound === null;
    const selectedPreset = matchingParticlePreset(state);
    for (const button of presetButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.preset === selectedPreset));
    }
    for (const button of operationButtons) {
      const active = button.dataset.operation === activeOperation;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    operationPanel.setAttribute('aria-labelledby', `playground-operation-tab-${activeOperation}`);
    curveSelect.value = state.curve;
    releaseSelect.value = state.release;
    for (const range of ranges) {
      const input = inputs.get(range.key);
      if (input) {
        input.value = String(state[range.key]);
        input.disabled = !state.soundEnabled && soundNumericKeys.includes(range.key);
        const progress = ((state[range.key] - range.min) / (range.max - range.min)) * 100;
        input.style.setProperty('--range-progress', `${progress}%`);
      }
      const valueInput = valueInputs.get(range.key);
      if (valueInput) {
        valueInput.value = formatEditableRangeValue(range, state[range.key]);
        valueInput.disabled = !state.soundEnabled && soundNumericKeys.includes(range.key);
      }
    }
    code.innerHTML = highlightedEffectSource(configuration, customSounds);
    updateActions();
  };
  const interruptOperation = () => {
    const operation = runningOperation;
    if (operation === null) return;
    runningOperation = null;
    // Cancellation synchronously cleans up visuals and commits a retained removal.
    operation.cancel();
    reconnectRetainedCard();
    busy = false;
    updateActions();
  };
  const run = async (operation: EffectOperation) => {
    runningOperation = operation;
    if (operation.operation === 'remove') removalId = operation.removalId;
    busy = true;
    status.textContent = operation.operation === 'remove' ? `${copy.remove}…` : `${copy.restore}…`;
    updateActions();
    const startedAt = performance.now();
    try {
      const result = await operation.finished;
      if (runningOperation !== operation) return false;
      status.textContent = `${result.operation} · ${result.status} · ${Math.round(performance.now() - startedAt)} ms`;
      return true;
    } finally {
      // A cancelled operation must not clear the new operation's busy state.
      if (runningOperation === operation) {
        runningOperation = null;
        busy = false;
        updateActions();
        previews.resume();
      }
    }
  };
  const preview = async () => {
    if (!reconnectRetainedCard()) return;
    const effect = playgroundEffect(configuration);
    const sound = configuredSound(configuration[activeOperation], customSounds) ?? false;
    if (activeOperation === 'restore') {
      await run(instance.restore(card, { effect, sound }));
      return;
    }
    const operation = instance.remove(card, {
      effect,
      layout: false,
      retain: true,
      sound,
    });
    if (await run(operation)) reconnectRetainedCard();
  };
  const previews = new PlaygroundPreview({
    isBusy: () => busy,
    interrupt: interruptOperation,
    run: preview,
    onChange: updateActions,
    onError: (error) => {
      status.textContent = String(error);
    },
  });
  const schedulePreview = () => previews.schedule();
  const scheduleHash = () => {
    if (hashTimer !== null) window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      hashTimer = null;
      writeHash(configuration, activeOperation, cardWidth);
    }, 100);
  };
  const flushHash = () => {
    if (hashTimer !== null) window.clearTimeout(hashTimer);
    hashTimer = null;
    writeHash(configuration, activeOperation, cardWidth);
  };
  const commitConfigurationChange = (changed?: NumericKey, committed = false) => {
    const state = configuration[activeOperation];
    if (state.horizontalMin > state.horizontalMax) {
      if (changed === 'horizontalMin') state.horizontalMax = state.horizontalMin;
      else state.horizontalMin = state.horizontalMax;
    }
    if (state.verticalMin > state.verticalMax) {
      if (changed === 'verticalMin') state.verticalMax = state.verticalMin;
      else state.verticalMin = state.verticalMax;
    }
    if (state.rotationMin > state.rotationMax) {
      if (changed === 'rotationMin') state.rotationMax = state.rotationMin;
      else state.rotationMin = state.rotationMax;
    }
    status.textContent = copy.updated;
    // A click, an Enter or a select change is a decision, and reloading right after one
    // must not lose it: `replaceState` during unload no longer reaches the URL the
    // browser is already navigating to. The debounce stays for streams of input events.
    if (committed) flushHash();
    else scheduleHash();
    render();
    schedulePreview();
  };
  const syncFromControls = (changed?: NumericKey, committed = false) => {
    const state = configuration[activeOperation];
    state.curve = curveSelect.value as ParticleCurve;
    state.release = releaseSelect.value as ParticleRelease;
    if (changed !== undefined) {
      const value = Number(inputs.get(changed)?.value);
      if (Number.isFinite(value)) state[changed] = value;
    }
    commitConfigurationChange(changed, committed);
  };
  const syncFromValueInput = (range: RangeDefinition, input: HTMLInputElement) => {
    if (!Number.isFinite(input.valueAsNumber)) {
      render();
      return;
    }
    const value = stateRangeValue(range, input.valueAsNumber);
    configuration[activeOperation][range.key] = Math.min(range.max, Math.max(range.min, value));
    commitConfigurationChange(range.key, true);
  };
  const prepare = async () => {
    status.textContent = copy.preparing;
    try {
      await instance.prepare(card);
      if (!busy) status.textContent = copy.ready;
    } catch (error: unknown) {
      status.textContent = String(error);
    }
  };
  const prepareOperationSound = (operation: PlaygroundOperation) => {
    const sound = configuredSound(configuration[operation], customSounds);
    if (sound === null) return Promise.resolve();
    return instance.prepareAudio(sound);
  };
  const prepareOperationSoundInBackground = (operation: PlaygroundOperation) => {
    void prepareOperationSound(operation).catch((error: unknown) => {
      if (!isAbortError(error)) status.textContent = String(error);
    });
  };
  const prepareBothOperationSoundsInBackground = () => {
    void Promise.all([prepareOperationSound('remove'), prepareOperationSound('restore')]).catch((error: unknown) => {
      if (!isAbortError(error)) status.textContent = String(error);
    });
  };

  // Keep the server-rendered SVG connected: appending it again detaches and
  // reinserts the visible card, needlessly rebuilding its paint state in Chrome.
  if (card.parentElement !== slot) slot.append(card);
  applyCardWidth(false);
  render();
  void (async () => {
    await document.fonts?.ready;
    await nextPaint();
    if (busy || !card.isConnected) return;
    await prepare();
    if (!busy && card.isConnected) registerCard();
  })();

  // A prepared snapshot is a picture of the card under the palette that was active when
  // it was taken, so a theme switch leaves the effect tearing apart the previous look.
  // Watching the attribute keeps this independent of whatever flips the theme.
  let appliedTheme = document.documentElement.dataset.theme;
  const themeObserver = new MutationObserver(() => {
    const theme = document.documentElement.dataset.theme;
    if (theme === appliedTheme) return;
    appliedTheme = theme;
    // One frame lets the new palette paint before the capture reads the card.
    requestAnimationFrame(() => {
      if (!busy) void prepare();
    });
  });
  themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  void listPlaygroundAudio()
    .then((stored) => {
      customSounds = stored;
      customSoundsLoaded = true;
      render();
      return Promise.all(
        (['remove', 'restore'] as const)
          .filter((operation) => findCustomSound(configuration[operation].soundSource, customSounds) !== null)
          .map((operation) => prepareOperationSound(operation)),
      );
    })
    .catch(() => {
      // Private browsing and storage policies may disable persistence; in-memory files still work.
      customSoundsLoaded = true;
      render();
    });

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      // Only the tab in view changes. Rebuilding both phases from one preset would
      // silently discard whatever the other tab had, including a different preset
      // or hand-tuned values the visitor had not touched yet.
      const preset = button.dataset.preset as BuiltInPreset;
      undoSnapshot = hasCustomizedConfiguration() ? createUndoSnapshot() : null;
      const previous = configuredSound(configuration[activeOperation], customSounds);
      if (previous !== null) instance.discardPreparedAudio(previous);
      configuration = { ...configuration, [activeOperation]: stateFromBuiltInPreset(preset, activeOperation) };
      prepareOperationSoundInBackground(activeOperation);
      flushHash();
      render();
      schedulePreview();
    });
  }
  curveSelect.addEventListener('change', () => syncFromControls(undefined, true));
  releaseSelect.addEventListener('change', () => syncFromControls(undefined, true));
  for (const [key, input] of inputs) input.addEventListener('input', () => syncFromControls(key));
  for (const range of ranges) {
    const input = valueInputs.get(range.key);
    if (!input) continue;
    input.addEventListener('focus', () => input.select());
    input.addEventListener('change', () => syncFromValueInput(range, input));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        render();
        input.blur();
      }
    });
  }
  for (const button of operationButtons) {
    button.addEventListener('click', () => {
      const operation = button.dataset.operation as PlaygroundOperation;
      if (operation === activeOperation) return;
      activeOperation = operation;
      status.textContent = copy.updated;
      flushHash();
      render();
      schedulePreview();
    });
  }
  operationButtons.forEach((button, index) => {
    button.addEventListener('keydown', (event) => {
      let nextIndex: number;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % operationButtons.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + operationButtons.length) % operationButtons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = operationButtons.length - 1;
      else return;
      event.preventDefault();
      operationButtons[nextIndex]?.click();
      operationButtons[nextIndex]?.focus();
    });
  });
  soundEnabled.addEventListener('change', () => {
    const state = configuration[activeOperation];
    state.soundEnabled = soundEnabled.checked;
    status.textContent = copy.updated;
    if (state.soundEnabled) prepareOperationSoundInBackground(activeOperation);
    flushHash();
    render();
    schedulePreview();
  });
  soundSource.addEventListener('change', () => {
    const operation = activeOperation;
    const state = configuration[operation];
    const previous = configuredSound(state, customSounds);
    if (previous !== null) instance.discardPreparedAudio(previous);
    state.soundSource = soundSource.value as PlaygroundSoundSource;
    status.textContent = copy.updated;
    flushHash();
    render();
    prepareOperationSoundInBackground(operation);
    schedulePreview();
  });
  soundReverse.addEventListener('change', () => {
    const operation = activeOperation;
    const state = configuration[operation];
    const previous = configuredSound(state, customSounds);
    if (previous !== null) instance.discardPreparedAudio(previous);
    state.soundReverse = soundReverse.checked;
    status.textContent = copy.updated;
    flushHash();
    render();
    prepareOperationSoundInBackground(operation);
    schedulePreview();
  });
  localAudioInput.addEventListener('change', async () => {
    const file = localAudioInput.files?.[0];
    localAudioInput.value = '';
    if (file === undefined) return;
    const operation = activeOperation;
    if (file.size > MAX_LOCAL_AUDIO_BYTES) {
      status.textContent = copy.audioTooLarge;
      return;
    }
    if (file.type !== '' && !file.type.startsWith('audio/')) {
      status.textContent = copy.audioInvalid;
      return;
    }
    status.textContent = copy.audioSaving;
    try {
      const duration = await audioDuration(file);
      if (duration > MAX_LOCAL_AUDIO_SECONDS) throw new RangeError(copy.audioTooLong);
      const previous = configuredSound(configuration[operation], customSounds);
      if (previous !== null) instance.discardPreparedAudio(previous);
      const stored = await savePlaygroundAudio(file).catch(
        () =>
          ({
            id: `session-${String((sessionAudioCount += 1))}`,
            blob: file,
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
          }) satisfies StoredPlaygroundAudio,
      );
      customSounds = [...customSounds, stored];
      configuration[operation].soundSource = `custom:${stored.id}`;
      configuration[operation].soundEnabled = true;
      status.textContent = copy.updated;
      // Persist the URL state before exposing the completed upload state so an
      // immediate reload cannot restore the previously selected source.
      flushHash();
      render();
      await prepareOperationSound(operation);
      if (operation === activeOperation) schedulePreview();
    } catch (error: unknown) {
      status.textContent = error instanceof RangeError ? error.message : copy.audioInvalid;
    }
  });
  localAudioRemove.addEventListener('click', () => {
    const operation = activeOperation;
    const state = configuration[operation];
    const removed = findCustomSound(state.soundSource, customSounds);
    if (removed === null) return;
    const previous = configuredSound(state, customSounds);
    if (previous !== null) instance.discardPreparedAudio(previous);
    customSounds = customSounds.filter((sound) => sound.id !== removed.id);
    // Both operations may point at the file that just left the store.
    for (const target of ['remove', 'restore'] as const) {
      if (customSoundId(configuration[target].soundSource) === removed.id) {
        configuration[target].soundSource = FALLBACK_SOUND;
      }
    }
    status.textContent = copy.updated;
    flushHash();
    render();
    void deletePlaygroundAudio(removed.id).catch(() => undefined);
    prepareOperationSoundInBackground(operation);
    schedulePreview();
  });

  remove.addEventListener('click', () => {
    previews.cancel();
    if (!reconnectRetainedCard()) return;
    const operation = instance.remove(card, {
      effect: playgroundEffect(configuration),
      layout: false,
      retain: true,
      sound: configuredSound(configuration.remove, customSounds) ?? false,
    });
    removalId = operation.removalId;
    void run(operation);
  });
  restore.addEventListener('click', () => {
    previews.cancel();
    if (!reconnectRetainedCard()) return;
    if (card.isConnected) {
      void run(
        instance.restore(card, {
          effect: playgroundEffect(configuration),
          sound: configuredSound(configuration.restore, customSounds) ?? false,
        }),
      );
    }
  });
  undo.addEventListener('click', () => {
    if (undoSnapshot === null) return;
    previews.cancel();
    reconnectRetainedCard();
    const snapshot = undoSnapshot;
    // Single step: taking it clears it, so a second press cannot walk further back
    // than the one state that was actually captured.
    undoSnapshot = null;
    for (const operation of ['remove', 'restore'] as const) {
      const previous = configuredSound(configuration[operation], customSounds);
      if (previous !== null) instance.discardPreparedAudio(previous);
    }
    configuration = snapshot.configuration;
    activeOperation = snapshot.operation;
    cardWidth = snapshot.cardWidth;
    applyCardWidth(false);
    prepareBothOperationSoundsInBackground();
    flushHash();
    render();
    schedulePreview();
  });
  reset.addEventListener('click', () => {
    undoSnapshot =
      hasCustomizedConfiguration() || activeOperation !== 'remove' || cardWidth !== 'narrow'
        ? createUndoSnapshot()
        : null;
    previews.cancel();
    if (removalId !== null) instance.discard(removalId);
    removalId = null;
    unregister();
    card.remove();
    card = createPreviewCard();
    slot.replaceChildren(card);
    registerCard();
    cardWidth = 'narrow';
    applyCardWidth(false);
    activeOperation = 'remove';
    configuration = configurationFromPreset('dust');
    prepareBothOperationSoundsInBackground();
    flushHash();
    render();
    void prepare();
  });

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-copy]');
    if (!button) return;
    const target = button.dataset.copy;
    if (!target) return;
    flushHash();
    const text = target === 'effect' ? effectSource(configuration, customSounds) : window.location.href;
    const originalLabel = button.getAttribute('aria-label') ?? '';
    const write = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error(copy.copyFailed));
    void write
      .then(() => {
        button.dataset.copyState = 'success';
        button.setAttribute('aria-label', `${originalLabel}. ${copy.copied}`);
      })
      .catch(() => {
        button.dataset.copyState = 'error';
        button.setAttribute('aria-label', `${originalLabel}. ${copy.copyFailed}`);
      })
      .finally(() => {
        window.setTimeout(() => {
          delete button.dataset.copyState;
          button.setAttribute('aria-label', originalLabel);
        }, 1400);
      });
  });

  window.addEventListener('pagehide', (event) => {
    cardHint.hide(true);
    previews.cancel();
    if (hashTimer !== null) flushHash();
    if (event.persisted) return;
    cardHint.dispose();
    previews.dispose();
    themeObserver.disconnect();
    unregister();
    instance.destroy();
  });
}
export { presetNames } from './playground-copy';
export { renderParticlePlayground } from './playground-markup';
