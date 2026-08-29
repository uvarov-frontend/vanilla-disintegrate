import bundleSize from '../generated/bundle-size.json';
import type { Locale } from '../i18n';

export const bundleVariants = [
  { id: 'esm', label: 'ESM core', size: bundleSize.esm },
  { id: 'esmWithSnapdom', label: 'ESM + SnapDOM', size: bundleSize.esmWithSnapdom },
  { id: 'iife', label: 'IIFE', size: bundleSize.iife },
] as const;

export function formatBundleSize(bytes: number, locale: Locale) {
  const kibibytes = bytes / 1024;
  const value = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(kibibytes);

  return `${value} KiB`;
}
