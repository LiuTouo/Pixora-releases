# Public site maintenance

The site is plain HTML, CSS and a classic deferred script under `docs/`. It has no runtime dependencies, build step, backend or API requests. Product instructions belong in the Traditional Chinese README and site, not here.

## Preview and test

Open `docs/index.html` in a browser; local file URLs are supported. All assets use relative paths so the same site works under `/Pixora-releases/`.

```sh
npm ci
npx playwright install chromium
npm test
```

`@playwright/test` is the only direct development dependency. Tests open the local HTML by default. To check an already deployed site, set `SITE_URL` to its full public URL, including the trailing slash:

```sh
SITE_URL=https://liutouo.github.io/Pixora-releases/ npm test
```

PowerShell equivalent:

```powershell
$env:SITE_URL = 'https://liutouo.github.io/Pixora-releases/'
npm test
Remove-Item Env:SITE_URL
```

Tests cover interaction, keyboard access, no-JavaScript reading, image loading, subpath hosting, viewport widths, enlarged text and reduced motion. The subpath test also verifies native video playback/seeking, captions and every media hash in the capture provenance; its local HTTP server supports byte ranges. The caption track embeds the same downloadable VTT as a data URL so direct file viewing does not trigger cross-origin track errors; update both copies together (the test checks equality). A Node standard-library HTTP server exists only inside the subpath test; no server package or separate startup is needed. Viewport screenshots are written into the ignored `test-results/` directory. Inspect desktop and mobile output after layout changes; automated overflow checks do not replace visual review.

## GitHub Pages

The intended Pages setting is **Deploy from a branch → main → /docs** at `https://liutouo.github.io/Pixora-releases/`. No custom workflow is needed. `docs/.nojekyll` keeps this a static site. Changing Pages settings or publishing is a separate, explicitly authorized action; the test command does neither.

Keep every download CTA pointed at `https://github.com/LiuTouo/Pixora-releases/releases/latest`, never at a versioned installer asset. The guide and screenshots are verified against v0.3.7. Recheck UI labels, supported behavior and screenshot provenance together when updating them. Do not publish private source, local paths or user data.

Supplied screenshots and `docs/evidence/` are public evidence, not test output. Do not replace their contents with fabricated UI or results. Benchmark copy must retain the synthetic-vector scope, environment and exclusions. Keep generated browser artifacts, dependency directories and local tooling indexes out of Git.
