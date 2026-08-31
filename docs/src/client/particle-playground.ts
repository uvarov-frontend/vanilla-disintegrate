import Disintegrator, {
  createParticleEffect,
  particlePresetSounds,
  particlePresets,
  type BuiltInEffect,
  type EffectOperation,
  type ParticleCurve,
  type ParticleOptions,
  type ParticlePreset,
  type ParticleRelease,
  type RemovalId,
  type SoundDefinition,
  type SoundOptions,
  type SoundSource,
} from '../../../src/snapdom';

type Locale = 'en' | 'ru' | 'zh' | 'ko';

interface PlaygroundState {
  curve: ParticleCurve;
  release: ParticleRelease;
  duration: number;
  stagger: number;
  horizontalDrift: number;
  horizontalMin: number;
  horizontalMax: number;
  verticalMin: number;
  verticalMax: number;
  convergence: number;
  swirl: number;
  endScale: number;
  soundEnabled: boolean;
  soundGain: number;
  soundPlaybackRate: number;
  soundDelay: number;
  soundFadeDuration: number;
}

type PlaygroundOperation = 'remove' | 'restore';
type PlaygroundPresetSelection = BuiltInEffect | 'custom';
type PlaygroundOperationPresets = Record<PlaygroundOperation, BuiltInEffect>;
type PlaygroundPresetSelections = Record<PlaygroundOperation, PlaygroundPresetSelection>;

interface PlaygroundConfiguration {
  remove: PlaygroundState;
  restore: PlaygroundState;
}

type NumericKey = Exclude<keyof PlaygroundState, 'curve' | 'release' | 'soundEnabled'>;

interface RangeDefinition {
  readonly key: NumericKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly description: string;
}

const copies = {
  en: {
    presetTitle: 'Ready-made effects',
    readyEffects: 'Ready-made effects',
    curve: 'Curve',
    release: 'Direction',
    preview: 'Preview',
    codeTab: 'Ready code',
    remove: 'Remove',
    restore: 'Restore',
    removeMode: 'Removal',
    restoreMode: 'Restoration',
    operation: 'Animation',
    reset: 'Reset',
    settingsLabel: 'Parameter groups',
    timing: 'Timing',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    sound: 'Sound',
    soundEnabled: 'Enable sound',
    soundGain: 'Volume',
    soundPlaybackRate: 'Speed',
    soundDelay: 'Delay',
    soundFadeDuration: 'Smooth start and end',
    on: 'On',
    off: 'Off',
    copyEffect: 'Copy code',
    copyEffectShort: 'Copy code',
    copyLink: 'Copy effect link',
    copyLinkShort: 'Copy link',
    copied: 'Copied',
    copyFailed: 'Clipboard is unavailable',
    ready: 'Ready',
    preparing: 'Preparing snapshot…',
    updated: 'Configuration updated',
    duration: 'Duration',
    stagger: 'Stagger',
    horizontalDrift: 'Drift',
    horizontalMin: 'Minimum',
    horizontalMax: 'Maximum',
    verticalMin: 'Minimum',
    verticalMax: 'Maximum',
    convergence: 'Center pull',
    swirl: 'Swirl',
    endScale: 'End scale',
  },
  ru: {
    presetTitle: 'Готовые эффекты',
    readyEffects: 'Готовые эффекты',
    curve: 'Кривая',
    release: 'Направление',
    preview: 'Предпросмотр',
    codeTab: 'Готовый код',
    remove: 'Удалить',
    restore: 'Восстановить',
    removeMode: 'Удаление',
    restoreMode: 'Восстановление',
    operation: 'Анимация',
    reset: 'Сбросить',
    settingsLabel: 'Группы параметров',
    timing: 'Тайминг',
    horizontal: 'Горизонталь',
    vertical: 'Вертикаль',
    sound: 'Звук',
    soundEnabled: 'Включить звук',
    soundGain: 'Громкость',
    soundPlaybackRate: 'Скорость',
    soundDelay: 'Задержка',
    soundFadeDuration: 'Плавное начало и конец',
    on: 'Вкл.',
    off: 'Выкл.',
    copyEffect: 'Копировать код',
    copyEffectShort: 'Копировать код',
    copyLink: 'Скопировать ссылку на эффект',
    copyLinkShort: 'Копировать ссылку',
    copied: 'Скопировано',
    copyFailed: 'Буфер обмена недоступен',
    ready: 'Готово',
    preparing: 'Подготавливаем снимок…',
    updated: 'Настройки обновлены',
    duration: 'Длительность',
    stagger: 'Разброс старта',
    horizontalDrift: 'Разброс',
    horizontalMin: 'Минимум',
    horizontalMax: 'Максимум',
    verticalMin: 'Минимум',
    verticalMax: 'Максимум',
    convergence: 'К центру',
    swirl: 'Колебание',
    endScale: 'Размер в конце',
  },
  zh: {
    presetTitle: '现成效果',
    readyEffects: '现成效果',
    curve: '曲线',
    release: '方向',
    preview: '预览',
    codeTab: '可用代码',
    remove: '删除',
    restore: '恢复',
    removeMode: '删除',
    restoreMode: '恢复',
    operation: '动画',
    reset: '重置',
    settingsLabel: '参数组',
    timing: '时间',
    horizontal: '水平',
    vertical: '垂直',
    sound: '声音',
    soundEnabled: '开启声音',
    soundGain: '音量',
    soundPlaybackRate: '速度',
    soundDelay: '延迟',
    soundFadeDuration: '平滑开始和结束',
    on: '开',
    off: '关',
    copyEffect: '复制代码',
    copyEffectShort: '复制代码',
    copyLink: '复制效果链接',
    copyLinkShort: '复制链接',
    copied: '已复制',
    copyFailed: '剪贴板不可用',
    ready: '就绪',
    preparing: '正在准备快照…',
    updated: '配置已更新',
    duration: '持续时间',
    stagger: '启动延迟',
    horizontalDrift: '漂移',
    horizontalMin: '最小值',
    horizontalMax: '最大值',
    verticalMin: '最小值',
    verticalMax: '最大值',
    convergence: '向中心',
    swirl: '摆动',
    endScale: '结束缩放',
  },
  ko: {
    presetTitle: '준비된 효과',
    readyEffects: '준비된 효과',
    curve: '곡선',
    release: '방향',
    preview: '미리보기',
    codeTab: '사용 가능한 코드',
    remove: '삭제',
    restore: '복원',
    removeMode: '삭제',
    restoreMode: '복원',
    operation: '애니메이션',
    reset: '초기화',
    settingsLabel: '매개변수 그룹',
    timing: '타이밍',
    horizontal: '가로',
    vertical: '세로',
    sound: '사운드',
    soundEnabled: '사운드 켜기',
    soundGain: '볼륨',
    soundPlaybackRate: '속도',
    soundDelay: '지연',
    soundFadeDuration: '부드러운 시작과 끝',
    on: '켜짐',
    off: '꺼짐',
    copyEffect: '코드 복사',
    copyEffectShort: '코드 복사',
    copyLink: '효과 링크 복사',
    copyLinkShort: '링크 복사',
    copied: '복사됨',
    copyFailed: '클립보드를 사용할 수 없음',
    ready: '준비됨',
    preparing: '스냅샷 준비 중…',
    updated: '설정이 업데이트됨',
    duration: '재생 시간',
    stagger: '시작 지연',
    horizontalDrift: '분산',
    horizontalMin: '최솟값',
    horizontalMax: '최댓값',
    verticalMin: '최솟값',
    verticalMax: '최댓값',
    convergence: '중앙으로',
    swirl: '흔들림',
    endScale: '최종 크기',
  },
} as const;

