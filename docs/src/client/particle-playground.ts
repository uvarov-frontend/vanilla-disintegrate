import Disintegrator, {
  createParticleEffect,
  particlePresets,
  type BuiltInPreset,
  type BuiltInSound,
  type EffectOperation,
  type ParticleCurve,
  type ParticleOptions,
  type ParticlePreset,
  type ParticleRelease,
  type RemovalId,
  type SoundOptions,
} from '../../../src/snapdom';
import { createDemoCard, demoCardContent } from './demo-card';
import {
  deletePlaygroundAudio,
  listPlaygroundAudio,
  savePlaygroundAudio,
  type StoredPlaygroundAudio,
} from './playground-audio-storage';

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
  soundSource: PlaygroundSoundSource;
  soundReverse: boolean;
  soundVolume: number;
  soundPlaybackRate: number;
  soundDelay: number;
  soundFadeDuration: number;
}

type PlaygroundOperation = 'remove' | 'restore';
type PlaygroundCardWidth = 'narrow' | 'wide';
type PlaygroundCustomSounds = readonly StoredPlaygroundAudio[];

/** A bundled name, or `custom:<id>` pointing at an entry in the browser's audio store. */
type PlaygroundSoundSource = BuiltInSound | `custom:${string}`;

function customSoundId(source: PlaygroundSoundSource) {
  return source.startsWith('custom:') ? source.slice('custom:'.length) : null;
}

function findCustomSound(source: PlaygroundSoundSource, sounds: PlaygroundCustomSounds) {
  const id = customSoundId(source);
  return id === null ? null : (sounds.find((sound) => sound.id === id) ?? null);
}

interface PlaygroundConfiguration {
  remove: PlaygroundState;
  restore: PlaygroundState;
}

type OptionSource<Property extends string = string> = readonly [Property, string];
type ParticleOptionSource = OptionSource<keyof ParticleOptions>;

type NumericKey = Exclude<keyof PlaygroundState, 'curve' | 'release' | 'soundEnabled' | 'soundSource' | 'soundReverse'>;

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
    cardShape: 'Card shape',
    cardShapeUpright: 'Upright card',
    cardShapeWide: 'Wide card',
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
    soundSource: 'Sound source',
    soundReverse: 'Reverse',
    customSound: 'Custom file',
    chooseSound: 'Choose file',
    changeSound: 'Replace',
    removeSound: 'Remove',
    localSoundNote: 'Stored in the browser IndexedDB.',
    bundledSoundNote: 'Bundled with the package.',
    audioTooLarge: 'Choose a file no larger than 5 MB.',
    audioTooLong: 'Choose audio no longer than 10 seconds.',
    audioInvalid: 'The browser could not read this audio file.',
    audioSaving: 'Saving audio locally…',
    soundVolume: 'Volume',
    soundPlaybackRate: 'Speed',
    soundDelay: 'Delay',
    soundFadeDuration: 'Fade',
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
    cardShape: 'Форма карточки',
    cardShapeUpright: 'Вертикальная карточка',
    cardShapeWide: 'Горизонтальная карточка',
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
    soundSource: 'Источник звука',
    soundReverse: 'Реверс',
    customSound: 'Свой файл',
    chooseSound: 'Выбрать файл',
    changeSound: 'Заменить',
    removeSound: 'Удалить',
    localSoundNote: 'Хранится в IndexedDB браузера.',
    bundledSoundNote: 'Встроенный звук из пакета.',
    audioTooLarge: 'Выберите файл размером не больше 5 МБ.',
    audioTooLong: 'Выберите звук длительностью не больше 10 секунд.',
    audioInvalid: 'Браузер не смог прочитать этот аудиофайл.',
    audioSaving: 'Сохраняем звук в браузере…',
    soundVolume: 'Громкость',
    soundPlaybackRate: 'Скорость',
    soundDelay: 'Задержка',
    soundFadeDuration: 'Фейд',
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
    cardShape: '卡片形状',
    cardShapeUpright: '竖版卡片',
    cardShapeWide: '横版卡片',
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
    soundSource: '声音来源',
    soundReverse: '反向',
    customSound: '自定义文件',
    chooseSound: '选择文件',
    changeSound: '替换',
    removeSound: '删除',
    localSoundNote: '保存在浏览器的 IndexedDB 中。',
    bundledSoundNote: '随包提供的内置音频。',
    audioTooLarge: '请选择不超过 5 MB 的文件。',
    audioTooLong: '请选择不超过 10 秒的音频。',
    audioInvalid: '浏览器无法读取此音频文件。',
    audioSaving: '正在本地保存音频…',
    soundVolume: '音量',
    soundPlaybackRate: '速度',
    soundDelay: '延迟',
    soundFadeDuration: '淡入淡出',
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
    cardShape: '카드 형태',
    cardShapeUpright: '세로형 카드',
    cardShapeWide: '가로형 카드',
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
    soundSource: '사운드 소스',
    soundReverse: '역재생',
    customSound: '사용자 파일',
    chooseSound: '파일 선택',
    changeSound: '교체',
    removeSound: '삭제',
    localSoundNote: '브라우저 IndexedDB에 저장됩니다.',
    bundledSoundNote: '패키지에 포함된 사운드입니다.',
    audioTooLarge: '5 MB 이하의 파일을 선택하세요.',
    audioTooLong: '10초 이하의 오디오를 선택하세요.',
    audioInvalid: '브라우저에서 이 오디오 파일을 읽을 수 없습니다.',
    audioSaving: '브라우저에 오디오 저장 중…',
    soundVolume: '볼륨',
    soundPlaybackRate: '속도',
    soundDelay: '지연',
    soundFadeDuration: '페이드',
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
    soundSource: 'Bundled audio or a local file.',
    soundReverse: 'Reverses the selected recording without requiring a second audio file.',
    soundVolume: '0–100%.',
    soundPlaybackRate: 'Speed and pitch.',
    soundDelay: 'Pause before playback.',
    soundFadeDuration: 'Fade in and out.',
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
    soundSource: 'Встроенный звук или локальный файл.',
    soundReverse: 'Воспроизводит выбранную запись задом наперёд без второго аудиофайла.',
    soundVolume: 'Уровень 0–100%.',
    soundPlaybackRate: 'Темп и высота тона.',
    soundDelay: 'Пауза перед стартом.',
    soundFadeDuration: 'Нарастание и затухание.',
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
    soundSource: '内置音频或本地文件。',
    soundReverse: '反向播放所选录音，无需第二个音频文件。',
    soundVolume: '0%–100%。',
    soundPlaybackRate: '速度和音高。',
    soundDelay: '播放前等待。',
    soundFadeDuration: '淡入和淡出。',
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
    soundSource: '내장 오디오 또는 로컬 파일.',
    soundReverse: '두 번째 파일 없이 선택한 녹음을 거꾸로 재생합니다.',
    soundVolume: '0%–100%.',
    soundPlaybackRate: '속도와 음높이.',
    soundDelay: '재생 전 대기.',
    soundFadeDuration: '페이드인·아웃.',
  },
} as const;

