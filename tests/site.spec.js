const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const { createHash } = require('node:crypto');

const docs = path.resolve(__dirname, '../docs');
const fileSite = pathToFileURL(path.join(docs, 'index.html')).href;
let site = process.env.SITE_URL;
let previewServer;
test.beforeAll(async () => {
  if (!site) { previewServer = await serveDocs(); site = previewServer.url; }
});
test.afterAll(async () => { await previewServer?.close(); });
const release = 'https://github.com/LiuTouo/Pixora-releases/releases/latest';
const stepIds = ['library', 'search', 'smart', 'preview', 'recovery'];
const chapters = ['library', 'search', 'selection', 'preview', 'recovery'];
const query = 'a photograph of a cat';

async function expectImagesLoaded(page) {
  const images = page.locator('main img');
  await images.evaluateAll(elements => elements.forEach(image => { image.loading = 'eager'; }));
  await expect.poll(() => images.evaluateAll(elements => elements.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
}
async function setViewport(page, viewport) {
  await page.setViewportSize(viewport);
  const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  // Windows WebKit applies desktop DPI scaling to Playwright's requested viewport.
  if (Math.abs(actual.width - viewport.width) > 2 || Math.abs(actual.height - viewport.height) > 2) {
    await page.setViewportSize({ width: Math.ceil(viewport.width ** 2 / actual.width), height: Math.ceil(viewport.height ** 2 / actual.height) });
  }
}
async function expectNoOverflow(page) {
  // Layout viewport rounding can differ by one CSS pixel on fractional-DPI WebKit.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
async function openOrdinaryScreenshot(page) {
  const [opened] = await Promise.all([
    Promise.any([
      page.waitForURL(/library\.webp$/).then(() => 'navigation'),
      page.waitForEvent('download').then(download => download.suggestedFilename()),
    ]),
    page.locator('.evidence-strip a').first().click(),
  ]);
  expect(opened).toMatch(/^(navigation|library\.webp)$/);
}
async function expectStep(page, index) {
  await expect(page.locator('.lab-steps a').nth(index)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#feature-${stepIds[index]}`)).toBeVisible();
  expect(await page.locator('.lab-panel').evaluateAll(panels => panels.filter(panel => !panel.inert).length)).toBe(1);
}
async function cinemaPage(page, hash = '') {
  await setViewport(page, { width: 1280, height: 900 });
  await page.goto(`${site}${hash}`);
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'cinema');
}
async function scrollChapter(page, label) {
  await page.evaluate(label => {
    const trigger = ScrollTrigger.getById('image-journey');
    const timeline = gsap.getById('image-journey');
    window.scrollTo({ top: trigger.start + (trigger.end - trigger.start) * timeline.labels[label] / timeline.duration(), behavior: 'instant' });
  }, label);
  await expect.poll(() => page.evaluate(label => Math.abs(gsap.getById('image-journey').time() - gsap.getById('image-journey').labels[label]), label)).toBeLessThan(.015);
}
async function interactivePage(page, { blockGsap = false } = {}) {
  if (blockGsap) await page.route('**/vendor/gsap.min.js', route => route.abort());
  await page.goto(`${site}#feature-library`);
  await page.locator('[data-view-toggle]').click();
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'interactive');
}

for (const preference of ['reduce', 'no-preference']) {
  for (const width of [390, 1366]) {
    test(`real animation remains enabled with OS ${preference} at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: preference });
      await setViewport(page, { width, height: width === 390 ? 844 : 768 });
      await page.goto(site);
      await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
      await expect(page.locator('.intro, .trail-img, .marquee')).toHaveCount(0);
      const drift = page.locator('.photo-drift').first();
      await expect.poll(() => drift.evaluate(element => getComputedStyle(element).animationName)).toBe('photo-breathe');
      const before = await drift.evaluate(element => getComputedStyle(element).transform);
      await page.waitForTimeout(180);
      expect(await drift.evaluate(element => getComputedStyle(element).transform)).not.toBe(before);
      const headline = await page.locator('h1').boundingBox();
      const cta = await page.locator('.hero .primary').boundingBox();
      expect(headline.y).toBeGreaterThanOrEqual(64);
      expect(cta.y + cta.height).toBeLessThanOrEqual(width === 390 ? 844 : 768);
      await page.emulateMedia({ reducedMotion: preference === 'reduce' ? 'no-preference' : 'reduce' });
      await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
      expect(await drift.evaluate(element => getComputedStyle(element).animationPlayState)).toBe('running');
      if (width > 900) {
        await scrollChapter(page, 'search');
        await expectStep(page, 1);
        await expect(page.locator('[data-story-query]')).toHaveText(query);
      } else {
        await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'story');
        const illustration = page.locator('#feature-smart .story-illustration');
        await illustration.scrollIntoViewIfNeeded();
        await expect(illustration).toHaveClass(/revealed/);
        expect(await illustration.evaluate(element => getComputedStyle(element).transitionDuration)).not.toBe('0s');
      }
      await expectNoOverflow(page);
    });
  }
}

test('the same twelve actors traverse named chapters, apply and undo reversibly', async ({ page }) => {
  await cinemaPage(page);
  await page.evaluate(() => { window.originalActors = [...document.querySelectorAll('.photo-actor')]; });
  const startHistory = await page.evaluate(() => history.length);
  for (const [index, label] of chapters.entries()) {
    await scrollChapter(page, label);
    await expectStep(page, index);
    await expectNoOverflow(page);
  }
  await scrollChapter(page, 'applied');
  await expect(page.locator('[data-story-count]')).toHaveText('2');
  await scrollChapter(page, 'undone');
  await expect(page.locator('[data-story-count]')).toHaveText('0');
  await expect(page.locator('[data-story-undo]')).toBeVisible();
  await scrollChapter(page, 'return-library');
  expect(await page.locator('.photo-actor').evaluateAll(actors => actors.every(actor => Number(getComputedStyle(actor).opacity) > .99))).toBe(true);
  await scrollChapter(page, 'library');
  await expectStep(page, 0);
  expect(await page.evaluate(() => [...document.querySelectorAll('.photo-actor')].every((actor, index) => actor === window.originalActors[index]))).toBe(true);
  expect(await page.evaluate(() => history.length)).toBe(startHistory);
  expect(new URL(page.url()).hash).toBe('');
  await scrollChapter(page, 'hero');
  await expect(page.locator('.hero .primary')).toBeVisible();
  expect(await page.locator('.hero').evaluate(element => element.inert)).toBe(false);
});

test('cold deep links and image refresh synchronize visual progress, query and inert state', async ({ page }) => {
  await cinemaPage(page, '#feature-smart');
  await expectStep(page, 2);
  await page.evaluate(() => ScrollTrigger.getById('image-journey').refresh());
  await expectStep(page, 2);
  expect(await page.locator('#features').evaluate(element => element.inert)).toBe(false);
  await page.locator('[data-view-toggle]').click();
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'interactive');
  await page.goto(`${site}#feature-search`);
  await page.reload();
  await expectStep(page, 1);
  await page.evaluate(() => ScrollTrigger.getById('image-journey').refresh());
  await expect(page.locator('[data-story-query]')).toHaveText(query);
});

test('cinema rail and keyboard navigate labels; skip download moves focus', async ({ page }) => {
  await cinemaPage(page);
  await page.locator('.hero .actions a[href="#features"]').click();
  await expectStep(page, 0);
  await page.locator('.lab-steps a').nth(1).click();
  await expectStep(page, 1);
  await expect(page.locator('[data-story-query]')).toHaveText(query);
  await page.locator('.lab-steps a').nth(1).press('ArrowRight');
  await expectStep(page, 2);
  await expect(page.locator('.lab-steps a').nth(2)).toBeFocused();
  await page.locator('[data-skip-story]').click();
  await expect(page.locator('#download-title')).toBeFocused();
  await expect(page.locator('#download')).toBeInViewport();
});

test('pause removes the pin, persists, stops motion and resumes at the current chapter', async ({ page }) => {
  await cinemaPage(page);
  await scrollChapter(page, 'selection');
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'story');
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  for (const panel of await page.locator('.lab-panel').all()) await expect(panel).toBeVisible();
  expect(await page.locator('.lab-panel').evaluateAll(panels => panels.every(panel => !panel.inert))).toBe(true);
  expect(await page.locator('.photo-drift').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await expect(page.locator('#feature-smart')).toBeInViewport();
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'cinema');
  await expectStep(page, 2);
  await page.locator('[data-motion-toggle]').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
});

test('storage failure does not prevent motion control or manual interaction', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('disabled storage'); };
    Storage.prototype.setItem = () => { throw new Error('disabled storage'); };
  });
  await interactivePage(page);
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await page.getByRole('tab').nth(4).click();
  await page.locator('[data-apply-btn]').click();
  await expect(page.locator('[data-count]')).toHaveText('2');
  await page.locator('[data-undo-btn]').click();
  await expect(page.locator('[data-count]')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('full manual flow preserves recorded search, human choice, per-file preview and undo', async ({ page }) => {
  await interactivePage(page);
  await page.getByRole('tab').nth(1).click();
  await page.locator('#lab-query').fill(query);
  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  await expect(page.locator('#feature-search .lab-board .lab-card').first()).toHaveAttribute('data-file', 'chelsea.png');
  await expect(page.locator('#feature-search .lab-board .is-hit')).toHaveCount(1);
  await page.getByRole('button', { name: '選取圖片，建立分類' }).click();
  const horse = page.locator('#feature-smart [data-file="horse.png"]');
  await horse.click();
  await expect(horse).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-counter]')).toHaveText('已選 3 張');
  await horse.press(' ');
  await expect(page.locator('[data-counter]')).toHaveText('已選 2 張');
  await page.locator('#lab-name').fill('太空探索');
  await page.locator('.lab-accept').click();
  await expectStep(page, 3);
  await expect(page.locator('[data-notice]')).toContainText('此刻檔案都還在原處');
  await expect(page.locator('[data-plan] li')).toHaveCount(2);
  await expect(page.locator('[data-plan] li').first()).toContainText('太空探索/astronaut.png');
  await expect(page.locator('[data-summary]')).toContainText('將搬移 2 張');
  await page.locator('[data-goto="4"]').click();
  await expect(page.locator('[data-fly] .lab-card')).toHaveCount(2);
  await page.locator('[data-apply-btn]').click();
  await expect(page.locator('[data-count]')).toHaveText('2');
  await expect(page.locator('[data-apply-btn]')).toBeDisabled();
  await page.locator('[data-undo-btn]').click();
  await expect(page.locator('[data-count]')).toHaveText('0');
  await expect(page.locator('[data-record]')).toContainText('2 個檔案回到原位置');
  await expect.poll(() => page.locator('[data-fly] .lab-card').evaluateAll(cards => cards.every(card => getComputedStyle(card).visibility === 'visible' && !card.getAnimations().length))).toBe(true);
});