const helps = {
  en: {
    curve: 'Changes how particles accelerate and fade without changing where they travel.',
    release: 'Determines which part of the element starts disintegrating first.',
    duration: 'Base lifetime of the particle animation. Longer values make the effect feel slower.',
    stagger: 'Maximum spread between the first and last particle start times.',
    horizontalDrift: 'Adds random sideways variation so particle paths do not look parallel.',
    horizontalMin: 'Smallest horizontal travel. Negative values move particles to the left.',
    horizontalMax: 'Largest horizontal travel. Positive values move particles to the right.',
    verticalMin: 'Smallest vertical travel. Negative values move particles upward.',
    verticalMax: 'Largest vertical travel. Positive values move particles downward.',
    convergence: 'Pulls particles toward the element centre. Zero keeps their paths independent.',
    swirl: 'Sets the amplitude of the vertical wave along each particle path.',
    endScale: 'Particle size at the end of removal, relative to its starting size.',
    soundGain: 'Linear output volume from silence at 0% to full gain at 100%.',
    soundPlaybackRate: 'Changes playback speed and pitch. 1× uses the original recording.',
    soundDelay: 'Waits this long after the visual operation starts before playing audio.',
    soundFadeDuration: 'Duration of the fade-out on removal and fade-in on restoration.',
  },
  ru: {
    curve: 'Меняет ускорение и затухание частиц, но не их траекторию.',
    release: 'Определяет, какая часть элемента начнёт распадаться первой.',
    duration: 'Базовое время жизни анимации частиц. Чем больше значение, тем медленнее эффект.',
    stagger: 'Разница во времени запуска частиц. При нуле все частицы стартуют одновременно.',
    horizontalDrift: 'Добавляет случайное движение в стороны, чтобы частицы летели естественнее.',
    horizontalMin: 'Минимальный путь по горизонтали. Отрицательное значение направляет частицы влево.',
    horizontalMax: 'Максимальный путь по горизонтали. Положительное значение направляет частицы вправо.',
    verticalMin: 'Минимальный путь по вертикали. Отрицательное значение направляет частицы вверх.',
    verticalMax: 'Максимальный путь по вертикали. Положительное значение направляет частицы вниз.',
    convergence: 'Насколько сильно частицы тянутся к центру элемента. При нуле притяжения нет.',
    swirl: 'Насколько сильно частицы колеблются во время движения.',
    endScale: 'Размер частицы в конце анимации. 1× — исходный размер.',
    soundGain: 'Линейная громкость: от полной тишины при 0% до полного уровня при 100%.',
    soundPlaybackRate: 'Меняет скорость и высоту воспроизведения. 1× соответствует оригинальной записи.',
    soundDelay: 'Задержка между запуском визуальной анимации и началом звука.',
    soundFadeDuration: 'Длительность затухания при удалении и нарастания звука при восстановлении.',
  },
  zh: {
    curve: '改变粒子的加速和淡出方式，但不改变运动路径。',
    release: '决定元素的哪个区域最先开始消散。',
    duration: '粒子动画的基础持续时间，数值越大效果越慢。',
    stagger: '第一批与最后一批粒子开始时间的最大间隔。',
    horizontalDrift: '加入随机横向偏移，避免粒子路径显得平行。',
    horizontalMin: '最小水平位移，负值使粒子向左移动。',
    horizontalMax: '最大水平位移，正值使粒子向右移动。',
    verticalMin: '最小垂直位移，负值使粒子向上移动。',
    verticalMax: '最大垂直位移，正值使粒子向下移动。',
    convergence: '将粒子拉向元素中心；设为零时路径彼此独立。',
    swirl: '设置粒子路径上垂直波动的幅度。',
    endScale: '移除结束时粒子相对初始大小的比例。',
    soundGain: '线性输出音量：0% 为静音，100% 为完整增益。',
    soundPlaybackRate: '改变播放速度和音高；1× 使用原始录音。',
    soundDelay: '视觉动画开始后等待多久再播放声音。',
    soundFadeDuration: '删除时淡出、恢复时淡入的持续时间。',
  },
  ko: {
    curve: '파티클의 이동 경로는 유지하면서 가속과 페이드를 바꿉니다.',
    release: '요소의 어느 부분부터 분해가 시작될지 정합니다.',
    duration: '파티클 애니메이션의 기본 재생 시간입니다. 값이 클수록 느려집니다.',
    stagger: '첫 파티클과 마지막 파티클의 시작 시간 차이를 정합니다.',
    horizontalDrift: '무작위 가로 편차를 더해 경로가 평행해 보이지 않게 합니다.',
    horizontalMin: '최소 가로 이동 거리입니다. 음수는 왼쪽으로 이동합니다.',
    horizontalMax: '최대 가로 이동 거리입니다. 양수는 오른쪽으로 이동합니다.',
    verticalMin: '최소 세로 이동 거리입니다. 음수는 위로 이동합니다.',
    verticalMax: '최대 세로 이동 거리입니다. 양수는 아래로 이동합니다.',
    convergence: '파티클을 요소 중앙으로 끌어당깁니다. 0이면 경로가 서로 독립적입니다.',
    swirl: '각 파티클 경로의 세로 파동 진폭을 정합니다.',
    endScale: '삭제가 끝날 때 시작 크기 대비 파티클 크기입니다.',
    soundGain: '0% 무음부터 100% 전체 게인까지의 선형 볼륨입니다.',
    soundPlaybackRate: '재생 속도와 피치를 바꿉니다. 1×는 원본 녹음입니다.',
    soundDelay: '시각 효과가 시작된 뒤 사운드를 재생하기까지의 지연입니다.',
    soundFadeDuration: '삭제 시 페이드아웃과 복원 시 페이드인의 지속 시간입니다.',
  },
} as const;