const locale = (typeof document === 'undefined' ? 'en' : (document.body.dataset.locale ?? 'en')) as Locale;
const copy = copies[locale];
const help = helps[locale];

export const presetNames: Record<BuiltInPreset, string> = {
  dust: 'Dust',
  scatter: 'Scatter',
  vapor: 'Vapor',
  wind: 'Wind',
};
const presetDescriptions: Record<Locale, Record<BuiltInPreset, string>> = {
  en: {
    dust: 'diagonal trail',
    scatter: 'spreads outward',
    vapor: 'rises and fades',
    wind: 'drifts sideways',
  },
  ru: {
    dust: 'диагональный шлейф',
    scatter: 'разлёт в стороны',
    vapor: 'вверх и растворяется',
    wind: 'сносит вбок',
  },
  zh: { dust: '对角拖尾', scatter: '向四周散开', vapor: '上升并消散', wind: '横向飘移' },
  ko: { dust: '대각선 궤적', scatter: '사방으로 확산', vapor: '상승하며 사라짐', wind: '옆으로 이동' },
};
const soundOptionLabels: Record<Locale, Record<BuiltInSound, string>> = {
  en: { dust: 'Dust', scatter: 'Scatter', vapor: 'Vapor', wind: 'Wind' },
  ru: { dust: 'Пыль', scatter: 'Импульс', vapor: 'Пар', wind: 'Ветер' },
  zh: { dust: '尘埃', scatter: '冲击', vapor: '气流', wind: '风声' },
  ko: { dust: '먼지', scatter: '충격', vapor: '공기', wind: '바람' },
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
const presetKeys = Object.keys(presetNames) as BuiltInPreset[];
const builtInSoundKeys: readonly BuiltInSound[] = ['dust', 'scatter', 'vapor', 'wind'];
/** Used whenever a chosen custom file is not in this browser's store. */
const FALLBACK_SOUND: BuiltInSound = 'dust';
const soundNumericKeys: readonly NumericKey[] = ['soundVolume', 'soundPlaybackRate', 'soundDelay', 'soundFadeDuration'];
function createRanges(copy: (typeof copies)[Locale], help: (typeof helps)[Locale]): readonly RangeDefinition[] {
  return [
    { key: 'duration', label: copy.duration, min: 200, max: 3000, step: 25, unit: 'ms', description: help.duration },
    { key: 'stagger', label: copy.stagger, min: 0, max: 800, step: 10, unit: 'ms', description: help.stagger },
    {
      key: 'horizontalDrift',
      label: copy.horizontalDrift,
      min: 0,
      max: 240,
      step: 1,
      unit: 'px',
      description: help.horizontalDrift,
    },
    {
      key: 'horizontalMin',
      label: copy.horizontalMin,
      min: -400,
      max: 400,
      step: 1,
      unit: 'px',
      description: help.horizontalMin,
    },
    {
      key: 'horizontalMax',
      label: copy.horizontalMax,
      min: -400,
      max: 400,
      step: 1,
      unit: 'px',
      description: help.horizontalMax,
    },
    {
      key: 'verticalMin',
      label: copy.verticalMin,
      min: -400,
      max: 400,
      step: 1,
      unit: 'px',
      description: help.verticalMin,
    },
    {
      key: 'verticalMax',
      label: copy.verticalMax,
      min: -400,
      max: 400,
      step: 1,
      unit: 'px',
      description: help.verticalMax,
    },
    {
      key: 'convergence',
      label: copy.convergence,
      min: 0,
      max: 1,
      step: 0.05,
      unit: '',
      description: help.convergence,
    },
    { key: 'swirl', label: copy.swirl, min: 0, max: 160, step: 1, unit: 'px', description: help.swirl },
    { key: 'endScale', label: copy.endScale, min: 0.1, max: 2, step: 0.01, unit: '×', description: help.endScale },
    {
      key: 'soundVolume',
      label: copy.soundVolume,
      min: 0,
      max: 1,
      step: 0.01,
      unit: '%',
      description: help.soundVolume,
    },
    {
      key: 'soundPlaybackRate',
      label: copy.soundPlaybackRate,
      min: 0.5,
      max: 2,
      step: 0.01,
      unit: '×',
      description: help.soundPlaybackRate,
    },
    { key: 'soundDelay', label: copy.soundDelay, min: 0, max: 500, step: 10, unit: 'ms', description: help.soundDelay },
    {
      key: 'soundFadeDuration',
      label: copy.soundFadeDuration,
      min: 0,
      max: 1,
      step: 0.01,
      unit: 's',
      description: help.soundFadeDuration,
    },
  ];
}

const ranges = createRanges(copy, help);
const MAX_LOCAL_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_LOCAL_AUDIO_SECONDS = 10;
const COMPACT_HASH_PREFIX = '#p=';
const COMPACT_HASH_VERSION = 1;

type CompactInteger = 'i16' | 'u8' | 'u16';

interface CompactNumberDefinition {
  readonly key: NumericKey;
  readonly scale: number;
  readonly type: CompactInteger;
}

// The order is the compact-link wire format. Append fields or introduce a new
// version instead of reordering them.
const compactNumbers: readonly CompactNumberDefinition[] = [
  { key: 'duration', scale: 1, type: 'u16' },
  { key: 'stagger', scale: 1, type: 'u16' },
  { key: 'horizontalDrift', scale: 1, type: 'u8' },
  { key: 'horizontalMin', scale: 1, type: 'i16' },
  { key: 'horizontalMax', scale: 1, type: 'i16' },
  { key: 'verticalMin', scale: 1, type: 'i16' },
  { key: 'verticalMax', scale: 1, type: 'i16' },
  { key: 'convergence', scale: 100, type: 'u8' },
  { key: 'swirl', scale: 1, type: 'u8' },
  { key: 'endScale', scale: 100, type: 'u8' },
  { key: 'soundVolume', scale: 100, type: 'u8' },
  { key: 'soundPlaybackRate', scale: 100, type: 'u8' },
  { key: 'soundDelay', scale: 1, type: 'u16' },
  { key: 'soundFadeDuration', scale: 100, type: 'u8' },
];

class CompactWriter {
  readonly bytes: number[] = [];

  u8(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError('Invalid compact uint8.');
    this.bytes.push(value);
  }

  u16(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError('Invalid compact uint16.');
    this.bytes.push(value >>> 8, value & 0xff);
  }

  i16(value: number) {
    if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) throw new RangeError('Invalid compact int16.');
    this.u16(value & 0xffff);
  }

  text(value: string) {
    const encoded = new TextEncoder().encode(value);
    this.u8(encoded.length);
    this.bytes.push(...encoded);
  }
}

class CompactReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done() {
    return this.offset === this.bytes.length;
  }

  u8() {
    const value = this.bytes[this.offset];
    if (value === undefined) throw new RangeError('Truncated compact link.');
    this.offset += 1;
    return value;
  }

  u16() {
    return (this.u8() << 8) | this.u8();
  }

  i16() {
    const value = this.u16();
    return value >= 0x8000 ? value - 0x1_0000 : value;
  }

  text() {
    const length = this.u8();
    const end = this.offset + length;
    if (end > this.bytes.length) throw new RangeError('Truncated compact text.');
    const value = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(this.offset, end));
    this.offset = end;
    return value;
  }
}

function required<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing particle playground element: ${selector}`);
  return element;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function audioDuration(file: Blob) {
  return new Promise<number>((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    let settled = false;
    let timeout = 0;
    const release = () => {
      if (settled) return false;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeEventListener('loadedmetadata', loaded);
      audio.removeEventListener('error', failed);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      return true;
    };
    const loaded = () => {
      const duration = audio.duration;
      if (!release()) return;
      if (Number.isFinite(duration)) resolve(duration);
      else reject(new Error('Invalid audio duration.'));
    };
    const failed = () => {
      if (!release()) return;
      reject(new Error('Unable to read audio metadata.'));
    };
    timeout = window.setTimeout(() => {
      if (!release()) return;
      reject(new Error('Audio metadata timeout.'));
    }, 5000);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', loaded, { once: true });
    audio.addEventListener('error', failed, { once: true });
    audio.src = url;
  });
}

function stateFromPreset(
  preset: ParticlePreset,
  operation: PlaygroundOperation,
  soundSource: BuiltInSound = 'dust',
): PlaygroundState {
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
    soundSource,
    soundReverse: operation === 'restore',
    soundVolume: 0.32,
    soundPlaybackRate: 1,
    soundDelay: 0,
    soundFadeDuration: 0.18,
  };
}

function stateFromBuiltInPreset(preset: BuiltInPreset, operation: PlaygroundOperation): PlaygroundState {
  return stateFromPreset(particlePresets[preset], operation, preset);
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

function matchingParticlePreset(state: PlaygroundState): BuiltInPreset | null {
  return (
    presetKeys.find((preset) => {
      const candidate = particlePresets[preset];
      return (
        state.curve === candidate.curve &&
        state.release === candidate.release &&
        state.duration === candidate.duration &&
        state.stagger === candidate.stagger &&
        state.horizontalDrift === candidate.horizontalDrift &&
        state.horizontalMin === candidate.horizontalTravel[0] &&
        state.horizontalMax === candidate.horizontalTravel[1] &&
        state.verticalMin === candidate.verticalTravel[0] &&
        state.verticalMax === candidate.verticalTravel[1] &&
        state.convergence === candidate.convergence &&
        state.swirl === candidate.swirl &&
        state.endScale === candidate.endScale
      );
    }) ?? null
  );
}

function matchingConfigurationPreset(configuration: PlaygroundConfiguration): BuiltInPreset | null {
  const removePreset = matchingParticlePreset(configuration.remove);
  return removePreset !== null && matchingParticlePreset(configuration.restore) === removePreset ? removePreset : null;
}

function configuredSound(state: PlaygroundState, customSounds: PlaygroundCustomSounds): SoundOptions | null {
  if (!state.soundEnabled) return null;
  const custom = findCustomSound(state.soundSource, customSounds);
  const src = customSoundId(state.soundSource) === null ? state.soundSource : custom?.blob;
  if (src === undefined) return null;
  return {
    src,
    reverse: state.soundReverse,
    volume: state.soundVolume,
    playbackRate: state.soundPlaybackRate,
    delay: state.soundDelay,
    fadeDuration: state.soundFadeDuration,
  };
}

function playgroundEffect(configuration: PlaygroundConfiguration) {
  return createParticleEffect({
    remove: particleOptions(configuration.remove),
    restore: particleOptions(configuration.restore),
  });
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function editableRangeValue(range: RangeDefinition, value: number) {
  return range.key === 'soundVolume' ? value * 100 : value;
}

function formatEditableRangeValue(range: RangeDefinition, value: number) {
  const scale = range.key === 'soundVolume' ? 100 : 1;
  const step = (range.step * scale).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  const fractionDigits = step.split('.')[1]?.length ?? 0;
  return editableRangeValue(range, value).toFixed(fractionDigits);
}

function stateRangeValue(range: RangeDefinition, value: number) {
  return range.key === 'soundVolume' ? value / 100 : value;
}

function particleOptionSources(state: PlaygroundState): readonly ParticleOptionSource[] {
  return [
    ['curve', `'${state.curve}'`],
    ['release', `'${state.release}'`],
    ['duration', formatNumber(state.duration)],
    ['stagger', formatNumber(state.stagger)],
    ['horizontalDrift', formatNumber(state.horizontalDrift)],
    ['horizontalTravel', `[${formatNumber(state.horizontalMin)}, ${formatNumber(state.horizontalMax)}]`],
    ['verticalTravel', `[${formatNumber(state.verticalMin)}, ${formatNumber(state.verticalMax)}]`],
    ['convergence', formatNumber(state.convergence)],
    ['swirl', formatNumber(state.swirl)],
    ['endScale', formatNumber(state.endScale)],
  ];
}

function splitSharedOptions<Property extends string>(
  removeOptions: readonly OptionSource<Property>[],
  restoreOptions: readonly OptionSource<Property>[],
) {
  const restoreValues = new Map<Property, string>(restoreOptions);
  const shared = removeOptions.filter(([property, value]) => restoreValues.get(property) === value);
  const sharedProperties = new Set(shared.map(([property]) => property));
  return {
    shared,
    remove: removeOptions.filter(([property]) => !sharedProperties.has(property)),
    restore: restoreOptions.filter(([property]) => !sharedProperties.has(property)),
  };
}

function optionsSource(options: readonly OptionSource[], spread?: string, depth = 1) {
  const indentation = '  '.repeat(depth);
  const closingIndentation = '  '.repeat(depth - 1);
  const lines = [
    ...(spread === undefined ? [] : [`${indentation}...${spread},`]),
    ...options.map(([property, value]) => `${indentation}${property}: ${value},`),
  ];
  return `{
${lines.join('\n')}
${closingIndentation}}`;
}

function playbackOptionSources(source: string, state: PlaygroundState): readonly OptionSource<keyof SoundOptions>[] {
  return [
    ['src', source],
    ['reverse', String(state.soundReverse)],
    ['volume', formatNumber(state.soundVolume)],
    ['playbackRate', formatNumber(state.soundPlaybackRate)],
    ['delay', formatNumber(state.soundDelay)],
    ['fadeDuration', formatNumber(state.soundFadeDuration)],
  ];
}

function playbackSource(options: readonly OptionSource[], spread?: string) {
  const lines = [
    ...(spread === undefined ? [] : [`      ...${spread},`]),
    ...options.map(([property, value]) => `      ${property}: ${value},`),
  ];
  return `{
${lines.join('\n')}
    }`;
}

function customSoundFileName(source: PlaygroundSoundSource, customSounds: PlaygroundCustomSounds) {
  const sound = findCustomSound(source, customSounds);
  if (sound === null || sound.name.trim() === '') return 'custom-sound.mp3';
  // Two stored files may carry the same name. Without the id the two phases would emit
  // an identical `src`, which the shared-option split then hoists into one constant —
  // silently giving both phases the same recording.
  const collides = customSounds.some((other) => other.id !== sound.id && other.name === sound.name);
  if (!collides) return sound.name;
  const extension = sound.name.lastIndexOf('.');
  return extension <= 0
    ? `${sound.name}-${sound.id}`
    : `${sound.name.slice(0, extension)}-${sound.id}${sound.name.slice(extension)}`;
}

function soundSourceExpression(state: PlaygroundState, customSounds: PlaygroundCustomSounds) {
  if (customSoundId(state.soundSource) === null) return `'${state.soundSource}'`;
  // A file name is one path segment, and spaces or a `#` in it would truncate the URL.
  const path = `./${encodeURIComponent(customSoundFileName(state.soundSource, customSounds))}`;
  return `new URL(${JSON.stringify(path)}, import.meta.url)`;
}

