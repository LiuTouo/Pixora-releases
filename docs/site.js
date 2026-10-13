'use strict';

/* ================= Shared helpers ================= */
const canAnimate = () => typeof Element.prototype.animate === 'function';
const EASE = 'cubic-bezier(.22, 1, .36, 1)';
const SPRING = 'cubic-bezier(.34, 1.3, .4, 1)';
document.documentElement.classList.remove('no-js');

/* Demo library: the 12 CC0 / public-domain sample images. */
const BROWSE_ORDER = ['astronaut.png', 'brick.png', 'camera.png', 'chelsea.png', 'clock_motion.png', 'coffee.png', 'eagle.png', 'grass.png', 'gravel.png', 'horse.png', 'hubble_deep_field.jpg', 'rocket.jpg'];
const SAMPLE_QUERY = 'a photograph of a cat';
const thumb = file => `assets/demo/${file.replace(/\.(png|jpg)$/, '')}.webp`;
/* Deterministic pseudo-random so entrance layouts are stable. */
const seeded = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const hasGsap = typeof window.gsap === 'object' && !!window.gsap && typeof window.ScrollTrigger !== 'undefined';
if (hasGsap) gsap.registerPlugin(ScrollTrigger);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

/* ================= Reveal system (works without GSAP) ================= */
const reveals = [...document.querySelectorAll('[data-reveal]')];
document.querySelectorAll('[data-reveal-group]').forEach(group => {
  group.querySelectorAll('[data-reveal]').forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${Math.min(index * 80, 320)}ms`);
  });
});
let revealObserver;
let revealsStarted = false;
function startReveals() {
  if (revealsStarted) return;
  revealsStarted = true;
  if (typeof window.IntersectionObserver === 'function') {
    revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -18% 0px' });
    reveals.forEach(element => revealObserver.observe(element));
    document.documentElement.classList.add('motion-ready');
  } else {
    reveals.forEach(element => element.classList.add('revealed'));
  }
}

/* ================= Opening intro (GSAP remount of the card-convergence) ================= */
let introTimer = 0;
let introDone = false;
function finishIntro(overlay, timeline) {
  if (introDone) return;
  introDone = true;
  clearTimeout(introTimer);
  if (timeline) timeline.kill();
  if (overlay) overlay.remove();
  document.documentElement.style.overflow = '';
  startReveals();
}

function runIntro() {
  /* Owner decision: the intro is autonomous motion, so unlike the scroll-driven
     choreography it steps aside for prefers-reduced-motion. */
  if (introDone || !hasGsap || reduceMotion.matches || document.hidden || window.innerWidth < 420) {
    startReveals();
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'intro';
  overlay.setAttribute('aria-hidden', 'true');
  const field = document.createElement('div');
  field.className = 'intro-field';
  const cards = BROWSE_ORDER.map(file => {
    const card = document.createElement('div');
    card.className = 'intro-card';
    const img = document.createElement('img');
    img.src = thumb(file);
    img.alt = '';
    img.decoding = 'async';
    card.appendChild(img);
    field.appendChild(card);
    return card;
  });
  const mark = document.createElement('img');
  mark.className = 'intro-mark';
  mark.src = 'assets/pixora-icon.webp';
  mark.alt = '';
  const tag = document.createElement('p');
  tag.className = 'intro-tag';
  tag.textContent = '讓每張圖片，各得其所。';
  field.append(mark, tag);
  overlay.appendChild(field);
  document.body.appendChild(overlay);
  document.documentElement.style.overflow = 'hidden';

  const skip = () => finishIntro(overlay, timeline);
  window.addEventListener('pointerdown', skip, { once: true, passive: true });
  window.addEventListener('keydown', skip, { once: true, passive: true });
  window.addEventListener('wheel', skip, { once: true, passive: true });
  window.addEventListener('touchstart', skip, { once: true, passive: true });
  document.addEventListener('pixora:skip-intro', skip, { once: true });

  const timeline = gsap.timeline();
  const begin = () => {
    if (introDone) return;
    const box = field.getBoundingClientRect();
    const fw = Math.max(1, box.width), fh = Math.max(1, box.height);
    const cardW = .21 * fw, cardH = .75 * cardW;
    const center = { x: fw / 2 - cardW / 2, y: fh / 2 - cardH / 2 };
    cards.forEach((card, index) => {
      const col = index % 4, row = Math.floor(index / 4);
      const diagonal = col + row;
      const grid = { x: (.025 + col * .257) * fw, y: (.02 + row * .355) * fh };
      const drift = { x: grid.x + (seeded(index) - .5) * .16 * fw, y: grid.y + (seeded(index + 40) - .5) * .1 * fh };
      const side = col < 2 ? -1 : 1;
      const scatter = { x: side * (.9 + seeded(index + 80)) * fw, y: (seeded(index + 120) - .5) * 2.2 * fh };
      timeline.fromTo(card,
        { x: scatter.x, y: scatter.y, rotate: side * (12 + seeded(index + 160) * 16), scale: .6, opacity: 0 },
        { x: drift.x, y: drift.y, rotate: (seeded(index + 200) - .5) * 12, scale: 1, opacity: 1, duration: .56, delay: diagonal * .065, ease: 'back.out(1.2)' }, 0);
      timeline.to(card, { x: grid.x, y: grid.y, rotate: 0, duration: .28, ease: 'power2.inOut' }, .62 + diagonal * .065);
      timeline.to(card, { x: center.x, y: center.y, scale: .12, opacity: 0, duration: .34, ease: 'power2.in' }, 1.02 + diagonal * .065);
    });
    timeline.fromTo(mark, { scale: .55, opacity: 0 }, { scale: 1, opacity: 1, duration: .42, ease: 'back.out(1.4)' }, 1.06);
    timeline.to(mark, { scale: 1.06, duration: .12, yoyo: true, repeat: 1 }, 1.44);
    timeline.to(tag, { opacity: 1, duration: .22 }, 1.46);
    timeline.to(overlay, { opacity: 0, duration: .26, onComplete: () => finishIntro(overlay, timeline) }, 1.93);
    introTimer = setTimeout(() => finishIntro(overlay, timeline), 2350);
  };

  Promise.race([
    Promise.all(cards.map(card => card.querySelector('img').decode().catch(() => {}))),
    new Promise(resolve => setTimeout(resolve, 650)),
  ]).then(begin);
}
runIntro();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    document.querySelector('.intro')?.remove();
    finishIntro(null);
  }
});

/* ================= Lightbox ================= */
const lightbox = document.querySelector('#lightbox');
const enlargedImage = lightbox.querySelector('img');
let imageOpener;
if (typeof lightbox.showModal === 'function') {
  document.querySelectorAll('[data-lightbox]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      imageOpener = link;
      const caption = link.querySelector('img')?.alt || link.dataset.caption;
      enlargedImage.src = link.href;
      enlargedImage.alt = caption;
      document.querySelector('#lightbox-caption').textContent = caption;
      lightbox.showModal();
    });
  });
  lightbox.querySelector('[data-close]').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('close', () => imageOpener?.focus({ preventScroll: true }));
}

/* Spotlight borders: decorative pointer tracking on image cards. */
if (finePointer.matches) {
  document.querySelectorAll('.image-link').forEach(link => {
    link.addEventListener('pointermove', event => {
      const box = link.getBoundingClientRect();
      link.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
      link.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
    });
  });
}

/* Scrollspy for the floating nav. */
const navLinks = [...document.querySelectorAll('.site-header nav a[href^="#"]')];
if (navLinks.length && typeof window.IntersectionObserver === 'function') {
  const spy = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      navLinks.forEach(link => {
        if (link.getAttribute('href') === `#${entry.target.id}`) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach(link => {
    const section = document.getElementById(link.getAttribute('href').slice(1));
    if (section) spy.observe(section);
  });
}

