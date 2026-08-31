# Vanilla Disintegrate — IIFE example

This folder contains a complete browser example with no package manager or application bundler.

Run it through a local HTTP server so the browser can load the bundled audio:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

## Files

- `index.html` — minimal remove and restore example
- `vanilla-disintegrate.iife.min.js` — library with SnapDOM included
- `sounds/` — audio used by the built-in presets

The IIFE build exposes the public API as `window.VanillaDisintegrate`.