const locale = (typeof document === 'undefined' ? 'en' : (document.body.dataset.locale ?? 'en')) as Locale;
const copy = copies[locale];
const help = helps[locale];

const presetNames: Record<BuiltInEffect, string> = {
  dust: 'Dust',
  vapor: 'Vapor',
  scatter: 'Scatter',
  wind: 'Wind',
};
const presetDescriptions: Record<Locale, Record<BuiltInEffect, string>> = {
  en: { dust: 'diagonal trail', vapor: 'rises and fades', scatter: 'spreads outward', wind: 'drifts sideways' },
  ru: { dust: 'диагональный шлейф', vapor: 'вверх и растворяется', scatter: 'разлёт в стороны', wind: 'сносит вбок' },
  zh: { dust: '对角拖尾', vapor: '上升并消散', scatter: '向四周散开', wind: '横向飘移' },
  ko: { dust: '대각선 궤적', vapor: '상승하며 사라짐', scatter: '사방으로 확산', wind: '옆으로 이동' },
};
const curveOptionLabels: Record<Locale, Record<ParticleCurve, string>> = {
  en: {
    settle: 'settle — gentle settling',
    float: 'float — smooth lift',
    burst: 'burst — quick scatter',
    drift: 'drift — steady wind',
  },
  ru: {
    settle: 'settle — плавное оседание',
    float: 'float — мягкий подъём',
    burst: 'burst — резкий разлёт',
    drift: 'drift — плавный снос',
  },
  zh: { settle: 'settle — 轻柔落下', float: 'float — 平滑上升', burst: 'burst — 快速散开', drift: 'drift — 稳定飘移' },
  ko: {
    settle: 'settle — 부드럽게 가라앉음',
    float: 'float — 부드러운 상승',
    burst: 'burst — 빠른 확산',
    drift: 'drift — 일정한 이동',
  },
};
const releaseOptionLabels: Record<Locale, Record<ParticleRelease, string>> = {
  en: {
    left: 'left — left to right',
    right: 'right — right to left',
    top: 'top — top to bottom',
    random: 'random — mixed order',
  },
  ru: {
    left: 'left — слева направо',
    right: 'right — справа налево',
    top: 'top — сверху вниз',
    random: 'random — случайно',
  },
  zh: { left: 'left — 从左到右', right: 'right — 从右到左', top: 'top — 从上到下', random: 'random — 随机' },
  ko: {
    left: 'left — 왼쪽에서 오른쪽',
    right: 'right — 오른쪽에서 왼쪽',
    top: 'top — 위에서 아래',
    random: 'random — 무작위',
  },
};
const curves: readonly ParticleCurve[] = ['settle', 'float', 'burst', 'drift'];
const releases: readonly ParticleRelease[] = ['left', 'right', 'top', 'random'];
const presetKeys = Object.keys(presetNames) as BuiltInEffect[];
const soundNumericKeys: readonly NumericKey[] = ['soundGain', 'soundPlaybackRate', 'soundDelay', 'soundFadeDuration'];
function createRanges(copy: (typeof copies)[Locale], help: (typeof helps)[Locale]): readonly RangeDefinition[] {
  return [
  { key: 'duration', label: copy.duration, min: 200, max: 3000, step: 50, unit: 'ms', description: help.duration },
  { key: 'stagger', label: copy.stagger, min: 0, max: 800, step: 10, unit: 'ms', description: help.stagger },
  {
    key: 'horizontalDrift',
    label: copy.horizontalDrift,
    min: 0,
    max: 240,
    step: 5,
    unit: 'px',
    description: help.horizontalDrift,
  },
  {
    key: 'horizontalMin',
    label: copy.horizontalMin,
    min: -400,
    max: 400,
    step: 5,
    unit: 'px',
    description: help.horizontalMin,
  },
  {
    key: 'horizontalMax',
    label: copy.horizontalMax,
    min: -400,
    max: 400,
    step: 5,
    unit: 'px',
    description: help.horizontalMax,
  },
  {
    key: 'verticalMin',
    label: copy.verticalMin,
    min: -400,
    max: 400,
    step: 5,
    unit: 'px',
    description: help.verticalMin,
  },
  {
    key: 'verticalMax',
    label: copy.verticalMax,
    min: -400,
    max: 400,
    step: 5,
    unit: 'px',
    description: help.verticalMax,
  },
  { key: 'convergence', label: copy.convergence, min: 0, max: 1, step: 0.05, unit: '', description: help.convergence },
  { key: 'swirl', label: copy.swirl, min: 0, max: 160, step: 5, unit: 'px', description: help.swirl },
  { key: 'endScale', label: copy.endScale, min: 0.1, max: 2, step: 0.05, unit: '×', description: help.endScale },
  { key: 'soundGain', label: copy.soundGain, min: 0, max: 1, step: 0.05, unit: '%', description: help.soundGain },
  {
    key: 'soundPlaybackRate',
    label: copy.soundPlaybackRate,
    min: 0.5,
    max: 2,
    step: 0.05,
    unit: '×',
    description: help.soundPlaybackRate,
  },
  { key: 'soundDelay', label: copy.soundDelay, min: 0, max: 500, step: 10, unit: 'ms', description: help.soundDelay },
  {
    key: 'soundFadeDuration',
    label: copy.soundFadeDuration,
    min: 0,
    max: 1,
    step: 0.05,
    unit: 's',
    description: help.soundFadeDuration,
  },
  ];
}

