'use strict';

const root = document.documentElement;
const EASE = 'cubic-bezier(.22, 1, .36, 1)';
const BROWSE_ORDER = ['astronaut.png', 'brick.png', 'camera.png', 'chelsea.png', 'clock_motion.png', 'coffee.png', 'eagle.png', 'grass.png', 'gravel.png', 'horse.png', 'hubble_deep_field.jpg', 'rocket.jpg'];
const RECORDED_SELECTION = ['astronaut.png', 'rocket.jpg'];
const SAMPLE_QUERY = 'a photograph of a cat';
const CHAPTERS = ['library', 'search', 'selection', 'preview', 'recovery'];
const SCENE_STARTS = [.96, 2.94, 5.17, 7.3, 9.18];
const thumb = file => `assets/demo/${file.replace(/\.(png|jpg)$/, '')}.webp`;
const hasGsap = !!window.gsap && typeof window.ScrollTrigger !== 'undefined';
if (hasGsap) gsap.registerPlugin(ScrollTrigger);
let motion = 'full';
try { if (localStorage.getItem('pixora.site.motion') === 'paused') motion = 'paused'; } catch { /* Storage is optional, including file:// and private browsing. */ }
root.dataset.motion = motion;
root.classList.remove('no-js');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const canAnimate = () => motion === 'full' && !document.hidden && typeof Element.prototype.animate === 'function';

const journey = document.querySelector('[data-journey]');
const hero = document.querySelector('.hero');
const actors = [...document.querySelectorAll('.photo-actor')];
const field = document.querySelector('.photo-field');
const lab = document.querySelector('[data-lab]');
const stepList = lab.querySelector('.lab-steps');
const steps = [...stepList.querySelectorAll('a')];
const panels = [...lab.querySelectorAll('.lab-panel')];
const guideBox = lab.querySelector('[data-guide]');
const noticeBox = lab.querySelector('[data-notice]');
const modeButton = lab.querySelector('[data-view-toggle]');
const motionButton = document.querySelector('[data-motion-toggle]');
const autoButton = lab.querySelector('[data-auto]');
const resetButton = lab.querySelector('[data-reset]');
const queryInput = lab.querySelector('#lab-query');
const searchGrid = panels[1].querySelector('.lab-grid');
const selectGrid = panels[2].querySelector('.lab-grid');
const counter = lab.querySelector('[data-counter]');
const nameInput = lab.querySelector('#lab-name');
const acceptButton = lab.querySelector('.lab-accept');
const planList = lab.querySelector('[data-plan]');
const planSummary = lab.querySelector('[data-summary]');
const flyGrid = lab.querySelector('[data-fly]');
const folder = lab.querySelector('[data-folder]');
const folderCount = lab.querySelector('[data-count]');
const applyButton = lab.querySelector('[data-apply-btn]');
const undoButton = lab.querySelector('[data-undo-btn]');
const record = lab.querySelector('[data-record]');
const recordCount = lab.querySelector('[data-record-count]');
const GUIDES = [
  '預載錄影中的範例。從圖庫開始，或直接點選上方步驟。',
  '輸入英文描述後按「搜尋」。此頁只重演已記錄的搜尋，不會執行 AI 推論。',
  '回到完整圖庫，選取要整理的圖片。命名並確認分類，此刻不會搬動檔案。',
  '逐檔核對來源與目的地。更改選取或分類名稱後，必須重新確認。',
  '套用後再試試復原。這裡只操作示範資料，不會動你的檔案。',
];
// Manual state is never written by the scroll timeline or responsive rebuilds.
const state = { step: 0, selected: [...RECORDED_SELECTION], confirmed: true, searched: false, applied: false, undone: false, autoplay: false };
let mode = 'story';
let activeIndex = -1;
let manualRequested = false;
let manualVisited = false;
let cinema = null;
let cinemaContext = null;
let scrollTween = null;
const effects = new Set();

function notice(text = '') { noticeBox.textContent = text; }
function animate(element, frames, options, finish) {
  if (!canAnimate()) { finish?.(); return; }
  const effect = element.animate(frames, { easing: EASE, ...options });
  effects.add(effect);
  effect.onfinish = () => { effects.delete(effect); finish?.(); };
  effect.oncancel = () => effects.delete(effect);
  return effect;
}
function cancelPanelAnimations() {
  effects.forEach(effect => { effect.onfinish = null; effect.cancel(); });
  effects.clear();
  panels.forEach(panel => panel.classList.remove('is-leaving'));
}

