'use strict';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const desktopStage = window.matchMedia('(min-width: 1024px) and (min-height: 700px)');
const showcase = document.querySelector('#features');
const stage = document.querySelector('.showcase-stage');
const tabList = document.querySelector('.tab-links');
const tabs = [...tabList.querySelectorAll('a')];
const featurePanels = [...document.querySelectorAll('.feature-panel')];
const progressBar = document.querySelector('.showcase-progress span');
const header = document.querySelector('.site-header');
const lightbox = document.querySelector('#lightbox');
let currentFeature = 0;
let panelAnimations = [];
let geometry;
let frame = 0;
let layoutDirty = true;

function cancelPanelAnimations() {
  panelAnimations.forEach(animation => animation.cancel());
  panelAnimations = [];
  featurePanels.forEach(panel => panel.classList.remove('is-leaving'));
}

function animatePanel(panel, outgoing) {
  if (reduceMotion.matches || typeof panel.animate !== 'function') return;
  const options = { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' };
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
  panelAnimations.push(exit);
}

function createIndicator(container) {
  const indicator = document.createElement('span');
  indicator.className = 'tab-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  container.appendChild(indicator);
  return () => {
    const active = tabs[currentFeature];
    const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = active;
    indicator.style.transform = `translate(${offsetLeft}px, ${offsetTop + offsetHeight - 2}px) scaleX(${offsetWidth})`;
  };
}
const positionTabIndicator = createIndicator(tabList);

function selectFeature(index, animate = false) {
  const previous = currentFeature;
  cancelPanelAnimations();
  currentFeature = index;
  tabs.forEach((tab, position) => {
    const selected = position === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    const panel = featurePanels[position];
    panel.classList.toggle('is-active', selected);
    panel.setAttribute('aria-hidden', String(!selected));
    panel.inert = !selected;
    panel.tabIndex = selected ? 0 : -1;
  });
  positionTabIndicator();
  if (animate && previous !== index) animatePanel(featurePanels[index], featurePanels[previous]);
}

function alignFeature(index) {
  if (geometry) {
    window.scrollTo({ top: geometry.start + (index + .5) / tabs.length * geometry.distance, behavior: 'instant' });
  } else {
    stage.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

function activateFeature(index) {
  selectFeature(index, true);
  const hash = `#${featurePanels[index].id}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  alignFeature(index);
}

tabList.setAttribute('role', 'tablist');
tabs.forEach((tab, index) => {
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', featurePanels[index].id);
  featurePanels[index].setAttribute('role', 'tabpanel');
  tab.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    activateFeature(index);
  });
  tab.addEventListener('keydown', event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus({ preventScroll: true });
    activateFeature(next);
  });
});

function measureStage() {
  const headerHeight = innerWidth >= 1024 ? header.getBoundingClientRect().height : 0;
  const stageBounds = stage.getBoundingClientRect();
  const wasPinned = Boolean(geometry);
  const wasInStory = geometry && scrollY >= geometry.start && scrollY <= geometry.start + geometry.distance;
  const wasVisible = stageBounds.top < innerHeight && stageBounds.bottom > headerHeight;
  // The progress track adds 29px only in pinned mode; include it before deciding fit.
  const stageHeight = stageBounds.height + (wasPinned ? 0 : 29);
  const pinned = desktopStage.matches && !reduceMotion.matches && stageHeight <= innerHeight - headerHeight - 32;
  document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
  showcase.classList.toggle('is-pinned', pinned);
  geometry = pinned ? {
    start: showcase.getBoundingClientRect().top + scrollY - headerHeight - 12,
    distance: Math.max(1, showcase.offsetHeight - stage.offsetHeight),
  } : null;
  positionTabIndicator();
  if (pinned !== wasPinned && (wasInStory || (!wasPinned && wasVisible))) alignFeature(currentFeature);
}

function syncScroll() {
  if (!geometry || lightbox.open) return;
  const progress = Math.max(0, Math.min(1, (scrollY - geometry.start) / geometry.distance));
  if (scrollY < geometry.start - innerHeight || scrollY > geometry.start + geometry.distance + innerHeight) return;
  progressBar.style.transform = `scaleX(${progress})`;
  const index = Math.min(tabs.length - 1, Math.floor(progress * tabs.length));
  if (index !== currentFeature && !featurePanels[currentFeature].contains(document.activeElement)) selectFeature(index, true);
}

function scheduleFrame() {
  if (frame || document.hidden) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (document.hidden) return;
    if (layoutDirty) {
      layoutDirty = false;
      measureStage();
    }
    syncScroll();
  });
}
function scheduleLayout() {
  layoutDirty = true;
  scheduleFrame();
}

// Resolve IDs rather than CSS selectors so malformed/unknown hashes are harmless.
function revealLinkedPanel() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  if (!id) {
    selectFeature(0);
    return;
  }
  const target = document.getElementById(id);
  const panel = target?.closest('.feature-panel');
  const index = featurePanels.indexOf(panel);
  if (index >= 0) {
    selectFeature(index, true);
    alignFeature(index);
  }
}

selectFeature(0);
stage.classList.add('tabs-ready');
measureStage();
layoutDirty = false;
revealLinkedPanel();
window.addEventListener('hashchange', revealLinkedPanel);
window.addEventListener('popstate', revealLinkedPanel);
window.addEventListener('scroll', scheduleFrame, { passive: true });
window.addEventListener('resize', scheduleLayout);
window.addEventListener('pageshow', scheduleLayout);
stage.addEventListener('focusout', scheduleFrame);
if (typeof window.ResizeObserver === 'function') {
  const resizeObserver = new ResizeObserver(scheduleLayout);
  resizeObserver.observe(stage);
  resizeObserver.observe(header);
}

const reveals = [...document.querySelectorAll('[data-reveal]')];
document.querySelectorAll('[data-reveal-group]').forEach(group => {
  group.querySelectorAll('[data-reveal]').forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${Math.min(index * 80, 320)}ms`);
  });
});
let revealObserver;
if (typeof window.IntersectionObserver === 'function' && !reduceMotion.matches) {
  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    }
  });
  reveals.forEach(element => revealObserver.observe(element));
  document.documentElement.classList.add('motion-ready');
}

reduceMotion.addEventListener('change', () => {
  cancelPanelAnimations();
  if (reduceMotion.matches) {
    reveals.forEach(element => element.classList.add('revealed'));
    revealObserver?.disconnect();
  }
  scheduleLayout();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    cancelPanelAnimations();
  } else scheduleLayout();
});

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