test('empty input, unsupported queries, name changes and empty selection cannot apply stale plans', async ({ page }) => {
  await interactivePage(page);
  await page.getByRole('tab').nth(1).click();
  await page.locator('.lab-run').click();
  await expect(page.locator('#lab-query')).toBeFocused();
  await expect(page.locator('[data-notice]')).toContainText('先輸入英文描述');
  await page.locator('#lab-query').fill('a mountain');
  await page.locator('.lab-run').click();
  await expect(page.locator('[data-notice]')).toContainText('並未對你輸入的文字執行搜尋');
  await page.getByRole('tab').nth(2).click();
  await page.locator('#lab-name').fill('');
  await expect(page.locator('.lab-accept')).toBeDisabled();
  await page.locator('#lab-name').fill('<img src=x>');
  await page.locator('.lab-accept').click();
  await expect(page.locator('[data-plan] img')).toHaveCount(0);
  await expect(page.locator('[data-plan] li').first()).toContainText('<img src=x>/astronaut.png');
  await page.getByRole('tab').nth(2).click();
  await page.locator('#feature-smart [data-file="astronaut.png"]').click();
  await page.locator('#feature-smart [data-file="rocket.jpg"]').click();
  await expect(page.locator('.lab-accept')).toBeDisabled();
  await page.getByRole('tab').nth(4).click();
  await expect(page.locator('[data-apply-btn]')).toBeDisabled();
});