function soundCodeSource(
  operations: readonly PlaygroundOperation[],
  configuration: PlaygroundConfiguration,
  customSounds: PlaygroundCustomSounds,
) {
  let operationOptions = operations.map((operation) => ({
    operation,
    options: playbackOptionSources(
      soundSourceExpression(configuration[operation], customSounds),
      configuration[operation],
    ),
  }));
  let declaration = '';
  let spread: string | undefined;
  if (operationOptions.length === 2) {
    const shared = splitSharedOptions(operationOptions[0]!.options, operationOptions[1]!.options);
    if (shared.shared.length > 0) {
      declaration = `const sharedSoundOptions = ${optionsSource(shared.shared)};\n\n`;
      spread = 'sharedSoundOptions';
      operationOptions = [
        { operation: operationOptions[0]!.operation, options: shared.remove },
        { operation: operationOptions[1]!.operation, options: shared.restore },
      ];
    }
  }
  return {
    declaration,
    entries: operationOptions
      .map(({ operation, options }) =>
        // Both phases fully shared: point them at the constant instead of wrapping it
        // in an object whose only member is the spread.
        spread !== undefined && options.length === 0
          ? `    ${operation}: ${spread},`
          : `    ${operation}: ${playbackSource(options, spread)},`,
      )
      .join('\n'),
  };
}

