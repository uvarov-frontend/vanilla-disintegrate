import { docsHref, type Locale } from '../i18n';

export interface DocEntry {
  readonly id: string;
  readonly data: {
    readonly title: string;
    readonly description: string;
    readonly locale: Locale;
    readonly section: 'start' | 'learn' | 'reference';
    readonly navTitle: string;
    readonly order: number;
  };
}

export function entryPath(entry: DocEntry) {
  return entry.id.split('/').slice(1).join('/');
}

export function entryHref(entry: DocEntry) {
  return docsHref(entry.data.locale, entryPath(entry));
}

export function editHref(entry: DocEntry) {
  return `https://github.com/uvarov-frontend/vanilla-disintegrate/edit/main/docs/content/${entry.id}.mdx`;
}

export function localeEntries(entries: readonly DocEntry[], locale: Locale) {
  return entries
    .filter((entry) => entry.data.locale === locale)
    .sort((left, right) => left.data.order - right.data.order);
}