const ranges = createRanges(copy, help);

const hashKeys: Readonly<Record<NumericKey, string>> = {
  duration: 'd',
  stagger: 's',
  horizontalDrift: 'hd',
  horizontalMin: 'h0',
  horizontalMax: 'h1',
  verticalMin: 'v0',
  verticalMax: 'v1',
  convergence: 'cv',
  swirl: 'sw',
  endScale: 'es',
  soundGain: 'sg',
  soundPlaybackRate: 'sr',
  soundDelay: 'sd',
  soundFadeDuration: 'sf',
};

function required<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing particle playground element: ${selector}`);
  return element;
}

function stateFromPreset(preset: ParticlePreset): PlaygroundState {
  return {
    curve: preset.curve,
    release: preset.release,
    duration: preset.duration,
    stagger: preset.stagger,
    horizontalDrift: preset.horizontalDrift,
    horizontalMin: preset.horizontalTravel[0],
    horizontalMax: preset.horizontalTravel[1],
    verticalMin: preset.verticalTravel[0],
    verticalMax: preset.verticalTravel[1],
    convergence: preset.convergence,
    swirl: preset.swirl,
    endScale: preset.endScale,
    soundEnabled: true,
    soundGain: 0.32,
    soundPlaybackRate: 1,
    soundDelay: 0,
    soundFadeDuration: 0.18,
  };
}

function particleOptions(state: PlaygroundState): ParticleOptions {
  return {
    curve: state.curve,
    release: state.release,
    duration: state.duration,
    stagger: state.stagger,
    horizontalDrift: state.horizontalDrift,
    horizontalTravel: [state.horizontalMin, state.horizontalMax],
    verticalTravel: [state.verticalMin, state.verticalMax],
    convergence: state.convergence,
    swirl: state.swirl,
    endScale: state.endScale,
  };
}

function isSoundOptions(definition: SoundSource | SoundOptions): definition is SoundOptions {
  return typeof definition === 'object' && definition !== null && 'src' in definition;
}

function configuredSound(definition: SoundDefinition | null | undefined, state: PlaygroundState) {
  if (definition === null || definition === undefined || typeof definition === 'function') return definition ?? null;
  const options: SoundOptions = isSoundOptions(definition) ? definition : { src: definition };
  return {
    ...options,
    gain: state.soundGain,
    playbackRate: state.soundPlaybackRate,
    delay: state.soundDelay,
    fadeDuration: state.soundFadeDuration,
  } satisfies SoundOptions;
}

function playgroundEffect(configuration: PlaygroundConfiguration, soundPresets: PlaygroundOperationPresets) {
  const removeSounds = particlePresetSounds[soundPresets.remove];
  const restoreSounds = particlePresetSounds[soundPresets.restore];
  return createParticleEffect(
    {
      remove: particleOptions(configuration.remove),
      restore: particleOptions(configuration.restore),
    },
    {
      remove: configuration.remove.soundEnabled ? configuredSound(removeSounds.remove, configuration.remove) : null,
      restore: configuration.restore.soundEnabled ? configuredSound(restoreSounds.restore, configuration.restore) : null,
    },
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatRangeValue(range: RangeDefinition, value: number) {
  if (range.key === 'soundGain') return `${Math.round(value * 100)}%`;
  return `${formatNumber(value)}${range.unit}`;
}

function optionsSource(state: PlaygroundState) {
  return `{
  curve: '${state.curve}',
  release: '${state.release}',
  duration: ${formatNumber(state.duration)},
  stagger: ${formatNumber(state.stagger)},
  horizontalDrift: ${formatNumber(state.horizontalDrift)},
  horizontalTravel: [${formatNumber(state.horizontalMin)}, ${formatNumber(state.horizontalMax)}],
  verticalTravel: [${formatNumber(state.verticalMin)}, ${formatNumber(state.verticalMax)}],
  convergence: ${formatNumber(state.convergence)},
  swirl: ${formatNumber(state.swirl)},
  endScale: ${formatNumber(state.endScale)},
}`;
}

function playbackSource(state: PlaygroundState) {
  return `{
  gain: ${formatNumber(state.soundGain)},
  playbackRate: ${formatNumber(state.soundPlaybackRate)},
  delay: ${formatNumber(state.soundDelay)},
  fadeDuration: ${formatNumber(state.soundFadeDuration)},
}`;
}

function effectSource(configuration: PlaygroundConfiguration, soundPresets: PlaygroundOperationPresets) {
  const removeOptions = optionsSource(configuration.remove);
  const restoreOptions = optionsSource(configuration.restore);
  const hasSound = configuration.remove.soundEnabled || configuration.restore.soundEnabled;
  if (!hasSound) {
    return `import { createParticleEffect } from 'vanilla-disintegrate';

const removeOptions = ${removeOptions};
const restoreOptions = ${restoreOptions};