/* Static chapter illustrations are independent of the live form and its state. */
for (const [index, panel] of panels.entries()) {
  const illustration = panel.querySelector('.lab-board').cloneNode(true);
  illustration.className = 'story-illustration';
  illustration.querySelectorAll('.lab-actions, .lab-confirm, .lab-record').forEach(element => element.remove());
  illustration.querySelectorAll('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name === 'id' || attribute.name.startsWith('data-') || ['role', 'tabindex', 'aria-checked'].includes(attribute.name)) element.removeAttribute(attribute.name);
    }
  });
  if (index === 1) {
    const query = document.createElement('p');
    query.className = 'illustration-query';
    query.textContent = SAMPLE_QUERY;
    illustration.querySelector('.lab-search').replaceWith(query);
    const cat = illustration.querySelector('img[src$="chelsea.webp"]').closest('.lab-card');
    cat.classList.add('is-hit');
    cat.parentNode.prepend(cat);
  }
  if (index === 2 || index === 4) {
    illustration.replaceChildren();
    const pair = document.createElement('div');
    pair.className = 'illustration-pair';
    RECORDED_SELECTION.forEach(file => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = thumb(file);
      image.alt = file === 'rocket.jpg' ? '火箭發射' : '太空人';
      image.loading = 'lazy';
      image.width = 480;
      image.height = 480;
      const caption = document.createElement('figcaption');
      caption.textContent = file;
      figure.append(image, caption);
      pair.append(figure);
    });
    const label = document.createElement('p');
    label.className = 'illustration-label';
    label.textContent = index === 2 ? '人工選取 2 張 → 確認為「太空探索」' : '太空探索/ → 原位置 · 已復原 2 個檔案';
    illustration.append(pair, label);
  }
  illustration.dataset.reveal = '';
  panel.append(illustration);
}

const indicator = document.createElement('span');
indicator.className = 'step-indicator';
indicator.setAttribute('aria-hidden', 'true');
stepList.append(indicator);
function positionIndicator() {
  indicator.style.transform = `translateX(${Math.max(0, activeIndex) * 100}%)`;
}
function applyRail(index) {
  activeIndex = index;
  const tabbed = mode !== 'story';
  if (tabbed) stepList.setAttribute('role', 'tablist');
  else stepList.removeAttribute('role');
  steps.forEach((step, position) => {
    const selected = position === index;
    const panel = panels[position];
    if (tabbed) {
      step.setAttribute('role', 'tab');
      step.setAttribute('aria-controls', panel.id);
      step.setAttribute('aria-selected', String(selected));
      step.removeAttribute('aria-current');
      step.tabIndex = selected || index < 0 && position === 0 ? 0 : -1;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-hidden', String(!selected));
      panel.inert = !selected;
    } else {
      step.removeAttribute('role');
      step.removeAttribute('aria-selected');
      step.removeAttribute('aria-controls');
      if (selected) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
      step.tabIndex = 0;
      panel.setAttribute('role', 'region');
      panel.removeAttribute('aria-hidden');
      panel.inert = false;
    }
    panel.tabIndex = tabbed && selected ? 0 : -1;
    panel.classList.toggle('is-active', selected);
  });
  guideBox.textContent = mode === 'cinema'
    ? '捲動繼續，往回捲可重看。也可以點選章節，或選「自己試一次」。'
    : GUIDES[Math.max(0, index)];
  positionIndicator();
}

