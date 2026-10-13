const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const { createHash } = require('node:crypto');

const docs = path.resolve(__dirname, '../docs');
const site = process.env.SITE_URL || pathToFileURL(path.join(docs, 'index.html')).href;
const release = 'https://github.com/LiuTouo/Pixora-releases/releases/latest';
const sceneIds = ['library', 'search', 'smart', 'recovery'];

async function expectImagesLoaded(page) {
  const images = page.locator('main img');
  await images.evaluateAll(elements => elements.forEach(image => { image.loading = 'eager'; }));
  await expect.poll(() => images.evaluateAll(elements => elements.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectScene(page, index) {
  await expect(page.getByRole('tab').nth(index)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.locator(`#feature-${sceneIds[index]}`)).toBeVisible();
  expect(await page.locator('.feature-panel').evaluateAll(panels => panels.filter(panel => !panel.inert).length)).toBe(1);
}

async function scrollToScene(page, index) {
  await page.evaluate(index => {
    const section = document.querySelector('#features');
    const stage = document.querySelector('.showcase-stage');
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'));
    const start = section.getBoundingClientRect().top + scrollY - header - 12;
    window.scrollTo({ top: start + (index + .5) / 4 * (section.offsetHeight - stage.offsetHeight), behavior: 'instant' });
  }, index);
}

test('feature tabs support mouse, Arrow keys, wrapping, Home and End', async ({ page }) => {
  await page.goto(site);
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expectScene(page, 0);
  await tabs.nth(1).click();
  await expectScene(page, 1);
  await expect(page.locator('#feature-library')).toBeHidden();
  await tabs.nth(1).press('ArrowRight');
  await expect(tabs.nth(2)).toBeFocused();
  await expectScene(page, 2);
  await tabs.nth(2).press('End');
  await expect(tabs.nth(3)).toBeFocused();
  await tabs.nth(3).press('ArrowRight');
  await expect(tabs.nth(0)).toBeFocused();
  await tabs.nth(0).press('ArrowLeft');
  await expect(tabs.nth(3)).toBeFocused();
  await tabs.nth(3).press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await tabs.nth(0).press('Tab');
  await expect(page.locator('#feature-library')).toBeFocused();
  for (let index = 0; index < 4; index++) {
    await tabs.nth(index).click();
    await expectScene(page, index);
    await expect(tabs.nth(index)).toHaveAttribute('tabindex', '0');
  }
});

test('native scrolling drives all four scenes forward and backward without adding history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(site);
  await expect(page.locator('#features')).toHaveClass(/is-pinned/);
  const historyLength = await page.evaluate(() => history.length);
  for (const index of [0, 1, 2, 3, 2, 1, 0]) {
    await scrollToScene(page, index);
    await expectScene(page, index);
    const stage = await page.locator('.showcase-stage').boundingBox();
    const header = await page.locator('.site-header').boundingBox();
    expect(stage.y).toBeGreaterThanOrEqual(header.height);
    expect(stage.y + stage.height).toBeLessThanOrEqual(1000);
  }
  const distance = await page.locator('#features').evaluate(section => section.offsetHeight - section.querySelector('.showcase-stage').offsetHeight);
  await page.mouse.move(1000, 500);
  await page.mouse.wheel(0, distance / 4);
  await expectScene(page, 1);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(new URL(page.url()).hash).toBe('');
});

test('rapid changes cancel old layers and do not auto-rotate on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(site);
  await page.locator('.tab-links').evaluate(list => {
    const tabs = list.querySelectorAll('a');
    for (const index of [3, 0, 2, 1, 3, 2]) tabs[index].click();
  });
  await expectScene(page, 2);
  await expect(page.locator('.is-leaving')).toHaveCount(0);
  await expect.poll(() => page.locator('.feature-panels').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  const active = await page.getByRole('tab').nth(2).boundingBox();
  const indicator = await page.locator('.tab-indicator').boundingBox();
  expect(Math.abs(indicator.x - active.x)).toBeLessThan(1);
  expect(Math.abs(indicator.y - (active.y + active.height - 2))).toBeLessThan(1);
  await page.waitForTimeout(1200);
  await expectScene(page, 2);
  await expect(page.locator('#features')).not.toHaveClass(/is-pinned/);
});

test('scroll never hides the panel containing keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(site);
  await page.getByRole('tab').first().click();
  await page.getByRole('tab').first().press('Tab');
  await expect(page.locator('#feature-library')).toBeFocused();
  await scrollToScene(page, 2);
  await page.waitForTimeout(150);
  await expectScene(page, 0);
  await expect(page.locator('#feature-library')).toBeFocused();
  await page.getByRole('tab').first().evaluate(tab => tab.focus({ preventScroll: true }));
  await expectScene(page, 2);
});

test('resize, short windows and live reduced motion retain selection without empty scroll space', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(site);
  await page.getByRole('tab').nth(2).click();
  await expect(page.locator('#features')).toHaveClass(/is-pinned/);
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 600 }, { width: 1280, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expectScene(page, 2);
    await expectNoOverflow(page);
    if (viewport.height === 1000) await expect(page.locator('#features')).toHaveClass(/is-pinned/);
    else {
      await expect(page.locator('#features')).not.toHaveClass(/is-pinned/);
      expect((await page.locator('#features').boundingBox()).height).toBeLessThan(1600);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#features')).not.toHaveClass(/is-pinned/);
  await expectScene(page, 2);
  await page.getByRole('tab').nth(3).click();
  await expectScene(page, 3);
  expect(await page.locator('.feature-panels').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#features')).toHaveClass(/is-pinned/);
  await expectScene(page, 3);
});

test('lightbox closes by button and Escape and restores focus, including text image link', async ({ page }) => {
  await page.goto(site);
  const opener = page.locator('.hero-shot [data-lightbox]');
  const dialog = page.getByRole('dialog');
  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toHaveAttribute('src', /library\.webp$/);
  await expect(page.getByRole('button', { name: '關閉' })).toBeFocused();
  await page.getByRole('button', { name: '關閉' }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.press('Enter');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await page.getByRole('tab').nth(3).click();
  const undo = page.getByRole('link', { name: '查看復原畫面' });
  await undo.click();
  await expect(dialog.locator('img')).toHaveAttribute('src', /undo\.webp$/);
  await expect(dialog.locator('img')).toHaveAttribute('alt', /2 個檔案已還原/);
  await page.keyboard.press('Escape');
  await expect(undo).toBeFocused();
});

test('FAQ, downloads, metadata and user-facing content are correct', async ({ page }) => {
  await page.goto(site);
  const summary = page.locator('#faq summary').first();
  const details = page.locator('#faq details').first();
  await summary.click();
  await expect(details).toHaveAttribute('open', '');
  await summary.press('Enter');
  await expect(details).not.toHaveAttribute('open');
  const downloads = page.getByRole('link', { name: '下載 Windows 版' });
  await expect(downloads).toHaveCount(2);
  for (const link of await downloads.all()) await expect(link).toHaveAttribute('href', release);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://liutouo.github.io/Pixora-releases/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/Pixora-releases\/assets\/pixora-cover\.webp$/);
  await expect(page.locator('#engineering, .sources, .tour-controls')).toHaveCount(0);
  await expect(page.locator('.site-header')).not.toContainText('GitHub');
  await expect(page.locator('.site-footer a').filter({ hasText: 'GitHub' })).toHaveAttribute('href', 'https://github.com/LiuTouo/Pixora-releases');
  await expect(page.getByRole('link', { name: '素材來源' })).toHaveAttribute('href', /#素材來源$/);
  const text = await page.locator('main').textContent();
  expect(text).not.toMatch(/benchmark|SHA-256|CLIP|ONNX|USearch|HNSW|SQLite|HDBSCAN|CDP|production|工程設計|隔離測試|百萬/);
  for (const term of ['英文', '背景分析佇列', '不包含原始圖片', '本次工作階段', '回收筒', '不要停用安全保護']) expect(text).toContain(term);
  const captions = await fs.readFile(path.join(docs, 'assets/demo.zh-TW.vtt'), 'utf8');
  expect(captions).not.toMatch(/benchmark|SHA-256|CLIP|ONNX|測試|雜湊/);
  expect(captions).toContain('人工選取');
  const anchors = await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.getAttribute('href')).filter(href => href !== '#'));
  for (const anchor of anchors) await expect(page.locator(anchor)).toHaveCount(1);
});

test('without JavaScript all scenes remain readable with real image and download links', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  try {
    await page.goto(site);
    for (const panel of await page.locator('.feature-panel').all()) await expect(panel).toBeVisible();
    await expect(page.locator('#features')).not.toHaveClass(/is-pinned/);
    await expect(page.locator('#demo video')).toHaveAttribute('controls', '');
    await expect(page.getByRole('link', { name: '開啟 MP4 影片' })).toHaveAttribute('href', 'assets/demo.mp4');
    await expect(page.locator('.demo-transcript summary')).toBeVisible();
    for (const link of await page.getByRole('link', { name: '下載 Windows 版' }).all()) await expect(link).toHaveAttribute('href', release);
    await page.locator('a[href="#feature-search"]').click();
    await expect(page.locator('#feature-search')).toBeInViewport();
    await page.locator('#faq summary').first().click();
    await expect(page.locator('#faq details').first()).toHaveAttribute('open', '');
    await expectImagesLoaded(page);
    await expectNoOverflow(page);
    await page.locator('.hero-shot .image-link').click();
    await expect(page).toHaveURL(/library\.webp$/);
  } finally { await context.close(); }
});

test('blocked site script leaves the page visible and fully readable', async ({ page }) => {
  await page.route('**/site.js', route => route.abort());
  await page.goto(site);
  await expect(page.locator('.tabs-ready')).toHaveCount(0);
  for (const panel of await page.locator('.feature-panel').all()) await expect(panel).toBeVisible();
  expect(await page.locator('[data-reveal]').evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1'))).toBe(true);
  await expect(page.getByRole('link', { name: '下載 Windows 版' }).first()).toHaveAttribute('href', release);
});

test('missing animation, observer and dialog APIs retain ordinary controls', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Element.prototype.animate = undefined;
    window.IntersectionObserver = undefined;
    window.ResizeObserver = undefined;
    HTMLDialogElement.prototype.showModal = undefined;
  });
  await page.goto(site);
  for (let index = 0; index < 4; index++) {
    await page.getByRole('tab').nth(index).click();
    await expectScene(page, index);
  }
  expect(await page.locator('[data-reveal]').evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1'))).toBe(true);
  expect(errors).toEqual([]);
  await page.locator('.hero-shot .image-link').click();
  await expect(page).toHaveURL(/library\.webp$/);
});

