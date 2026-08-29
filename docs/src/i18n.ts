export const locales = ['en', 'ru', 'zh', 'ko'] as const;

export type Locale = (typeof locales)[number];

export interface UiCopy {
  readonly language: string;
  readonly learn: string;
  readonly reference: string;
  readonly menu: string;
  readonly onThisPage: string;
  readonly previous: string;
  readonly next: string;
  readonly edit: string;
  readonly source: string;
  readonly sections: Readonly<Record<'start' | 'learn' | 'reference', string>>;
  readonly notFound: {
    readonly documentTitle: string;
    readonly description: string;
    readonly errorLabel: string;
    readonly heading: string;
    readonly body: string;
    readonly action: string;
    readonly homeAction: string;
  };
  readonly home: {
    readonly documentTitle: string;
    readonly title: string;
    readonly accent: string;
    readonly description: string;
    readonly tryLabel: string;
    readonly playgroundKicker: string;
    readonly playgroundTitle: string;
    readonly playgroundDescription: string;
    readonly customKicker: string;
    readonly customTitle: string;
    readonly customDescription: string;
    readonly codeLabel: string;
    readonly codeTitle: string;
    readonly codeDescription: string;
    readonly customGuide: string;
    readonly openGuide: string;
    readonly docsKicker: string;
    readonly docsTitle: string;
    readonly docsDescription: string;
  };
}

export const localeNames: Readonly<Record<Locale, string>> = {
  en: 'English',
  ru: 'Русский',
  zh: '简体中文',
  ko: '한국어',
};