test('manual state survives chapter changes, pause, cinema and repeated responsive rebuilds', async ({ page }) => {
  await interactivePage(page);
  await page.getByRole('tab').nth(1).click();
  await page.locator('#lab-query').fill(query);
  await page.locator('.lab-run').click();
  await page.getByRole('tab').nth(2).click();
  await page.locator('#feature-smart [data-file="coffee.png"]').click();
  await page.locator('#lab-name').fill('我的選取');
  await page.locator('.lab-accept').click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 620 }, { width: 1440, height: 900 }]) {
    await setViewport(page, viewport);
    await expectStep(page, 3);
    await expect(page.locator('[data-plan] li')).toHaveCount(3);
    await expectNoOverflow(page);
  }
  await page.locator('[data-motion-toggle]').click();
  await expectStep(page, 3);
  await page.locator('[data-motion-toggle]').click();
  await page.locator('[data-view-toggle]').click();
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'cinema');
  await scrollChapter(page, 'search');
  await page.locator('[data-view-toggle]').click();
  await expectStep(page, 3);
  await expect(page.locator('[data-plan] li')).toHaveCount(3);
  await expect(page.locator('#lab-name')).toHaveValue('我的選取');
  await expect(page.locator('#lab-query')).toHaveValue(query);
  await page.getByRole('tab').nth(2).click();
  await page.locator('#feature-smart [data-file="coffee.png"]').click();
  await expect(page.locator('[data-counter]')).toHaveText('已選 2 張');
});

