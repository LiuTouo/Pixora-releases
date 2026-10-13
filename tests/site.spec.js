const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const { createHash } = require('node:crypto');

const docs = path.resolve(__dirname, '../docs');
const site = process.env.SITE_URL || pathToFileURL(path.join(docs, 'index.html')).href;
const release = 'https://github.com/LiuTouo/Pixora-releases/releases/latest';
const stepIds = ['library', 'search', 'smart', 'preview', 'recovery'];

async function expectImagesLoaded(page) {
  const images = page.locator('main img:not(.trail-img)');
  await images.evaluateAll(elements => elements.forEach(image => { image.loading = 'eager'; }));
  await expect.poll(() => images.evaluateAll(elements => elements.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectStep(page, index) {
  await expect.poll(() => page.getByRole('tab').nth(index).getAttribute('aria-selected'), { timeout: 8000 }).toBe('true');
  await expect(page.locator(`#feature-${stepIds[index]}`)).toBeVisible();
  expect(await page.locator('.lab-panel').evaluateAll(panels => panels.filter(panel => !panel.inert).length)).toBe(1);
}

/* The opening intro is skippable; poll the skip event until the overlay is gone. */
async function settleIntro(page) {
  await page.waitForFunction(() => {
    document.dispatchEvent(new Event('pixora:skip-intro'));
    return !document.querySelector('.intro') && document.documentElement.style.overflow === '';
  }, undefined, { timeout: 8000 }).catch(() => {});
  await expect(page.locator('.intro')).toHaveCount(0);
}

/* Interactive (tabbed) lab mode: run without GSAP to force the fallback. */
async function interactivePage(page) {
  await page.route('**/vendor/gsap.min.js', route => route.abort());
  await page.goto(site);
  await expect(page.locator('.lab-frame')).toHaveClass(/lab-ready/);
  await expect(page.locator('.lab-frame')).not.toHaveClass(/lab-cinema/);
}

test('cinema: scrolling the pinned lab advances the five scenes in order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(site);
  await settleIntro(page);
  await expect(page.locator('.lab-frame')).toHaveClass(/lab-cinema/);
  await page.evaluate(() => {
    const st = window.ScrollTrigger.getAll()[0];
    window.scrollTo({ top: st.start + 10, behavior: 'instant' });
  });
  await expectStep(page, 0);
  for (let index = 1; index < 5; index++) {
    await page.evaluate(i => {
      const st = window.ScrollTrigger.getAll()[0];
      const segment = (st.end - st.start) / 5;
      window.scrollTo({ top: st.start + segment * (i + 0.6), behavior: 'instant' });
    }, index);
    await page.waitForTimeout(200);
    await expectStep(page, index);
  }
  /* Deep in scene 5 the undo record appears and the folder emptied again. */
  await page.evaluate(() => {
    const st = window.ScrollTrigger.getAll()[0];
    window.scrollTo({ top: st.end + 200, behavior: 'instant' });
  });
  await expect(page.locator('[data-record]')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-record]')).toContainText('2 個檔案回到原位置');
  await expect(page.locator('[data-count]')).toHaveText('0');
  /* Scrolling back reverses the choreography. */
  await page.evaluate(() => {
    const st = window.ScrollTrigger.getAll()[0];
    window.scrollTo({ top: st.start, behavior: 'instant' });
  });
  await expectStep(page, 0);
});

test('cinema: rail links scroll to scenes and typing replays via scrub', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(site);
  await settleIntro(page);
  await page.getByRole('tab').nth(1).click();
  await expectStep(page, 1);
  await expect.poll(() => page.locator('#lab-query').evaluate(el => el.value.length), { timeout: 8000 }).toBeGreaterThan(0);
  /* Keep scrolling through scene 2 until the scrub finishes the recorded query. */
  await page.evaluate(() => {
    const st = window.ScrollTrigger.getAll()[0];
    const segment = (st.end - st.start) / 5;
    window.scrollTo({ top: st.start + segment * 1.95, behavior: 'smooth' });
  });
  await expect.poll(() => page.locator('#lab-query').evaluate(el => el.value), { timeout: 12000 }).toBe('a photograph of a cat');
  await expect(page.locator('#feature-search .lab-hit')).toBeVisible();
  await page.getByRole('tab').nth(2).press('ArrowRight');
  await expectStep(page, 3);
  await expect(page.locator('[data-plan] li')).toHaveCount(2);
});

test('lab steps support mouse, Arrow keys, wrapping, Home and End', async ({ page }) => {
  await interactivePage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  await expectStep(page, 0);
  await tabs.nth(1).click();
  await expectStep(page, 1);
  await expect(page.locator('#feature-library')).toBeHidden();
  await tabs.nth(1).press('ArrowRight');
  await expect(tabs.nth(2)).toBeFocused();
  await expectStep(page, 2);
  await tabs.nth(2).press('End');
  await expect(tabs.nth(4)).toBeFocused();
  await expectStep(page, 4);
  await tabs.nth(4).press('ArrowRight');
  await expect(tabs.nth(0)).toBeFocused();
  await tabs.nth(0).press('ArrowLeft');
  await expect(tabs.nth(4)).toBeFocused();
  await tabs.nth(4).press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await tabs.nth(0).press('Tab');
  await expect(page.locator('#feature-library')).toBeFocused();
  for (let index = 0; index < 5; index++) {
    await tabs.nth(index).click();
    await expectStep(page, index);
    await expect(tabs.nth(index)).toHaveAttribute('tabindex', '0');
  }
});

test('full interactive flow: search, select, confirm, preview, apply and undo', async ({ page }) => {
  await interactivePage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('tab').nth(1).click();
  await expectStep(page, 1);
  const input = page.locator('#lab-query');
  await input.fill('a photograph of a cat');
  await page.getByRole('button', { name: '搜尋' }).click();
  await expect(page.locator('#feature-search .lab-grid .lab-card').first()).toHaveAttribute('data-file', 'chelsea.png');
  await expect(page.locator('#feature-search .lab-card.is-hit')).toHaveCount(1);
  await expect(page.locator('[data-notice]')).toContainText('chelsea.png');

  await page.getByRole('button', { name: '選取圖片，建立分類' }).click();
  await expectStep(page, 2);
  const card = page.locator('#feature-smart .lab-card[data-file="horse.png"]');
  await card.click();
  await expect(card).toHaveClass(/is-selected/);
  await expect(card).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-counter]')).toHaveText('已選 3 張');
  await card.click();
  await expect(card).not.toHaveClass(/is-selected/);
  await expect(page.locator('[data-counter]')).toHaveText('已選 2 張');

  await page.locator('#lab-name').fill('太空探索');
  await page.getByRole('button', { name: '確認分類' }).click();
  await expect(page.locator('[data-notice]')).toContainText('此刻檔案都還在原處');
  await expect.poll(() => page.locator('.lab-steps a[aria-selected="true"]').getAttribute('id')).toBe('tab-preview');
  await expect(page.locator('[data-plan] li')).toHaveCount(2);
  await expect(page.locator('[data-plan] li').first()).toContainText('太空探索/astronaut.png');
  await expect(page.locator('[data-summary]')).toContainText('將搬移 2 張');

  await page.getByRole('button', { name: '確認，前往套用' }).click();
  await expectStep(page, 4);
  await expect(page.locator('[data-fly] .lab-card')).toHaveCount(2);
  await page.getByRole('button', { name: '套用整理' }).click();
  await expect(page.locator('[data-apply-btn]')).toBeDisabled();
  await expect(page.locator('[data-undo-btn]')).toBeEnabled();
  await expect(page.locator('[data-count]')).toHaveText('2');
  await expect(page.locator('[data-folder]')).toHaveClass(/is-filled/);

  await page.getByRole('button', { name: '復原這次操作' }).click();
  await expect(page.locator('[data-undo-btn]')).toBeDisabled();
  await expect(page.locator('[data-count]')).toHaveText('0');
  await expect(page.locator('[data-record]')).toBeVisible();
  await expect(page.locator('[data-record]')).toContainText('2 個檔案回到原位置');
  await expect(page.locator('[data-notice]')).toContainText('已復原');
});