/* Manual search → human confirmation → per-file preview → apply → undo. */
function groupName() { return nameInput.value.trim(); }
function syncSelection() {
  counter.textContent = `已選 ${state.selected.length} 張`;
  acceptButton.disabled = !state.selected.length || !groupName();
  panels[2].querySelector('.lab-dest strong').textContent = `${groupName() || '尚未命名'}/`;
  selectGrid.querySelectorAll('.lab-card').forEach(card => {
    const selected = state.selected.includes(card.dataset.file);
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-checked', String(selected));
  });
}
function renderPlan() {
  planList.replaceChildren(...state.selected.map(file => {
    const row = document.createElement('li');
    for (const [className, text] of [['from', file], ['move', '→'], ['to', `${groupName() || '尚未命名'}/${file}`]]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      if (className === 'move') span.setAttribute('aria-hidden', 'true');
      row.append(span);
    }
    return row;
  }));
  planSummary.textContent = state.confirmed
    ? `將搬移 ${state.selected.length} 張 · 其餘 ${12 - state.selected.length} 張維持原處 · 確認後才會執行`
    : '請先選取圖片、命名並確認分類，再核對搬移清單。';
  panels[3].querySelector('[data-goto="4"]').disabled = !state.confirmed;
}
function renderFly() {
  flyGrid.replaceChildren(...state.selected.map(file => {
    const card = document.createElement('li');
    card.className = 'lab-card';
    card.dataset.file = file;
    const image = document.createElement('img');
    image.src = thumb(file);
    image.alt = '';
    image.width = 480;
    image.height = 360;
    const label = document.createElement('span');
    label.textContent = file;
    card.append(image, label);
    card.style.visibility = state.applied ? 'hidden' : '';
    return card;
  }));
  folder.lastChild.textContent = `${groupName() || '尚未命名'}/`;
  folderCount.textContent = state.applied ? String(state.selected.length) : '0';
  folder.classList.toggle('is-filled', state.applied);
  applyButton.disabled = !state.confirmed || state.applied;
  undoButton.disabled = !state.applied;
  record.hidden = !state.undone;
  recordCount.textContent = String(state.selected.length);
}
function invalidatePlan() {
  cancelPanelAnimations();
  Object.assign(state, { confirmed: false, applied: false, undone: false });
  syncSelection();
  renderPlan();
  renderFly();
}
function flipReorder(grid, order) {
  const cards = [...grid.children];
  const before = new Map(cards.map(card => [card.dataset.file, card.getBoundingClientRect()]));
  order.forEach(file => grid.append(cards.find(card => card.dataset.file === file)));
  if (!canAnimate()) return;
  cards.forEach(card => {
    const first = before.get(card.dataset.file);
    const last = card.getBoundingClientRect();
    animate(card, [{ transform: `translate(${first.left - last.left}px, ${first.top - last.top}px)` }, { transform: 'none' }], { duration: 480 });
  });
}
function runSearch() {
  if (!queryInput.value.trim()) { notice('先輸入英文描述，或按「填入範例」。'); queryInput.focus(); return; }
  cancelPanelAnimations();
  state.searched = true;
  flipReorder(searchGrid, ['chelsea.png', ...BROWSE_ORDER.filter(file => file !== 'chelsea.png')]);
  searchGrid.querySelectorAll('.lab-card').forEach(card => card.classList.toggle('is-hit', card.dataset.file === 'chelsea.png'));
  notice(queryInput.value.trim() === SAMPLE_QUERY
    ? '已記錄的搜尋結果：貓（chelsea.png）排在最前。'
    : `此頁只收錄「${SAMPLE_QUERY}」的已記錄結果；並未對你輸入的文字執行搜尋。`);
}
function toggleCard(card) {
  const file = card.dataset.file;
  state.selected = state.selected.includes(file) ? state.selected.filter(value => value !== file) : [...state.selected, file];
  invalidatePlan();
  animate(card, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 300 });
}
function animatePanel(panel, outgoing) {
  if (!canAnimate() || !outgoing || outgoing === panel) return;
  outgoing.classList.add('is-leaving');
  animate(outgoing, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 180 }, () => outgoing.classList.remove('is-leaving'));
  animate(panel, [{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'none' }], { duration: 360 });
}
function selectStep(index, animated = false) {
  const previous = panels[state.step];
  const movingFocus = previous?.contains(document.activeElement);
  cancelPanelAnimations();
  renderFly();
  state.step = index;
  applyRail(index);
  if (animated) animatePanel(panels[index], previous);
  if (movingFocus && previous !== panels[index]) steps[index].focus({ preventScroll: true });
}
function alignLab(animated = false) {
  scrollToPosition(scrollY + lab.getBoundingClientRect().top - document.querySelector('.site-header').offsetHeight - 12, animated);
}
function activateStep(index, publish = true) {
  if (publish) pushHash(`#${panels[index].id}`);
  selectStep(index, true);
  alignLab();
}
function confirmSelection() {
  if (!state.selected.length || !groupName()) return;
  cancelPanelAnimations();
  Object.assign(state, { confirmed: true, applied: false, undone: false });
  renderPlan();
  renderFly();
  activateStep(3, !state.autoplay);
  notice(`已確認 ${state.selected.length} 張，此刻檔案都還在原處。`);
}
function flyIntoFolder() {
  if (!state.confirmed || state.applied) return;
  cancelPanelAnimations();
  state.applied = true;
  state.undone = false;
  const target = folder.getBoundingClientRect();
  [...flyGrid.children].forEach((card, index) => {
    const box = card.getBoundingClientRect();
    const x = target.left + target.width / 2 - box.left - box.width / 2;
    const y = target.top + target.height / 2 - box.top - box.height / 2;
    animate(card, [{ transform: 'none', opacity: 1 }, { transform: `translate(${x}px, ${y}px) scale(.12)`, opacity: 0 }], { duration: 540, delay: index * 100 }, () => { card.style.visibility = 'hidden'; });
  });
  folderCount.textContent = String(state.selected.length);
  folder.classList.add('is-filled');
  applyButton.disabled = true;
  undoButton.disabled = false;
  record.hidden = true;
  notice(`已套用：${state.selected.length} 張移入 ${groupName()}/。真實操作中，這一步會實際搬移檔案。`);
}
function flyBack() {
  if (!state.applied) return;
  cancelPanelAnimations();
  Object.assign(state, { applied: false, undone: true });
  renderFly();
  const target = folder.getBoundingClientRect();
  [...flyGrid.children].forEach((card, index) => {
    const box = card.getBoundingClientRect();
    const x = target.left + target.width / 2 - box.left - box.width / 2;
    const y = target.top + target.height / 2 - box.top - box.height / 2;
    animate(card, [{ transform: `translate(${x}px, ${y}px) scale(.12)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: index * 90 });
  });
  notice(`已復原：${state.selected.length} 個檔案回到原位置。復原紀錄跨重啟保存。`);
}
function resetLab() {
  cancelPanelAnimations();
  Object.assign(state, { searched: false, selected: [], confirmed: false, applied: false, undone: false });
  queryInput.value = '';
  nameInput.value = '太空探索';
  flipReorder(searchGrid, BROWSE_ORDER);
  searchGrid.querySelectorAll('.lab-card').forEach(card => card.classList.remove('is-hit'));
  syncSelection();
  renderPlan();
  renderFly();
  selectStep(0);
  notice('已清空選取，換你決定圖片的位置。');
}

/* One cancellable timer; stopping a replay cannot resume an older replay later. */
let playbackToken = 0;
let playbackTimer = 0;
let cancelWait = null;
function stopAutoplay(silent = false) {
  playbackToken++;
  clearTimeout(playbackTimer);
  cancelWait?.(false);
  cancelWait = null;
  if (!state.autoplay) return;
  state.autoplay = false;
  autoButton.textContent = '自動演出';
  if (!silent) notice('演出已停止，可繼續手動操作。');
}
async function autoplay() {
  if (state.autoplay) { stopAutoplay(); return; }
  resetLab();
  state.autoplay = true;
  autoButton.textContent = '停止演出';
  notice('自動演出開始：重演已記錄的真實操作流程。');
  const token = ++playbackToken;
  const wait = ms => new Promise(resolve => {
    cancelWait = resolve;
    playbackTimer = setTimeout(() => { cancelWait = null; resolve(token === playbackToken); }, ms);
  });
  if (!await wait(650)) return;
  activateStep(1, false);
  for (const letter of SAMPLE_QUERY) { if (!await wait(36)) return; queryInput.value += letter; }
  runSearch();
  if (!await wait(1000)) return;
  activateStep(2, false);
  for (const file of RECORDED_SELECTION) {
    if (!await wait(500)) return;
    toggleCard(selectGrid.querySelector(`[data-file="${file}"]`));
  }
  if (!await wait(700)) return;
  confirmSelection();
  if (!await wait(1500)) return;
  activateStep(4, false);
  if (!await wait(500)) return;
  flyIntoFolder();
  if (!await wait(1600)) return;
  flyBack();
  stopAutoplay(true);
  notice('重演完畢。換你試試：按「重新體驗」，自己操作一次。');
}

/* The same twelve actors travel through every desktop chapter. */
function syncCinema(time) {
  let index = -1;
  SCENE_STARTS.forEach((start, position) => { if (time >= start) index = position; });
  const features = document.querySelector('#features');
  const focusedPanel = panels.find(panel => panel.contains(document.activeElement));
  const hidingFeatures = index < 0 && features.contains(document.activeElement);
  const hidingHero = index >= 0 && hero.contains(document.activeElement);
  hero.inert = index >= 0;
  hero.setAttribute('aria-hidden', String(index >= 0));
  features.inert = index < 0;
  features.setAttribute('aria-hidden', String(index < 0));
  if (activeIndex !== index) applyRail(index);
  if (hidingFeatures) document.querySelector('.brand').focus({ preventScroll: true });
  else if (hidingHero || focusedPanel && focusedPanel !== panels[index]) steps[index].focus({ preventScroll: true });
  journey.dataset.scene = index < 0 ? 'hero' : CHAPTERS[index];
  document.querySelector('[data-story-count]').textContent = time >= 11.08 && time < 12.04 ? '2' : '0';
  const typed = Math.max(0, Math.min(1, (time - 3.05) / .75));
  document.querySelector('[data-story-query]').textContent = SAMPLE_QUERY.slice(0, Math.round(typed * SAMPLE_QUERY.length));
}
function buildCinema() {
  mode = 'cinema';
  journey.classList.add('journey-cinema');
  lab.classList.remove('lab-story', 'lab-manual');
  lab.classList.add('lab-cinema');
  cinemaContext = gsap.context(() => {
    const width = innerWidth, height = innerHeight;
    const size = 168;
    const columns = width < 1100 ? 4 : 6;
    const cell = Math.min(width * .77 / columns, 184);
    const scale = (cell - 24) / size;
    const grid = index => ({ x: (width - cell * columns) / 2 + index % columns * cell, y: height * .4 + Math.floor(index / columns) * (cell * .75 + 20), scale, rotation: 0, autoAlpha: 1 });
    const pair = actors.filter(actor => RECORDED_SELECTION.includes(actor.dataset.file));
    const others = actors.filter(actor => !pair.includes(actor));
    const cat = actors.find(actor => actor.dataset.file === 'chelsea.png');
    const catOthers = actors.filter(actor => actor !== cat);
    const overlays = [...document.querySelectorAll('.story-search, .story-selection, .story-paths, .story-folder, .story-undo')];
    gsap.set(actors, { left: 0, top: 0, width: size, transformOrigin: 'top left' });
    actors.forEach(actor => gsap.set(actor, {
      x: Number(actor.style.getPropertyValue('--x')) * width / 100,
      y: 76 + Number(actor.style.getPropertyValue('--y')) * (height - 138) / 100,
      scale: Number(actor.style.getPropertyValue('--w')) / size,
      rotation: Number(actor.style.getPropertyValue('--r')),
    }));
    gsap.set([document.querySelector('#features'), ...panels, ...overlays], { autoAlpha: 0 });
    gsap.set(pair.map(actor => actor.querySelector('i')), { autoAlpha: 0, scale: .5 });
    const timeline = gsap.timeline({ id: 'image-journey', paused: true, defaults: { ease: 'power2.inOut' } });
    timeline.addLabel('hero', 0).addLabel('library', 1.6).addLabel('search', 4.05).addLabel('return-library', 5.05)
      .addLabel('selection', 6.45).addLabel('preview', 8.25).addLabel('recovery', 9.85).addLabel('applied', 11.35).addLabel('undone', 12.75);
    timeline.to(hero, { autoAlpha: 0, y: -24, duration: .36 }, .52);
    actors.forEach((actor, index) => timeline.to(actor, { ...grid(index), duration: .8 }, .5 + index * .025));
    timeline.to(document.querySelector('#features'), { autoAlpha: 1, duration: .24 }, .78);
    SCENE_STARTS.forEach((start, index) => {
      if (index) timeline.to(panels[index - 1], { autoAlpha: 0, y: -12, duration: .2 }, start - .2);
      timeline.fromTo(panels[index], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: .26 }, start - .1);
    });
    timeline.to('[data-story-search]', { autoAlpha: 1, duration: .3 }, 2.8);
    timeline.to(catOthers, { autoAlpha: 0, scale: scale * .9, duration: .6 }, 3.1);
    timeline.to(cat, { x: width * .65, y: height * .49, scale: Math.min(width * .18 / size, 1.55), rotation: -3, duration: .7 }, 3.15);
    // Restore the complete library before the human picks two unrelated images.
    timeline.to('[data-story-search]', { autoAlpha: 0, duration: .25 }, 4.55);
    actors.forEach((actor, index) => timeline.to(actor, { ...grid(index), duration: .48 }, 4.58));
    timeline.to(pair.map(actor => actor.querySelector('i')), { autoAlpha: 1, scale: 1, stagger: .18, duration: .22 }, 5.35);
    timeline.to(others, { autoAlpha: 0, duration: .5 }, 5.62);
    pair.forEach((actor, index) => timeline.to(actor, { x: width * (.53 + index * .23), y: height * (.39 + index * .045), scale: Math.min(width * .195 / size, 1.65), rotation: index * 3, duration: .75 }, 5.6));
    timeline.to('[data-story-selection]', { autoAlpha: 1, y: 0, duration: .35 }, 6.12);
    timeline.to('[data-story-selection]', { autoAlpha: 0, duration: .25 }, 7.05);
    timeline.to(pair.map(actor => actor.querySelector('i')), { autoAlpha: 0, duration: .2 }, 7.15);
    pair.forEach((actor, index) => timeline.to(actor, { x: width * .1, y: height * .49 + 12 + index * 86, scale: .4, rotation: 0, duration: .65 }, 7.15));
    timeline.fromTo('[data-story-paths]', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: .45 }, 7.6);
    timeline.to('[data-story-paths]', { autoAlpha: 0, duration: .25 }, 8.9);
    const recovery = index => ({ x: width * (.48 + index * .13), y: height * (.46 + index * .035), scale: .8, rotation: index * 4 });
    pair.forEach((actor, index) => timeline.to(actor, { ...recovery(index), duration: .65 }, 9.02));
    timeline.to('[data-story-folder]', { autoAlpha: 1, duration: .4 }, 9.1);
    timeline.to(pair, { x: width * .835, y: height * .52, scale: .08, autoAlpha: 0, rotation: 0, stagger: .18, duration: .6, ease: 'power2.in' }, 10.3);
    timeline.to('[data-story-folder]', { scale: 1.04, yoyo: true, repeat: 1, duration: .13 }, 11.02);
    pair.forEach((actor, index) => timeline.to(actor, { ...recovery(index), autoAlpha: 1, duration: .6, ease: 'power2.out' }, 11.95 + index * .12));
    timeline.fromTo('[data-story-undo]', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .3 }, 12.45);
    timeline.to({}, { duration: .85 }, 12.75);
    timeline.eventCallback('onUpdate', () => syncCinema(timeline.time()));
    cinema = { timeline, scrollTrigger: null };
    cinema.scrollTrigger = ScrollTrigger.create({
      id: 'image-journey', trigger: journey, pin: journey.querySelector('.journey-pin'),
      start: 'top top', end: () => `+=${Math.round(innerHeight * 5.5)}`,
      animation: timeline, scrub: .55, anticipatePin: 1, invalidateOnRefresh: true,
      onRefresh: self => syncCinema(self.animation.time()),
    });
    // Timeline-backed triggers defer their first measurement; routing needs it now.
    cinema.scrollTrigger.refresh();
    syncCinema(timeline.time());
  }, journey);
}
function cinemaScrollTarget(index) {
  if (!cinema) return null;
  const { timeline, scrollTrigger } = cinema;
  const time = timeline.labels[index < 0 ? 'hero' : CHAPTERS[index]];
  return scrollTrigger.start + time / timeline.duration() * (scrollTrigger.end - scrollTrigger.start);
}
function cinemaGoTo(index, animated = true, complete) {
  const top = cinemaScrollTarget(index);
  if (top !== null) scrollToPosition(top, animated, () => {
    cinema?.scrollTrigger.getTween()?.progress(1);
    if (cinema) syncCinema(cinema.timeline.time());
    complete?.();
  });
}
function scrollToPosition(top, animated = true, complete) {
  scrollTween?.kill();
  top = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight));
  if (!animated || motion === 'paused' || !hasGsap) {
    window.scrollTo({ top, behavior: 'instant' });
    if (hasGsap) ScrollTrigger.update();
    complete?.();
    return;
  }
  const position = { y: scrollY };
  scrollTween = gsap.to(position, { y: top, duration: .65, ease: 'power2.inOut', onUpdate: () => window.scrollTo({ top: position.y, behavior: 'instant' }), onComplete: complete });
}
let initialRoutePending = true;
for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(event, () => {
  initialRoutePending = false;
  scrollTween?.kill();
}, { passive: true, capture: true });

/* Routing uses timeline labels, never equal-sized scroll slices. */
function pushHash(hash) { if (location.hash !== hash) history.pushState(null, '', hash || `${location.pathname}${location.search}`); }
function panelIndexFromHash(hash = location.hash) {
  let id;
  try { id = decodeURIComponent(hash.slice(1)); } catch { return -1; }
  if (id === 'features') return 0;
  const panel = document.getElementById(id)?.closest('.lab-panel');
  return panels.indexOf(panel);
}
function navigate(hash, animated = false, moveFocus = false) {
  const focus = target => {
    if (!moveFocus) return;
    const heading = target.querySelector('h1, h2, h3') || target.closest('section')?.querySelector('h2, h3') || target;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };
  const index = panelIndexFromHash(hash);
  if (index >= 0) {
    if (mode === 'cinema') cinemaGoTo(index, animated, () => focus(panels[index]));
    else if (mode === 'interactive') { selectStep(index, animated); alignLab(animated); focus(panels[index]); }
    else {
      applyRail(index);
      scrollToPosition(scrollY + panels[index].getBoundingClientRect().top - document.querySelector('.site-header').offsetHeight - 28, animated, () => focus(panels[index]));
    }
    return;
  }
  let id;
  try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
  const target = id ? document.getElementById(id) : hero;
  if (!target) return;
  const top = !id || id === 'main' ? 0 : scrollY + target.getBoundingClientRect().top - document.querySelector('.site-header').offsetHeight - 20;
  scrollToPosition(top, animated, () => focus(target));
}
for (const link of document.querySelectorAll('a[href^="#"]')) {
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    stopAutoplay(true);
    const hash = link.getAttribute('href');
    pushHash(hash === '#' ? '' : hash);
    navigate(hash, true, !stepList.contains(link) && !link.classList.contains('skip-link'));
    if (link.classList.contains('skip-link')) {
      const main = document.querySelector('main');
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
  });
}
steps.forEach((step, index) => step.addEventListener('keydown', event => {
  let next;
  if (event.key === 'ArrowRight') next = (index + 1) % steps.length;
  else if (event.key === 'ArrowLeft') next = (index + steps.length - 1) % steps.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = steps.length - 1;
  else return;
  event.preventDefault();
  stopAutoplay(true);
  steps[next].focus({ preventScroll: true });
  pushHash(`#${panels[next].id}`);
  navigate(location.hash, true);
}));
let routeFrame = 0;
for (const event of ['hashchange', 'popstate']) window.addEventListener(event, () => {
  cancelAnimationFrame(routeFrame);
  routeFrame = requestAnimationFrame(() => { stopAutoplay(true); navigate(location.hash); });
});

/* Responsive rebuilds release pins and styles, not the manual form state. */
function fitsCinema() {
  if (!hasGsap || motion !== 'full' || innerWidth < 900 || innerHeight < 700) return false;
  journey.classList.add('journey-cinema');
  const header = document.querySelector('.site-header').offsetHeight;
  const fits = hero.querySelector('.hero-copy').scrollHeight + header + 100 < innerHeight
    && Math.max(...panels.map(panel => panel.querySelector('.lab-copy').scrollHeight)) < innerHeight - header - 260
    && stepList.scrollHeight < 100;
  journey.classList.remove('journey-cinema');
  return fits;
}
let layoutSignature = '';
function getLayoutSignature() { return `${innerWidth}:${innerHeight}:${getComputedStyle(root).fontSize}:${document.querySelector('.site-header').offsetHeight}`; }
function visibleChapter() {
  const top = document.querySelector('.site-header').offsetHeight + 40;
  return panels.findIndex(panel => {
    const bounds = panel.getBoundingClientRect();
    return bounds.bottom > top && bounds.top < innerHeight;
  });
}
function activateLabMode(restore = true) {
  const previous = mode === 'story' ? visibleChapter() : activeIndex;
  const oldMode = mode;
  const inJourney = cinema ? scrollY <= cinema.scrollTrigger.end + 2 : journey.getBoundingClientRect().bottom > 0;
  const wasBelow = !inJourney;
  const evidenceTop = document.querySelector('#demo').getBoundingClientRect().top;
  scrollTween?.kill();
  stopAutoplay(true);
  cancelPanelAnimations();
  if (hasGsap) { gsap.killTweensOf(field); gsap.set(field, { x: 0, y: 0 }); }
  cinemaContext?.revert();
  if (hasGsap) {
    // Firefox may retain fromTo start styles after context.revert().
    gsap.set([hero, document.querySelector('#features'), ...panels, ...actors,
      ...document.querySelectorAll('.photo-print i, .story-search, .story-selection, .story-paths, .story-folder, .story-undo')],
    { clearProps: 'transform,transformOrigin,opacity,visibility,left,top,width' });
  }
  cinemaContext = null;
  cinema = null;
  journey.classList.remove('journey-cinema');
  lab.classList.remove('lab-cinema', 'lab-manual', 'lab-story');
  hero.inert = false;
  hero.removeAttribute('aria-hidden');
  document.querySelector('#features').inert = false;
  document.querySelector('#features').removeAttribute('aria-hidden');
  if (!manualRequested && fitsCinema()) buildCinema();
  else {
    mode = manualRequested ? 'interactive' : 'story';
    lab.classList.add(manualRequested ? 'lab-manual' : 'lab-story');
    if (manualRequested) selectStep(state.step);
    else applyRail(previous);
    journey.dataset.scene = scrollY < hero.offsetHeight - 100 ? 'hero' : CHAPTERS[Math.max(0, previous)];
  }
  journey.dataset.view = mode;
  modeButton.textContent = manualRequested ? '返回捲動故事 ↗' : '自己試一次 ↗';
  modeButton.setAttribute('aria-pressed', String(manualRequested));
  autoButton.hidden = mode !== 'interactive';
  autoButton.disabled = motion === 'paused';
  lab.querySelector('[data-skip-story]').hidden = mode !== 'cinema';
  document.querySelector('.story-outro').hidden = mode !== 'story';
  resetButton.textContent = mode === 'cinema' ? '從頭看' : '重新體驗';
  selectGrid.querySelectorAll('.lab-card').forEach(card => {
    card.setAttribute('role', 'checkbox');
    card.tabIndex = 0;
  });
  renderFly();
  if (restore) {
    if (wasBelow) scrollToPosition(scrollY + document.querySelector('#demo').getBoundingClientRect().top - evidenceTop, false);
    else if (previous >= 0 && (oldMode === 'cinema' || mode === 'cinema' || manualRequested)) navigate(`#${panels[manualRequested ? state.step : previous].id}`);
  }
  layoutSignature = getLayoutSignature();
  positionIndicator();
}
modeButton.hidden = false;
modeButton.addEventListener('click', () => {
  manualRequested = !manualRequested;
  if (manualRequested && !manualVisited) { state.step = Math.max(0, activeIndex); manualVisited = true; }
  activateLabMode();
  if (manualRequested) alignLab();
});
document.querySelector('[data-manual-start]').addEventListener('click', () => {
  modeButton.click();
  steps[state.step].focus({ preventScroll: true });
});
function updateMotionControl() {
  root.dataset.motion = motion;
  motionButton.setAttribute('aria-pressed', String(motion === 'full'));
  const label = motion === 'full' ? '暫停動畫' : '播放動畫';
  motionButton.setAttribute('aria-label', label);
  motionButton.querySelector('[data-motion-label]').textContent = label;
}
motionButton.hidden = false;
updateMotionControl();
motionButton.addEventListener('click', () => {
  motion = motion === 'full' ? 'paused' : 'full';
  try { localStorage.setItem('pixora.site.motion', motion); } catch { /* In-memory pause still works. */ }
  updateMotionControl();
  if (motion === 'paused') document.querySelectorAll('[data-reveal]').forEach(element => element.classList.add('revealed'));
  activateLabMode();
});
let resizeTimer = 0;
function scheduleLayout() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (layoutSignature !== getLayoutSignature()) activateLabMode(); }, 140);
}
window.addEventListener('resize', scheduleLayout);
window.addEventListener('orientationchange', scheduleLayout);
if (typeof ResizeObserver === 'function') {
  const observer = new ResizeObserver(() => {
    positionIndicator();
    scheduleLayout();
    if (mode === 'cinema' && panels.some(panel => panel.querySelector('.lab-copy').scrollHeight > innerHeight - 336)) {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => activateLabMode(), 140);
    }
  });
  observer.observe(root);
  observer.observe(stepList);
  observer.observe(hero.querySelector('.hero-copy'));
  panels.forEach(panel => observer.observe(panel.querySelector('.lab-copy')));
}