test('keyboard rail wraps and rapid changes leave one active panel and no stale effects', async ({ page }) => {
  await interactivePage(page);
  const tabs = page.getByRole('tab');
  await tabs.nth(0).press('ArrowLeft');
  await expectStep(page, 4);
  await tabs.nth(4).press('ArrowRight');
  await expectStep(page, 0);
  await tabs.nth(0).press('End');
  await expect(tabs.nth(4)).toBeFocused();
  await tabs.nth(4).press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await tabs.nth(0).press('Tab');
  await expect(page.locator('#feature-library')).toBeFocused();
  await page.evaluate(() => { for (const i of [4, 0, 3, 1, 4, 2]) document.querySelectorAll('.lab-steps a')[i].click(); });
  await expectStep(page, 2);
  await expect(page.locator('.is-leaving')).toHaveCount(0);
  await expect.poll(() => page.locator('.lab-panels').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await expect.poll(async () => {
    const tab = await tabs.nth(2).boundingBox(), indicator = await page.locator('.step-indicator').boundingBox();
    return Math.max(Math.abs(indicator.x - tab.x), Math.abs(indicator.width - tab.width));
  }).toBeLessThan(1);
});

test('automatic demonstration completes and cancelling prevents delayed restarts', async ({ page }) => {
  await interactivePage(page);
  await page.locator('[data-auto]').click();
  await expect(page.locator('[data-notice]')).toContainText('自動演出開始');
  await expect(page.locator('[data-record]')).toBeVisible({ timeout: 16000 });
  await expect(page.locator('[data-record]')).toContainText('2 個檔案');
  await expect(page.locator('[data-notice]')).toContainText('換你試試');
  await page.locator('[data-auto]').click();
  await page.locator('[data-reset]').click();
  await page.locator('[data-auto]').click();
  await page.locator('[data-motion-toggle]').click();
  await page.waitForTimeout(900);
  await expectStep(page, 0);
  await expect(page.locator('[data-auto]')).toHaveText('自動演出');
  await expect(page.locator('#lab-query')).toHaveValue('');
});

test('short viewports and oversized text release pinning without losing content', async ({ page }) => {
  await cinemaPage(page, '#feature-smart');
  await setViewport(page, { width: 1280, height: 620 });
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'story');
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await setViewport(page, { width: 1280, height: 900 });
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'cinema');
  await page.addStyleTag({ content: ':root { font-size: 400%; }' });
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'story');
  for (const panel of await page.locator('.lab-panel').all()) await expect(panel).toBeVisible();
});

