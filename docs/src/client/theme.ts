type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeBridge {
  readonly key: string;
  apply: (preference: ThemePreference) => void;
  stored: () => ThemePreference;
}

const STORAGE_KEY = 'vanilla-disintegrate-theme';

function bridge(): ThemeBridge | null {
  return (window as Window & { __vdTheme?: ThemeBridge }).__vdTheme ?? null;
}

function currentPreference(): ThemePreference {
  const attribute = document.documentElement.dataset.themePreference;
  if (attribute === 'light' || attribute === 'dark' || attribute === 'system') return attribute;
  return 'system';
}

/**
 * The head script already resolved and applied the theme; this only keeps the control
 * in step with it, writes the choice, and mirrors changes made in another tab.
 */
export function setupThemeSwitcher() {
  const groups = [...document.querySelectorAll<HTMLElement>('[data-theme-switcher]')];
  if (groups.length === 0) return;
  const buttons = groups.flatMap((group) => [...group.querySelectorAll<HTMLButtonElement>('[data-theme-option]')]);

  const render = (preference: ThemePreference) => {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.themeOption === preference));
    }
  };

  const select = (preference: ThemePreference, persist: boolean) => {
    bridge()?.apply(preference);
    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        // Storage may be unavailable; the choice still applies for this page view.
      }
    }
    render(preference);
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      select((button.dataset.themeOption as ThemePreference | undefined) ?? 'system', true);
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const value = event.newValue;
    if (value === null) select('system', false);
    else if (value === 'light' || value === 'dark' || value === 'system') select(value, false);
  });

  render(currentPreference());
}