panels[1].querySelector('.lab-run').addEventListener('click', () => { stopAutoplay(true); runSearch(); });
panels[1].querySelector('.lab-fill').addEventListener('click', () => { stopAutoplay(true); queryInput.value = SAMPLE_QUERY; queryInput.focus(); });
queryInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); stopAutoplay(true); runSearch(); } });
queryInput.addEventListener('input', () => stopAutoplay(true));
selectGrid.addEventListener('click', event => {
  const card = event.target.closest('.lab-card');
  if (card && mode === 'interactive') { stopAutoplay(true); toggleCard(card); }
});
selectGrid.addEventListener('keydown', event => {
  const card = event.target.closest('.lab-card');
  if (card && mode === 'interactive' && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); stopAutoplay(true); toggleCard(card); }
});
nameInput.addEventListener('input', () => { stopAutoplay(true); invalidatePlan(); });
acceptButton.addEventListener('click', () => { stopAutoplay(true); confirmSelection(); });
applyButton.addEventListener('click', () => { stopAutoplay(true); flyIntoFolder(); });
undoButton.addEventListener('click', () => { stopAutoplay(true); flyBack(); });
resetButton.addEventListener('click', () => {
  stopAutoplay(true);
  if (mode === 'cinema') { pushHash(''); cinemaGoTo(-1, true, () => hero.querySelector('a').focus({ preventScroll: true })); }
  else { resetLab(); pushHash('#feature-library'); alignLab(); }
});
autoButton.addEventListener('click', autoplay);
lab.addEventListener('pointerdown', event => { if (state.autoplay && !autoButton.contains(event.target)) stopAutoplay(true); });
lab.addEventListener('keydown', event => { if (state.autoplay && event.key === 'Escape') stopAutoplay(); });
lab.querySelectorAll('[data-goto]').forEach(button => button.addEventListener('click', () => {
  if (mode !== 'interactive') return;
  stopAutoplay(true);
  activateStep(Number(button.dataset.goto));
}));