for (const width of [375, 430, 768, 1280, 1920]) {
  test(`layout, local assets and manual controls at ${width}px, including 200% text`, async ({ page }, testInfo) => {
    const errors = [], failed = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('request', request => requests.push(request.url()));
    await setViewport(page, { width, height: width < 500 ? 844 : 1000 });
    await interactivePage(page);
    await expectImagesLoaded(page);
    for (const enlarged of [false, true]) {
      if (enlarged) await page.addStyleTag({ content: ':root { font-size: 200%; }' });
      for (let index = 0; index < 5; index++) {
        await page.getByRole('tab').nth(index).click();
        await expectStep(page, index);
        await expectNoOverflow(page);
        expect((await page.getByRole('tab').nth(index).boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: testInfo.outputPath(`manual-${width}.png`) });
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
    expect(requests.filter(url => !url.startsWith(new URL('.', site).href) && !/^(data|blob):/.test(url))).toEqual([]);
  });
}

test('lightbox restores focus after close and Escape, including the last filmstrip image', async ({ page }) => {
  await page.goto(site);
  for (const name of ['圖庫瀏覽', '套用與復原']) {
    const opener = page.locator('.evidence-strip a').filter({ hasText: name });
    await opener.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: '關閉' })).toBeFocused();
    if (name === '圖庫瀏覽') await page.getByRole('button', { name: '關閉' }).click();
    else {
      await expect(page.locator('#lightbox img')).toHaveAttribute('alt', /2 個檔案已還原/);
      await page.keyboard.press('Escape');
    }
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(opener).toBeFocused();
  }
});

test('metadata, legacy anchors, copy and downloadable assets remain intact', async ({ page }) => {
  await page.goto(site);
  await expect(page.locator(`a[href="${release}"]`)).toHaveCount(3);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://liutouo.github.io/Pixora-releases/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/Pixora-releases\/assets\/pixora-cover\.webp$/);
  await expect(page.getByRole('link', { name: '素材來源' }).first()).toHaveAttribute('href', /#素材來源$/);
  await expect(page.getByRole('link', { name: '使用指南' }).first()).toHaveAttribute('href', /#第一次使用$/);
  const text = await page.locator('main').textContent();
  expect(text).not.toMatch(/benchmark|SHA-256|CLIP|ONNX|USearch|HNSW|SQLite|HDBSCAN|CDP|production|百萬/);
  for (const term of ['本機 AI', '真實資料夾', '復原', query, '太空探索', '僅存於此頁', '63 秒']) expect(text).toContain(term);
  for (const id of [...stepIds.map(id => `feature-${id}`), 'features', 'demo', 'download', 'tour-review', 'tour-preview', 'tour-completed', 'tour-scope', 'guide', 'faq']) await expect(page.locator(`#${id}`)).toHaveCount(1);
  const bytes = await Promise.all(['site.js', 'vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js'].map(async file => (await fs.stat(path.join(docs, file))).size));
  expect(bytes.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(200000);
});

test('no JavaScript keeps every chapter readable and screenshot links ordinary', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  try {
    await setViewport(page, { width: 375, height: 812 });
    await page.goto(fileSite);
    for (const panel of await page.locator('.lab-panel').all()) await expect(panel).toBeVisible();
    await expect(page.locator('[data-motion-toggle]')).toBeHidden();
    await expect(page.locator('#demo video')).toHaveAttribute('controls', '');
    await page.locator('a[href="#feature-search"]').click();
    await expect(page.locator('#feature-search')).toBeInViewport();
    await expectImagesLoaded(page);
    await expectNoOverflow(page);
    await openOrdinaryScreenshot(page);
  } finally { await context.close(); }
});

test('blocked site script leaves content visible and download links available', async ({ page }) => {
  await page.route('**/site.js', route => route.abort());
  await page.goto(site);
  for (const panel of await page.locator('.lab-panel').all()) await expect(panel).toBeVisible();
  expect(await page.locator('[data-reveal]').evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1'))).toBe(true);
  await expect(page.locator('.hero .primary')).toHaveAttribute('href', release);
});

test('missing GSAP, animation, observers and dialog APIs retain the complete manual flow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Element.prototype.animate = undefined;
    window.IntersectionObserver = undefined;
    window.ResizeObserver = undefined;
    HTMLDialogElement.prototype.showModal = undefined;
  });
  await interactivePage(page, { blockGsap: true });
  await page.getByRole('tab').nth(1).click();
  await page.locator('#lab-query').fill(query);
  await page.locator('.lab-run').click();
  await expect(page.locator('#feature-search .lab-board .lab-card').first()).toHaveAttribute('data-file', 'chelsea.png');
  await page.getByRole('tab').nth(4).click();
  await page.locator('[data-apply-btn]').click();
  await expect(page.locator('[data-count]')).toHaveText('2');
  await page.locator('[data-undo-btn]').click();
  await expect(page.locator('[data-record]')).toBeVisible();
  expect(errors).toEqual([]);
  await openOrdinaryScreenshot(page);
});

