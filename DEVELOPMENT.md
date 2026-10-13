# Public site maintenance

The site is plain HTML, CSS and a classic deferred script under `docs/`, plus a vendored copy of GSAP and ScrollTrigger in `docs/vendor/` (installed from the `gsap` npm dependency; no CDN, no external requests at runtime). There is no build step, backend or API request beyond that. Product instructions belong in the Traditional Chinese README and site, not here.

## Preview and test

Open `docs/index.html` in a browser; local file URLs are supported. All assets use relative paths so the same site works under `/Pixora-releases/`.

```sh
npm ci
npx playwright install chromium
npm test
```

`@playwright/test` is the development dependency; `gsap` is fetched only to vendor its minified files into `docs/vendor/` (update by reinstalling and copying again). Tests open the local HTML by default. To check an already deployed site, set `SITE_URL` to its full public URL, including the trailing slash:

```sh
SITE_URL=https://liutouo.github.io/Pixora-releases/ npm test
```

PowerShell equivalent:

```powershell
$env:SITE_URL = 'https://liutouo.github.io/Pixora-releases/'
npm test
Remove-Item Env:SITE_URL
```

Tests cover the pinned scroll choreography, the interactive fallback lab, the opening intro, keyboard access, focus preservation, deep links, no-JavaScript and blocked-script reading, blocked-GSAP fallback, missing animation APIs, image loading, the hero image trail, subpath hosting, viewport changes and enlarged text. The subpath test also verifies native video playback/seeking, captions and every media hash in the capture provenance; its local HTTP server supports byte ranges. The caption track embeds the same downloadable VTT as a data URL so direct file viewing does not trigger cross-origin track errors; update both copies together (the test checks equality). A Node standard-library HTTP server exists only inside the subpath test; no server package or separate startup is needed. Viewport screenshots are written into the ignored `test-results/` directory. Inspect desktop and mobile output after layout changes; automated overflow checks do not replace visual review.

## Four-act structure

The page is four acts: hero (asymmetric split with the library window, mouse parallax, image trail and magnetic CTAs), a principles marquee band (CSS-only, one per page, duplicated copy is `aria-hidden` with an `sr-only` static list), the interactive re-enactment (`#features`), and the evidence act (`#demo`: 63-second video, real-screenshot scroll-snap strip, transcript) ending in the download CTA (`#download`). The FAQ and first-use guide sections were removed; their content lives in the README and is linked from the download act. `#guide`, `#faq` and `#tour-scope` remain as anchor aliases pointing at the download act so old links keep working.

## Interactive lab: cinema and interactive modes

The `#features` section is the five-step re-enactment of the recorded v0.3.7 operation: library, semantic search, manual selection and confirmation, per-file preview, then apply and undo. All states, counts and the recorded query (`a photograph of a cat`, cat result first, astronaut.png + rocket.jpg into 太空探索) come from `capture-provenance.json`; copy must not claim automatic classification accuracy, and the lab clearly states it never touches the visitor's files.

**Cinema mode** (viewport at least 900px wide and 700px tall with GSAP loaded): the lab frame pins and a scrubbed GSAP timeline maps scroll progress to the five scenes — cards settle, the query types itself, the cat is highlighted, the two recorded files are checked, the preview rows slide in, the cards fly into the folder and undo. Scene state is deterministic from scroll progress (transform/opacity only; measured flight offsets are function-based with `invalidateOnRefresh`), so scrolling backwards replays cleanly. The step rail doubles as ARIA tabs; clicking a rail link smooth-scrolls the stage and pushes the scene hash. `重新體驗` scrolls back to the start.

**Interactive mode** (smaller viewports, blocked GSAP, or missing animation APIs): the previous tabbed lab — manual search with FLIP reorder, card selection, confirmation driving the preview, apply/undo with flight animations, and the `自動演出` re-enactment. Mode switches rebuild on breakpoint change and restore the recorded initial state.

Without JavaScript all five scenes remain ordinary readable sections; `.no-js` CSS hides interactive-only controls. Hidden scenes stay measurable but inert and excluded from the accessibility tree once enhanced (`.lab-ready`). The owner decision on motion now distinguishes: user-driven scrub choreography stays on for every visitor (it is tied to the scrollbar), while autonomous motion — the opening intro, marquee scroll and the hero image trail — pauses for `prefers-reduced-motion` and degrades to instant states when animation APIs are missing.

The opening intro is a GSAP remount of the card-convergence: twelve CC0 sample thumbnails fly in, settle into a grid, converge into the app mark, then hand off to the hero. It runs with animation support, a visible tab and a viewport at least 420px wide; any pointer, key, wheel or `pixora:skip-intro` event finishes it instantly, and a timer caps it near 2.4s. Scroll is locked only while the overlay exists. Reveals (`[data-reveal]`) stay hidden until the intro finishes (`motion-ready`).

Feature hash links are retained. `#feature-library`…`#feature-recovery` select lab scenes 1–5 (cinema mode scrolls the pinned stage to them); `#tour-review`, `#tour-preview` and `#tour-completed` alias scenes 3–5; `#tour-scope`, `#guide` and `#faq` point at the download act. Engineering notes and evidence links live in README. Passive scrolling does not add browser history entries; step activation does.

Keep captions focused on the actual user actions, without implementation or benchmark commentary. Caption edits require synchronizing the inline track, downloadable VTT and its `published_files` byte count/hash in `docs/evidence/capture-provenance.json`; record the editorial change under `video.caption_editing`. `.gitattributes` keeps VTT line endings at LF so Windows checkout does not invalidate their byte hashes. Do not change capture facts or original media to make the demo appear more capable. The original video is low-frame-rate and stays user-initiated, never a looping backdrop.

## GitHub Pages

The intended Pages setting is **Deploy from a branch → main → /docs** at `https://liutouo.github.io/Pixora-releases/`. No custom workflow is needed. `docs/.nojekyll` keeps this a static site. Changing Pages settings or publishing is a separate, explicitly authorized action; the test command does neither.

Keep every download CTA pointed at `https://github.com/LiuTouo/Pixora-releases/releases/latest`, never at a versioned installer asset. The guide and screenshots are verified against v0.3.7. Recheck UI labels, supported behavior and screenshot provenance together when updating them. Do not publish private source, local paths or user data.

Supplied screenshots and `docs/evidence/` are public evidence, not test output. Do not replace their contents with fabricated UI or results. Benchmark copy must retain the synthetic-vector scope, environment and exclusions. Keep generated browser artifacts, dependency directories and local tooling indexes out of Git.