/* ================= Hero motion (GSAP): parallax, image trail, magnetic buttons ================= */
if (hasGsap && finePointer.matches && !reduceMotion.matches) {
  const shell = document.querySelector('[data-parallax]');
  const glow = document.querySelector('.hero-glow');
  if (shell && glow) {
    const shellX = gsap.quickTo(shell, 'x', { duration: .7, ease: 'power3.out' });
    const shellY = gsap.quickTo(shell, 'y', { duration: .7, ease: 'power3.out' });
    const glowX = gsap.quickTo(glow, 'x', { duration: 1.1, ease: 'power3.out' });
    document.querySelector('.hero').addEventListener('pointermove', event => {
      const nx = event.clientX / window.innerWidth - .5;
      const ny = event.clientY / window.innerHeight - .5;
      shellX(nx * 14);
      shellY(ny * 10);
      glowX(nx * -30);
    });
  }

  /* Image trail: sample thumbnails bloom along the cursor path, then dissolve. */
  const trailHost = document.querySelector('[data-trail]');
  if (trailHost) {
    const POOL = 8;
    const pool = Array.from({ length: POOL }, () => {
      const img = document.createElement('img');
      img.className = 'trail-img';
      img.alt = '';
      img.decoding = 'async';
      trailHost.appendChild(img);
      return img;
    });
    let cursor = 0;
    let lastSpawn = 0;
    document.querySelector('.hero').addEventListener('pointermove', event => {
      const now = performance.now();
      if (now - lastSpawn < 150) return;
      lastSpawn = now;
      const img = pool[cursor = (cursor + 1) % POOL];
      img.src = thumb(BROWSE_ORDER[(Math.random() * BROWSE_ORDER.length) | 0]);
      const drift = 30 + seeded(cursor + now % 97) * 50;
      gsap.fromTo(img,
        { x: event.clientX + 18, y: event.clientY - 48, rotation: (seeded(now % 53) - .5) * 14, scale: .5, opacity: 0 },
        { scale: 1, opacity: .85, duration: .3, ease: 'power2.out' });
      gsap.to(img, { y: `-=${drift}`, opacity: 0, scale: .92, duration: .9, delay: .25, ease: 'power1.in' });
    });
  }

  /* Magnetic pull on the focal buttons. */
  document.querySelectorAll('[data-magnetic]').forEach(button => {
    const xTo = gsap.quickTo(button, 'x', { duration: .5, ease: 'power3.out' });
    const yTo = gsap.quickTo(button, 'y', { duration: .5, ease: 'power3.out' });
    button.addEventListener('pointermove', event => {
      const box = button.getBoundingClientRect();
      xTo((event.clientX - box.left - box.width / 2) * .3);
      yTo((event.clientY - box.top - box.height / 2) * .35);
    });
    button.addEventListener('pointerleave', () => {
      gsap.to(button, { x: 0, y: 0, duration: .7, ease: 'elastic.out(1, .4)' });
    });
  });
}