for (const width of [375, 768, 1280, 1920]) {
  test(`layout, images, controls and runtime at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    const failedRequests = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failedRequests.push(request.url()));
    page.on('request', request => requests.push(request.url()));
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    await page.goto(site);
    await expectImagesLoaded(page);
    await expectNoOverflow(page);
    for (let index = 0; index < 4; index++) {
      const tab = page.getByRole('tab').nth(index);
      await tab.click();
      await expectScene(page, index);
      await expectNoOverflow(page);
      expect((await tab.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    for (const summary of await page.locator('summary').all()) await summary.click();
    await expectNoOverflow(page);
    await page.getByRole('tab').first().click();
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach(element => { element.style.transition = 'none'; element.classList.add('revealed'); }));
    await expect(page.locator('.is-leaving')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`showcase-${width}.png`) });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath(`site-${width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`hero-${width}.png`) });
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(requests.every(url => url.startsWith(new URL('.', site).href) || url.startsWith('data:'))).toBe(true);
  });
}

test('200% text and reduced motion retain layout, FAQ, lightbox and interaction', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(site);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (let index = 0; index < 4; index++) {
      await page.getByRole('tab').nth(index).click();
      await expectScene(page, index);
      await expectNoOverflow(page);
    }
    await expect(page.locator('#features')).not.toHaveClass(/is-pinned/);
  }
  expect(await page.locator('.button').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.locator('.hero-shot .image-link').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoOverflow(page);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 1000 });
  for (const summary of await page.locator('summary').all()) await summary.click();
  await expectNoOverflow(page);
  await page.locator('#faq').screenshot({ path: testInfo.outputPath('faq-375-text200.png') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(page.locator('#features')).not.toHaveClass(/is-pinned/);
});

