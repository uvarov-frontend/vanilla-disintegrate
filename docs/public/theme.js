/*
 * Resolves the colour theme before the first paint.
 *
 * Loaded synchronously from <head> rather than inlined: the site's CSP allows
 * script-src 'self' with no unsafe-inline, and an inline block would be refused.
 * The stored value is the user's intent ("system" included); the attribute always
 * carries the resolved theme, so the stylesheet needs one palette selector.
 */
(function () {
  var STORAGE_KEY = 'vanilla-disintegrate-theme';
  var root = document.documentElement;

  function stored() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
    } catch {
      // Private browsing and blocked storage still follow the operating-system theme.
      return 'system';
    }
  }

  var query = window.matchMedia('(prefers-color-scheme: light)');

  function apply(preference) {
    var resolved = preference === 'system' ? (query.matches ? 'light' : 'dark') : preference;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
  }

  apply(stored());

  // Only meaningful while the preference is "system"; apply() re-reads it each time.
  var onChange = function () {
    if (root.dataset.themePreference === 'system') apply('system');
  };
  if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
  else if (typeof query.addListener === 'function') query.addListener(onChange);

  window.__vdTheme = { key: STORAGE_KEY, apply: apply, stored: stored };
})();
