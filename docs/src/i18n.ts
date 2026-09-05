export const locales = ['en', 'ru', 'zh', 'ko'] as const;

export type Locale = (typeof locales)[number];

export interface UiCopy {
  readonly language: string;
  readonly navigation: string;
  readonly homeLink: string;
  readonly learn: string;
  readonly reference: string;
  readonly menu: string;
  readonly githubStarPrompt: string;
  readonly sponsor: string;
  readonly theme: Readonly<Record<'label' | 'system' | 'light' | 'dark', string>>;
  readonly close: string;
  readonly onThisPage: string;
  readonly previous: string;
  readonly next: string;
  readonly edit: string;
  readonly source: string;
  readonly privacy: string;
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
    readonly headingRemoveHint: string;
    readonly headingRestoreHint: string;
    readonly headingRemoveEffect: string;
    readonly headingRestoreEffect: string;
    readonly description: string;
    readonly descriptionHighlight: string;
    readonly tryLabel: string;
    readonly playgroundKicker: string;
    readonly playgroundTitle: string;
    readonly playgroundDescription: string;
    readonly playgroundDescriptionHighlight: string;
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
    navigation: 'Navigation',
    homeLink: 'Home',
    learn: 'Learn',
    reference: 'Reference',
    menu: 'Open navigation',
    githubStarPrompt: 'If you like Vanilla Disintegrate, please give it a 🌟 star on GitHub.',
    sponsor: 'Sponsor',
    theme: { label: 'Theme', system: 'System', light: 'Light', dark: 'Dark' },
    close: 'Close',
    onThisPage: 'On this page',
    previous: 'Previous',
    next: 'Next',
    edit: 'Edit this page on GitHub',
    source: 'Source on GitHub',
    privacy: 'Privacy',
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
      documentTitle: 'Vanilla Disintegrate · Particle effects for removing and restoring DOM elements',
      title: 'Modern, striking,',
      accent: 'versatile, and CSS-free',
      headingRemoveHint: 'Snap to disintegrate!',
      headingRestoreHint: 'Snap to restore!',
      headingRemoveEffect: 'Play the Thanos snap and remove the highlighted word',
      headingRestoreEffect: 'Reverse the snap and restore the highlighted word',
      description:
        'A TypeScript library for animated removal and restoration of DOM elements, with built-in GPU-accelerated WebGL2 particle effects inspired by the famous Thanos snap. Compatible with native JavaScript and any framework.',
      descriptionHighlight: 'Thanos snap',
      tryLabel: 'Build an effect in the playground',
      playgroundKicker: 'Interactive playground',
      playgroundTitle: 'Create your effect',
      playgroundDescription:
        'Start from a preset, tune removal and restoration separately, preview both directions, and copy ready-to-use TypeScript.',
      playgroundDescriptionHighlight: 'copy ready-to-use TypeScript',
      openGuide: 'Open guide',
      docsKicker: 'Documentation',
      docsTitle: 'Bring it into your project',
      docsDescription:
        'Start with installation and a built-in preset, then add restoration, undo, background preparation, or a custom renderer.',
    },
  },
  ru: {
    language: 'Язык',
    navigation: 'Навигация',
    homeLink: 'Главная',
    learn: 'Руководство',
    reference: 'Справочник',
    menu: 'Открыть навигацию',
    githubStarPrompt: 'Если вам нравится Vanilla Disintegrate, пожалуйста, поставьте ему 🌟 звёздочку на GitHub.',
    sponsor: 'Спонсор',
    theme: { label: 'Тема', system: 'Системная', light: 'Светлая', dark: 'Тёмная' },
    close: 'Закрыть',
    onThisPage: 'На этой странице',
    previous: 'Назад',
    next: 'Далее',
    edit: 'Редактировать страницу на GitHub',
    source: 'Исходный код на GitHub',
    privacy: 'Конфиденциальность',
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
      documentTitle: 'Vanilla Disintegrate · Анимации удаления и восстановления DOM-элементов',
      title: 'Современная, эффектная,',
      accent: 'универсальная и без CSS-зависимостей',
      headingRemoveHint: 'Щёлкните, чтобы развеять!',
      headingRestoreHint: 'Щёлкните, чтобы вернуть!',
      headingRemoveEffect: 'Щёлкнуть перчаткой и удалить выделенное слово',
      headingRestoreEffect: 'Обратить время и восстановить выделенное слово',
      description:
        'TypeScript-библиотека для анимированного удаления и восстановления DOM-элементов со встроенными GPU-ускоренными эффектами частиц на WebGL2, вдохновлёнными знаменитым «щелчком Таноса». Совместима с нативным JavaScript и любым фреймворком.',
      descriptionHighlight: '«щелчком Таноса»',
      tryLabel: 'Соберите эффект в плейграунде',
      playgroundKicker: 'Интерактивный плейграунд',
      playgroundTitle: 'Создайте свой эффект',
      playgroundDescription:
        'Выберите пресет, отдельно настройте удаление и восстановление, проверьте оба направления и скопируйте готовый TypeScript-код.',
      playgroundDescriptionHighlight: 'скопируйте готовый TypeScript-код',
      openGuide: 'Открыть руководство',
      docsKicker: 'Документация',
      docsTitle: 'Подключите библиотеку к проекту',
      docsDescription:
        'Начните с установки и готового пресета, затем добавьте сохранение удалённых элементов, фоновую подготовку или собственный рендерер.',
    },
  },
  zh: {
    language: '语言',
    navigation: '导航',
    homeLink: '首页',
    learn: '指南',
    reference: 'API 参考',
    menu: '打开导航',
    githubStarPrompt: '如果你喜欢 Vanilla Disintegrate，请在 GitHub 上点个 🌟 星标。',
    sponsor: '赞助',
    theme: { label: '主题', system: '跟随系统', light: '浅色', dark: '深色' },
    close: '关闭',
    onThisPage: '本页内容',
    previous: '上一页',
    next: '下一页',
    edit: '在 GitHub 上编辑此页',
    source: 'GitHub 源码',
    privacy: '隐私',
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
      documentTitle: 'Vanilla Disintegrate · DOM 元素删除与恢复粒子动画',
      title: '现代、惊艳、',
      accent: '通用，无需 CSS 依赖',
      headingRemoveHint: '打个响指，让它消散！',
      headingRestoreHint: '打个响指，让它复原！',
      headingRemoveEffect: '播放灭霸响指并移除高亮词语',
      headingRestoreEffect: '逆转响指并恢复高亮词语',
      description:
        '一个用于为 DOM 元素的删除与恢复添加动画的 TypeScript 库，内置受著名灭霸响指启发的 WebGL2 GPU 加速粒子效果。兼容原生 JavaScript 和任何框架。',
      descriptionHighlight: '灭霸响指',
      tryLabel: '在游乐场中构建效果',
      playgroundKicker: '交互式游乐场',
      playgroundTitle: '创建你的效果',
      playgroundDescription: '从预设开始，分别调整删除和恢复，预览两个方向，然后复制可直接使用的 TypeScript。',
      playgroundDescriptionHighlight: '复制可直接使用的 TypeScript',
      openGuide: '打开指南',
      docsKicker: '文档',
      docsTitle: '接入你的项目',
      docsDescription: '从安装和内置预设开始，再添加恢复、撤销、后台准备或自定义渲染器。',
    },
  },
  ko: {
    language: '언어',
    navigation: '탐색',
    homeLink: '홈',
    learn: '가이드',
    reference: 'API 레퍼런스',
    menu: '탐색 열기',
    githubStarPrompt: 'Vanilla Disintegrate가 마음에 드신다면 GitHub에 🌟 스타를 눌러 주세요.',
    sponsor: '후원',
    theme: { label: '테마', system: '시스템', light: '라이트', dark: '다크' },
    close: '닫기',
    onThisPage: '이 페이지에서',
    previous: '이전',
    next: '다음',
    edit: 'GitHub에서 이 페이지 편집',
    source: 'GitHub 소스',
    privacy: '개인정보 보호',
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
      documentTitle: 'Vanilla Disintegrate · DOM 삭제 및 복원 파티클 애니메이션',
      title: '현대적이고 인상적이며,',
      accent: '범용적이고 CSS 의존성이 없습니다',
      headingRemoveHint: '손가락을 튕겨 분해하세요!',
      headingRestoreHint: '손가락을 튕겨 되돌리세요!',
      headingRemoveEffect: '타노스 스냅으로 강조된 단어 제거',
      headingRestoreEffect: '시간을 되돌려 강조된 단어 복원',
      description:
        'DOM 요소의 삭제와 복원을 애니메이션으로 구현하는 TypeScript 라이브러리입니다. 유명한 타노스 스냅에서 영감을 받은 WebGL2 기반 GPU 가속 파티클 효과를 내장하며, 순수 JavaScript와 모든 프레임워크를 지원합니다.',
      descriptionHighlight: '타노스 스냅',
      tryLabel: '플레이그라운드에서 효과 만들기',
      playgroundKicker: '인터랙티브 플레이그라운드',
      playgroundTitle: '나만의 효과를 만드세요',
      playgroundDescription:
        '프리셋에서 시작해 삭제와 복원을 각각 조정하고 두 방향을 미리 본 뒤 바로 사용할 TypeScript를 복사하세요.',
      playgroundDescriptionHighlight: '바로 사용할 TypeScript를 복사하세요',
      openGuide: '가이드 열기',
      docsKicker: '문서',
      docsTitle: '프로젝트에 연결하세요',
      docsDescription:
        '설치와 내장 프리셋으로 시작한 뒤 복원, 실행 취소, 백그라운드 준비 또는 사용자 렌더러를 추가하세요.',
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

export function privacyHref(locale: Locale) {
  return `${localePrefix(locale)}/privacy/`;
}

export function switchLocalePath(pathname: string, locale: Locale) {
  const pathWithoutLocale = pathname.replace(/^\/(ru|zh|ko)(?=\/|$)/, '') || '/';
  return `${localePrefix(locale)}${pathWithoutLocale}` || '/';
}