test('failed images cannot stall navigation or initialize an invisible page', async ({ page }) => {
  await page.route('**/assets/demo/*.webp', route => route.abort());
  await cinemaPage(page, '#feature-search');
  await expectStep(page, 1);
  await page.locator('[data-view-toggle]').click();
  await expect(page.locator('.lab-manual')).toBeVisible();
  await page.getByRole('tab').nth(4).click();
  await page.locator('[data-apply-btn]').click();
  await expect(page.locator('[data-count]')).toHaveText('2');
});

test('feature aliases, malformed fragments and Back/Forward work without passive history entries', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await cinemaPage(page, '#feature-search');
  await expectStep(page, 1);
  await page.locator('.lab-steps a').nth(2).click();
  await expectStep(page, 2);
  await page.goBack();
  await expectStep(page, 1);
  await page.goForward();
  await expectStep(page, 2);
  for (const [id, index] of [['tour-review', 2], ['tour-preview', 3], ['tour-completed', 4]]) {
    await page.evaluate(id => { location.hash = id; }, id);
    await expectStep(page, index);
  }
  for (const id of ['tour-scope', 'guide', 'faq']) {
    await page.evaluate(id => { location.hash = id; }, id);
    await expect(page.locator('#download')).toBeInViewport();
  }
  for (const hash of ['#%E0%A4%A', '#[', '#not-a-section']) await page.evaluate(hash => { location.hash = hash; }, hash);
  expect(errors).toEqual([]);
});

test('direct file viewing supports deep links and the manual apply/undo flow', async ({ page }) => {
  await setViewport(page, { width: 1280, height: 900 });
  await page.goto(`${fileSite}#feature-search`);
  await expectStep(page, 1);
  await page.locator('[data-view-toggle]').click();
  await page.locator('#lab-query').fill(query);
  await page.locator('.lab-run').click();
  await expect(page.locator('#feature-search .lab-board .is-hit')).toHaveCount(1);
  await page.getByRole('tab').nth(4).click();
  await page.locator('[data-apply-btn]').click();
  await expect(page.locator('[data-count]')).toHaveText('2');
  await page.locator('[data-undo-btn]').click();
  await expect(page.locator('[data-record]')).toBeVisible();
});