export const ui: Readonly<Record<Locale, UiCopy>> = {
  en: {
    language: 'Language',
    learn: 'Learn',
    reference: 'Reference',
    menu: 'Open documentation navigation',
    onThisPage: 'On this page',
    previous: 'Previous',
    next: 'Next',
    edit: 'Edit this page on GitHub',
    source: 'Source on GitHub',
    sections: { start: 'Start', learn: 'Learn', reference: 'Reference' },
    notFound: {
      documentTitle: 'Page not found · Vanilla Disintegrate',
      description: 'The requested page was not found.',
      errorLabel: 'Error 404',
      heading: 'Page not found',
      body: 'The documentation page does not exist or has moved.',
      action: 'Open documentation',
      homeAction: 'Go to home',
    },
    home: {
      documentTitle: 'Vanilla Disintegrate · Thanos snap effects for the DOM',
      title: 'Remove any element',
      accent: 'with a Thanos snap',
      description:
        'A lightweight TypeScript library for removing and restoring any DOM element with a Thanos-snap effect. Choose one of four ready-made animations or create your own — with no CSS and no framework lock-in.',
      tryLabel: 'Try it with real DOM',
      playgroundKicker: 'Live Thanos snap',
      playgroundTitle: 'Snap it away. Bring it back.',
      playgroundDescription:
        'Every card is a real DOM element. Pick an animation, remove a card, then restore that same card from the list below.',
      customKicker: 'Custom effect',
      customTitle: 'Create your own snap.',
      customDescription:
        'This particle vortex is a completely custom animation. Try removing and restoring the card, then see how the pair is defined.',
      codeLabel: 'Real code',
      codeTitle: 'One effect, two animations',
      codeDescription: 'Define what happens when the element disappears and what happens when it comes back.',
      customGuide: 'Build a custom effect',
      openGuide: 'Open guide',
      docsKicker: 'Documentation',
      docsTitle: 'Start simple. Add more when needed.',
      docsDescription:
        'Begin with one remove() call. Then learn how to restore elements, build undo, preload screenshots, or create a custom effect.',
    },
  },
  ru: {
    language: 'Язык',
    learn: 'Руководство',
    reference: 'Справочник',
    menu: 'Открыть навигацию по документации',
    onThisPage: 'На этой странице',
    previous: 'Назад',
    next: 'Далее',
    edit: 'Редактировать страницу на GitHub',
    source: 'Исходный код на GitHub',
    sections: { start: 'Начало', learn: 'Руководство', reference: 'Справочник' },
    notFound: {
      documentTitle: 'Страница не найдена · Vanilla Disintegrate',
      description: 'Запрошенная страница не найдена.',
      errorLabel: 'Ошибка 404',
      heading: 'Страница не найдена',
      body: 'Страница документации не существует или была перемещена.',
      action: 'Открыть документацию',
      homeAction: 'На главную',
    },
    home: {
      documentTitle: 'Vanilla Disintegrate · Эффекты щелчка Таноса для DOM',
      title: 'Удалите любой элемент',
      accent: 'щелчком Таноса',
      description:
        'Лёгкая TypeScript-библиотека для удаления и восстановления любых DOM-элементов с эффектом щелчка Таноса. Выберите одну из четырёх готовых анимаций или создайте собственную — без CSS и привязки к фреймворку.',
      tryLabel: 'Попробуйте на настоящем DOM',
      playgroundKicker: 'Щелчок Таноса вживую',
      playgroundTitle: 'Удалите. Затем верните.',
      playgroundDescription:
        'Каждая карточка — настоящий DOM-элемент. Выберите анимацию, удалите карточку и верните тот же узел из списка ниже.',
      customKicker: 'Свой эффект',
      customTitle: 'Создайте собственный щелчок.',
      customDescription:
        'Эта воронка из частиц — полностью пользовательская анимация. Удалите и верните карточку, затем посмотрите определение пары.',
      codeLabel: 'Настоящий код',
      codeTitle: 'Один эффект, две анимации',
      codeDescription: 'Опишите отдельно исчезновение элемента и его возвращение.',
      customGuide: 'Создать свой эффект',
      openGuide: 'Открыть руководство',
      docsKicker: 'Документация',
      docsTitle: 'Начните с простого.',
      docsDescription:
        'Сначала вызовите remove(). Затем разберитесь с возвратом, undo, подготовкой снимков и собственными эффектами.',
    },
  },
  zh: {
    language: '语言',
    learn: '指南',
    reference: 'API 参考',
    menu: '打开文档导航',
    onThisPage: '本页内容',
    previous: '上一页',
    next: '下一页',
    edit: '在 GitHub 上编辑此页',
    source: 'GitHub 源码',
    sections: { start: '开始', learn: '指南', reference: 'API 参考' },
    notFound: {
      documentTitle: '页面未找到 · Vanilla Disintegrate',
      description: '未找到请求的页面。',
      errorLabel: '错误 404',
      heading: '页面未找到',
      body: '该文档页面不存在或已被移动。',
      action: '打开文档',
      homeAction: '返回首页',
    },
    home: {
      documentTitle: 'Vanilla Disintegrate · 面向 DOM 的灭霸响指特效',
      title: '用灭霸响指',
      accent: '删除任意元素',
      description:
        '一款轻量的 TypeScript 库，可用灭霸响指效果删除和恢复任意 DOM 元素。可选择四种内置动画或创建自己的效果，无需 CSS，也不受框架限制。',
      tryLabel: '在真实 DOM 中体验',
      playgroundKicker: '实时灭霸响指',
      playgroundTitle: '让它消失，再把它带回来。',
      playgroundDescription: '每张卡片都是真实 DOM 元素。选择动画、删除卡片，再从下方列表恢复同一个节点。',
      customKicker: '自定义效果',
      customTitle: '创造你的响指效果。',
      customDescription: '这个粒子漩涡完全由用户自定义。试着删除和恢复卡片，再查看效果对的定义。',
      codeLabel: '真实代码',
      codeTitle: '一个效果，两段动画',
      codeDescription: '分别定义元素消失和重新出现时发生的事情。',
      customGuide: '构建自定义效果',
      openGuide: '打开指南',
      docsKicker: '文档',
      docsTitle: '从简单开始，需要时再深入。',
      docsDescription: '先调用一次 remove()，再了解恢复、撤销、快照预处理和自定义效果。',
    },
  },
  ko: {
    language: '언어',
    learn: '가이드',
    reference: 'API 레퍼런스',
    menu: '문서 탐색 열기',
    onThisPage: '이 페이지에서',
    previous: '이전',
    next: '다음',
    edit: 'GitHub에서 이 페이지 편집',
    source: 'GitHub 소스',
    sections: { start: '시작', learn: '가이드', reference: 'API 레퍼런스' },
    notFound: {
      documentTitle: '페이지를 찾을 수 없습니다 · Vanilla Disintegrate',
      description: '요청한 페이지를 찾을 수 없습니다.',
      errorLabel: '오류 404',
      heading: '페이지를 찾을 수 없습니다',
      body: '해당 문서 페이지가 없거나 위치가 변경되었습니다.',
      action: '문서 열기',
      homeAction: '홈으로 가기',
    },
    home: {
      documentTitle: 'Vanilla Disintegrate · DOM을 위한 타노스 스냅 효과',
      title: '타노스의 핑거 스냅으로',
      accent: '어떤 요소든 삭제하세요',
      description:
        '타노스 스냅 효과로 모든 DOM 요소를 삭제하고 복원하는 가벼운 TypeScript 라이브러리입니다. 네 가지 내장 애니메이션을 사용하거나 CSS와 프레임워크 제약 없이 직접 만들 수 있습니다.',
      tryLabel: '실제 DOM에서 체험하기',
      playgroundKicker: '실시간 타노스 스냅',
      playgroundTitle: '사라지게 하고, 다시 불러오세요.',
      playgroundDescription:
        '각 카드는 실제 DOM 요소입니다. 애니메이션을 고르고 카드를 삭제한 다음 아래 목록에서 같은 노드를 복원하세요.',
      customKicker: '사용자 효과',
      customTitle: '나만의 스냅을 만드세요.',
      customDescription:
        '이 파티클 소용돌이는 완전한 사용자 애니메이션입니다. 카드를 삭제하고 복원한 뒤 효과 쌍의 정의를 살펴보세요.',
      codeLabel: '실제 코드',
      codeTitle: '효과 하나, 애니메이션 두 개',
      codeDescription: '요소가 사라질 때와 돌아올 때의 동작을 각각 정의합니다.',
      customGuide: '사용자 효과 만들기',
      openGuide: '가이드 열기',
      docsKicker: '문서',
      docsTitle: '간단하게 시작하고 필요할 때 확장하세요.',
      docsDescription: 'remove() 한 번으로 시작한 뒤 복원, 실행 취소, 스냅샷 준비, 사용자 효과를 익혀 보세요.',
    },
  },
};

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function localeFromPath(pathname: string): Locale {
  const segment = pathname.split('/')[1];
  return isLocale(segment) ? segment : 'en';
}

export function localePrefix(locale: Locale) {
  return locale === 'en' ? '' : `/${locale}`;
}

export function homeHref(locale: Locale) {
  return `${localePrefix(locale)}/`;
}

export function docsHref(locale: Locale, path: string) {
  return `${localePrefix(locale)}/docs/${path.replace(/^\/+|\/+$/g, '')}/`;
}

export function switchLocalePath(pathname: string, locale: Locale) {
  const pathWithoutLocale = pathname.replace(/^\/(ru|zh|ko)(?=\/|$)/, '') || '/';
  return `${localePrefix(locale)}${pathWithoutLocale}` || '/';
}
