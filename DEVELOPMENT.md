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

Tests cover the four-scene scroll showcase, interruptible transitions, keyboard access, focus preservation, deep links, no-JavaScript and blocked-script reading, unavailable animation APIs, image loading, subpath hosting, viewport changes, enlarged text and live reduced-motion changes. The subpath test also verifies native video playback/seeking, captions and every media hash in the capture provenance; its local HTTP server supports byte ranges. The caption track embeds the same downloadable VTT as a data URL so direct file viewing does not trigger cross-origin track errors; update both copies together (the test checks equality). A Node standard-library HTTP server exists only inside the subpath test; no server package or separate startup is needed. Viewport screenshots are written into the ignored `test-results/` directory. Inspect desktop and mobile output after layout changes; automated overflow checks do not replace visual review.

## Showcase behavior

The four feature panels share one grid cell after successful enhancement. Hidden scenes remain measurable for stable layout but are inert and excluded from the accessibility tree. CSS hides nothing before `site.js` initializes. Without JavaScript, all four scenes remain ordinary readable sections and image links.

The desktop stage pins only at 1024px × 700px or larger, with normal motion, and only if its measured content fits below the header. Native scrolling chooses one of four equal progress intervals; a tab click or arrow key aligns instantly to the chosen interval while the scene crossfades. Scroll selection never steals focus or hides a panel containing focus. Mobile, short windows, enlarged text that does not fit, and reduced motion use manual tabs without the tall scroll section. Resize and media changes recalculate this gate. The scroll handler schedules at most one frame per event burst, uses cached geometry, and has no idle animation loop.

Feature hash links are retained. `#tour-scope` points to the compact guide; `#tour-review` to the third scene; `#tour-preview` and `#tour-completed` to the final scene. The former `#engineering` section is intentionally removed; engineering notes and evidence links live in README instead. Passive scrolling does not add browser history entries.

Keep captions focused on the actual user actions, without implementation or benchmark commentary. Caption edits require synchronizing the inline track, downloadable VTT and its `published_files` byte count/hash in `docs/evidence/capture-provenance.json`; record the editorial change under `video.caption_editing`. `.gitattributes` keeps VTT line endings at LF so Windows checkout does not invalidate their byte hashes. Do not change capture facts or original media to make the demo appear more capable. The original video is low-frame-rate and stays user-initiated, never a looping backdrop.

## GitHub Pages

The intended Pages setting is **Deploy from a branch → main → /docs** at `https://liutouo.github.io/Pixora-releases/`. No custom workflow is needed. `docs/.nojekyll` keeps this a static site. Changing Pages settings or publishing is a separate, explicitly authorized action; the test command does neither.

Keep every download CTA pointed at `https://github.com/LiuTouo/Pixora-releases/releases/latest`, never at a versioned installer asset. The guide and screenshots are verified against v0.3.7. Recheck UI labels, supported behavior and screenshot provenance together when updating them. Do not publish private source, local paths or user data.

Supplied screenshots and `docs/evidence/` are public evidence, not test output. Do not replace their contents with fabricated UI or results. Benchmark copy must retain the synthetic-vector scope, environment and exclusions. Keep generated browser artifacts, dependency directories and local tooling indexes out of Git.
