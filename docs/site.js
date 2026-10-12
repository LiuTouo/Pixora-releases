'use strict';

const tabs = [...document.querySelectorAll('[data-tabs] .tab-links a')];
const featurePanels = [...document.querySelectorAll('.feature-panel')];
const tabList = document.querySelector('.tab-links');

function selectFeature(index) {
  tabs.forEach((tab, position) => {
    const selected = position === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    featurePanels[position].hidden = !selected;
  });
}

tabList.setAttribute('role', 'tablist');
tabs.forEach((tab, index) => {
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', featurePanels[index].id);
  featurePanels[index].setAttribute('role', 'tabpanel');
  featurePanels[index].tabIndex = 0;
  tab.addEventListener('click', event => {
    event.preventDefault();
    selectFeature(index);
  });
  tab.addEventListener('keydown', event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectFeature(next);
    tabs[next].focus();
  });
});
selectFeature(0);

const steps = [...document.querySelectorAll('.tour-steps a')];
const tourPanels = [...document.querySelectorAll('.tour-panel')];
const previous = document.querySelector('[data-previous]');
const next = document.querySelector('[data-next]');
const status = document.querySelector('.tour-status');
let currentStep = 0;

function selectStep(index) {
  currentStep = index;
  steps.forEach((step, position) => {
    if (position === index) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
    tourPanels[position].hidden = position !== index;
  });
  previous.disabled = index === 0;
  next.disabled = index === steps.length - 1;
  status.textContent = `步驟 ${index + 1} / ${steps.length} · ${tourPanels[index].querySelector('h4').textContent}`;
}
steps.forEach((step, index) => {
  step.setAttribute('aria-controls', tourPanels[index].id);
  step.addEventListener('click', event => {
    event.preventDefault();
    selectStep(index);
  });
});
previous.addEventListener('click', () => selectStep(currentStep - 1));
next.addEventListener('click', () => selectStep(currentStep + 1));
selectStep(0);
document.querySelector('.tour-controls').hidden = false;

// Keep ordinary section links usable when a URL points into an enhanced panel.
function revealLinkedPanel() {
  const featureIndex = featurePanels.findIndex(panel => `#${panel.id}` === location.hash);
  const stepIndex = tourPanels.findIndex(panel => `#${panel.id}` === location.hash);
  if (featureIndex >= 0) selectFeature(featureIndex);
  if (stepIndex >= 0) selectStep(stepIndex);
  if (featureIndex >= 0 || stepIndex >= 0) document.querySelector(location.hash).scrollIntoView();
}
revealLinkedPanel();
window.addEventListener('hashchange', revealLinkedPanel);

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