test('resizing a manual input preserves focus and its caret', async ({ page }) => {
  await setViewport(page, { width: 1280, height: 900 });
  await interactivePage(page);
  await page.getByRole('tab').nth(1).click();
  const input = page.locator('#lab-query');
  await input.fill(query);
  await input.evaluate(element => element.setSelectionRange(2, 9));
  await setViewport(page, { width: 1100, height: 900 });
  await page.waitForTimeout(350);
  await expect(input).toBeFocused();
  expect(await input.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([2, 9]);
});

test('cinema reset and reverse scroll leave focus on an operable target', async ({ page }) => {
  await cinemaPage(page, '#feature-search');
  await page.locator('[data-reset]').focus();
  await page.locator('[data-reset]').press('Enter');
  await expect(page.locator('.hero .primary')).toBeFocused();
  await scrollChapter(page, 'library');
  await page.locator('#feature-library').focus();
  await scrollChapter(page, 'hero');
  expect(await page.evaluate(() => !document.activeElement.closest('[inert]') && getComputedStyle(document.activeElement).visibility === 'visible')).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !document.activeElement.closest('[inert]'))).toBe(true);
});

test('mobile outro transfers keyboard focus to the active manual chapter', async ({ page }) => {
  await setViewport(page, { width: 390, height: 844 });
  await page.goto(site);
  await page.locator('[data-manual-start]').focus();
  await page.locator('[data-manual-start]').press('Enter');
  await expect(page.locator('.lab-steps a[aria-selected="true"]')).toBeFocused();
  await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'interactive');
});

test('pointer parallax stops while paused and works again after resume', async ({ page }) => {
  await cinemaPage(page);
  await page.mouse.move(250, 220);
  await page.waitForTimeout(850);
  const transform = () => page.locator('.photo-field').evaluate(element => getComputedStyle(element).transform);
  const moving = await transform();
  await page.locator('[data-motion-toggle]').click();
  await page.locator('[data-journey]').dispatchEvent('pointerleave');
  const paused = await transform();
  await page.mouse.move(600, 200);
  await page.waitForTimeout(850);
  expect(await transform()).toBe(paused);
  expect(paused).not.toBe(moving);
  await page.locator('[data-motion-toggle]').click();
  await page.mouse.move(240, 260);
  await expect.poll(transform).not.toBe(paused);
  await page.locator('[data-motion-toggle]').click();
  const midPause = await transform();
  await page.locator('[data-journey]').dispatchEvent('pointerleave');
  await page.waitForTimeout(250);
  expect(await transform()).toBe(midPause);
});

test('leaving the manual lab stops autoplay rather than pulling the visitor back', async ({ page }) => {
  await interactivePage(page);
  await page.locator('[data-auto]').click();
  await page.locator('#demo').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-auto]')).toHaveText('自動演出');
  const position = await page.evaluate(() => scrollY);
  await page.waitForTimeout(850);
  expect(Math.abs(await page.evaluate(() => scrollY) - position)).toBeLessThan(2);
});

