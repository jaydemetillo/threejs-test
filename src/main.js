import { Scene3D } from './scene.js';
import { initScrolly } from './scrolly.js';
import './style.css';

const canvas = document.querySelector('.scrolly__canvas');
const loadingEl = document.querySelector('.scrolly__loading');
const loadingPct = loadingEl.querySelector('.scrolly__loading-pct');

const scene3d = new Scene3D(canvas);

scene3d
  .load((ratio) => {
    loadingPct.textContent = `${Math.round(ratio * 100)}%`;
  })
  .then(() => {
    loadingEl.classList.add('is-done');
    initScrolly(scene3d);

    // Visual highlight/camera tuner — dev only, loaded on demand so it never
    // reaches the production bundle. Open the page with ?tune to use it.
    if (new URLSearchParams(location.search).has('tune')) {
      import('./tuner.js').then((m) => m.initTuner());
    }
  })
  .catch((err) => {
    console.error('Failed to load model:', err);
    loadingEl.querySelector('.scrolly__loading-label').textContent =
      'The 3D model could not be loaded.';
  });
