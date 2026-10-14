# Public site maintenance

The showcase is plain HTML, CSS and a classic deferred script under `docs/`, with vendored GSAP and ScrollTrigger in `docs/vendor/`. There is no build step, backend, runtime CDN, remote inference or external runtime request. Product instructions belong in the Traditional Chinese README and site, not here.

## Preview and test

Open `docs/index.html` directly in a browser. Relative assets also support GitHub Pages under `/Pixora-releases/`.

```sh
npm ci
npx playwright install chromium
npm test

# Cross-engine validation
npx playwright install firefox webkit
npx playwright test --browser=all --workers=3
```

`@playwright/test` is a development dependency. The `gsap` dependency supplies the vendored minified files; the website never imports from `node_modules`. Preserve the vendor files' LF endings when updating them.

Tests normally start a Node standard-library HTTP server per worker. This makes blocked-script tests reliable across browsers: Firefox does not reliably intercept `file://` scripts through Playwright routing. Separate tests cover direct file viewing and no-JavaScript file viewing. No server package or manual startup is needed.

To test a deployed site, set `SITE_URL` to the full public URL, including its trailing slash:

```sh
SITE_URL=https://liutouo.github.io/Pixora-releases/ npm test
```

PowerShell equivalent:

```powershell
$env:SITE_URL = 'https://liutouo.github.io/Pixora-releases/'
npm test
Remove-Item Env:SITE_URL
```

The media-provenance test always serves the local assets under `/Pixora-releases/`. Its server supports byte ranges and verifies playback, seeking, captions and published media hashes. WebKit can honor a native preference that initially disables captions; the test explicitly enables the native text track before checking cues. Ordinary screenshot links may display the image or download it, depending on the browser.

Tests cover actual motion under both OS motion preferences and live preference changes; named timeline chapters and reverse scrolling; pause persistence and storage failure; independent manual state; keyboard focus/caret preservation; rapid switching; responsive layout and 200% text; cold deep links, aliases and browser history; no-JavaScript/blocked-script/missing-API fallbacks; failed images; parallax pause/resume; and cancellation of offscreen replay. On Windows, the viewport helper compensates for WebKit applying desktop DPI scaling to requested dimensions. Overflow checks tolerate one CSS pixel of layout rounding, not content overflow.

Screenshots and traces are written into ignored test-output directories. Inspect desktop and mobile screenshots after layout changes; automated assertions do not replace visual review or real-device testing.

## Four-act “影像歸途” structure

1. **Photos first.** The headline and Windows download CTA are immediately usable, surrounded by the twelve real sample photos. There is no blocking intro, scroll lock, image trail, marquee, fake app window or generated product screenshot.
2. **One continuous journey (`#features`).** The same twelve `.photo-actor` elements reorganize into the library, demonstrate the recorded search, return to the complete library, then follow human selection, per-file preview, application and undo. “自己試一次” opens the separate manual lab.
3. **Real evidence (`#demo`).** The user-initiated 63-second v0.3.7 recording, native captions, scrollable screenshot filmstrip, lightbox and transcript remain real evidence, clearly distinguished from the re-enactment.
4. **Download (`#download`).** A concluding photo composition, Windows download link, README guide, privacy/undo notes, issue reporting and attribution. The old long guide and FAQ are not reintroduced.

The recorded search is `a photograph of a cat`, with `chelsea.png` as the leading result. Only after returning to the complete library does the operator select `astronaut.png` and `rocket.jpg`, naming the group `太空探索`. These are not cat-search results or automatically accepted classifications. Confirmation does not move files. The preview lists both source/destination paths; applying and undoing affect exactly two sample files. The demo never accesses visitor files or performs AI inference.

## Three presentation modes

### Cinema

With GSAP/ScrollTrigger, full site motion, a viewport at least 900px wide and 700px tall, and content that fits the stage, `.journey-pin` pins for approximately 5.5 viewport heights. The outer element owns pinning, `.photo-actor` owns story transforms, `.photo-field` owns small pointer parallax, and `.photo-drift` owns decorative breathing. Text and CTAs do not follow the pointer.

Both the GSAP timeline and ScrollTrigger have ID `image-journey`. Use their named labels—`hero`, `library`, `search`, `return-library`, `selection`, `preview`, `recovery`, `applied`, `undone`—for tests and navigation. Do not assume the first registered trigger is this one or divide progress into five equal segments.

Semantic chapter state, `inert`, ARIA, typed query and folder counts synchronize with actual timeline time, not only raw scroll progress. Synchronization also runs on refresh because GSAP can suppress animation callbacks while refreshing. A newly created timeline-backed trigger is explicitly refreshed before label-to-scroll routing uses its measurements.

### Readable story

Narrow/short viewports, enlarged content that no longer fits, paused site motion, or missing GSAP use native unpinned chapter flow. All five chapters remain readable. Their illustrations are independent of the live form, so changing manual selections never rewrites the recorded story. With motion enabled, CSS drift, entrance effects and scroll reveals still work without GSAP. The top mode control and bottom outro both provide entry to the manual lab.

