const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');

const docs = path.resolve(__dirname, '../docs');
const site = process.env.SITE_URL || pathToFileURL(path.join(docs, 'index.html')).href;
const release = 'https://github.com/LiuTouo/Pixora-releases/releases/latest';

async function expectImagesLoaded(page) {
  const images = page.locator('main img');
  await images.evaluateAll(elements => elements.forEach(image => { image.loading = 'eager'; }));
  await expect.poll(() => images.evaluateAll(elements => elements.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('feature tabs support mouse, Arrow keys, wrapping, Home and End', async ({ page }) => {
  await page.goto(site);
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(1).click();
  await expect(page.locator('#feature-search')).toBeVisible();
  await expect(page.locator('#feature-library')).toBeHidden();
  await tabs.nth(1).press('ArrowRight');
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
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
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(tabs.nth(index)).toHaveAttribute('tabindex', '0');
  }
});

test('tour supports previous, next and direct steps without auto-rotation', async ({ page }) => {
  await page.goto(site);
  const previous = page.getByRole('button', { name: '← 上一步' });
  const next = page.getByRole('button', { name: '下一步 →' });
  await expect(previous).toBeDisabled();
  for (const id of ['review', 'preview', 'completed']) {
    await next.click();
    await expect(page.locator(`#tour-${id}`)).toBeVisible();
  }
  await expect(next).toBeDisabled();
  await expect(page.locator('.tour-status')).toContainText('步驟 4 / 4');
  await previous.click();
  await expect(page.locator('#tour-preview')).toBeVisible();
  await page.locator('.tour-steps a').nth(0).click();
  await expect(page.locator('#tour-scope')).toBeVisible();
  await expect(page.locator('.tour-steps a').nth(0)).toHaveAttribute('aria-current', 'step');
  await page.waitForTimeout(1200);
  await expect(page.locator('#tour-scope')).toBeVisible();
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
  await page.locator('.tour-steps a').nth(3).click();
  const undo = page.getByRole('link', { name: '查看復原畫面' });
  await undo.click();
  await expect(dialog.locator('img')).toHaveAttribute('src', /undo\.webp$/);
  await expect(dialog.locator('img')).toHaveAttribute('alt', /2 個檔案已還原/);
  await page.keyboard.press('Escape');
  await expect(undo).toBeFocused();
});

test('FAQ works with mouse and keyboard; downloads and metadata are correct', async ({ page }) => {
  await page.goto(site);
  const summary = page.locator('summary').first();
  const details = page.locator('details').first();
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
  await expect(page.locator('#engineering')).toContainText('不是圖片分類正確率');
  const anchors = await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.getAttribute('href')).filter(href => href !== '#'));
  for (const anchor of anchors) await expect(page.locator(anchor)).toHaveCount(1);
});

test('without JavaScript all feature and tour content remains readable with real image/download links', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  try {
    await page.goto(site);
    for (const panel of await page.locator('.feature-panel, .tour-panel').all()) await expect(panel).toBeVisible();
    await expect(page.locator('.tour-controls')).toBeHidden();
    for (const link of await page.getByRole('link', { name: '下載 Windows 版' }).all()) await expect(link).toHaveAttribute('href', release);
    await page.locator('a[href="#feature-search"]').click();
    await expect(page.locator('#feature-search')).toBeInViewport();
    await page.locator('summary').first().click();
    await expect(page.locator('details').first()).toHaveAttribute('open', '');
    await expectImagesLoaded(page);
    await expectNoOverflow(page);
    await page.locator('.hero-shot .image-link').click();
    await expect(page).toHaveURL(/library\.webp$/);
  } finally { await context.close(); }
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
    for (const tab of await page.getByRole('tab').all()) {
      await tab.click();
      await expectNoOverflow(page);
      expect((await tab.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    for (const step of await page.locator('.tour-steps a').all()) {
      await step.click();
      await expectNoOverflow(page);
      expect((await step.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    for (const summary of await page.locator('summary').all()) await summary.click();
    await expectNoOverflow(page);
    await page.getByRole('tab').first().click();
    await page.locator('.tour-steps a').first().click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`site-${width}.png`), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`hero-${width}.png`) });
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(requests.every(url => url.startsWith(new URL('.', site).href))).toBe(true);
  });
}

test('200% text and reduced motion retain layout and interaction', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(site);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of await page.getByRole('tab').all()) {
      await tab.click();
      await expectNoOverflow(page);
    }
    for (const step of await page.locator('.tour-steps a').all()) {
      await step.click();
      await expectNoOverflow(page);
    }
  }
  expect(await page.locator('.button').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.locator('.hero-shot .image-link').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoOverflow(page);
  await page.keyboard.press('Escape');
});

test('direct links reveal enhanced panels', async ({ page }) => {
  await page.goto(`${site}#feature-search`);
  await expect(page.locator('#feature-search')).toBeVisible();
  await page.evaluate(() => { location.hash = 'tour-preview'; });
  await expect(page.locator('#tour-preview')).toBeVisible();
});

test('relative assets and evidence work under /Pixora-releases/ HTTP subpath', async ({ page }) => {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
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
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(content);
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
    expect(badResponses).toEqual([]);
  } finally {
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
});

test('benchmark values remain contained at 200% text on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(site);
  await page.addStyleTag({ content: ':root { font-size: 200%; }' });
  const benchmark = page.locator('.benchmark');
  expect(await benchmark.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const value of await benchmark.locator('dd').all()) {
    expect(await value.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await benchmark.screenshot({ path: testInfo.outputPath('benchmark-375-text200.png') });
});