async function serveDocs() {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.vtt': 'text/vtt' };
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = path.resolve(docs, pathname.slice('/Pixora-releases/'.length) || 'index.html');
    if (!pathname.startsWith('/Pixora-releases/') || !file.startsWith(`${docs}${path.sep}`)) { response.writeHead(404).end(); return; }
    try {
      const content = await fs.readFile(file);
      const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      if (request.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
        const start = match ? Number(match[1]) : NaN;
        const end = match?.[2] ? Math.min(Number(match[2]), content.length - 1) : content.length - 1;
        if (!Number.isSafeInteger(start) || start > end || start >= content.length) { response.writeHead(416).end(); return; }
        response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${content.length}`, 'Content-Length': end - start + 1 }).end(content.subarray(start, end + 1));
      } else response.writeHead(200, { ...headers, 'Content-Length': content.length }).end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/Pixora-releases/`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

test('Pages subpath preserves evidence hashes, byte ranges, captions and actual 63-second playback', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const server = await serveDocs();
  const badResponses = [], mediaRequests = [];
  page.on('response', response => { if (response.status() >= 400) badResponses.push(response.url()); });
  page.on('request', request => { if (request.url().endsWith('.mp4')) mediaRequests.push(request.url()); });
  try {
    await setViewport(page, { width: 1280, height: 900 });
    await page.goto(server.url);
    await expect(page.locator('[data-journey]')).toHaveAttribute('data-view', 'cinema');
    await expectImagesLoaded(page);
    expect(mediaRequests).toEqual([]);
    for (const file of ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js']) expect((await page.request.get(new URL(file, server.url).href)).ok()).toBe(true);
    const provenance = await (await page.request.get(new URL('evidence/capture-provenance.json', server.url).href)).json();
    expect(provenance.app_version).toBe('0.3.7');
    expect(provenance.sample_count).toBe(12);
    expect(provenance.distinct_visuals).toBe(12);
    expect(new Set(provenance.sample_sources.map(sample => sample.sha256)).size).toBe(12);
    expect(provenance.sample_sources.every(sample => /^[a-f0-9]{64}$/.test(sample.sha256))).toBe(true);
    expect(provenance.smart_exceptions_before_review).toBe(12);
    expect(provenance.smart_confirmed).toBe(2);
    expect(provenance.file_verification).toHaveLength(2);
    expect(provenance.file_verification.every(file => file.moved && file.restored && /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(provenance.all_12_original_hashes_restored).toBe(true);
    expect(provenance.video.caption_editing).toContain('unchanged');
    for (const asset of provenance.published_files) {
      const response = await page.request.get(new URL(`assets/${asset.file}`, server.url).href);
      expect(response.ok(), asset.file).toBe(true);
      const bytes = await response.body();
      expect(bytes.length, asset.file).toBe(asset.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), asset.file).toBe(asset.sha256);
    }
    const benchmark = await (await page.request.get(new URL('evidence/benchmark-1000000.json', server.url).href)).json();
    expect(benchmark.count).toBe(1000000);
    const partial = await page.request.get(new URL('assets/demo.mp4', server.url).href, { headers: { Range: 'bytes=0-31' } });
    expect(partial.status()).toBe(206);
    expect((await partial.body()).length).toBe(32);
    expect(partial.headers()['content-range']).toMatch(/^bytes 0-31\/\d+$/);
    expect((await page.request.get(new URL('assets/demo.mp4', server.url).href, { headers: { Range: 'bytes=999999999999-' } })).status()).toBe(416);
    const video = page.locator('#demo video');
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('playsinline', '');
    await expect(video).toHaveAttribute('preload', 'none');
    await expect(video).not.toHaveAttribute('autoplay');
    await expect(video.locator('track')).toHaveAttribute('srclang', 'zh-TW');
    await expect(video.locator('track')).toHaveAttribute('default', '');
    const inlineTrack = await video.locator('track').getAttribute('src');
    expect(inlineTrack).toMatch(/^data:text\/vtt;base64,/);
    const downloadableTrack = await page.request.get(new URL('assets/demo.zh-TW.vtt', server.url).href);
    expect(Buffer.from(inlineTrack.split(',')[1], 'base64').toString('utf8')).toBe(await downloadableTrack.text());
    // Native caption preferences may override <track default>; exercise enabling it.
    await video.evaluate(element => { element.textTracks[0].mode = 'showing'; return element.play(); });
    await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
    await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2);
    expect(await video.evaluate(element => element.duration)).toBeCloseTo(63, 1);
    await expect.poll(() => video.evaluate(element => element.textTracks[0]?.cues?.length)).toBe(9);
    expect(await video.evaluate(element => element.textTracks[0].mode)).toBe('showing');
    await video.evaluate(async element => {
      element.pause();
      await new Promise(resolve => { element.addEventListener('seeked', resolve, { once: true }); element.currentTime = 27; });
    });
    expect(await video.evaluate(element => element.error)).toBeNull();
    await expect.poll(() => video.evaluate(element => element.textTracks[0].activeCues?.[0]?.text)).toContain('人工選取');
    for (const width of [375, 1280]) {
      await setViewport(page, { width, height: 1000 });
      await video.scrollIntoViewIfNeeded();
      const before = await video.evaluate(element => element.currentTime);
      await video.evaluate(element => element.play());
      await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(before + .1);
      await video.evaluate(element => element.pause());
      await expectNoOverflow(page);
      expect((await video.boundingBox()).width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`demo-${width}.png`) });
    }
    expect(badResponses).toEqual([]);
  } finally { await server.close(); }
});
