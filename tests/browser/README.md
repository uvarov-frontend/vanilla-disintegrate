# Browser checks

Run `pnpm test:browser` for the full suite or `pnpm test:visual` for snapshot fidelity checks. Install browsers first with `pnpm exec playwright install chromium firefox webkit`.

`capture-fixtures.html` is a standalone specimen page. Open it through the fixture server:

```sh
pnpm exec vite --config vite.browser.config.ts --host 127.0.0.1 --port 4174
# http://127.0.0.1:4174/tests/browser/capture-fixtures.html
```

The fidelity suite covers text without controls, buttons and links, a promotional grid banner, a calendar with pseudo-element arrows, current form values, captioned and fixed-height tables, raster images, SVG, canvas, opacity, clipping, scrolling, transforms, and open shadow DOM with a slot. It runs in Chromium, Firefox, WebKit, mobile Chromium, and mobile WebKit, with light/DPR 1 and dark/DPR 2 variants.

Each operation's reference is a fresh screenshot of the live DOM from that same browser. The actual image is the canvas delivered to an effect by the public `Disintegrator` removal or restoration lifecycle. There are no checked-in golden snapshots to regenerate after a renderer upgrade. Root bounds are aligned to physical pixels, and transparency is composited over the same contrasting page background.

The comparison checks dimensions, ignores antialiasing, and allows matching colors within one CSS pixel in both directions to accommodate glyph and collapsed-border rasterization. Remaining differences are limited over the complete image and in every 16×16 CSS-pixel region. The local check prevents a missing icon from passing because most of a large card is unchanged.

Native checkbox/radio appearance is deliberately checked separately: Firefox uses SnapDOM's drawn replacements, and WebKit SVG images may use a monochrome control theme. At the original positions, the center pixels must contain the checked mark/dot, or be empty for an unchecked control, and the control itself must remain visible. This classifier is verified against the live screenshot as well. Only these two small native-control regions are excluded from shape/color comparison after their presence and state checks pass; labels, field values, select and textarea remain in the visual comparison. Both checked and unchecked states are exercised.

Negative controls deliberately stretch the banner, displace arrows, remove an image and a field value, clear selected controls, and hide unchecked controls. All must fail the comparison, while identical screenshots must pass. Review actual rendering differences before changing comparison tolerances.

Visual tests have no retries, including in CI. They are part of `test:browser`, `check`, `prepublishOnly`, and the release verification job. A failure prevents publication. CI, release, and deployment checks preserve `test-results/` for seven days; each failing trace contains the live image, captured image, and highlighted difference. Inspect with `pnpm exec playwright show-trace <trace.zip>`.

To add coverage, add a specimen with a unique `data-case` to the HTML page and its name to `capture-visual.spec.ts`. Prefer local, deterministic assets and wait for fonts and images to load. Keep the targeted geometry, invalidation, cancellation, and resource-lifecycle tests in `browser.spec.ts`: visual comparison complements those assertions.

This suite does not prove correctness for every DOM/CSS combination, cross-origin resource policy, closed shadow root, or real Safari/iOS release. WebKit automation is useful coverage but is not a substitute for checking reported problems in the affected browser.