test('keyboard selection with Space, empty search message and name requirement', async ({ page }) => {
  await interactivePage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('tab').nth(1).click();
  await page.getByRole('button', { name: '搜尋' }).click();
  await expect(page.locator('[data-notice]')).toContainText('先輸入英文描述');
  await page.getByRole('button', { name: '填入範例' }).click();
  await expect(page.locator('#lab-query')).toHaveValue('a photograph of a cat');

  await page.getByRole('tab').nth(2).click();
  const card = page.locator('#feature-smart .lab-card[data-file="coffee.png"]');
  await card.focus();
  await card.press(' ');
  await expect(card).toHaveAttribute('aria-checked', 'true');
  await page.locator('#lab-name').fill('');
  await expect(page.locator('.lab-accept')).toBeDisabled();
  await page.locator('#lab-name').fill('咖啡時光');
  await expect(page.locator('.lab-accept')).toBeEnabled();
});

test('autoplay re-enacts the recorded flow and user interaction stops it', async ({ page }) => {
  await interactivePage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const autoRun = page.getByRole('button', { name: '自動演出' });
  await autoRun.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await autoRun.click();
  await expect(page.locator('[data-notice]')).toContainText('自動演出開始');
  await expect.poll(() => page.locator('[data-record]').isVisible(), { timeout: 20000 }).toBe(true);
  await expect(page.locator('[data-record]')).toContainText('2 個檔案回到原位置');
  await expect(page.locator('[data-notice]')).toContainText('換你試試');
  await expect(page.getByRole('button', { name: '自動演出' })).toBeEnabled();

  await page.getByRole('button', { name: '自動演出' }).click();
  await expect(page.locator('[data-notice]')).toContainText('自動演出開始');
  await page.getByRole('button', { name: '重新體驗' }).click();
  await expect(page.locator('[data-auto]')).toHaveText('自動演出');
  await expectStep(page, 0);
});