/* ================= Lab: shared DOM and state ================= */
const lab = document.querySelector('[data-lab]');
const labFrame = document.querySelector('.lab-frame');
const stepList = lab.querySelector('.lab-steps');
const steps = [...stepList.querySelectorAll('a')];
const panels = [...lab.querySelectorAll('.lab-panel')];
const noticeBox = lab.querySelector('[data-notice]');
const guideBox = lab.querySelector('[data-guide]');
const autoButton = lab.querySelector('[data-auto]');
const resetButton = lab.querySelector('[data-reset]');
const GUIDES_INTERACTIVE = [
  '從圖庫開始。按「試試用畫面找圖」，或直接點上方步驟。',
  '輸入英文描述後按「搜尋」，也可以按「填入範例」。此步驟重演已記錄的真實搜尋。',
  '點選要一起整理的圖片（試試太空人與火箭），命名後按「確認分類」。確認不會搬動檔案。',
  '逐檔核對來源與目的地。這份清單就是將要執行的內容，確認後才會開始。',
  '按「套用整理」看圖片歸位，再按「復原這次操作」回到原處。整個過程不會動你的檔案。',
];
const GUIDES_CINEMA = [
  '從圖庫開始。繼續往下捲動，或點上方步驟。',
  '輸入英文描述，搜尋已完成分析的圖片。繼續捲動看重演結果。',
  '點選圖片即可加入或移出選取。這裡重演選取太空人與火箭。',
  '逐檔核對來源與目的地，確認後才會執行。',
  '套用後可從操作紀錄復原。往回捲動，隨時重看任一步。',
];

const state = {
  step: 0,
  searched: false,
  selected: [],
  confirmed: false,
  applied: false,
  undone: false,
  autoplay: false,
};
let mode = 'interactive'; /* 'interactive' | 'cinema' */

function notice(text) { noticeBox.textContent = text || ''; }

/* --- shared rail ARIA + indicator --- */
const indicator = document.createElement('span');
indicator.className = 'step-indicator';
indicator.setAttribute('aria-hidden', 'true');
stepList.appendChild(indicator);
function positionIndicator() {
  const active = steps[state.step];
  if (!active) return;
  const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = active;
  indicator.style.transform = `translate(${offsetLeft}px, ${offsetTop + offsetHeight - 2}px) scaleX(${offsetWidth})`;
}
stepList.setAttribute('role', 'tablist');
steps.forEach((step, index) => {
  step.setAttribute('role', 'tab');
  step.setAttribute('aria-controls', panels[index].id);
  panels[index].setAttribute('role', 'tabpanel');
});

function applyRail(index, guides) {
  state.step = index;
  steps.forEach((step, position) => {
    const selected = position === index;
    step.setAttribute('aria-selected', String(selected));
    step.tabIndex = selected ? 0 : -1;
    step.classList.toggle('is-done', position < index);
    const panel = panels[position];
    panel.setAttribute('aria-hidden', String(!selected));
    panel.inert = !selected;
    panel.tabIndex = selected ? 0 : -1;
  });
  guideBox.textContent = guides[index];
  positionIndicator();
}

/* --- shared board controls --- */
const searchPanel = panels[1];
const queryInput = searchPanel.querySelector('#lab-query');
const searchGrid = searchPanel.querySelector('.lab-grid');
const selectPanel = panels[2];
const selectGrid = selectPanel.querySelector('.lab-grid');
const counter = selectPanel.querySelector('[data-counter]');
const nameInput = selectPanel.querySelector('#lab-name');
const acceptButton = selectPanel.querySelector('.lab-accept');
const previewPanel = panels[3];
const planList = previewPanel.querySelector('[data-plan]');
const planSummary = previewPanel.querySelector('[data-summary]');
const applyPanel = panels[4];
const flyGrid = applyPanel.querySelector('[data-fly]');
const folder = applyPanel.querySelector('[data-folder]');
const folderCount = applyPanel.querySelector('[data-count]');
const applyButton = applyPanel.querySelector('[data-apply-btn]');
const undoButton = applyPanel.querySelector('[data-undo-btn]');
const record = applyPanel.querySelector('[data-record]');
const recordCount = applyPanel.querySelector('[data-record-count]');