test('feature and legacy deep links, malformed hashes and browser history work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}#feature-search`);
  await expectScene(page, 1);
  await page.getByRole('tab').nth(2).click();
  await page.goBack();
  await expectScene(page, 1);
  await page.goForward();
  await expectScene(page, 2);
  for (const [id, index] of [['tour-review', 2], ['tour-preview', 3], ['tour-completed', 3]]) {
    await page.evaluate(id => { location.hash = id; }, id);
    await expectScene(page, index);
    await expect(page.locator(`#feature-${sceneIds[index]}`)).toBeInViewport();
  }
  await page.evaluate(() => { location.hash = 'tour-scope'; });
  await expect(page.locator('#guide')).toBeInViewport();
  for (const hash of ['#%E0%A4%A', '#[', '#not-a-section']) await page.evaluate(hash => { location.hash = hash; }, hash);
  expect(errors).toEqual([]);
});

test('mobile Back restores the initial fragmentless scene without rewriting section links', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(site);
  await expectScene(page, 0);
  await page.getByRole('tab').nth(1).click();
  await expectScene(page, 1);
  await page.goBack();
  expect(new URL(page.url()).hash).toBe('');
  await expectScene(page, 0);
  await page.goForward();
  await expectScene(page, 1);
  await page.locator('.site-header a[href="#guide"]').click();
  await expect(page.locator('#guide')).toBeInViewport();
  await expectScene(page, 1);
  expect(new URL(page.url()).hash).toBe('#guide');
});