test('rapid step changes cancel old layers and settle the indicator', async ({ page }) => {
  await interactivePage(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.lab-steps a');
    for (const index of [4, 0, 3, 1, 4, 2]) tabs[index].click();
  });
  await expectStep(page, 2);
  await expect(page.locator('.is-leaving')).toHaveCount(0);
  await expect.poll(() => page.locator('.lab-panels').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  const active = await page.getByRole('tab').nth(2).boundingBox();
  const indicator = await page.locator('.step-indicator').boundingBox();
  expect(Math.abs(indicator.x - active.x)).toBeLessThan(1);
  expect(Math.abs(indicator.y - (active.y + active.height - 2))).toBeLessThan(1);
  await page.waitForTimeout(600);
  await expectStep(page, 2);
});

test('opening intro appears once, ends by itself and never blocks content', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(site);
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 8000 });
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  await expect(page.locator('h1')).toBeVisible();
  await expect.poll(() => page.locator('.hero .micro').evaluate(element => getComputedStyle(element).opacity)).toBe('1');

  await page.reload();
  const start = Date.now();
  await page.waitForFunction(() => {
    document.dispatchEvent(new Event('pixora:skip-intro'));
    return !document.querySelector('.intro');
  }, undefined, { timeout: 8000 });
  expect(Date.now() - start).toBeLessThan(4000);
  await page.getByRole('tab').nth(2).click();
  await expectStep(page, 2);
});

test('intro skips for reduced motion and narrow viewports while marquee pauses', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(site);
  await expect(page.locator('.intro')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  expect(await page.locator('.marquee-track').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  /* Scroll choreography stays user-driven even with reduced motion. */
  await expect(page.locator('.lab-frame')).toHaveClass(/lab-cinema/);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(site);
  await expect(page.locator('.intro')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
});

test('image trail blooms behind the hero cursor on fine pointers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(site);
  await settleIntro(page);
  const hero = page.locator('.hero');
  await hero.hover();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(300 + i * 60, 320 + (i % 5) * 40);
    await page.waitForTimeout(140);
  }
  await expect.poll(() => page.locator('.trail-img').evaluateAll(imgs => imgs.some(img => Number(getComputedStyle(img).opacity) > 0)), { timeout: 6000 }).toBe(true);
});

