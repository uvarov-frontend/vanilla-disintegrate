import Disintegrator, {
  type BuiltInEffect,
  type EffectDefinition,
  type EffectOperation,
  type RemovalId,
} from '../../../src/snapdom';
import { particleVortex } from '../../../demo/particle-vortex';

type Locale = 'en' | 'ru' | 'zh' | 'ko';
type DemoKind = 'built-in' | 'preparation' | 'particle-vortex';

const locale = (document.body.dataset.locale ?? 'en') as Locale;
const instances = new Set<Disintegrator>();

const copy = {
  en: {
    choose: 'Choose animation',
    chooseHint: 'Used by the next remove or new element',
    sound: 'Sound',
    live: 'Live collection',
    next: 'Next action',
    add: 'Add new element',
    reset: 'Reset playground',
    nodes: 'DOM nodes',
    retained: 'Retained',
    last: 'Last operation',
    ready: 'Ready',
    empty: 'The live grid is empty.',
    emptyHint: 'Restore a retained card or create a new element.',
    retainedTitle: 'Retained elements',
    retainedHint: 'take(id) returns the original node once',
    discardAll: 'Discard all',
    noRetained: 'Remove a card with retain: true to see it here.',
    remove: 'Remove',
    restore: 'Restore',
    restoreAtEnd: 'Restore at end',
    preview: 'Preview restore',
    discard: 'Discard',
    effectPair: 'Effect pair',
    operation: 'Operation',
    dom: 'DOM',
    restorePair: 'Restore pair',
    retainedId: 'Retained ID',
    connected: 'Connected',
    detached: 'Detached',
    hint: 'Preview restore animates the connected card without removing it first.',
    snapshotPreparation: 'Snapshot preparation',
    prepareNow: 'Prepare now',
    invalidate: 'Invalidate',
    clearCache: 'Clear cache',
    prepared: 'Prepared',
    waiting: 'Scheduled',
    invalidated: 'Invalidated',
    cacheCleared: 'Cache cleared',
    preparationHint: 'register() keeps this card eligible for visible-idle preparation.',
  },
  ru: {
    choose: 'Выберите анимацию',
    chooseHint: 'Для следующего удаления или нового элемента',
    sound: 'Звук',
    live: 'Живая коллекция',
    next: 'Следующее действие',
    add: 'Добавить элемент',
    reset: 'Сбросить демо',
    nodes: 'DOM-узлы',
    retained: 'Сохранено',
    last: 'Последняя операция',
    ready: 'Готово',
    empty: 'В сетке не осталось карточек.',
    emptyHint: 'Верните сохранённую карточку или создайте новый элемент.',
    retainedTitle: 'Сохранённые элементы',
    retainedHint: 'take(id) один раз возвращает исходный узел',
    discardAll: 'Очистить все',
    noRetained: 'Удалите карточку с retain: true, и она появится здесь.',
    remove: 'Удалить',
    restore: 'Вернуть',
    restoreAtEnd: 'Вернуть в конец',
    preview: 'Показать восстановление',
    discard: 'Освободить',
    effectPair: 'Пара эффектов',
    operation: 'Операция',
    dom: 'DOM',
    restorePair: 'Эффект возврата',
    retainedId: 'Сохранённый ID',
    connected: 'Подключён',
    detached: 'Отсоединён',
    hint: 'Предпросмотр анимирует подключённую карточку без предварительного удаления.',
    snapshotPreparation: 'Подготовка снимков',
    prepareNow: 'Подготовить сейчас',
    invalidate: 'Инвалидировать',
    clearCache: 'Очистить кэш',
    prepared: 'Подготовлен',
    waiting: 'Запланирован',
    invalidated: 'Инвалидирован',
    cacheCleared: 'Кэш очищен',
    preparationHint: 'register() оставляет эту карточку кандидатом для visible-idle подготовки.',
  },
  zh: {
    choose: '选择动画',
    chooseHint: '用于下一次删除或新元素',
    sound: '声音',
    live: '实时集合',
    next: '下一次操作',
    add: '添加新元素',
    reset: '重置演示',
    nodes: 'DOM 节点',
    retained: '已保留',
    last: '最近操作',
    ready: '就绪',
    empty: '实时网格为空。',
    emptyHint: '恢复已保留卡片或创建新元素。',
    retainedTitle: '已保留元素',
    retainedHint: 'take(id) 只返回原节点一次',
    discardAll: '全部释放',
    noRetained: '使用 retain: true 删除卡片后会显示在这里。',
    remove: '删除',
    restore: '恢复',
    restoreAtEnd: '恢复到末尾',
    preview: '预览恢复',
    discard: '释放',
    effectPair: '效果对',
    operation: '操作',
    dom: 'DOM',
    restorePair: '恢复效果',
    retainedId: '保留 ID',
    connected: '已连接',
    detached: '已分离',
    hint: '预览恢复会直接动画显示当前卡片，无需先删除。',
    snapshotPreparation: '快照预准备',
    prepareNow: '立即准备',
    invalidate: '失效',
    clearCache: '清除缓存',
    prepared: '已准备',
    waiting: '已排队',
    invalidated: '已失效',
    cacheCleared: '缓存已清除',
    preparationHint: 'register() 会让这张卡片保持为 visible-idle 准备的候选项。',
  },
  ko: {
    choose: '애니메이션 선택',
    chooseHint: '다음 삭제 또는 새 요소에 사용',
    sound: '사운드',
    live: '실시간 컬렉션',
    next: '다음 작업',
    add: '새 요소 추가',
    reset: '데모 초기화',
    nodes: 'DOM 노드',
    retained: '보관됨',
    last: '마지막 작업',
    ready: '준비됨',
    empty: '실시간 그리드가 비었습니다.',
    emptyHint: '보관된 카드를 복원하거나 새 요소를 만드세요.',
    retainedTitle: '보관된 요소',
    retainedHint: 'take(id)는 원본 노드를 한 번 반환합니다',
    discardAll: '모두 해제',
    noRetained: 'retain: true로 카드를 삭제하면 여기에 표시됩니다.',
    remove: '삭제',
    restore: '복원',
    restoreAtEnd: '끝에 복원',
    preview: '복원 미리보기',
    discard: '해제',
    effectPair: '효과 쌍',
    operation: '작업',
    dom: 'DOM',
    restorePair: '복원 효과',
    retainedId: '보관 ID',
    connected: '연결됨',
    detached: '분리됨',
    hint: '복원 미리보기는 먼저 삭제하지 않고 연결된 카드를 애니메이션합니다.',
    snapshotPreparation: '스냅샷 준비',
    prepareNow: '지금 준비',
    invalidate: '무효화',
    clearCache: '캐시 비우기',
    prepared: '준비됨',
    waiting: '예약됨',
    invalidated: '무효화됨',
    cacheCleared: '캐시가 비워짐',
    preparationHint: 'register()는 이 카드를 visible-idle 준비 후보로 유지합니다.',
  },
}[locale];