function groupName() { return nameInput.value.trim() || '太空探索'; }
function syncSelection() {
  counter.textContent = `已選 ${state.selected.length} 張`;
  acceptButton.disabled = state.selected.length === 0 || nameInput.value.trim() === '';
}

/* --- FLIP reorder for manual search --- */
function flipReorder(grid, order) {
  const cards = [...grid.children];
  const first = new Map(cards.map(card => [card.dataset.file, card.getBoundingClientRect()]));
  order.forEach(file => {
    const card = cards.find(entry => entry.dataset.file === file);
    if (card) grid.appendChild(card);
  });
  if (!canAnimate()) return;
  order.forEach((file, rank) => {
    const card = cards.find(entry => entry.dataset.file === file);
    if (!card) return;
    const before = first.get(file);
    const after = card.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (!dx && !dy) return;
    card.animate([
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: 'none' },
    ], { duration: 480, easing: EASE, delay: rank * 32 });
  });
}

function runSearch() {
  const query = queryInput.value.trim();
  if (!query) {
    notice('先輸入英文描述，或按「填入範例」。');
    queryInput.focus();
    return;
  }
  state.searched = true;
  flipReorder(searchGrid, ['chelsea.png', ...BROWSE_ORDER.filter(file => file !== 'chelsea.png')]);
  searchGrid.querySelectorAll('.lab-card').forEach(card => card.classList.toggle('is-hit', card.dataset.file === 'chelsea.png'));
  notice(query === SAMPLE_QUERY
    ? '已找到畫面最相近的結果：貓（chelsea.png）排在最前。'
    : `示範僅收錄了「${SAMPLE_QUERY}」的已記錄結果，已為你顯示該結果。`);
}

function toggleCard(card, pulse = false) {
  const file = card.dataset.file;
  const on = !state.selected.includes(file);
  state.selected = on ? [...state.selected, file] : state.selected.filter(entry => entry !== file);
  card.classList.toggle('is-selected', on);
  card.setAttribute('aria-checked', String(on));
  if (pulse && canAnimate()) {
    card.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.07)' },
      { transform: 'scale(1)' },
    ], { duration: 420, easing: EASE });
  }
  syncSelection();
}

function renderPlan() {
  planList.replaceChildren(...state.selected.map(file => {
    const row = document.createElement('li');
    const from = document.createElement('span');
    from.className = 'from';
    from.textContent = file;
    const move = document.createElement('span');
    move.className = 'move';
    move.setAttribute('aria-hidden', 'true');
    move.textContent = '→';
    const to = document.createElement('span');
    to.className = 'to';
    to.textContent = `${groupName()}/${file}`;
    row.append(from, move, to);
    return row;
  }));
  const kept = BROWSE_ORDER.length - state.selected.length;
  planSummary.replaceChildren();
  planSummary.append(`將搬移 ${state.selected.length} 張 · 其餘 ${kept} 張維持原處 · 確認後才會執行`);
}

function renderFly() {
  flyGrid.replaceChildren(...state.selected.map(file => {
    const card = document.createElement('li');
    card.className = 'lab-card';
    card.dataset.file = file;
    const img = document.createElement('img');
    img.src = thumb(file);
    img.alt = '';
    img.loading = 'lazy';
    const label = document.createElement('span');
    label.textContent = file;
    card.append(img, label);
    return card;
  }));
  folder.lastChild.textContent = `${groupName()}/`;
  folderCount.textContent = state.applied ? state.selected.length : 0;
  folder.classList.toggle('is-filled', state.applied);
  flyGrid.querySelectorAll('.lab-card').forEach(card => { card.style.visibility = state.applied ? 'hidden' : ''; });
}

/* The recorded v0.3.7 demonstration is the initial interactive state. */
function applyRecordedState() {
  state.selected = ['astronaut.png', 'rocket.jpg'];
  selectGrid.querySelectorAll('.lab-card').forEach(card => {
    const on = state.selected.includes(card.dataset.file);
    card.classList.toggle('is-selected', on);
    card.setAttribute('aria-checked', String(on));
  });
  renderPlan();
  renderFly();
  syncSelection();
}