function usesDefaultPresetSound(state: PlaygroundState, operation: PlaygroundOperation, preset: BuiltInPreset) {
  return (
    state.soundSource === preset &&
    state.soundReverse === (operation === 'restore') &&
    state.soundVolume === 0.32 &&
    state.soundPlaybackRate === 1 &&
    state.soundDelay === 0 &&
    state.soundFadeDuration === 0.18
  );
}

function presetSource(
  preset: BuiltInPreset,
  configuration: PlaygroundConfiguration,
  customSounds: PlaygroundCustomSounds,
) {
  const enabledOperations = (['remove', 'restore'] as const).filter(
    (operation) => configuration[operation].soundEnabled,
  );
  if (enabledOperations.length === 0) {
    return `import Disintegrator from 'vanilla-disintegrate/snapdom';

export const disintegrator = new Disintegrator({
  preset: '${preset}',
  sound: false,
});`;
  }
  if (
    enabledOperations.length === 2 &&
    enabledOperations.every((operation) => usesDefaultPresetSound(configuration[operation], operation, preset))
  ) {
    return `import Disintegrator from 'vanilla-disintegrate/snapdom';

export const disintegrator = new Disintegrator({
  preset: '${preset}',
});`;
  }

  const soundSource = soundCodeSource(enabledOperations, configuration, customSounds);
  return `import Disintegrator, { builtInPresets, definePreset } from 'vanilla-disintegrate/snapdom';

${soundSource.declaration}export const preset = definePreset({
  effect: builtInPresets.${preset}.effect,
  sound: {
${soundSource.entries}
  },
});

export const disintegrator = new Disintegrator({ preset });`;
}

function effectSource(configuration: PlaygroundConfiguration, customSounds: PlaygroundCustomSounds) {
  const preset = matchingConfigurationPreset(configuration);
  if (preset !== null) return presetSource(preset, configuration, customSounds);

  const removeOptionSources = particleOptionSources(configuration.remove);
  const restoreOptionSources = particleOptionSources(configuration.restore);
  const splitOptions = splitSharedOptions(removeOptionSources, restoreOptionSources);
  const identicalParticleOptions = splitOptions.remove.length === 0 && splitOptions.restore.length === 0;
  const sharedOptionsName = splitOptions.shared.length > 0 ? 'sharedParticleOptions' : undefined;
  const sharedParticleOptionsDeclaration =
    sharedOptionsName === undefined
      ? ''
      : `const ${sharedOptionsName}: ParticleOptions = ${optionsSource(splitOptions.shared)};\n\n`;
  // Matching phases still need both keys: the shared constant is what they point at,
  // otherwise the copied snippet animates removal and leaves restore undefined.
  const particleEffectOptions =
    identicalParticleOptions && sharedOptionsName !== undefined
      ? `    remove: ${sharedOptionsName},
    restore: ${sharedOptionsName},`
      : `    remove: ${optionsSource(splitOptions.remove, sharedOptionsName, 3)},
    restore: ${optionsSource(splitOptions.restore, sharedOptionsName, 3)},`;
  const enabledOperations = (['remove', 'restore'] as const).filter(
    (operation) => configuration[operation].soundEnabled,
  );
  const soundSource = soundCodeSource(enabledOperations, configuration, customSounds);
  const particleOptionsImport = sharedOptionsName === undefined ? '' : ', type ParticleOptions';
  const importSource = `import Disintegrator, { createParticleEffect${particleOptionsImport} } from 'vanilla-disintegrate/snapdom';`;
  return `${importSource}

${sharedParticleOptionsDeclaration}${soundSource.declaration}export const disintegrator = new Disintegrator({
  effect: createParticleEffect({
${particleEffectOptions}
  }),${enabledOperations.length > 0 ? `\n  sound: {\n${soundSource.entries}\n  },` : ''}
});`;
}

function highlightedEffectSource(configuration: PlaygroundConfiguration, customSounds: PlaygroundCustomSounds) {
  const source = effectSource(configuration, customSounds);
  const pattern =
    /(["'][^"'\n]*["'])|\b(import|from|export|const|new|true|false|type)\b|(-?\d+(?:\.\d+)?)|(\b[a-zA-Z]\w*)(?=:)|\b(builtInPresets|createParticleEffect|definePreset|Disintegrator|ParticleOptions|URL)\b/g;
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
  return createDemoCard('playground-card');
}

function configurationFromPreset(preset: BuiltInPreset): PlaygroundConfiguration {
  return {
    remove: stateFromBuiltInPreset(preset, 'remove'),
    restore: stateFromBuiltInPreset(preset, 'restore'),
  };
}

interface PlaygroundHashState {
  readonly configuration: PlaygroundConfiguration;
  readonly operation: PlaygroundOperation;
  readonly cardWidth: PlaygroundCardWidth;
}

function writeCompactNumber(writer: CompactWriter, definition: CompactNumberDefinition, value: number) {
  const compactValue = Math.round(value * definition.scale);
  writer[definition.type](compactValue);
}

function readCompactNumber(reader: CompactReader, definition: CompactNumberDefinition) {
  const value = reader[definition.type]() / definition.scale;
  const range = ranges.find((candidate) => candidate.key === definition.key);
  if (range === undefined || value < range.min || value > range.max)
    throw new RangeError('Compact playground value is out of range.');
  return value;
}

function writeCompactState(writer: CompactWriter, state: PlaygroundState) {
  const curve = curves.indexOf(state.curve);
  const release = releases.indexOf(state.release);
  writer.u8(curve | (release << 2) | (state.soundEnabled ? 1 << 4 : 0) | (state.soundReverse ? 1 << 5 : 0));

  const customId = customSoundId(state.soundSource);
  if (customId === null) writer.u8(builtInSoundKeys.indexOf(state.soundSource as BuiltInSound));
  else {
    writer.u8(0xff);
    writer.text(customId);
  }
  for (const definition of compactNumbers) writeCompactNumber(writer, definition, state[definition.key]);
}