export const effect = createParticleEffect({
  remove: removeOptions,
  restore: restoreOptions,
});`;
  }
  const soundEntries = [
    configuration.remove.soundEnabled ? `  remove: { ...removeSound, ...removePlayback },` : null,
    configuration.restore.soundEnabled ? `  restore: { ...restoreSound, ...restorePlayback },` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const playbackDeclarations = [
    configuration.remove.soundEnabled
      ? `const removeSound = particlePresetSounds.${soundPresets.remove}.remove;`
      : null,
    configuration.restore.soundEnabled
      ? `const restoreSound = particlePresetSounds.${soundPresets.restore}.restore;`
      : null,
    configuration.remove.soundEnabled ? `const removePlayback = ${playbackSource(configuration.remove)};` : null,
    configuration.restore.soundEnabled ? `const restorePlayback = ${playbackSource(configuration.restore)};` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return `import { createParticleEffect, particlePresetSounds } from 'vanilla-disintegrate';

const removeOptions = ${removeOptions};
const restoreOptions = ${restoreOptions};
${playbackDeclarations}

export const effect = createParticleEffect({
  remove: removeOptions,
  restore: restoreOptions,
}, {
${soundEntries}
});`;
}

function highlightedEffectSource(configuration: PlaygroundConfiguration, soundPresets: PlaygroundOperationPresets) {
  const source = effectSource(configuration, soundPresets);
  const pattern =
    /('[^'\n]*')|\b(import|from|export|const|true|false)\b|(-?\d+(?:\.\d+)?)|(\b[a-zA-Z]\w*)(?=:)|\b(createParticleEffect|particlePresetSounds)\b/g;
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let highlighted = '';
  let previousIndex = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    highlighted += escape(source.slice(previousIndex, index));
    const className = match[1]
      ? 'playground-syntax-string'
      : match[2]
        ? 'playground-syntax-keyword'
        : match[3]
          ? 'playground-syntax-number'
          : match[4]
            ? 'playground-syntax-property'
            : 'playground-syntax-function';
    highlighted += `<span class="${className}">${escape(match[0])}</span>`;
    previousIndex = index + match[0].length;
  }
  return highlighted + escape(source.slice(previousIndex));
}

function createPreviewCard() {
  const card = document.createElement('article');
  card.className = 'playground-card';
  card.innerHTML = `<div class="playground-card-cover" aria-hidden="true"><span></span><span></span></div><div class="playground-card-copy"><span>Particle laboratory</span><h3>Shape the motion</h3><div><small>DOM element</small><small>WebGL2</small></div></div>`;
  return card;
}

function configurationFromPreset(preset: ParticlePreset): PlaygroundConfiguration {
  return {
    remove: stateFromPreset(preset),
    restore: stateFromPreset(preset),
  };
}

function stateFromParameters(parameters: URLSearchParams, prefix: string): PlaygroundState {
  const state = stateFromPreset(particlePresets.dust);
  const curve = parameters.get(`${prefix}c`);
  const release = parameters.get(`${prefix}r`);
  if (curves.includes(curve as ParticleCurve)) state.curve = curve as ParticleCurve;
  if (releases.includes(release as ParticleRelease)) state.release = release as ParticleRelease;
  state.soundEnabled = parameters.get(`${prefix}a`) !== '0';
  for (const range of ranges) {
    const rawValue = parameters.get(`${prefix}${hashKeys[range.key]}`);
    if (rawValue === null) continue;
    const value = Number(rawValue);
    if (Number.isFinite(value)) state[range.key] = Math.min(range.max, Math.max(range.min, value));
  }
  if (state.horizontalMin > state.horizontalMax)
    [state.horizontalMin, state.horizontalMax] = [state.horizontalMax, state.horizontalMin];
  if (state.verticalMin > state.verticalMax)
    [state.verticalMin, state.verticalMax] = [state.verticalMax, state.verticalMin];
  return state;
}

function configurationFromHash(): PlaygroundConfiguration | null {
  if (!window.location.hash.startsWith('#playground?')) return null;
  const parameters = new URLSearchParams(window.location.hash.slice('#playground?'.length));
  return {
    remove: stateFromParameters(parameters, 'm'),
    restore: stateFromParameters(parameters, 'r'),
  };
}

function operationFromHash(): PlaygroundOperation {
  if (!window.location.hash.startsWith('#playground?')) return 'remove';
  const value = new URLSearchParams(window.location.hash.slice('#playground?'.length)).get('o');
  return value === 'restore' ? 'restore' : 'remove';
}

function soundPresetsFromHash(): PlaygroundOperationPresets {
  if (!window.location.hash.startsWith('#playground?')) return { remove: 'dust', restore: 'dust' };
  const parameters = new URLSearchParams(window.location.hash.slice('#playground?'.length));
  const legacyPreset = parameters.get('p');
  const fallback = presetKeys.includes(legacyPreset as BuiltInEffect) ? (legacyPreset as BuiltInEffect) : 'dust';
  const remove = parameters.get('mp');
  const restore = parameters.get('rp');
  return {
    remove: presetKeys.includes(remove as BuiltInEffect) ? (remove as BuiltInEffect) : fallback,
    restore: presetKeys.includes(restore as BuiltInEffect) ? (restore as BuiltInEffect) : fallback,
  };
}

function writeHash(
  configuration: PlaygroundConfiguration,
  soundPresets: PlaygroundOperationPresets,
  operation: PlaygroundOperation,
) {
  const parameters = new URLSearchParams({
    mp: soundPresets.remove,
    rp: soundPresets.restore,
    o: operation,
  });
  for (const [prefix, state] of [
    ['m', configuration.remove],
    ['r', configuration.restore],
  ] as const) {
    parameters.set(`${prefix}c`, state.curve);
    parameters.set(`${prefix}r`, state.release);
    parameters.set(`${prefix}a`, state.soundEnabled ? '1' : '0');
    for (const range of ranges) {
      parameters.set(`${prefix}${hashKeys[range.key]}`, formatNumber(state[range.key]));
    }
  }
  const url = `${window.location.pathname}${window.location.search}#playground?${parameters.toString()}`;
  window.history.replaceState(window.history.state, '', url);
}