test('resize, short windows and mode switches retain working steps without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(site);
  await settleIntro(page);
  await expect(page.locator('.lab-frame')).toHaveClass(/lab-cinema/);
  await page.getByRole('tab').nth(2).click();
  await expectStep(page, 2);
  for (const viewport of [{ width: 1280, height: 600 }, { width: 1280, height: 1000 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(400);
    await expectNoOverflow(page);
  }
  /* After shrinking to mobile the interactive lab takes over. */
  await expect(page.locator('.lab-frame')).not.toHaveClass(/lab-cinema/);
  await page.getByRole('tab').nth(4).click();
  await expectStep(page, 4);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectStep(page, 4);
});

test('lightbox closes by button and Escape and restores focus, including evidence links', async ({ page }) => {
  await page.goto(site);
  await settleIntro(page);
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
  const undo = page.locator('.evidence-strip a').filter({ hasText: '套用與復原' });
  await undo.scrollIntoViewIfNeeded();
  await undo.click();
  await expect(dialog.locator('img')).toHaveAttribute('src', /undo\.webp$/);
  await expect(dialog.locator('img')).toHaveAttribute('alt', /2 個檔案已還原/);
  await page.keyboard.press('Escape');
  await expect(undo).toBeFocused();
});

test('downloads, metadata and user-facing content are correct', async ({ page }) => {
  await page.goto(site);
  await settleIntro(page);
  const downloads = page.locator(`a[href="${release}"]`);
  await expect(downloads).toHaveCount(3);
  for (const link of await downloads.all()) await expect(link).toHaveAttribute('href', release);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://liutouo.github.io/Pixora-releases/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/Pixora-releases\/assets\/pixora-cover\.webp$/);
  await expect(page.locator('.site-header')).not.toContainText('GitHub');
  await expect(page.locator('.site-footer a').filter({ hasText: 'GitHub' })).toHaveAttribute('href', 'https://github.com/LiuTouo/Pixora-releases');
  await expect(page.getByRole('link', { name: '素材來源' }).first()).toHaveAttribute('href', /#素材來源$/);
  await expect(page.getByRole('link', { name: '使用指南' }).first()).toHaveAttribute('href', /#第一次使用$/);
  await expect(page.locator('.marquee')).toHaveCount(1);
  const text = await page.locator('main').textContent();
  expect(text).not.toMatch(/benchmark|SHA-256|CLIP|ONNX|USearch|HNSW|SQLite|HDBSCAN|CDP|production|工程設計|隔離測試|百萬/);
  expect(text).not.toMatch(/[—–]/);
  for (const term of ['本機 AI', '真實資料夾', '復原', 'a photograph of a cat', '太空探索', '僅存於此頁']) expect(text).toContain(term);
  const captions = await fs.readFile(path.join(docs, 'assets/demo.zh-TW.vtt'), 'utf8');
  expect(captions).not.toMatch(/benchmark|SHA-256|CLIP|ONNX|測試|雜湊/);
  expect(captions).toContain('人工選取');
  const anchors = await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.getAttribute('href')).filter(href => href !== '#'));
  for (const anchor of anchors) await expect(page.locator(anchor)).toHaveCount(1);
});

test('without JavaScript all lab steps remain readable with real image and download links', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  try {
    await page.goto(site);
    for (const panel of await page.locator('.lab-panel').all()) await expect(panel).toBeVisible();
    await expect(page.locator('.lab-frame')).not.toHaveClass(/lab-ready/);
    await expect(page.locator('#demo video')).toHaveAttribute('controls', '');
    await expect(page.getByRole('link', { name: '開啟 MP4 影片' })).toHaveAttribute('href', 'assets/demo.mp4');
    await expect(page.locator('.demo-transcript summary')).toBeVisible();
    for (const link of await page.getByRole('link', { name: '下載 Windows 版' }).all()) await expect(link).toHaveAttribute('href', release);
    await page.locator('a[href="#feature-search"]').first().click();
    await expect(page.locator('#feature-search')).toBeInViewport();
    await expectImagesLoaded(page);
    await expectNoOverflow(page);
    await page.locator('.hero-shot .image-link').click();
    await expect(page).toHaveURL(/library\.webp$/);
  } finally { await context.close(); }
});