/* Progressive enhancement: no loading gate, no OS motion-preference override. */
function startReveals() {
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  if (typeof IntersectionObserver !== 'function' || motion === 'paused') { reveals.forEach(element => element.classList.add('revealed')); return; }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  reveals.forEach(element => observer.observe(element));
  root.classList.add('motion-ready');
}
let heroVisible = true;
if (typeof IntersectionObserver === 'function') {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target === hero) heroVisible = entry.isIntersecting;
      if (mode !== 'cinema' && entry.target === hero) journey.dataset.scene = entry.isIntersecting ? 'hero' : CHAPTERS[Math.max(0, activeIndex)];
    });
    if (mode === 'story') applyRail(visibleChapter());
  }, { threshold: .25 });
  observer.observe(hero);
  panels.forEach(panel => observer.observe(panel));
}
if (hasGsap && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  journey.addEventListener('pointermove', event => {
    if (motion !== 'full' || document.hidden || !heroVisible || journey.dataset.scene !== 'hero') return;
    gsap.to(field, { x: (event.clientX / innerWidth - .5) * -10, y: (event.clientY / innerHeight - .5) * -8, duration: .75, ease: 'power2.out', overwrite: true });
  });
  journey.addEventListener('pointerleave', () => {
    if (motion === 'full' && !document.hidden) gsap.to(field, { x: 0, y: 0, duration: .75, ease: 'power2.out', overwrite: true });
  });
}
window.addEventListener('scroll', () => {
  if (!state.autoplay) return;
  const bounds = lab.getBoundingClientRect();
  if (bounds.bottom <= document.querySelector('.site-header').offsetHeight || bounds.top >= innerHeight) stopAutoplay(true);
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  root.classList.toggle('page-hidden', document.hidden);
  if (document.hidden) {
    stopAutoplay(true);
    cancelPanelAnimations();
    renderFly();
    scrollTween?.kill();
    if (hasGsap) { gsap.killTweensOf(field); gsap.set(field, { x: 0, y: 0 }); }
  }
});

