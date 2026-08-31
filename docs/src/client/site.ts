import Disintegrator from '../../../src/snapdom';
import type { BuiltInPreset, EffectDefinition, EffectOperation, RemovalId, SoundSelection } from '../../../src/types';
import { createDemoCard } from './demo-card';
import { mountParticlePlayground, presetNames } from './particle-playground';

type Locale = 'en' | 'ru' | 'zh' | 'ko';
type DemoKind = 'built-in' | 'particle-vortex';
type DisintegratorInstance = InstanceType<typeof Disintegrator>;

const locale = (document.body.dataset.locale ?? 'en') as Locale;
const instances = new Set<DisintegratorInstance>();
let particleVortexEffect: EffectDefinition | null = null;
let particleVortexSounds: SoundSelection | null = null;

const copy = {
  en: {
    sound: 'Sound',
    reset: 'Reset playground',
    ready: 'Ready',
    remove: 'Remove',
    restore: 'Restore',
    effectPair: 'Effect pair',
    operation: 'Operation',
    dom: 'DOM',
    restorePair: 'Restore pair',
    retainedId: 'Retained ID',
    connected: 'Connected',
    detached: 'Detached',
  },
  ru: {
    sound: 'Звук',
    reset: 'Сбросить демо',
    ready: 'Готово',
    remove: 'Удалить',
    restore: 'Восстановить',
    effectPair: 'Пара эффектов',
    operation: 'Операция',
    dom: 'DOM',
    restorePair: 'Эффект восстановления',
    retainedId: 'Сохранённый ID',
    connected: 'Подключён',
    detached: 'Отсоединён',
  },
  zh: {
    sound: '声音',
    reset: '重置演示',
    ready: '就绪',
    remove: '删除',
    restore: '恢复',
    effectPair: '效果对',
    operation: '操作',
    dom: 'DOM',
    restorePair: '恢复效果',
    retainedId: '保留 ID',
    connected: '已连接',
    detached: '已分离',
  },
  ko: {
    sound: '사운드',
    reset: '데모 초기화',
    ready: '준비됨',
    remove: '삭제',
    restore: '복원',
    effectPair: '효과 쌍',
    operation: '작업',
    dom: 'DOM',
    restorePair: '복원 효과',
    retainedId: '보관 ID',
    connected: '연결됨',
    detached: '분리됨',
  },
}[locale];