### Manual interaction

Manual mode is explicitly selected, not forced by a breakpoint. It provides search, keyboard/mouse selection, category naming and confirmation, per-file preview, apply, undo, reset and a cancellable automatic replay. Unsupported search text is clearly identified as using the one recorded example, not new inference. Category text is rendered with `textContent`.

Selection/name changes invalidate confirmation and prevent stale plans from being applied. The form's selected files, query, name, confirmation, operation state and current step survive resizing, pause/resume and visits to cinema. Rebuilding the same manual chapter must preserve the focused input and caret. Moving to a different chapter transfers focus out of the hidden panel.

Automatic replay has one cancellable timer chain. User interaction, leaving the lab, backgrounding the document, pausing or rebuilding cancels it; an old replay must never wake up later or pull the visitor back from another section.

## Motion and lifecycle contract

**Explicit owner policy:** OS `prefers-reduced-motion` does not suppress the site's animations. The visible site control is the opt-out: **暫停動畫 / 播放動畫**, stored in `localStorage` as `pixora.site.motion = full | paused`. Missing, invalid or unavailable storage defaults to full motion; storage failures must not break the control.

Paused mode stops decorative loops, parallax, transitions and replay, releases pinning, and leaves all content and manual controls usable with immediate state updates. Resuming returns to the current chapter without replaying the opening entrance. This control does not override the user's native video playback or caption choices.

Offscreen hero decoration and background-tab work stop. Do not retain killed `gsap.quickTo` closures for parallax: rebuilding or pausing must not permanently disable pointer motion after resume. Image decoding may refresh measurements, but loading or failed images never gate initialization.

Rebuilds revert the old GSAP context, cancel outstanding effects and explicitly clear cinema-owned inline styles; Firefox can otherwise retain `fromTo` start visibility after context reversion. Preserve the actors' inline `--x`, `--y`, `--w`, `--r` composition properties. Do not clear all inline styles indiscriminately.

No JavaScript leaves ordinary readable chapters, real images, native video, captions, the transcript and download links. Interactive-only controls stay hidden. Missing WAAPI uses immediate manual state updates; missing observers reveals content immediately; missing dialog support leaves ordinary screenshot links.

## Navigation and focus

- `#features` and `#feature-library` … `#feature-recovery` select the five chapters.
- `#tour-review`, `#tour-preview`, `#tour-completed` alias confirmation, preview and recovery.
- `#tour-scope`, `#guide`, `#faq` point at the download section.
- `#demo` and `#download` remain stable public anchors.

Chapter clicks add history; passive scrolling and timed replay do not. Back/Forward resolve the fragment without discarding manual state. The router owns scroll restoration. A post-`pageshow` correction handles WebKit reload restoration only while the visitor has not already interacted.

Hidden panels and the hidden hero/lab are inert and excluded from the accessibility tree. Release inert state before focusing a destination. Cinema reset, reverse scrolling and the mobile outro must not strand focus inside a hidden control. Keep the visible focus indicator; it is not a decorative card border.

## Evidence and performance guardrails

Keep the original video low-frame-rate, silent and user-initiated, never a looping backdrop. Do not interpolate frames, alter capture facts, replace evidence with fabricated UI or describe the demo as more capable than the recorded product.

The inline caption data URL is byte-identical to `docs/assets/demo.zh-TW.vtt`; it supports direct file viewing without cross-origin track failures. Caption edits require updating both copies and the VTT byte count/hash in `docs/evidence/capture-provenance.json`, recording the editorial change under `video.caption_editing`. `.gitattributes` keeps VTT endings at LF. Keep captions about actual user actions, not benchmarks or implementation details.

Budget the uncompressed JavaScript total—including both vendor scripts—at no more than 200KB. Below-fold evidence images remain lazy; video uses `preload="none"` and must not be requested on initial load. Target LCP ≤2.5s, CLS ≤0.1 and interaction latency ≤200ms. Report throttling conditions with lab measurements; they do not establish field INP or real-device performance. Do not enlarge the sample thumbnails into full-screen backgrounds.

## GitHub Pages and release boundary

The intended Pages setting is **Deploy from a branch → main → /docs** at `https://liutouo.github.io/Pixora-releases/`. `docs/.nojekyll` keeps the site static. Changing Pages settings or publishing requires separate authorization; tests do neither.

Every download CTA points to `https://github.com/LiuTouo/Pixora-releases/releases/latest`, never a versioned installer. Screenshots and guide claims remain verified against v0.3.7 even when the latest release changes. Recheck UI labels, supported behavior and provenance together when updating them. Do not publish private source, local paths or visitor data.

Supplied screenshots and `docs/evidence/` are public evidence, not test output. Benchmark claims retain their synthetic-vector scope, environment and exclusions. Keep generated screenshots, browser traces, dependency directories and local tooling indexes out of Git.