const lightbox = document.querySelector('#lightbox');
let imageOpener;
if (typeof lightbox.showModal === 'function') {
  document.querySelectorAll('[data-lightbox]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    imageOpener = link;
    const caption = link.querySelector('img').alt;
    lightbox.querySelector('img').src = link.href;
    lightbox.querySelector('img').alt = caption;
    document.querySelector('#lightbox-caption').textContent = caption;
    lightbox.showModal();
  }));
  lightbox.querySelector('[data-close]').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('close', () => imageOpener?.focus({ preventScroll: true }));
}

syncSelection();
renderPlan();
renderFly();
activateLabMode(false);
startReveals();
if (!location.hash && motion === 'full') actors.forEach((actor, index) => {
  animate(actor.querySelector('.photo-print'), [{ opacity: 0, transform: 'translateY(22px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: index * 16 });
});
requestAnimationFrame(() => navigate(location.hash));
// WebKit can restore the pre-reload scroll position after the first route frame.
window.addEventListener('pageshow', event => {
  if (event.persisted) return;
  requestAnimationFrame(() => {
    if (initialRoutePending && location.hash) navigate(location.hash);
    initialRoutePending = false;
  });
});
Promise.allSettled(actors.map(actor => actor.querySelector('img').decode?.())).then(() => cinema?.scrollTrigger.refresh());