function readCompactState(reader: CompactReader): PlaygroundState {
  const metadata = reader.u8();
  if ((metadata & 0xc0) !== 0) throw new RangeError('Unsupported compact playground flags.');
  const curve = curves[metadata & 0b11];
  const release = releases[(metadata >>> 2) & 0b11];
  if (curve === undefined || release === undefined) throw new RangeError('Invalid compact playground options.');

  const soundCode = reader.u8();
  let soundSource: PlaygroundSoundSource;
  if (soundCode === 0xff) {
    const customId = reader.text();
    if (customId === '') throw new RangeError('Invalid compact custom sound.');
    soundSource = `custom:${customId}`;
  } else {
    const builtInSound = builtInSoundKeys[soundCode];
    if (builtInSound === undefined) throw new RangeError('Invalid compact sound.');
    soundSource = builtInSound;
  }

  const state = stateFromPreset(particlePresets.dust, 'remove');
  state.curve = curve;
  state.release = release;
  state.soundEnabled = (metadata & (1 << 4)) !== 0;
  state.soundReverse = (metadata & (1 << 5)) !== 0;
  state.soundSource = soundSource;
  for (const definition of compactNumbers) state[definition.key] = readCompactNumber(reader, definition);
  if (state.horizontalMin > state.horizontalMax || state.verticalMin > state.verticalMax)
    throw new RangeError('Invalid compact playground range.');
  return state;
}

