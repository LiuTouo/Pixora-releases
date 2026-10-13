'use strict';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function animatePanel(panel) {
  if (reduceMotion.matches) return;
  panel.animate(
    [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
    { duration: 240, easing: 'ease-out' }
  );
}

// Sliding underline shared by the feature tabs and the tour steps.
function createIndicator(container, activeSelector, className) {
  const indicator = document.createElement('span');
  indicator.className = className;
  indicator.setAttribute('aria-hidden', 'true');
  indicator.style.transition = 'none';
  container.appendChild(indicator);
  const position = () => {
    const active = container.querySelector(activeSelector);
    if (!active) return;
    indicator.style.left = `${active.offsetLeft}px`;
    indicator.style.width = `${active.offsetWidth}px`;
  };
  position();
  requestAnimationFrame(() => { indicator.style.transition = ''; });
  window.addEventListener('resize', position);
  return position;
}

const tabs = [...document.querySelectorAll('[data-tabs] .tab-links a')];
const featurePanels = [...document.querySelectorAll('.feature-panel')];
const tabList = document.querySelector('.tab-links');

function selectFeature(index, animate) {
  tabs.forEach((tab, position) => {
    const selected = position === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    featurePanels[position].hidden = !selected;
  });
  positionTabIndicator();
  if (animate) animatePanel(featurePanels[index]);
}

tabList.setAttribute('role', 'tablist');
tabs.forEach((tab, index) => {
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', featurePanels[index].id);
  featurePanels[index].setAttribute('role', 'tabpanel');
  featurePanels[index].tabIndex = 0;
  tab.addEventListener('click', event => {
    event.preventDefault();
    selectFeature(index, true);
  });
  tab.addEventListener('keydown', event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectFeature(next, true);
    tabs[next].focus();
  });
});

const steps = [...document.querySelectorAll('.tour-steps a')];
const tourPanels = [...document.querySelectorAll('.tour-panel')];
const previous = document.querySelector('[data-previous]');
const next = document.querySelector('[data-next]');
const status = document.querySelector('.tour-status');
let currentStep = 0;

function selectStep(index, animate) {
  currentStep = index;
  steps.forEach((step, position) => {
    if (position === index) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
    tourPanels[position].hidden = position !== index;
  });
  positionStepIndicator();
  previous.disabled = index === 0;
  next.disabled = index === steps.length - 1;
  status.textContent = `步驟 ${index + 1} / ${steps.length} · ${tourPanels[index].querySelector('h4').textContent}`;
  if (animate) animatePanel(tourPanels[index]);
}
steps.forEach((step, index) => {
  step.setAttribute('aria-controls', tourPanels[index].id);
  step.addEventListener('click', event => {
    event.preventDefault();
    selectStep(index, true);
  });
});
previous.addEventListener('click', () => selectStep(currentStep - 1, true));
next.addEventListener('click', () => selectStep(currentStep + 1, true));
document.querySelector('.tour-controls').hidden = false;

const positionTabIndicator = createIndicator(tabList, '[aria-selected="true"]', 'tab-indicator');
const positionStepIndicator = createIndicator(document.querySelector('.tour-steps'), '[aria-current="step"]', 'step-indicator');
selectFeature(0, false);
selectStep(0, false);

// Keep ordinary section links usable when a URL points into an enhanced panel.
function revealLinkedPanel() {
  const featureIndex = featurePanels.findIndex(panel => `#${panel.id}` === location.hash);
  const stepIndex = tourPanels.findIndex(panel => `#${panel.id}` === location.hash);
  if (featureIndex >= 0) selectFeature(featureIndex, true);
  if (stepIndex >= 0) selectStep(stepIndex, true);
  if (featureIndex >= 0 || stepIndex >= 0) document.querySelector(location.hash).scrollIntoView();
}
revealLinkedPanel();
window.addEventListener('hashchange', revealLinkedPanel);

// Scroll reveals; groups stagger their children via --reveal-delay.
document.querySelectorAll('[data-reveal-group]').forEach(group => {
  group.querySelectorAll('[data-reveal]').forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${Math.min(index * 90, 450)}ms`);
  });
});
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    }
  });
  document.querySelectorAll('[data-reveal]').forEach(element => revealObserver.observe(element));
} else {
  document.querySelectorAll('[data-reveal]').forEach(element => element.classList.add('revealed'));
}

const lightbox = document.querySelector('#lightbox');
const enlargedImage = lightbox.querySelector('img');
let imageOpener;

// Ordinary image links remain the fallback if native dialog is unavailable.
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
  lightbox.addEventListener('close', () => imageOpener?.focus());
}