test('blocked site script leaves the page visible and fully readable', async ({ page }) => {
  await page.route('**/site.js', route => route.abort());
  await page.goto(site);
  await expect(page.locator('.lab-ready')).toHaveCount(0);
  for (const panel of await page.locator('.lab-panel').all()) await expect(panel).toBeVisible();
  expect(await page.locator('[data-reveal]').evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1'))).toBe(true);
  await expect(page.getByRole('link', { name: '下載 Windows 版' }).first()).toHaveAttribute('href', release);
});

test('missing animation, observer and dialog APIs retain ordinary controls', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/gsap.min.js', route => route.abort());
  await page.addInitScript(() => {
    Element.prototype.animate = undefined;
    window.IntersectionObserver = undefined;
    window.ResizeObserver = undefined;
    HTMLDialogElement.prototype.showModal = undefined;
  });
  await page.goto(site);
  await expect(page.locator('.intro')).toHaveCount(0);
  for (let index = 0; index < 5; index++) {
    await page.getByRole('tab').nth(index).click();
    await expectStep(page, index);
  }
  await page.getByRole('tab').nth(1).click();
  await page.locator('#lab-query').fill('a photograph of a cat');
  await page.getByRole('button', { name: '搜尋' }).click();
  await expect(page.locator('#feature-search .lab-grid .lab-card').first()).toHaveAttribute('data-file', 'chelsea.png');
  await page.getByRole('tab').nth(4).click();
  await page.getByRole('button', { name: '套用整理' }).click();
  await expect(page.locator('[data-count]')).toHaveText('2');
  await page.getByRole('button', { name: '復原這次操作' }).click();
  await expect(page.locator('[data-record]')).toBeVisible();
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
    await settleIntro(page);
    await expectImagesLoaded(page);
    await expectNoOverflow(page);
    for (let index = 0; index < 5; index++) {
      const tab = page.getByRole('tab').nth(index);
      await tab.click();
      await expectStep(page, index);
      await expectNoOverflow(page);
      expect((await tab.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    for (const summary of await page.locator('summary').all()) await summary.click();
    await expectNoOverflow(page);
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach(element => { element.style.transition = 'none'; element.classList.add('revealed'); }));
    await expect(page.locator('.is-leaving')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`lab-${width}.png`) });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath(`site-${width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`hero-${width}.png`) });
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(requests.every(url => url.startsWith(new URL('.', site).href) || url.startsWith('data:'))).toBe(true);
  });
}

test('200% text keeps layout, lab and lightbox working', async ({ page }) => {
  await page.goto(site);
  await settleIntro(page);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(300);
    for (let index = 0; index < 5; index++) {
      await page.getByRole('tab').nth(index).click();
      await expectStep(page, index);
      await expectNoOverflow(page);
    }
  }
  expect(await page.locator('.button').first().evaluate(element => getComputedStyle(element).transitionDuration)).not.toBe('0s');
  await page.locator('.hero-shot .image-link').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expectNoOverflow(page);
  await page.setViewportSize({ width: 375, height: 1000 });
  for (const summary of await page.locator('summary').all()) await summary.click();
  await expectNoOverflow(page);
});

test('feature and legacy deep links, malformed hashes and browser history work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(site);
  await settleIntro(page);
  await page.evaluate(() => { location.hash = 'feature-search'; });
  await expectStep(page, 1);
  await page.getByRole('tab').nth(2).click();
  await expectStep(page, 2);
  await page.goBack();
  await expectStep(page, 1);
  await page.goForward();
  await expectStep(page, 2);
  for (const [id, index] of [['tour-review', 2], ['tour-preview', 3], ['tour-completed', 4]]) {
    await page.evaluate(id => { location.hash = id; }, id);
    await expectStep(page, index);
    await expect(page.locator(`#feature-${stepIds[index]}`)).toBeInViewport();
  }
  for (const id of ['tour-scope', 'guide', 'faq']) {
    await page.evaluate(id => { location.hash = id; }, id);
    await expect(page.locator('#download')).toBeInViewport();
  }
  for (const hash of ['#%E0%A4%A', '#[', '#not-a-section']) await page.evaluate(hash => { location.hash = hash; }, hash);
  expect(errors).toEqual([]);
});

test('mobile Back restores the initial fragmentless step without rewriting section links', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(site);
  await expect(page.locator('.intro')).toHaveCount(0);
  await expectStep(page, 0);
  await page.getByRole('tablist').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.getByRole('tab').nth(1).click();
  await expectStep(page, 1);
  await page.goBack();
  expect(new URL(page.url()).hash).toBe('');
  await expectStep(page, 0);
  await page.goForward();
  await expectStep(page, 1);
  expect(new URL(page.url()).hash).toBe('#feature-search');
});

test('scroll reveals settle visible for every motion preference', async ({ page }) => {
  await page.goto(site);
  await settleIntro(page);
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
  await settleIntro(page);
  await page.evaluate(async () => {
    for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  });
  await expect.poll(() => reveals.evaluateAll(elements => elements.every(element => getComputedStyle(element).opacity === '1'))).toBe(true);
});

test('relative assets, vendor scripts and evidence work under /Pixora-releases/ HTTP subpath', async ({ page }, testInfo) => {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.map': 'application/octet-stream' };
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
          response.writeHead(416).end();
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
    await settleIntro(page);
    await expect(page.getByRole('tab')).toHaveCount(5);
    await expectImagesLoaded(page);
    await expect(page.locator('.lab-frame')).toHaveClass(/lab-cinema/);
    for (const file of ['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js']) {
      const response = await page.request.get(new URL(file, root).href);
      expect(response.ok(), file).toBe(true);
    }
    const evidence = await page.request.get(new URL('evidence/benchmark-1000000.json', root).href);
    expect(evidence.ok()).toBe(true);
    expect((await evidence.json()).count).toBe(1000000);
    const provenance = await (await page.request.get(new URL('evidence/capture-provenance.json', root).href)).json();
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
      await page.screenshot({ path: testInfo.outputPath(`demo-${width}.png`) });
    }
    expect(badResponses).toEqual([]);
  } finally {
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});