function base64UrlFromBytes(bytes: readonly number[]) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromBase64Url(value: string) {
  if (!/^[\w-]+$/.test(value)) throw new TypeError('Invalid compact playground encoding.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function compactHash(
  configuration: PlaygroundConfiguration,
  operation: PlaygroundOperation,
  cardWidth: PlaygroundCardWidth,
) {
  const writer = new CompactWriter();
  writer.u8(COMPACT_HASH_VERSION);
  writer.u8((operation === 'restore' ? 1 : 0) | (cardWidth === 'narrow' ? 1 << 1 : 0));
  writeCompactState(writer, configuration.remove);
  writeCompactState(writer, configuration.restore);
  return `${COMPACT_HASH_PREFIX}${base64UrlFromBytes(writer.bytes)}`;
}

function playgroundStateFromHash(): PlaygroundHashState | null {
  if (!window.location.hash.startsWith(COMPACT_HASH_PREFIX)) return null;
  try {
    const reader = new CompactReader(bytesFromBase64Url(window.location.hash.slice(COMPACT_HASH_PREFIX.length)));
    if (reader.u8() !== COMPACT_HASH_VERSION) return null;
    const flags = reader.u8();
    if ((flags & 0xfc) !== 0) return null;
    const configuration = {
      remove: readCompactState(reader),
      restore: readCompactState(reader),
    };
    if (!reader.done) return null;
    return {
      configuration,
      operation: (flags & 1) === 0 ? 'remove' : 'restore',
      cardWidth: (flags & (1 << 1)) === 0 ? 'wide' : 'narrow',
    };
  } catch {
    return null;
  }
}

function writeHash(
  configuration: PlaygroundConfiguration,
  operation: PlaygroundOperation,
  cardWidth: PlaygroundCardWidth,
) {
  const url = `${window.location.pathname}${window.location.search}${compactHash(configuration, operation, cardWidth)}`;
  window.history.replaceState(window.history.state, '', url);
}

/** Renders the complete playground markup into the initial HTML response. */
export function renderParticlePlayground(locale: Locale) {
  const copy = copies[locale];
  const help = helps[locale];
  const ranges = createRanges(copy, help);
  const initialState = stateFromBuiltInPreset('dust', 'remove');
  const initialConfiguration = configurationFromPreset('dust');
  const initialCustomSounds: PlaygroundCustomSounds = [];
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
  const selectMarkup = (key: 'curve' | 'release', label: string, description: string, values: readonly string[]) =>
    `<div class="playground-select-field"><span class="playground-field-heading"><label for="playground-${key}">${label}</label><small>${description}</small></span><select id="playground-${key}" data-${key}>${selectOptions(key, values)}</select></div>`;
  const rangeMarkup = (keys: readonly NumericKey[]) =>
    keys
      .map((key) => {
        const range = ranges.find((definition) => definition.key === key);
        if (!range) throw new Error(`Missing particle playground range: ${key}`);
        const value = initialState[range.key];
        const progress = ((value - range.min) / (range.max - range.min)) * 100;
        const scale = range.key === 'soundVolume' ? 100 : 1;
        const unit = range.unit === '' ? '' : `<span aria-hidden="true">${range.unit}</span>`;
        return `<div class="playground-range"><div class="playground-range-heading"><span><label for="playground-${range.key}">${range.label}</label><small>${range.description}</small></span><span class="playground-range-value"><input id="playground-${range.key}-value" type="number" min="${formatNumber(range.min * scale)}" max="${formatNumber(range.max * scale)}" step="any" value="${formatEditableRangeValue(range, value)}" data-value="${range.key}" aria-label="${range.label}">${unit}</span></div><input id="playground-${range.key}" type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" data-option="${range.key}" style="--range-progress: ${progress}%"></div>`;
      })
      .join('');
  const groupPanel = (id: 'timing' | 'horizontal' | 'vertical', keys: readonly NumericKey[], hidden = false) =>
    `<section id="playground-group-panel-${id}" class="playground-settings-panel" role="tabpanel" data-group-panel="${id}" aria-labelledby="playground-group-tab-${id}"${hidden ? ' hidden' : ''}><div class="playground-control-list">${rangeMarkup(keys)}</div></section>`;
  const soundOptions = builtInSoundKeys
    .map((key) => `<option value="${key}">${soundOptionLabels[locale][key]}</option>`)
    .join('');
  const fileIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 10.75V3.5m0 0L5.25 6.25M8 3.5l2.75 2.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M3 10.5v1.25A1.25 1.25 0 0 0 4.25 13h7.5A1.25 1.25 0 0 0 13 11.75V10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>`;
  const clearIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m5 5 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>`;
  const soundMarkup = `<section id="playground-group-panel-sound" class="playground-settings-panel playground-sound-panel" role="tabpanel" data-group-panel="sound" aria-labelledby="playground-group-tab-sound" hidden>
    <div class="playground-sound-toggles">
      <div class="playground-sound-enabled"><span>${copy.soundEnabled}</span><label class="playground-switch"><input type="checkbox" data-sound-enabled checked><span aria-hidden="true"></span><output data-sound-state>${copy.on}</output></label></div>
      <div class="playground-sound-reverse"><b>${copy.soundReverse}</b><label class="playground-switch playground-switch-compact"><input type="checkbox" data-sound-reverse><span aria-hidden="true"></span></label></div>
    </div>
    <div class="playground-sound-source playground-select-field">
      <div class="playground-sound-heading">
        <span class="playground-field-heading"><label for="playground-sound-source">${copy.soundSource}</label><small>${help.soundSource}</small></span>
        <button type="button" class="playground-sound-remove" data-local-audio-remove hidden>${clearIcon}<span>${copy.removeSound}</span></button>
      </div>
      <div class="playground-sound-picker">
        <div class="playground-sound-select"><select id="playground-sound-source" data-sound-source>${soundOptions}</select></div>
        <input id="playground-local-audio-file" type="file" accept="audio/*" data-local-audio-input hidden>
        <label class="playground-sound-file" for="playground-local-audio-file" data-local-audio-choose title="${copy.chooseSound}">${fileIcon}<span>${copy.customSound}</span></label>
      </div>
      <small class="playground-local-audio-note" data-local-audio-meta>${copy.bundledSoundNote}</small>
    </div>
    <div class="playground-control-list playground-sound-ranges">${rangeMarkup(soundNumericKeys)}</div>
  </section>`;
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
            <div class="playground-width-tabs" role="group" aria-label="${copy.cardShape}">
              <button type="button" data-width-option="narrow" aria-pressed="false" aria-label="${copy.cardShapeUpright}" title="${copy.cardShapeUpright}"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="4" y="3.25" width="8" height="9.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.5"></rect><path d="M4 8.25h8" stroke="currentColor" stroke-width="1.5"></path></svg></button>
              <button type="button" data-width-option="wide" aria-pressed="true" aria-label="${copy.cardShapeWide}" title="${copy.cardShapeWide}"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.75" y="4.75" width="12.5" height="6.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.5"></rect><path d="M6.25 4.75v6.5" stroke="currentColor" stroke-width="1.5"></path></svg></button>
            </div>
            <div class="playground-stage" data-slot><article class="demo-card playground-card" data-card-width="wide">${demoCardContent}</article></div>
          </div>
          <section id="playground-view-panel-code" class="playground-view-panel playground-code code-block" role="tabpanel" data-view-panel="code" aria-labelledby="playground-view-tab-code" hidden>
            <div class="code-toolbar playground-code-heading">
              <span>TypeScript</span>
              <div><button type="button" data-copy="effect" aria-label="${copy.copyEffect}" title="${copy.copyEffect}"><span class="playground-copy-icon playground-copy-icon-default">${copyIcon}</span><span class="playground-copy-icon playground-copy-icon-success">${copiedIcon}</span><span>${copy.copyEffectShort}</span></button><button type="button" data-copy="link" aria-label="${copy.copyLink}" title="${copy.copyLink}"><span class="playground-copy-icon playground-copy-icon-default">${linkIcon}</span><span class="playground-copy-icon playground-copy-icon-success">${copiedIcon}</span><span>${copy.copyLinkShort}</span></button></div>
            </div>
            <pre class="language-typescript"><code data-code>${highlightedEffectSource(initialConfiguration, initialCustomSounds)}</code></pre>
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
    const firstParts = morph ? parts.map((part) => part.getBoundingClientRect()) : [];

    card.dataset.cardWidth = cardWidth;
    for (const button of widthButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.widthOption === cardWidth));
    }
    if (!morph || firstCard === null || frame === null) return;

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
      translate: `${first.left - origin.left}px ${first.top - origin.top}px`,
      width: `${first.width}px`,
      height: `${first.height}px`,
    });
    const running = parts.map((part, index) =>
      part.animate([box(firstParts[index]!, firstCard), box(lastParts[index]!, lastFrame)], timing),
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
      prepare();
    });
  };
  for (const button of widthButtons) {
    button.addEventListener('click', () => {
      const selected = button.dataset.widthOption === 'wide' ? 'wide' : 'narrow';
      if (selected === cardWidth) return;
      cardWidth = selected;
      applyCardWidth(true);
      scheduleHash();
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
  let cardWidth = hashState?.cardWidth ?? 'wide';
  let customSounds: PlaygroundCustomSounds = [];
  // The store is read asynchronously; until it answers, a `custom:` source from the
  // URL is unresolved rather than unknown, so it must not be replaced yet.
  let customSoundsLoaded = false;
  // Never derived from the list length: a deletion would let the next fallback entry
  // reuse a live id, and both options would then address the same file.
  let sessionAudioCount = 0;
  // Set only by a preset click, so a slider drag does not grey the presets out during
  // its own queued preview while an actual switch is still locked out on the spot.
  let presetSwitchPending = false;
  let card = slot.querySelector<HTMLElement>('.playground-card') ?? createPreviewCard();
  let removalId: RemovalId | null = null;
  let unregister: () => void = () => undefined;
  let busy = false;
  let pendingPreview = false;
  let previewTimer: number | null = null;
  let hashTimer: number | null = null;
  const initialSounds = (['remove', 'restore'] as const)
    .map((operation) => configuredSound(configuration[operation], customSounds))
    .filter((sound): sound is SoundOptions => sound !== null);
  const instance = new Disintegrator({
    audioPreparation: initialSounds.length > 0 ? { sounds: initialSounds } : false,
    effect: playgroundEffect(configuration),
    layout: false,
    // Explicit prepare() below owns the initial capture; idle registration only
    // covers later invalidations without racing it with a duplicate snapshot.
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
    // The wait before a switch's preview starts is still a window where a second
    // preset would swap the configuration out from under it, so it locks too.
    // The selected preset stays live so the current choice keeps its full contrast.
    const presetsLocked = busy || presetSwitchPending;
    for (const button of presetButtons)
      button.disabled = presetsLocked && button.getAttribute('aria-pressed') !== 'true';
    for (const button of widthButtons) button.disabled = busy || !card.isConnected;
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
    soundReverse.checked = state.soundReverse;
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
  function schedulePreview(fromPreset = false) {
    pendingPreview = false;
    presetSwitchPending = fromPreset;
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      previewTimer = null;
      // run() flips `busy` before its first await, so the lock never lifts in between.
      void preview().finally(() => {
        presetSwitchPending = false;
        updateActions();
      });
    }, 240);
    updateActions();
  }
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
  const commitConfigurationChange = (changed?: NumericKey) => {
    const state = configuration[activeOperation];
    if (state.horizontalMin > state.horizontalMax) {
      if (changed === 'horizontalMin') state.horizontalMax = state.horizontalMin;
      else state.horizontalMin = state.horizontalMax;
    }
    if (state.verticalMin > state.verticalMax) {
      if (changed === 'verticalMin') state.verticalMax = state.verticalMin;
      else state.verticalMin = state.verticalMax;
    }
    status.textContent = copy.updated;
    scheduleHash();
    render();
    schedulePreview();
  };
  const syncFromControls = (changed?: NumericKey) => {
    const state = configuration[activeOperation];
    state.curve = curveSelect.value as ParticleCurve;
    state.release = releaseSelect.value as ParticleRelease;
    if (changed !== undefined) {
      const value = Number(inputs.get(changed)?.value);
      if (Number.isFinite(value)) state[changed] = value;
    }
    commitConfigurationChange(changed);
  };
  const syncFromValueInput = (range: RangeDefinition, input: HTMLInputElement) => {
    if (!Number.isFinite(input.valueAsNumber)) {
      render();
      return;
    }
    const value = stateRangeValue(range, input.valueAsNumber);
    configuration[activeOperation][range.key] = Math.min(range.max, Math.max(range.min, value));
    commitConfigurationChange(range.key);
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
  const prepareOperationSound = (operation: PlaygroundOperation) => {
    const sound = configuredSound(configuration[operation], customSounds);
    if (sound === null) return Promise.resolve();
    return instance.prepareAudio(sound);
  };

  slot.append(card);
  registerCard();
  applyCardWidth(false);
  render();
  prepare();

  // A prepared snapshot is a picture of the card under the palette that was active when
  // it was taken, so a theme switch leaves the effect tearing apart the previous look.
  // Watching the attribute keeps this independent of whatever flips the theme.
  let appliedTheme = document.documentElement.dataset.theme;
  new MutationObserver(() => {
    const theme = document.documentElement.dataset.theme;
    if (theme === appliedTheme) return;
    appliedTheme = theme;
    // One frame lets the new palette paint before the capture reads the card.
    requestAnimationFrame(() => {
      if (!busy) prepare();
    });
  }).observe(document.documentElement, { attributeFilter: ['data-theme'] });
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
      // Switching rebuilds the configuration and discards the prepared audio, which
      // would pull the ground out from under a run that is already playing.
      if (busy) return;
      const preset = button.dataset.preset as BuiltInPreset;
      for (const operation of ['remove', 'restore'] as const) {
        const previous = configuredSound(configuration[operation], customSounds);
        if (previous !== null) instance.discardPreparedAudio(previous);
      }
      configuration = configurationFromPreset(preset);
      void Promise.all([prepareOperationSound('remove'), prepareOperationSound('restore')]);
      scheduleHash();
      render();
      schedulePreview(true);
    });
  }
  curveSelect.addEventListener('change', () => syncFromControls());
  releaseSelect.addEventListener('change', () => syncFromControls());
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
    status.textContent = copy.updated;
    if (state.soundEnabled) void prepareOperationSound(activeOperation);
    scheduleHash();
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
    scheduleHash();
    render();
    void prepareOperationSound(operation);
    schedulePreview();
  });
  soundReverse.addEventListener('change', () => {
    const operation = activeOperation;
    const state = configuration[operation];
    const previous = configuredSound(state, customSounds);
    if (previous !== null) instance.discardPreparedAudio(previous);
    state.soundReverse = soundReverse.checked;
    status.textContent = copy.updated;
    scheduleHash();
    render();
    void prepareOperationSound(operation);
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
    scheduleHash();
    render();
    void deletePlaygroundAudio(removed.id).catch(() => undefined);
    void prepareOperationSound(operation);
    schedulePreview();
  });

  remove.addEventListener('click', () => {
    if (busy || !card.isConnected) return;
    if (previewTimer !== null) window.clearTimeout(previewTimer);
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
    if (busy) return;
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
    cardWidth = 'wide';
    applyCardWidth(false);
    activeOperation = 'remove';
    configuration = configurationFromPreset('dust');
    void Promise.all([prepareOperationSound('remove'), prepareOperationSound('restore')]);
    scheduleHash();
    render();
    prepare();
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
    if (previewTimer !== null) {
      window.clearTimeout(previewTimer);
      previewTimer = null;
    }
    if (hashTimer !== null) flushHash();
    // A page frozen for the back/forward cache returns with this DOM and these
    // listeners intact, so the instance has to come back with them. Clearing the
    // preview timer above is what makes the preset lock release on the way back.
    if (event.persisted) {
      updateActions();
      return;
    }
    unregister();
    instance.destroy();
  });
}