/** Renders the complete playground markup into the initial HTML response. */
export function renderParticlePlayground(locale: Locale) {
  const copy = copies[locale];
  const help = helps[locale];
  const ranges = createRanges(copy, help);
  const initialState = stateFromPreset(particlePresets.dust);
  const initialConfiguration = configurationFromPreset(particlePresets.dust);
  const initialSoundPresets: PlaygroundOperationPresets = { remove: 'dust', restore: 'dust' };
  const presetMarkup = presetKeys
    .map((key) => {
      return `<button type="button" data-preset="${key}" data-preset-effect="${key}" aria-pressed="${String(key === 'dust')}"><i aria-hidden="true"></i><span><b>${presetNames[key]}</b><small>${presetDescriptions[locale][key]}</small></span></button>`;
    })
    .join('');
  const selectOptions = (key: 'curve' | 'release', values: readonly string[]) =>
    values
      .map((value) => {
        const label =
          key === 'curve'
            ? curveOptionLabels[locale][value as ParticleCurve]
            : releaseOptionLabels[locale][value as ParticleRelease];
        return `<option value="${value}">${label}</option>`;
      })
      .join('');
  const selectMarkup = (
    key: 'curve' | 'release',
    label: string,
    description: string,
    values: readonly string[],
  ) =>
    `<div class="playground-select-field"><span class="playground-field-heading"><label for="playground-${key}">${label}</label><small>${description}</small></span><select id="playground-${key}" data-${key}>${selectOptions(key, values)}</select></div>`;
  const rangeMarkup = (keys: readonly NumericKey[]) =>
    keys
      .map((key) => {
        const range = ranges.find((definition) => definition.key === key);
        if (!range) throw new Error(`Missing particle playground range: ${key}`);
        const value = initialState[range.key];
        const progress = ((value - range.min) / (range.max - range.min)) * 100;
        return `<div class="playground-range"><div class="playground-range-heading"><span><label for="playground-${range.key}">${range.label}</label><small>${range.description}</small></span><output data-value="${range.key}">${formatRangeValue(range, value)}</output></div><input id="playground-${range.key}" type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" data-option="${range.key}" style="--range-progress: ${progress}%"></div>`;
      })
      .join('');
  const groupPanel = (id: 'timing' | 'horizontal' | 'vertical', keys: readonly NumericKey[], hidden = false) =>
    `<section id="playground-group-panel-${id}" class="playground-settings-panel" role="tabpanel" data-group-panel="${id}" aria-labelledby="playground-group-tab-${id}"${hidden ? ' hidden' : ''}><div class="playground-control-list">${rangeMarkup(keys)}</div></section>`;
  const soundMarkup = `<section id="playground-group-panel-sound" class="playground-settings-panel playground-sound-panel" role="tabpanel" data-group-panel="sound" aria-labelledby="playground-group-tab-sound" hidden><div class="playground-sound-enabled"><span>${copy.soundEnabled}</span><label class="playground-switch"><input type="checkbox" data-sound-enabled checked><span aria-hidden="true"></span><output data-sound-state>${copy.on}</output></label></div><div class="playground-control-list">${rangeMarkup(soundNumericKeys)}</div></section>`;
  const copyIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.5"></rect><path d="M10.75 5.25V4.5A1.5 1.5 0 0 0 9.25 3h-4.5A1.75 1.75 0 0 0 3 4.75v4.5a1.5 1.5 0 0 0 1.5 1.5h.75"></path></svg>`;
  const linkIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 9.75 9.75 6.25"></path><path d="M5.25 11.75H4.5a3 3 0 0 1 0-6h2"></path><path d="M10.75 4.25h.75a3 3 0 0 1 0 6h-2"></path></svg>`;
  const copiedIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.25 2.75 2.75 6.25-6.25"></path></svg>`;

  return `
    <div class="particle-playground">
      <section class="playground-preset-bar">
        <div class="playground-preset-heading">
          <strong>${copy.readyEffects}</strong>
          <div class="playground-phase"><span>${copy.operation}</span><div class="playground-operation-tabs" role="tablist" aria-label="${copy.operation}"><button id="playground-operation-tab-remove" type="button" role="tab" data-operation="remove" aria-controls="playground-operation-panel" aria-selected="true">${copy.removeMode}</button><button id="playground-operation-tab-restore" type="button" role="tab" data-operation="restore" aria-controls="playground-operation-panel" aria-selected="false" tabindex="-1">${copy.restoreMode}</button></div></div>
        </div>
        <div class="playground-presets" role="group" aria-label="${copy.presetTitle}">${presetMarkup}</div>
      </section>
      <div class="playground-workspace">
        <section class="playground-preview">
          <div class="playground-stage-header">
            <div class="playground-window-controls" aria-hidden="true"><i></i><i></i><i></i></div>
            <div class="playground-view-tabs" role="tablist" aria-label="${copy.preview}">
              <button id="playground-view-tab-preview" type="button" role="tab" data-view-tab="preview" aria-controls="playground-view-panel-preview" aria-selected="true">${copy.preview}</button>
              <button id="playground-view-tab-code" type="button" role="tab" data-view-tab="code" aria-controls="playground-view-panel-code" aria-selected="false" tabindex="-1">${copy.codeTab}</button>
            </div>
          </div>
          <div id="playground-view-panel-preview" class="playground-view-panel playground-preview-panel" role="tabpanel" data-view-panel="preview" aria-labelledby="playground-view-tab-preview">
            <div class="playground-stage" data-slot><article class="playground-card"><div class="playground-card-cover" aria-hidden="true"><span></span><span></span></div><div class="playground-card-copy"><span>Particle laboratory</span><h3>Shape the motion</h3><div><small>DOM element</small><small>WebGL2</small></div></div></article></div>
          </div>
          <section id="playground-view-panel-code" class="playground-view-panel playground-code code-block" role="tabpanel" data-view-panel="code" aria-labelledby="playground-view-tab-code" hidden>
            <div class="code-toolbar playground-code-heading">
              <span>TypeScript</span>
              <div><button type="button" data-copy="effect" aria-label="${copy.copyEffect}" title="${copy.copyEffect}"><span class="playground-copy-icon playground-copy-icon-default">${copyIcon}</span><span class="playground-copy-icon playground-copy-icon-success">${copiedIcon}</span><span>${copy.copyEffectShort}</span></button><button type="button" data-copy="link" aria-label="${copy.copyLink}" title="${copy.copyLink}"><span class="playground-copy-icon playground-copy-icon-default">${linkIcon}</span><span class="playground-copy-icon playground-copy-icon-success">${copiedIcon}</span><span>${copy.copyLinkShort}</span></button></div>
            </div>
            <pre class="language-typescript"><code data-code>${highlightedEffectSource(initialConfiguration, initialSoundPresets)}</code></pre>
          </section>
          <div class="playground-commandbar">
            <output data-status aria-live="polite">${copy.ready}</output>
            <div class="playground-actions">
              <button class="button-primary" type="button" data-action="remove">${copy.remove}</button>
              <button class="button-secondary" type="button" data-action="restore">${copy.restore}</button>
              <button class="button-quiet" type="button" data-action="reset">${copy.reset}</button>
            </div>
          </div>
        </section>
        <form id="playground-operation-panel" class="playground-controls" role="tabpanel" aria-labelledby="playground-operation-tab-remove">
          <div class="playground-selectors">
            ${selectMarkup('curve', copy.curve, help.curve, curves)}
            ${selectMarkup('release', copy.release, help.release, releases)}
          </div>
          <div class="playground-settings-tabs" role="tablist" aria-label="${copy.settingsLabel}">
            <button id="playground-group-tab-timing" type="button" role="tab" data-group-tab="timing" aria-controls="playground-group-panel-timing" aria-selected="true">${copy.timing}</button>
            <button id="playground-group-tab-horizontal" type="button" role="tab" data-group-tab="horizontal" aria-controls="playground-group-panel-horizontal" aria-selected="false" tabindex="-1">${copy.horizontal}</button>
            <button id="playground-group-tab-vertical" type="button" role="tab" data-group-tab="vertical" aria-controls="playground-group-panel-vertical" aria-selected="false" tabindex="-1">${copy.vertical}</button>
            <button id="playground-group-tab-sound" type="button" role="tab" data-group-tab="sound" aria-controls="playground-group-panel-sound" aria-selected="false" tabindex="-1">${copy.sound}</button>
          </div>
          <div class="playground-settings-panels">
            ${groupPanel('timing', ['duration', 'stagger', 'swirl', 'endScale'])}
            ${groupPanel('horizontal', ['horizontalDrift', 'horizontalMin', 'horizontalMax'], true)}
            ${groupPanel('vertical', ['verticalMin', 'verticalMax', 'convergence'], true)}
            ${soundMarkup}
          </div>
        </form>
      </div>
    </div>`;
}