test('scroll reveals settle visible for every motion preference', async ({ page }) => {
  await page.goto(site);
  const reveals = page.locator('[data-reveal]');
  expect(await reveals.count()).toBeGreaterThan(10);
  await page.evaluate(async () => {
    for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  });
  await expect.poll(() => reveals.evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1'))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(site);
  await expect.poll(() => reveals.evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1'))).toBe(true);
});

test('relative assets and evidence work under /Pixora-releases/ HTTP subpath', async ({ page }) => {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.vtt': 'text/vtt' };
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const relative = pathname.slice('/Pixora-releases/'.length) || 'index.html';
    const file = path.resolve(docs, relative);
    if (!pathname.startsWith('/Pixora-releases/') || !file.startsWith(`${docs}${path.sep}`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const content = await fs.readFile(file);
      const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      if (request.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        const start = match ? Number(match[1]) : NaN;
        const end = match?.[2] ? Math.min(Number(match[2]), content.length - 1) : content.length - 1;
        if (!Number.isSafeInteger(start) || start > end || start >= content.length) {
          response.writeHead(416, { 'Content-Range': `bytes */${content.length}` }).end();
          return;
        }
        response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${content.length}`, 'Content-Length': end - start + 1 }).end(content.subarray(start, end + 1));
        return;
      }
      response.writeHead(200, { ...headers, 'Content-Length': content.length }).end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${server.address().port}/Pixora-releases/`;
  const badResponses = [];
  page.on('response', response => { if (response.status() >= 400) badResponses.push(response.url()); });
  try {
    await page.goto(root);
    await expect(page.getByRole('tab')).toHaveCount(4);
    await expectImagesLoaded(page);
    expect(await page.locator('body').evaluate(element => getComputedStyle(element).color)).toBe('rgb(237, 243, 249)');
    const evidence = await page.request.get(new URL('evidence/benchmark-1000000.json', root).href);
    expect(evidence.ok()).toBe(true);
    expect((await evidence.json()).count).toBe(1000000);
    const provenance = await (await page.request.get(new URL('evidence/capture-provenance.json', root).href)).json();
    expect(provenance.app_version).toBe('0.3.7');
    expect(provenance.sample_count).toBe(12);
    expect(provenance.distinct_visuals).toBe(12);
    expect(new Set(provenance.sample_sources.map(sample => sample.sha256)).size).toBe(12);
    expect(provenance.smart_exceptions_before_review).toBe(12);
    expect(provenance.smart_confirmed).toBe(2);
    expect(provenance.file_verification).toHaveLength(2);
    expect(provenance.file_verification.every(file => file.moved && file.restored && /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(provenance.all_12_original_hashes_restored).toBe(true);
    expect(provenance.video.caption_editing).toContain('unchanged');
    for (const asset of provenance.published_files) {
      const response = await page.request.get(new URL(`assets/${asset.file}`, root).href);
      expect(response.ok(), asset.file).toBe(true);
      const bytes = await response.body();
      expect(bytes.length, asset.file).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), asset.file).toBe(asset.sha256);
    }
    const partial = await page.request.get(new URL('assets/demo.mp4', root).href, { headers: { Range: 'bytes=0-31' } });
    expect(partial.status()).toBe(206);
    expect((await partial.body()).length).toBe(32);
    expect(partial.headers()['content-range']).toMatch(/^bytes 0-31\/\d+$/);
    const invalidRange = await page.request.get(new URL('assets/demo.mp4', root).href, { headers: { Range: 'bytes=999999999999-' } });
    expect(invalidRange.status()).toBe(416);
    const video = page.locator('#demo video');
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('playsinline', '');
    await expect(video).not.toHaveAttribute('autoplay');
    await expect(video.locator('track')).toHaveAttribute('srclang', 'zh-TW');
    await expect(video.locator('track')).toHaveAttribute('default', '');
    const inlineTrack = await video.locator('track').getAttribute('src');
    expect(inlineTrack).toMatch(/^data:text\/vtt;base64,/);
    const downloadableTrack = await page.request.get(new URL('assets/demo.zh-TW.vtt', root).href);
    expect(Buffer.from(inlineTrack.split(',')[1], 'base64').toString('utf8')).toBe(await downloadableTrack.text());
    await video.evaluate(element => element.play());
    await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
    await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2);
    expect(await video.evaluate(element => element.duration)).toBeCloseTo(63, 1);
    await expect.poll(() => video.evaluate(element => element.textTracks[0]?.cues?.length)).toBe(9);
    expect(await video.evaluate(element => element.textTracks[0].mode)).toBe('showing');
    expect(await video.evaluate(element => element.textTracks[0].cues[4].text)).toContain('人工選取');
    await video.evaluate(async element => {
      element.pause();
      await new Promise(resolve => {
        element.addEventListener('seeked', resolve, { once: true });
        element.currentTime = 27;
      });
    });
    expect(await video.evaluate(element => element.currentTime)).toBeCloseTo(27, 1);
    expect(await video.evaluate(element => element.error)).toBeNull();
    await expect.poll(() => video.evaluate(element => element.textTracks[0].activeCues?.[0]?.text)).toContain('人工選取');
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await video.scrollIntoViewIfNeeded();
      const before = await video.evaluate(element => element.currentTime);
      await video.evaluate(element => element.play());
      await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(before + .1);
      await video.evaluate(element => element.pause());
      await expectNoOverflow(page);
      expect((await video.boundingBox()).width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: test.info().outputPath(`demo-${width}.png`) });
    }
    expect(badResponses).toEqual([]);
  } finally {
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});