/* ================= Lab: interactive mode (fallback for small viewports, no GSAP) ================= */
let panelAnimations = [];
function cancelPanelAnimations() {
  panelAnimations.forEach(animation => animation.cancel());
  panelAnimations = [];
  panels.forEach(panel => panel.classList.remove('is-leaving'));
}
function animatePanel(panel, outgoing) {
  if (!canAnimate()) return;
  const options = { duration: 420, easing: EASE };
  panelAnimations.push(panel.animate([
    { opacity: 0, transform: 'translateY(16px) scale(.99)' },
    { opacity: 1, transform: 'none' },
  ], options));
  outgoing.classList.add('is-leaving');
  const exit = outgoing.animate([
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateY(-8px)' },
  ], { ...options, duration: 260 });
  exit.onfinish = () => outgoing.classList.remove('is-leaving');
}

function selectStep(index, animate = false) {
  const previous = state.step;
  cancelPanelAnimations();
  applyRail(index, GUIDES_INTERACTIVE);
  panels.forEach((panel, position) => panel.classList.toggle('is-active', position === index));
  if (animate && previous !== index) animatePanel(panels[index], panels[previous]);
}

function alignLab() {
  const bounds = labFrame.getBoundingClientRect();
  const headerHeight = innerWidth >= 768 ? 88 : 0;
  if (bounds.top < headerHeight - 4 || bounds.bottom > innerHeight) {
    labFrame.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

function activateStep(index) {
  selectStep(index, true);
  const hash = `#${panels[index].id}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  alignLab();
}

/* --- cinema rail / keyboard routing (branch inside shared handlers) --- */
steps.forEach((step, index) => {
  step.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    stopAutoplay();
    if (mode === 'cinema') cinemaGoTo(index);
    else activateStep(index);
  });
  step.addEventListener('keydown', event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % steps.length;
    else if (event.key === 'ArrowLeft') next = (index + steps.length - 1) % steps.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = steps.length - 1;
    else return;
    event.preventDefault();
    stopAutoplay();
    steps[next].focus({ preventScroll: true });
    if (mode === 'cinema') cinemaGoTo(next);
    else activateStep(next);
  });
});

/* --- interactive-only listeners (guarded by mode) --- */
searchPanel.querySelector('.lab-run').addEventListener('click', () => { stopAutoplay(true); runSearch(); });
searchPanel.querySelector('.lab-fill').addEventListener('click', () => {
  queryInput.value = SAMPLE_QUERY;
  queryInput.focus();
});
queryInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); stopAutoplay(true); runSearch(); }
});

selectGrid.addEventListener('click', event => {
  const card = event.target.closest('.lab-card');
  if (!card || mode === 'cinema') return;
  stopAutoplay(true);
  toggleCard(card);
});
selectGrid.addEventListener('keydown', event => {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  const card = event.target.closest('.lab-card');
  if (!card || mode === 'cinema') return;
  event.preventDefault();
  stopAutoplay(true);
  toggleCard(card);
});
nameInput.addEventListener('input', syncSelection);

function flyIntoFolder() {
  state.applied = true;
  state.undone = false;
  const cards = [...flyGrid.children];
  const target = folder.getBoundingClientRect();
  const count = state.selected.length;
  if (canAnimate()) {
    cards.forEach((card, index) => {
      const box = card.getBoundingClientRect();
      const dx = target.left + target.width / 2 - (box.left + box.width / 2);
      const dy = target.top + target.height / 2 - (box.top + box.height / 2);
      const flight = card.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(.1)`, opacity: .1 },
      ], { duration: 560, delay: index * 140, easing: EASE, fill: 'forwards' });
      flight.onfinish = () => { card.style.visibility = 'hidden'; };
    });
    folder.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 460, delay: 280 + cards.length * 140, easing: SPRING });
  } else {
    cards.forEach(card => { card.style.visibility = 'hidden'; });
  }
  setTimeout(() => { if (state.applied) { folderCount.textContent = count; folder.classList.add('is-filled'); } }, canAnimate() ? 420 : 0);
  applyButton.disabled = true;
  undoButton.disabled = false;
  record.hidden = true;
  notice(`已套用：${count} 張移入 ${groupName()}/。真實操作中，這一步會實際搬移檔案。`);
}
function flyBack() {
  state.undone = true;
  state.applied = false;
  const cards = [...flyGrid.children];
  const target = folder.getBoundingClientRect();
  if (canAnimate()) {
    cards.forEach((card, index) => {
      card.style.visibility = '';
      const box = card.getBoundingClientRect();
      const dx = target.left + target.width / 2 - (box.left + box.width / 2);
      const dy = target.top + target.height / 2 - (box.top + box.height / 2);
      card.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.1)`, opacity: .1 },
        { transform: 'none', opacity: 1 },
      ], { duration: 520, delay: index * 130, easing: SPRING });
    });
  } else {
    cards.forEach(card => { card.style.visibility = ''; });
  }
  folderCount.textContent = 0;
  folder.classList.remove('is-filled');
  recordCount.textContent = state.selected.length;
  record.hidden = false;
  undoButton.disabled = true;
  notice(`已復原：${state.selected.length} 個檔案回到原位置。復原紀錄跨重啟保存。`);
}
applyButton.addEventListener('click', () => { stopAutoplay(true); if (!state.applied) flyIntoFolder(); });
undoButton.addEventListener('click', () => { stopAutoplay(true); if (state.applied && !state.undone) flyBack(); });

function confirmSelection(pulse = false) {
  if (!state.selected.length) return;
  state.confirmed = true;
  state.applied = false;
  state.undone = false;
  const cards = selectGrid.querySelectorAll('.lab-card');
  if (pulse && canAnimate()) {
    cards.forEach(card => {
      if (state.selected.includes(card.dataset.file)) {
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 380, easing: EASE });
      }
    });
  }
  renderPlan();
  renderFly();
  notice(`已確認 ${state.selected.length} 張，此刻檔案都還在原處。`);
  applyButton.disabled = false;
  undoButton.disabled = true;
  setTimeout(() => { if (state.confirmed && state.step === 2 && mode === 'interactive') activateStep(3); }, pulse ? 650 : 420);
}
acceptButton.addEventListener('click', () => { stopAutoplay(true); confirmSelection(); });

function resetLab(keepStep = false) {
  Object.assign(state, { searched: false, selected: [], confirmed: false, applied: false, undone: false });
  queryInput.value = '';
  nameInput.value = '太空探索';
  searchGrid.querySelectorAll('.lab-card').forEach(card => card.classList.remove('is-hit'));
  selectGrid.querySelectorAll('.lab-card').forEach(card => {
    card.classList.remove('is-selected');
    card.setAttribute('aria-checked', 'false');
  });
  flipReorder(searchGrid, BROWSE_ORDER);
  folderCount.textContent = 0;
  folder.classList.remove('is-filled');
  record.hidden = true;
  applyButton.disabled = false;
  undoButton.disabled = true;
  flyGrid.querySelectorAll('.lab-card').forEach(card => { card.style.visibility = ''; });
  syncSelection();
  if (!keepStep) selectStep(0, false);
  notice('');
}

resetButton.addEventListener('click', () => {
  if (mode === 'cinema') { cinemaRestart(); return; }
  stopAutoplay();
  resetLab();
  alignLab();
});

/* --- autoplay (interactive mode only) --- */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function autoplay() {
  if (state.autoplay) { stopAutoplay(); return; }
  state.autoplay = true;
  autoButton.textContent = '停止演出';
  const alive = () => state.autoplay;
  resetLab(true);
  selectStep(0, true);
  notice('自動演出開始：重演已記錄的真實操作流程。');
  await wait(700); if (!alive()) return;
  activateStep(1);
  await wait(500); if (!alive()) return;
  queryInput.value = '';
  queryInput.focus({ preventScroll: true });
  for (const character of SAMPLE_QUERY) {
    if (!alive()) return;
    queryInput.value += character;
    await wait(34);
  }
  if (!alive()) return;
  runSearch();
  await wait(1100); if (!alive()) return;
  activateStep(2);
  await wait(500); if (!alive()) return;
  for (const file of ['astronaut.png', 'rocket.jpg']) {
    if (!alive()) return;
    const card = selectGrid.querySelector(`[data-file="${file}"]`);
    if (card && !state.selected.includes(file)) toggleCard(card, true);
    await wait(520);
  }
  if (!alive()) return;
  confirmSelection(true);
  await wait(900); if (!alive()) return;
  activateStep(4);
  await wait(600); if (!alive()) return;
  flyIntoFolder();
  await wait(1500); if (!alive()) return;
  flyBack();
  await wait(800); if (!alive()) return;
  notice('完整流程重演完畢。換你試試：按「重新體驗」自己操作一次。');
  stopAutoplay(true);
}
function stopAutoplay(silent = false) {
  if (!state.autoplay) return;
  state.autoplay = false;
  autoButton.textContent = '自動演出';
  if (!silent) notice('演出已停止，你可以繼續手動操作。');
}
autoButton.addEventListener('click', () => { if (mode === 'interactive') state.autoplay ? stopAutoplay() : autoplay(); });
lab.addEventListener('pointerdown', event => {
  if (state.autoplay && !autoButton.contains(event.target)) stopAutoplay(true);
});
lab.addEventListener('keydown', event => {
  if (state.autoplay && event.key === 'Escape') stopAutoplay();
});

lab.querySelectorAll('[data-goto]').forEach(button => {
  button.addEventListener('click', () => {
    if (mode !== 'interactive') return;
    stopAutoplay();
    activateStep(Number(button.dataset.goto));
  });
});

/* ================= Lab: cinema mode (pinned scroll choreography) ================= */
let cinema = null; /* { timeline, scrollTrigger } */
let cinemaIndex = -1;

function cinemaScrollTarget(index) {
  const st = cinema.scrollTrigger;
  if (!st || typeof st.start !== 'number') return null;
  const segment = (st.end - st.start) / 5;
  return st.start + segment * (index + 0.35);
}
function cinemaGoTo(index) {
  const top = cinemaScrollTarget(index);
  if (top === null) return;
  const hash = `#${panels[index].id}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  window.scrollTo({ top, behavior: 'smooth' });
}
function cinemaRestart() {
  const st = cinema?.scrollTrigger;
  if (st && typeof st.start === 'number') window.scrollTo({ top: st.start, behavior: 'smooth' });
}

function syncCinema(progress) {
  const index = Math.min(4, Math.floor(progress * 5));
  if (index !== cinemaIndex) {
    cinemaIndex = index;
    applyRail(index, GUIDES_CINEMA);
  }
  const filled = progress >= .868 && progress < .925;
  folder.classList.toggle('is-filled', filled);
  const selectedNow = progress >= .425 && progress < .868;
  ['astronaut.png', 'rocket.jpg'].forEach(file => {
    selectGrid.querySelector(`[data-file="${file}"]`)?.setAttribute('aria-checked', String(selectedNow));
  });
}

function buildCinema() {
  mode = 'cinema';
  labFrame.classList.add('lab-ready', 'lab-cinema');
  autoButton.hidden = true;
  resetLab(true);
  record.hidden = false; /* the timeline fades it in and out instead */
  /* Base states: only the first panel shows; the story builds itself. */
  gsap.set(panels, { autoAlpha: 0 });
  gsap.set(panels[0], { autoAlpha: 1 });
  const libraryCards = panels[0].querySelectorAll('.lab-card');
  gsap.set(libraryCards, { y: 36, autoAlpha: 0 });
  const hitBadge = searchGrid.querySelector('.lab-hit');
  const chelseaCard = searchGrid.querySelector('[data-file="chelsea.png"]');
  const dimmedCards = [...searchGrid.querySelectorAll('.lab-card')].filter(card => card.dataset.file !== 'chelsea.png');
  const recordedChecks = ['astronaut.png', 'rocket.jpg'].map(file => selectGrid.querySelector(`[data-file="${file}"] .lab-check`));
  const planRows = planList.querySelectorAll('li');

  const selectedCount = { n: 0 };
  const movedCount = { n: 0 };

  const timeline = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: labFrame,
      start: () => `top ${Math.min(96, Math.round(innerHeight * .12))}`,
      end: () => `+=${Math.round(innerHeight * 3.6)}`,
      pin: true,
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: self => syncCinema(self.progress),
    },
  });

  /* Scene 1: the library settles into place. */
  timeline.to(libraryCards, { y: 0, autoAlpha: 1, duration: .5, stagger: .032, ease: 'power2.out' }, .06);

  /* 1 -> 2 */
  timeline.to(panels[0], { autoAlpha: 0, y: -14, duration: .2 }, 1.02)
    .fromTo(panels[1], { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .28 }, 1.1);
  /* Scene 2: the recorded query types itself, the cat surfaces. */
  const typed = { p: 0 };
  timeline.to(typed, { p: 1, duration: .4, onUpdate: () => { queryInput.value = SAMPLE_QUERY.slice(0, Math.round(typed.p * SAMPLE_QUERY.length)); } }, 1.16);
  timeline.to(hitBadge, { autoAlpha: 1, y: 0, duration: .18 }, 1.6)
    .to(chelseaCard, { scale: 1.05, duration: .18 }, 1.6)
    .to(dimmedCards, { opacity: .48, duration: .18 }, 1.64);

  /* 2 -> 3 */
  timeline.to(panels[1], { autoAlpha: 0, y: -14, duration: .2 }, 2.02)
    .fromTo(panels[2], { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .28 }, 2.1);
  /* Scene 3: the operator picks the astronaut and the rocket. */
  timeline.to(recordedChecks, { scale: 1, autoAlpha: 1, duration: .16, stagger: .12, ease: 'back.out(2)' }, 2.16);
  timeline.to(selectedCount, { n: 2, duration: .18, snap: { n: 1 }, onUpdate: () => { counter.textContent = `已選 ${selectedCount.n} 張`; } }, 2.2);

  /* 3 -> 4 */
  timeline.to(panels[2], { autoAlpha: 0, y: -14, duration: .2 }, 3.02)
    .fromTo(panels[3], { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .28 }, 3.1);
  /* Scene 4: per-file preview. */
  timeline.fromTo(planRows, { x: -26, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .26, stagger: .09, ease: 'power2.out' }, 3.16);

  /* 4 -> 5 */
  timeline.to(panels[3], { autoAlpha: 0, y: -14, duration: .2 }, 4.02)
    .fromTo(panels[4], { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .28 }, 4.1);
  /* Scene 5: apply, then undo. */
  const flyCards = [...flyGrid.querySelectorAll('.lab-card')];
  timeline.to(flyCards, {
    x: index => {
      const card = flyCards[index].getBoundingClientRect();
      const target = folder.getBoundingClientRect();
      return target.left + target.width / 2 - (card.left + card.width / 2);
    },
    y: index => {
      const card = flyCards[index].getBoundingClientRect();
      const target = folder.getBoundingClientRect();
      return target.top + target.height / 2 - (card.top + card.height / 2);
    },
    scale: .12,
    autoAlpha: .12,
    duration: .22,
    stagger: .05,
    ease: 'power2.in',
  }, 4.18);
  timeline.to(folder, { scale: 1.07, duration: .08, yoyo: true, repeat: 1 }, 4.36);
  timeline.to(movedCount, { n: 2, duration: .06, snap: { n: 1 }, onUpdate: () => { folderCount.textContent = String(movedCount.n); } }, 4.38);
  timeline.to(flyCards, { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: .2, stagger: .05, ease: 'power2.out' }, 4.62);
  timeline.to(movedCount, { n: 0, duration: .06, snap: { n: 1 }, onUpdate: () => { folderCount.textContent = String(movedCount.n); } }, 4.66);
  timeline.fromTo(record, { autoAlpha: 0, x: -12 }, {
    autoAlpha: 1, x: 0, duration: .1,
    onUpdate: () => { recordCount.textContent = '2'; },
  }, 4.88);

  cinema = { timeline, scrollTrigger: timeline.scrollTrigger };
  cinemaIndex = -1;
  applyRail(0, GUIDES_CINEMA);

  /* Deep links: scroll the pinned stage to the requested scene once measured. */
  const resolve = () => resolveHashCinema();
  ScrollTrigger.addEventListener('refresh', resolve, { once: true });
  resolve();
  return () => {
    ScrollTrigger.removeEventListener('refresh', resolve);
    timeline.scrollTrigger?.kill();
    timeline.kill();
    cinema = null;
    cinemaIndex = -1;
    gsap.set([labFrame, ...panels, ...panels.map(panel => [...panel.querySelectorAll('.lab-card, .lab-check, .lab-hit, .lab-plan li, .lab-record, .lab-folder')]).flat()], { clearProps: 'all' });
    labFrame.classList.remove('lab-ready', 'lab-cinema');
    autoButton.hidden = false;
    record.hidden = true;
    panels.forEach(panel => { panel.inert = false; panel.classList.remove('is-active'); });
  };
}