/** Attaches behavior to the statically rendered particle configurator. */
export function mountParticlePlayground(root: HTMLElement) {
  if (!root.querySelector('.particle-playground')) root.innerHTML = renderParticlePlayground(locale);

  const presetButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const curveSelect = required<HTMLSelectElement>(root, '[data-curve]');
  const releaseSelect = required<HTMLSelectElement>(root, '[data-release]');
  const soundEnabled = required<HTMLInputElement>(root, '[data-sound-enabled]');
  const soundState = required<HTMLOutputElement>(root, '[data-sound-state]');
  const slot = required<HTMLElement>(root, '[data-slot]');
  const status = required<HTMLOutputElement>(root, '[data-status]');
  const code = required<HTMLElement>(root, '[data-code]');
  const remove = required<HTMLButtonElement>(root, '[data-action="remove"]');
  const restore = required<HTMLButtonElement>(root, '[data-action="restore"]');
  const reset = required<HTMLButtonElement>(root, '[data-action="reset"]');
  const operationButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-operation]')];
  const operationPanel = required<HTMLElement>(root, '#playground-operation-panel');
  const inputs = new Map<NumericKey, HTMLInputElement>();
  const outputs = new Map<NumericKey, HTMLOutputElement>();
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-option]')) {
    inputs.set(input.dataset.option as NumericKey, input);
  }
  for (const output of root.querySelectorAll<HTMLOutputElement>('[data-value]')) {
    outputs.set(output.dataset.value as NumericKey, output);
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
  const hashConfiguration = configurationFromHash();
  let configuration = hashConfiguration ?? configurationFromPreset(particlePresets.dust);
  let activeOperation = operationFromHash();
  let selectedPresets: PlaygroundPresetSelections =
    hashConfiguration === null ? { remove: 'dust', restore: 'dust' } : { remove: 'custom', restore: 'custom' };
  let soundPresets = soundPresetsFromHash();
  let card = slot.querySelector<HTMLElement>('.playground-card') ?? createPreviewCard();
  let removalId: RemovalId | null = null;
  let unregister: () => void = () => undefined;
  let busy = false;
  let pendingPreview = false;
  let previewTimer: number | null = null;
  let hashTimer: number | null = null;
  const preparedSounds = [...new Set([soundPresets.remove, soundPresets.restore])];
  const instance = new Disintegrator({
    audioPreparation:
      configuration.remove.soundEnabled || configuration.restore.soundEnabled ? { effects: preparedSounds } : false,
    layout: false,
    preparation: { strategy: 'immediate', observeMutations: false },
    random: () => 0.314_159_265,
    sound: true,
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
    remove.disabled = busy || !card.isConnected;
    restore.disabled = busy || (!card.isConnected && removalId === null);
    restore.textContent = copy.restore;
    reset.disabled = busy;
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
    for (const button of presetButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.preset === selectedPresets[activeOperation]));
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
      const output = outputs.get(range.key);
      if (output) output.textContent = formatRangeValue(range, state[range.key]);
    }
    code.innerHTML = highlightedEffectSource(configuration, soundPresets);
    updateActions();
  };
  const run = async (operation: EffectOperation) => {
    busy = true;
    status.textContent = operation.operation === 'remove' ? `${copy.remove}…` : `${copy.restore}…`;
    updateActions();
    const startedAt = performance.now();
    try {
      const result = await operation.finished;
      status.textContent = `${result.operation} · ${result.status} · ${Math.round(performance.now() - startedAt)} ms`;
    } finally {
      busy = false;
      updateActions();
      if (pendingPreview) schedulePreview();
    }
  };
  const preview = async () => {
    pendingPreview = false;
    if (busy) {
      pendingPreview = true;
      return;
    }
    if (!reconnectRetainedCard()) return;
    const effect = playgroundEffect(configuration, soundPresets);
    if (activeOperation === 'restore') {
      await run(instance.restore(card, { effect, sound: configuration.restore.soundEnabled }));
      return;
    }
    const operation = instance.remove(card, {
      effect,
      layout: false,
      retain: true,
      sound: configuration.remove.soundEnabled,
    });
    const previewRemovalId = operation.removalId;
    await run(operation);
    if (previewRemovalId === null) return;
    const retained = instance.take(previewRemovalId);
    if (!retained) return;
    card = retained;
    slot.append(card);
    registerCard();
    updateActions();
  };
  function schedulePreview() {
    pendingPreview = false;
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => void preview(), 240);
  }
  const scheduleHash = () => {
    if (hashTimer !== null) window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => writeHash(configuration, soundPresets, activeOperation), 100);
  };
  const syncFromControls = (changed?: NumericKey) => {
    const state = configuration[activeOperation];
    state.curve = curveSelect.value as ParticleCurve;
    state.release = releaseSelect.value as ParticleRelease;
    for (const range of ranges) {
      const value = Number(inputs.get(range.key)?.value);
      if (Number.isFinite(value)) state[range.key] = value;
    }
    if (state.horizontalMin > state.horizontalMax) {
      if (changed === 'horizontalMin') state.horizontalMax = state.horizontalMin;
      else state.horizontalMin = state.horizontalMax;
    }
    if (state.verticalMin > state.verticalMax) {
      if (changed === 'verticalMin') state.verticalMax = state.verticalMin;
      else state.verticalMin = state.verticalMax;
    }
    selectedPresets[activeOperation] = 'custom';
    status.textContent = copy.updated;
    scheduleHash();
    render();
    schedulePreview();
  };
  const prepare = () => {
    status.textContent = copy.preparing;
    void instance
      .prepare(card)
      .then(() => {
        if (!busy) status.textContent = copy.ready;
      })
      .catch((error: unknown) => {
        status.textContent = String(error);
      });
  };

  slot.append(card);
  registerCard();
  render();
  prepare();

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      const preset = button.dataset.preset as BuiltInEffect;
      selectedPresets[activeOperation] = preset;
      soundPresets[activeOperation] = preset;
      configuration[activeOperation] = stateFromPreset(particlePresets[preset]);
      void instance.prepareAudio(preset);
      scheduleHash();
      render();
      schedulePreview();
    });
  }
  curveSelect.addEventListener('change', () => syncFromControls());
  releaseSelect.addEventListener('change', () => syncFromControls());
  for (const [key, input] of inputs) input.addEventListener('input', () => syncFromControls(key));
  for (const button of operationButtons) {
    button.addEventListener('click', () => {
      const operation = button.dataset.operation as PlaygroundOperation;
      if (operation === activeOperation) return;
      activeOperation = operation;
      status.textContent = copy.updated;
      scheduleHash();
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
    selectedPresets[activeOperation] = 'custom';
    status.textContent = copy.updated;
    if (state.soundEnabled) void instance.prepareAudio(soundPresets[activeOperation]);
    scheduleHash();
    render();
    schedulePreview();
  });

  remove.addEventListener('click', () => {
    if (busy || !card.isConnected) return;
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    const operation = instance.remove(card, {
      effect: playgroundEffect(configuration, soundPresets),
      layout: false,
      retain: true,
      sound: configuration.remove.soundEnabled,
    });
    removalId = operation.removalId;
    void run(operation);
  });
  restore.addEventListener('click', () => {
    if (busy) return;
    if (!reconnectRetainedCard()) return;
    if (card.isConnected) {
      void run(
        instance.restore(card, {
          effect: playgroundEffect(configuration, soundPresets),
          sound: configuration.restore.soundEnabled,
        }),
      );
    }
  });
  reset.addEventListener('click', () => {
    if (busy) return;
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    if (removalId !== null) instance.discard(removalId);
    removalId = null;
    unregister();
    card.remove();
    card = createPreviewCard();
    slot.replaceChildren(card);
    registerCard();
    selectedPresets = { remove: 'dust', restore: 'dust' };
    soundPresets = { remove: 'dust', restore: 'dust' };
    activeOperation = 'remove';
    configuration = configurationFromPreset(particlePresets.dust);
    void instance.prepareAudio('dust');
    scheduleHash();
    render();
    prepare();
  });

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-copy]');
    if (!button) return;
    const target = button.dataset.copy;
    if (!target) return;
    writeHash(configuration, soundPresets, activeOperation);
    const text = target === 'effect' ? effectSource(configuration, soundPresets) : window.location.href;
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

  window.addEventListener(
    'pagehide',
    () => {
      if (previewTimer !== null) window.clearTimeout(previewTimer);
      if (hashTimer !== null) window.clearTimeout(hashTimer);
      unregister();
      instance.destroy();
    },
    { once: true },
  );
}