const effectNames: Record<BuiltInEffect, string> = {
  dust: 'Rising dust',
  scatter: 'Fine scatter',
  vapor: 'Rising vapor',
  wind: 'Christmas wind',
};
const builtInEffectNames = Object.keys(effectNames) as BuiltInEffect[];

function required<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing documentation element: ${selector}`);
  return element;
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
  const setOpen = (open: boolean) => {
    document.body.classList.toggle('menu-open', open);
    menuButton?.setAttribute('aria-expanded', String(open));
    if (mobileNavigation) mobileNavigation.setAttribute('aria-hidden', String(!open));
  };

  menuButton?.addEventListener('click', () => setOpen(!document.body.classList.contains('menu-open')));
  backdrop?.addEventListener('click', () => setOpen(false));
  menu?.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
  document.addEventListener('click', (event) => {
    for (const switcher of document.querySelectorAll<HTMLDetailsElement>('[data-language-switcher][open]')) {
      if (!switcher.contains(event.target as Node)) switcher.open = false;
    }
  });
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

interface CardDefinition {
  readonly title: string;
  readonly category: string;
  readonly duration: string;
  readonly gradient: string;
}

const cards: readonly CardDefinition[] = [
  {
    title: 'The last lighthouse',
    category: 'Field notes',
    duration: '08 min',
    gradient: 'linear-gradient(145deg, #ff876f, #a1488c)',
  },
  {
    title: 'A map of quiet places',
    category: 'Travel log',
    duration: '12 min',
    gradient: 'linear-gradient(145deg, #5bd8c4, #3155c8)',
  },
  {
    title: 'Signals after midnight',
    category: 'Radio archive',
    duration: '16 min',
    gradient: 'linear-gradient(145deg, #ffc35c, #e94d78)',
  },
  {
    title: 'The clockmaker’s garden',
    category: 'Short story',
    duration: '09 min',
    gradient: 'linear-gradient(145deg, #83df78, #247f72)',
  },
];

function createCard(definition: CardDefinition, battle = false) {
  const card = document.createElement('article');
  card.className = battle ? 'battle-card' : 'example-card';
  card.dataset.cardTitle = definition.title;
  card.innerHTML = battle
    ? `<div class="battle-card-cover" style="--battle-gradient: ${definition.gradient}"><span></span><span></span><button type="button" data-remove>${copy.remove}</button></div><div class="battle-card-copy"><span>${definition.category}</span><h3>${definition.title}</h3><div><small>${definition.duration}</small><small>DOM element</small></div></div>`
    : `<div class="example-cover" aria-hidden="true"><span></span><span></span><span></span></div><div class="example-copy"><div><span class="example-kicker">${definition.category}</span><h3>${definition.title}</h3></div><p>A real DOM element captured in its current documentation layout.</p><div class="example-meta"><span>${definition.duration}</span><span>DOM element</span></div></div>`;
  return card;
}

function track(instance: Disintegrator) {
  instances.add(instance);
  return instance;
}

function mountBattle(root: HTMLElement) {
  root.innerHTML = `<div class="battle-demo"><div class="battle-toolbar"><div class="battle-effect-control"><div class="battle-control-heading"><span><strong>${copy.choose}</strong><small>${copy.chooseHint}</small></span></div><div class="battle-presets" role="group">${Object.entries(
    effectNames,
  )
    .map(
      ([value, label], index) =>
        `<button type="button" data-effect="${value}" data-battle-effect="${value}" aria-pressed="${String(index === 0)}"><i></i><span><b>${label}</b><small>${value}</small></span></button>`,
    )
    .join(
      '',
    )}</div></div><label class="sound-toggle battle-sound"><input type="checkbox" data-sound checked><span></span>${copy.sound}</label></div><div class="battle-stage" data-stage><div class="battle-stage-header"><div><i></i><i></i><i></i><span>${copy.live}</span></div><code data-next>${copy.next} · effect: 'dust'</code></div><div class="battle-grid" data-grid></div><div class="battle-empty" data-empty hidden><strong>${copy.empty}</strong><span>${copy.emptyHint}</span></div></div><div class="battle-commandbar"><dl class="battle-metrics"><div><dt>${copy.nodes}</dt><dd data-nodes>4</dd></div><div><dt>${copy.retained}</dt><dd data-retained>0</dd></div><div><dt>${copy.last}</dt><dd><output data-status>${copy.ready}</output></dd></div></dl><div class="battle-actions"><button class="button-primary" type="button" data-add>${copy.add}</button><button class="button-secondary" type="button" data-reset>${copy.reset}</button></div></div><div class="battle-history"><div class="battle-history-heading"><div><span>${copy.retainedTitle}</span><small><code>${copy.retainedHint}</code></small></div><button type="button" data-discard-all disabled>${copy.discardAll}</button></div><div class="battle-history-list" data-history></div></div></div>`;

  const grid = required<HTMLElement>(root, '[data-grid]');
  const stage = required<HTMLElement>(root, '[data-stage]');
  const empty = required<HTMLElement>(root, '[data-empty]');
  const status = required<HTMLOutputElement>(root, '[data-status]');
  const sound = required<HTMLInputElement>(root, '[data-sound]');
  const nodes = required<HTMLElement>(root, '[data-nodes]');
  const retainedCount = required<HTMLElement>(root, '[data-retained]');
  const history = required<HTMLElement>(root, '[data-history]');
  const discardAll = required<HTMLButtonElement>(root, '[data-discard-all]');
  const effectButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-effect]')];
  const retained = new Map<RemovalId, { title: string; effect: BuiltInEffect }>();
  const instance = track(
    new Disintegrator({
      audioPreparation: { effects: builtInEffectNames },
      preparation: true,
      sound: true,
      onError: (error) => {
        status.textContent = String(error);
      },
    }),
  );
  // Preparation acts only on registered elements, and the grid keeps changing.
  const registrations = new Map<HTMLElement, () => void>();
  const syncPreparation = () => {
    const current = new Set(grid.querySelectorAll<HTMLElement>('.battle-card'));
    for (const [element, unregister] of registrations) {
      if (current.has(element)) continue;
      unregister();
      registrations.delete(element);
    }
    for (const element of current) {
      if (!registrations.has(element)) registrations.set(element, instance.register(element));
    }
  };
  let effect: BuiltInEffect = 'dust';
  let busy = false;
  let sequence = 1;

  const renderHistory = () => {
    history.innerHTML =
      retained.size === 0
        ? `<p>${copy.noRetained}</p>`
        : [...retained]
            .map(
              ([id, item]) =>
                `<article class="retained-chip" data-id="${String(id)}"><span><b>${item.title}</b><small>${effectNames[item.effect]} · ${String(id)}</small></span><div><button type="button" data-restore>${copy.restoreAtEnd}</button><button type="button" data-discard>${copy.discard}</button></div></article>`,
            )
            .join('');
  };
  const update = () => {
    syncPreparation();
    const count = grid.querySelectorAll('.battle-card').length;
    root.setAttribute('aria-busy', String(busy));
    nodes.textContent = String(count);
    retainedCount.textContent = String(retained.size);
    grid.hidden = count === 0;
    empty.hidden = count > 0;
    stage.classList.toggle('is-empty', count === 0);
    for (const button of root.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy;
    discardAll.disabled = busy || retained.size === 0;
    sound.disabled = busy;
  };
  const settle = async (operation: EffectOperation, message: string) => {
    busy = true;
    status.textContent = operation.operation === 'remove' ? 'Removing…' : 'Restoring…';
    update();
    const startedAt = performance.now();
    try {
      const result = await operation.finished;
      const elapsed = Math.round(performance.now() - startedAt);
      status.textContent = `${message} · ${result.status} · ${elapsed} ms`;
    } finally {
      busy = false;
      renderHistory();
      update();
    }
  };
  const reset = () => {
    instance.discardAll();
    retained.clear();
    grid.replaceChildren(...cards.map((card) => createCard(card, true)));
    status.textContent = copy.ready;
    renderHistory();
    update();
  };

  root.addEventListener('click', (event) => {
    const target = event.target as Element;
    const effectButton = target.closest<HTMLButtonElement>('[data-effect]');
    if (effectButton && !busy) {
      effect = effectButton.dataset.effect as BuiltInEffect;
      effectButtons.forEach((button) => button.setAttribute('aria-pressed', String(button === effectButton)));
      required<HTMLElement>(root, '[data-next]').textContent = `${copy.next} · effect: '${effect}'`;
      return;
    }
    const remove = target.closest<HTMLButtonElement>('[data-remove]');
    if (remove && !busy) {
      const card = remove.closest<HTMLElement>('.battle-card');
      if (!card) return;
      const operation = instance.remove(card, { effect, retain: true, sound: sound.checked });
      if (operation.removalId)
        retained.set(operation.removalId, { title: card.dataset.cardTitle ?? 'Element', effect });
      void settle(operation, `${card.dataset.cardTitle ?? 'Element'} removed`);
      return;
    }
    const item = target.closest<HTMLElement>('[data-id]');
    const id = item ? [...retained.keys()].find((key) => String(key) === item.dataset.id) : undefined;
    if (id && target.closest('[data-restore]') && !busy) {
      const retainedElement = instance.take(id);
      const title = retained.get(id)?.title ?? 'Element';
      retained.delete(id);
      if (retainedElement) {
        grid.append(retainedElement);
        // The grid can be hidden after the last removal. Reveal it before restore()
        // measures the newly appended card's final geometry.
        update();
        void settle(instance.restore(retainedElement, { sound: sound.checked }), `${title} restored`);
      }
    } else if (id && target.closest('[data-discard]') && !busy) {
      instance.discard(id);
      retained.delete(id);
      renderHistory();
      update();
    }
  });
  required<HTMLButtonElement>(root, '[data-add]').addEventListener('click', () => {
    if (busy) return;
    const card = createCard(
      {
        title: `New arrival ${String(sequence++).padStart(2, '0')}`,
        category: 'Created just now',
        duration: 'new DOM',
        gradient: 'linear-gradient(145deg, #b88cff, #5b51bf)',
      },
      true,
    );
    grid.append(card);
    update();
    void settle(
      instance.restore(card, { effect, sound: sound.checked }),
      `${card.dataset.cardTitle ?? 'Element'} created`,
    );
  });
  required<HTMLButtonElement>(root, '[data-reset]').addEventListener('click', reset);
  discardAll.addEventListener('click', () => {
    instance.discardAll();
    retained.clear();
    renderHistory();
    update();
  });
  reset();
}

function mountPreparationDemo(root: HTMLElement) {
  root.innerHTML = `<div class="interactive-example preparation-demo"><div class="example-toolbar"><div class="example-setting"><span>${copy.snapshotPreparation}</span><strong>visible-idle</strong></div></div><div class="example-stage" data-slot></div><div class="example-actions"><button class="button-primary" type="button" data-action="prepare">${copy.prepareNow}</button><button class="button-secondary" type="button" data-action="invalidate">${copy.invalidate}</button><button class="button-secondary" type="button" data-action="clear">${copy.clearCache}</button><button class="button-quiet" type="button" data-action="reset">${copy.reset}</button></div><dl class="example-state" aria-live="polite"><div><dt>${copy.operation}</dt><dd data-operation>${copy.ready}</dd></div><div><dt>${copy.snapshotPreparation}</dt><dd data-cache>${copy.waiting}</dd></div><div><dt>${copy.dom}</dt><dd>${copy.connected}</dd></div></dl><p class="example-hint">${copy.preparationHint}</p></div>`;

  const slot = required<HTMLElement>(root, '[data-slot]');
  const prepare = required<HTMLButtonElement>(root, '[data-action="prepare"]');
  const invalidate = required<HTMLButtonElement>(root, '[data-action="invalidate"]');
  const clear = required<HTMLButtonElement>(root, '[data-action="clear"]');
  const reset = required<HTMLButtonElement>(root, '[data-action="reset"]');
  const operation = required<HTMLElement>(root, '[data-operation]');
  const cache = required<HTMLElement>(root, '[data-cache]');
  const card = createCard(cards[1]!);
  const instance = track(
    new Disintegrator({
      preparation: { strategy: 'visible-idle', fallbackDelay: 120, scrollSettle: 0 },
      onError: (error) => {
        operation.textContent = String(error);
      },
    }),
  );
  let busy = false;
  const setPreparationState = (
    state: 'scheduled' | 'preparing' | 'prepared' | 'invalidated' | 'cleared' | 'failed',
  ) => {
    root.dataset.preparationState = state;
  };

  slot.append(card);
  instance.register(card);
  setPreparationState('scheduled');

  const update = () => {
    root.setAttribute('aria-busy', String(busy));
    prepare.disabled = busy;
    invalidate.disabled = busy;
    clear.disabled = busy;
    reset.disabled = busy;
  };
  const prepareNow = async () => {
    if (busy) return;
    busy = true;
    setPreparationState('preparing');
    operation.textContent = `${copy.prepareNow}…`;
    update();
    try {
      await instance.prepare(card);
      setPreparationState('prepared');
      cache.textContent = copy.prepared;
      operation.textContent = copy.prepared;
    } catch (error) {
      setPreparationState('failed');
      operation.textContent = String(error);
    } finally {
      busy = false;
      update();
    }
  };

  prepare.addEventListener('click', () => void prepareNow());
  invalidate.addEventListener('click', () => {
    instance.invalidate(card);
    setPreparationState('invalidated');
    cache.textContent = copy.invalidated;
    operation.textContent = copy.invalidated;
  });
  clear.addEventListener('click', () => {
    instance.clearPrepared();
    setPreparationState('cleared');
    cache.textContent = copy.cacheCleared;
    operation.textContent = copy.cacheCleared;
  });
  reset.addEventListener('click', () => {
    instance.clearPrepared();
    instance.invalidate(card);
    setPreparationState('scheduled');
    cache.textContent = copy.waiting;
    operation.textContent = copy.ready;
  });
  update();
}

function mountPairDemo(root: HTMLElement, kind: DemoKind) {
  const picker = kind === 'built-in';
  const effectLabel = kind === 'particle-vortex' ? 'Particle vortex' : effectNames.dust;
  root.innerHTML = `<div class="interactive-example"><div class="example-toolbar"><div class="example-setting"><span>${copy.effectPair}</span>${
    picker
      ? `<label class="select-control"><select data-effect>${Object.entries(effectNames)
          .map(([value, label]) => `<option value="${value}">${label}</option>`)
          .join('')}</select><i></i></label>`
      : `<strong>${effectLabel}</strong>`
  }</div><label class="sound-toggle"><input type="checkbox" data-sound checked><span></span>${copy.sound}</label></div><div class="example-stage" data-slot></div><div class="example-actions"><button class="button-primary" type="button" data-action="remove">${copy.remove}</button><button class="button-secondary" type="button" data-action="restore">${copy.preview}</button><button class="button-quiet" type="button" data-action="reset">${copy.reset}</button></div><dl class="example-state" aria-live="polite"><div><dt>${copy.operation}</dt><dd data-operation>${copy.ready}</dd></div><div><dt>${copy.dom}</dt><dd data-dom>${copy.connected}</dd></div><div><dt>${copy.restorePair}</dt><dd data-pair>${effectLabel}</dd></div><div><dt>${copy.retainedId}</dt><dd data-id>none</dd></div></dl><p class="example-hint" data-hint>${copy.hint}</p></div>`;

  const slot = required<HTMLElement>(root, '[data-slot]');
  const select = root.querySelector<HTMLSelectElement>('select[data-effect]');
  const sound = root.querySelector<HTMLInputElement>('[data-sound]');
  const remove = required<HTMLButtonElement>(root, '[data-action="remove"]');
  const restore = required<HTMLButtonElement>(root, '[data-action="restore"]');
  const state = required<HTMLElement>(root, '[data-operation]');
  const dom = required<HTMLElement>(root, '[data-dom]');
  const pair = required<HTMLElement>(root, '[data-pair]');
  const idOutput = required<HTMLElement>(root, '[data-id]');
  const instance = track(
    new Disintegrator({
      ...(kind === 'built-in' ? { audioPreparation: { effects: builtInEffectNames }, sound: true as const } : {}),
      preparation: true,
      onError: (error) => {
        state.textContent = String(error);
      },
    }),
  );
  let card: HTMLElement | null = createCard(cards[2]!);
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

  const selected = (): BuiltInEffect | EffectDefinition => {
    if (kind === 'particle-vortex') return particleVortex;
    return (select?.value ?? 'dust') as BuiltInEffect;
  };
  const selectedLabel = () =>
    kind === 'particle-vortex' ? 'Particle vortex' : effectNames[(select?.value ?? 'dust') as BuiltInEffect];
  const soundOptions = () => (sound ? { sound: sound.checked } : {});
  const update = () => {
    const connected = card?.isConnected === true;
    root.setAttribute('aria-busy', String(busy));
    remove.disabled = busy || !connected;
    restore.disabled = busy || (!connected && !removalId);
    restore.textContent = connected ? copy.preview : copy.restore;
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
    const startedAt = performance.now();
    try {
      const result = await operation.finished;
      const elapsed = Math.round(performance.now() - startedAt);
      state.textContent = `${result.operation} · ${result.status} · ${elapsed} ms`;
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
    const operation = instance.remove(target, { effect: selected(), retain: true, ...soundOptions() });
    removalId = operation.removalId;
    void settle(operation, () => {
      card = target.isConnected ? target : null;
    });
  });
  restore.addEventListener('click', () => {
    if (busy) return;
    if (card?.isConnected) {
      remembered = selectedLabel();
      void settle(instance.restore(card, { effect: selected(), ...soundOptions() }));
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
    card = createCard(cards[2]!);
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
  setupGitHubStarPrompt();
  setupPackageInstall();
  setupCodeTabs();
  setupCodeBlocks();
  setupToc();

  for (const root of document.querySelectorAll<HTMLElement>('[data-demo-root]')) {
    const kind = (root.dataset.demoKind ?? 'built-in') as DemoKind;
    if (kind === 'preparation') mountPreparationDemo(root);
    else mountPairDemo(root, kind);
  }

  const battle = document.querySelector<HTMLElement>('[data-battle-root]');
  if (battle) mountBattle(battle);

  window.addEventListener('pagehide', () => {
    instances.forEach((instance) => instance.destroy());
    instances.clear();
  });
}