/* ================= Hash routing ================= */
function panelIndexFromHash() {
  if (!location.hash) return -1;
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return -1; }
  const target = document.getElementById(id);
  if (!target) return -2; /* unknown hash: ignore */
  const panel = target.closest('.lab-panel');
  const index = panels.indexOf(panel);
  return index;
}

function resolveHashCinema() {
  if (mode !== 'cinema' || !cinema) return;
  const index = panelIndexFromHash();
  if (index >= 0) {
    const top = cinemaScrollTarget(index);
    if (top !== null) {
      cinemaIndex = -1;
      window.scrollTo({ top, behavior: 'instant' });
    }
  }
}

function resolveHashInteractive() {
  const index = panelIndexFromHash();
  if (index === -1) { selectStep(0); return; }
  if (index >= 0) {
    selectStep(index, true);
    alignLab();
  }
}

/* ================= Mode selection ================= */
function buildInteractive() {
  mode = 'interactive';
  labFrame.classList.add('lab-ready');
  autoButton.hidden = false;
  applyRecordedState();
  selectStep(0);
  resolveHashInteractive();
  requestAnimationFrame(positionIndicator);
}

const CINEMA_QUERY = '(min-width: 900px) and (min-height: 700px)';
let labTeardown = null;

function activateLabMode() {
  if (labTeardown) { labTeardown(); labTeardown = null; }
  if (window.matchMedia(CINEMA_QUERY).matches && hasGsap) labTeardown = buildCinema();
  else buildInteractive();
  /* After any mode switch the pinned/unpinned layout settles; re-measure the rail. */
  requestAnimationFrame(positionIndicator);
}

activateLabMode();
let modeQuery = window.matchMedia(CINEMA_QUERY);
modeQuery.addEventListener?.('change', activateLabMode);
window.addEventListener('orientationchange', activateLabMode);

window.addEventListener('hashchange', () => {
  if (mode === 'cinema') resolveHashCinema();
  else resolveHashInteractive();
});
window.addEventListener('popstate', () => {
  if (mode === 'cinema') resolveHashCinema();
  else resolveHashInteractive();
});
window.addEventListener('resize', positionIndicator);
if (typeof window.ResizeObserver === 'function') {
  const resizeObserver = new ResizeObserver(positionIndicator);
  resizeObserver.observe(stepList);
}