function required<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing documentation element: ${selector}`);
  return element;
}

function createDisintegrator(options: ConstructorParameters<typeof Disintegrator>[0]) {
  return new Disintegrator(options);
}

const packageManagerStorageKey = 'vanilla-disintegrate-package-manager';
const githubStarPromptStorageKey = 'vanilla-disintegrate-github-star-prompt';

function setupGitHubStarPrompt() {
  const prompt = document.querySelector<HTMLElement>('[data-github-star-prompt]');
  const close = prompt?.querySelector<HTMLButtonElement>('[data-github-star-close]');
  if (!prompt || !close) return;

  try {
    if (window.localStorage.getItem(githubStarPromptStorageKey)) return;
  } catch {
    // The prompt may still be shown when storage is unavailable.
  }

  const hide = () => {
    prompt.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!prompt.classList.contains('is-visible')) prompt.hidden = true;
    }, 180);
  };
  const dismiss = () => {
    hide();
    try {
      window.localStorage.setItem(githubStarPromptStorageKey, 'closed');
    } catch {
      // Closing still works when storage is unavailable.
    }
  };

  close.addEventListener('click', dismiss);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !prompt.hidden) dismiss();
  });
  window.setTimeout(() => {
    prompt.hidden = false;
    window.requestAnimationFrame(() => prompt.classList.add('is-visible'));
  }, 30_000);
}

function setupPackageInstall() {
  const roots = [...document.querySelectorAll<HTMLElement>('[data-package-install]')];
  if (roots.length === 0) return;

  const select = (manager: string, persist: boolean) => {
    let selected = manager;

    for (const root of roots) {
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-package-manager]')];
      const active = buttons.find((button) => button.dataset.packageManager === manager) ?? buttons[0];
      if (!active) continue;
      selected = active.dataset.packageManager ?? 'npm';
      root.style.setProperty('--package-manager-index', active.dataset.packageIndex ?? '0');
      required<HTMLElement>(root, '[data-install-command]').textContent = active.dataset.packageCommand ?? '';
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button === active)));
    }

    if (!persist) return;
    try {
      window.localStorage.setItem(packageManagerStorageKey, selected);
    } catch {
      // The switcher still works when storage is unavailable.
    }
  };

  let stored = 'npm';
  try {
    stored = window.localStorage.getItem(packageManagerStorageKey) ?? stored;
  } catch {
    // Use npm when storage is unavailable.
  }
  select(stored, false);

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-package-manager]')) {
    button.addEventListener('click', () => select(button.dataset.packageManager ?? 'npm', true));
  }

  window.addEventListener('storage', (event) => {
    if (event.key === packageManagerStorageKey && event.newValue) select(event.newValue, false);
  });
}

function setupNavigation() {
  const menuButton = document.querySelector<HTMLButtonElement>('[data-menu-button]');
  const sidebar = document.querySelector<HTMLElement>('[data-sidebar]');
  const mobileNavigation = document.querySelector<HTMLElement>('[data-mobile-nav]');
  const backdrop = document.querySelector<HTMLElement>('[data-sidebar-backdrop], [data-mobile-nav-backdrop]');
  const menu = sidebar ?? mobileNavigation;
  if (!menuButton || !menu) return;
  const mobileViewport = window.matchMedia('(max-width: 790px)');
  const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const setOpen = (open: boolean, restoreFocus = false) => {
    const wasOpen = document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    const hidden = mobileViewport.matches ? !open : mobileNavigation !== null;
    menu.inert = hidden;
    if (hidden) menu.setAttribute('aria-hidden', 'true');
    else menu.removeAttribute('aria-hidden');
    if (open) {
      window.requestAnimationFrame(() => menu.querySelector<HTMLElement>(focusableSelector)?.focus());
    } else if (restoreFocus && wasOpen) {
      menuButton.focus();
    }
  };

  setOpen(false);
  menuButton.addEventListener('click', () => setOpen(!document.body.classList.contains('menu-open'), true));
  backdrop?.addEventListener('click', () => setOpen(false, true));
  menu?.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (!document.body.classList.contains('menu-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false, true);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...menu.querySelectorAll<HTMLElement>(focusableSelector)].filter(
      (element) => !element.inert && element.getClientRects().length > 0,
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  mobileViewport.addEventListener('change', () => setOpen(false));
  document.addEventListener('click', (event) => {
    for (const switcher of document.querySelectorAll<HTMLDetailsElement>('[data-language-switcher][open]')) {
      if (!switcher.contains(event.target as Node)) switcher.open = false;
    }
  });
}

const analyticsStorageKey = 'vanilla-disintegrate-analytics';
const analyticsCounterId = 112076480;

function setupAnalytics() {
  type AnalyticsChoice = 'granted' | 'denied';
  type AnalyticsWindow = Window & {
    ym?: ((...arguments_: unknown[]) => void) & { a?: unknown[][]; l?: number };
  };
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(analyticsStorageKey);
  } catch {
    // Analytics stays enabled by default when storage is unavailable.
  }
  const toggles = [...document.querySelectorAll<HTMLButtonElement>('[data-analytics-toggle]')];
  const syncToggles = () => {
    const disabled = stored === 'denied';
    for (const toggle of toggles) {
      const label = disabled ? toggle.dataset.enableLabel : toggle.dataset.disableLabel;
      if (label !== undefined) toggle.textContent = label;
      toggle.classList.toggle('button-secondary', !disabled);
      toggle.setAttribute('aria-pressed', String(!disabled));
      toggle.dataset.analyticsReady = '';
      toggle.closest<HTMLElement>('[data-analytics-toggle-slot]')?.setAttribute('data-analytics-ready', '');
    }
  };
  const load = () => {
    const analyticsWindow = window as AnalyticsWindow;
    if (document.querySelector<HTMLScriptElement>('[data-yandex-metrica]')) return;
    analyticsWindow.ym ??= (...arguments_: unknown[]) => {
      (analyticsWindow.ym!.a ??= []).push(arguments_);
    };
    analyticsWindow.ym.l = Date.now();
    analyticsWindow.ym(analyticsCounterId, 'init', {
      accurateTrackBounce: true,
      clickmap: true,
      ssr: true,
      trackHash: true,
      trackLinks: true,
      webvisor: true,
    });
    const script = document.createElement('script');
    script.async = true;
    script.dataset.yandexMetrica = '';
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.append(script);
  };
  const select = (choice: AnalyticsChoice, reload = false) => {
    try {
      window.localStorage.setItem(analyticsStorageKey, choice);
    } catch {
      // The current choice still applies when storage is unavailable.
    }
    stored = choice;
    syncToggles();
    if (choice === 'granted') load();
    else {
      Reflect.set(window, `disableYaCounter${analyticsCounterId}`, true);
      if (reload) window.location.reload();
    }
  };

  if (stored !== 'denied') load();
  syncToggles();
  for (const toggle of toggles) {
    toggle.addEventListener('click', () => {
      const choice: AnalyticsChoice = stored === 'denied' ? 'granted' : 'denied';
      select(choice, choice === 'denied' && stored !== 'denied');
    });
  }
}

function setupCodeBlocks() {
  for (const pre of document.querySelectorAll<HTMLElement>('.page-content pre')) {
    if (pre.closest('.code-block')) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    const language = [...pre.classList].find((name) => name.startsWith('language-'))?.slice(9) ?? 'Code';
    toolbar.innerHTML = `<span>${language}</span><button type="button" data-copy-code>Copy</button>`;
    pre.before(wrapper);
    wrapper.append(toolbar, pre);
  }

  document.addEventListener('click', async (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-copy-code], [data-copy-install]');
    if (!button) return;
    const text = button.matches('[data-copy-install]')
      ? button.closest('[data-package-install]')?.querySelector('[data-install-command]')?.textContent
      : (
          button.closest('.code-block')?.querySelector('[data-code-panel]:not([hidden]) pre') ??
          button.closest('.code-block')?.querySelector('pre')
        )?.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text.trim());
      const previous = button.textContent;
      button.textContent = button.dataset.copiedLabel ?? 'Copied';
      window.setTimeout(() => {
        button.textContent = previous;
      }, 1400);
    } catch {
      button.textContent = button.dataset.failedLabel ?? 'Copy failed';
    }
  });
}

function setupCodeTabs() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-code-tabs]')) {
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-code-tab]')];
    const panels = [...root.querySelectorAll<HTMLElement>('[data-code-panel]')];
    const activate = (tab: HTMLButtonElement, focus: boolean) => {
      const selected = tab.dataset.codeTab;
      for (const candidate of tabs) {
        const active = candidate === tab;
        candidate.setAttribute('aria-selected', String(active));
        candidate.tabIndex = active ? 0 : -1;
      }
      for (const panel of panels) panel.hidden = panel.dataset.codePanel !== selected;
      if (focus) tab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab, false));
      tab.addEventListener('keydown', (event) => {
        let next: number;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        const target = tabs[next];
        if (target) activate(target, true);
      });
    });
  }
}

function setupToc() {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  const sections = links
    .map((link) => document.getElementById(link.dataset.tocLink ?? ''))
    .filter((section): section is HTMLElement => section !== null);
  if (!('IntersectionObserver' in window) || sections.length === 0) return;
  const visible = new Map<string, number>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
        else visible.delete(entry.target.id);
      }
      const active = [...visible].sort((left, right) => left[1] - right[1])[0]?.[0];
      if (active) for (const link of links) link.classList.toggle('is-active', link.dataset.tocLink === active);
    },
    { rootMargin: '-84px 0px -65% 0px', threshold: [0, 0.1, 1] },
  );
  sections.forEach((section) => observer.observe(section));
  links.filter((link) => link.dataset.tocLink === sections[0]?.id).forEach((link) => link.classList.add('is-active'));
}

function whenNear(element: HTMLElement, callback: () => void) {
  if (!('IntersectionObserver' in window)) {
    callback();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    },
    { rootMargin: '400px 0px' },
  );
  observer.observe(element);
}

function track(instance: DisintegratorInstance) {
  instances.add(instance);
  return instance;
}

function mountPairDemo(root: HTMLElement, kind: DemoKind) {
  const picker = kind === 'built-in';
  const effectLabel = kind === 'particle-vortex' ? 'Particle vortex' : presetNames.dust;
  root.innerHTML = `<div class="interactive-example"><div class="example-toolbar"><div class="example-setting"><span>${copy.effectPair}</span>${
    picker
      ? `<label class="select-control"><select data-effect>${Object.entries(presetNames)
          .map(([value, label]) => `<option value="${value}">${label}</option>`)
          .join('')}</select><i></i></label>`
      : `<strong>${effectLabel}</strong>`
  }</div><label class="sound-toggle"><input type="checkbox" data-sound checked><span></span>${copy.sound}</label></div><div class="example-stage" data-slot></div><div class="example-actions"><button class="button-primary" type="button" data-action="remove">${copy.remove}</button><button class="button-secondary" type="button" data-action="restore">${copy.restore}</button><button class="button-quiet" type="button" data-action="reset">${copy.reset}</button></div><dl class="example-state example-state-four" aria-live="polite"><div><dt>${copy.operation}</dt><dd data-operation>${copy.ready}</dd></div><div><dt>${copy.dom}</dt><dd data-dom>${copy.connected}</dd></div><div><dt>${copy.restorePair}</dt><dd data-pair>${effectLabel}</dd></div><div><dt>${copy.retainedId}</dt><dd data-id>none</dd></div></dl></div>`;

  const slot = required<HTMLElement>(root, '[data-slot]');
  const select = root.querySelector<HTMLSelectElement>('select[data-effect]');
  const sound = root.querySelector<HTMLInputElement>('[data-sound]');
  const remove = required<HTMLButtonElement>(root, '[data-action="remove"]');
  const restore = required<HTMLButtonElement>(root, '[data-action="restore"]');
  const state = required<HTMLElement>(root, '[data-operation]');
  const dom = required<HTMLElement>(root, '[data-dom]');
  const pair = required<HTMLElement>(root, '[data-pair]');
  const idOutput = required<HTMLElement>(root, '[data-id]');
  const demoSounds: SoundSelection | false = kind === 'particle-vortex' ? (particleVortexSounds ?? false) : false;
  const instanceSelection = () => {
    if (kind === 'built-in') return { preset: 'dust' as const };
    if (particleVortexEffect === null) throw new Error('The particle vortex demo is not loaded.');
    return { effect: particleVortexEffect, sound: demoSounds };
  };
  const instance = track(
    createDisintegrator({
      ...instanceSelection(),
      ...(demoSounds === false ? {} : { audioPreparation: { sounds: demoSounds } }),
      preparation: true,
      onError: (error) => {
        state.textContent = String(error);
      },
    }),
  );
  let card: HTMLElement | null = createDemoCard('example-card');
  let removalId: RemovalId | null = null;
  let busy = false;
  let remembered = effectLabel;
  let unregisterCard: (() => void) | null = null;
  const registerCard = (element: HTMLElement | null) => {
    unregisterCard?.();
    unregisterCard = element === null ? null : instance.register(element);
  };
  slot.append(card);
  registerCard(card);

  const selectedLabel = () =>
    kind === 'particle-vortex' ? 'Particle vortex' : presetNames[(select?.value ?? 'dust') as BuiltInPreset];
  const selectedOptions = () => (kind === 'built-in' ? { preset: (select?.value ?? 'dust') as BuiltInPreset } : {});
  const soundOptions = () => (sound?.checked === false ? { sound: false as const } : {});
  const update = () => {
    const connected = card?.isConnected === true;
    root.setAttribute('aria-busy', String(busy));
    remove.disabled = busy || !connected;
    restore.disabled = busy || (!connected && !removalId);
    dom.textContent = connected ? copy.connected : copy.detached;
    pair.textContent = remembered;
    idOutput.textContent = removalId ? String(removalId) : 'none';
    if (sound) sound.disabled = busy;
    if (select) select.disabled = busy;
  };
  const settle = async (operation: EffectOperation, done?: () => void) => {
    busy = true;
    state.textContent = operation.operation === 'remove' ? 'Removing…' : 'Restoring…';
    update();
    try {
      const result = await operation.finished;
      state.textContent = `${result.operation} · ${result.status}`;
      done?.();
    } finally {
      busy = false;
      update();
    }
  };
  remove.addEventListener('click', () => {
    if (!card || busy) return;
    const target = card;
    remembered = selectedLabel();
    const operation = instance.remove(target, { ...selectedOptions(), retain: true, ...soundOptions() });
    removalId = operation.removalId;
    void settle(operation, () => {
      card = target.isConnected ? target : null;
    });
  });
  restore.addEventListener('click', () => {
    if (busy) return;
    if (card?.isConnected) {
      remembered = selectedLabel();
      void settle(instance.restore(card, { ...selectedOptions(), ...soundOptions() }));
      return;
    }
    if (!removalId) return;
    const retained = instance.take(removalId);
    removalId = null;
    if (!retained) return update();
    card = retained;
    slot.append(retained);
    registerCard(retained);
    update();
    void settle(instance.restore(retained, soundOptions()));
  });
  required<HTMLButtonElement>(root, '[data-action="reset"]').addEventListener('click', () => {
    if (busy) return;
    if (removalId) instance.discard(removalId);
    removalId = null;
    card?.remove();
    card = createDemoCard('example-card');
    slot.replaceChildren(card);
    registerCard(card);
    remembered = selectedLabel();
    state.textContent = copy.ready;
    update();
  });
  select?.addEventListener('change', () => {
    if (!removalId) remembered = selectedLabel();
    update();
  });
  update();
}

export function setupSite() {
  setupNavigation();
  setupAnalytics();
  setupGitHubStarPrompt();
  setupPackageInstall();
  setupCodeTabs();
  setupCodeBlocks();
  setupToc();

  const demoRoots = [...document.querySelectorAll<HTMLElement>('[data-demo-root]')];
  const firstDemo = demoRoots[0];
  if (firstDemo) {
    whenNear(firstDemo, () => {
      const needsVortex = demoRoots.some((root) => root.dataset.demoKind === 'particle-vortex');
      const vortex = needsVortex ? import('../demo/particle-vortex') : Promise.resolve(null);
      void vortex
        .then((vortexModule) => {
          particleVortexEffect = vortexModule?.particleVortex ?? null;
          particleVortexSounds = vortexModule?.particleVortexSounds ?? null;
          for (const root of demoRoots) {
            const kind = (root.dataset.demoKind ?? 'built-in') as DemoKind;
            mountPairDemo(root, kind);
          }
          window.addEventListener(
            'pagehide',
            () => {
              instances.forEach((instance) => instance.destroy());
              instances.clear();
            },
            { once: true },
          );
        })
        .catch((error: unknown) => {
          for (const root of demoRoots) {
            root.setAttribute('role', 'alert');
            root.textContent = String(error);
          }
        });
    });
  }

  const playground = document.querySelector<HTMLElement>('[data-particle-playground]');
  if (playground) {
    try {
      mountParticlePlayground(playground);
    } catch (error: unknown) {
      playground.setAttribute('role', 'alert');
      playground.textContent = String(error);
    }
  }
}
