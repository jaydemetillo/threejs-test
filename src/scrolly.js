import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CameraRig } from './cameraRig.js';
import { Highlighter } from './highlights.js';
import { PostFX } from './postfx.js';
import { AdaptiveQuality } from './quality.js';
import { STEPS, MOTION, QUALITY } from './sections.js';

gsap.registerPlugin(ScrollTrigger);

/**
 * Wires scroll to the 3D experience:
 *   - a tall .scrolly container provides the scrub distance (100vh per beat)
 *   - the stage inside it is position:sticky, so the model holds the viewport
 *   - one ScrollTrigger maps section progress 0..1 onto the camera rig
 *   - a pre-roll trigger scales the stage in as it takes over (the NYT
 *     "image becomes the page" moment) and back out on release
 *   - story cards + green highlights are driven from the DAMPED progress so
 *     they stay in lockstep with what the camera is actually showing
 */
export function initScrolly(scene3d) {
  const section = document.querySelector('.scrolly');
  const stage = section.querySelector('.scrolly__stage');
  const cardsLayer = section.querySelector('.scrolly__cards');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Build the story cards from config so copy lives in sections.js.
  const cardEls = new Map();
  for (const step of STEPS) {
    const el = document.createElement('article');
    el.className = 'story-card';
    el.innerHTML = `
      <p class="story-card__kicker">${step.kicker}</p>
      <h3 class="story-card__title">${step.title}</h3>
      <p class="story-card__body">${step.body}</p>
    `;
    gsap.set(el, { autoAlpha: 0, y: 48 });
    cardsLayer.appendChild(el);
    cardEls.set(step.id, el);
  }

  const rig = new CameraRig(scene3d);
  const highlighter = new Highlighter(scene3d);

  // Post-processing is built after the materials exist, so the composer's
  // first compile sees the highlight-patched shaders.
  const postfx = new PostFX(scene3d, scene3d.tier);
  scene3d.attachPostFX(postfx);
  const quality = new AdaptiveQuality(scene3d, scene3d.tier);

  // Main scrub: section progress -> camera target progress.
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => rig.setTargetProgress(self.progress),
  });

  // Takeover pre-roll: the stage grows from an inset figure to full-bleed
  // as it scrolls into place, and releases the same way on the way out.
  // Skipped for reduced motion — the stage just sits at its final state.
  if (!reducedMotion) {
    gsap.fromTo(
      stage,
      { scale: 0.94, opacity: 0.35, borderRadius: '14px' },
      {
        scale: 1,
        opacity: 1,
        borderRadius: '0px',
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top 90%',
          end: 'top top',
          scrub: true,
        },
      }
    );
  }

  // Only render while the section is anywhere near the viewport.
  let visible = false;
  new IntersectionObserver(
    (entries) => { visible = entries[0].isIntersecting; },
    { rootMargin: '60% 0px 60% 0px' }
  ).observe(section);

  // ...and not at all while the tab is backgrounded. The observer above only
  // knows about scroll position; a backgrounded tab still fires rAF on some
  // platforms, which is pure battery drain on a phone.
  let hidden = false;
  if (QUALITY.pauseWhenHidden) {
    document.addEventListener('visibilitychange', () => {
      hidden = document.hidden;
      last = performance.now(); // don't bill the away-time to the next frame
    });
  }

  // Story-beat sequencing runs off the *damped* progress, so cards and
  // highlights land exactly when the camera arrives, not when the wheel does.
  // `suspend` lets the tuner (src/tuner.js) take over region control.
  let activeCardId = null;
  // suspendStepSync: tuner owns the highlight region.
  // suspendCamera:   tuner's free-look owns camera.position.
  // onFrame:         per-frame hook for tuner-side controls that need dt.
  const control = { suspendStepSync: false, suspendCamera: false, onFrame: null };
  function syncStep(progress) {
    if (control.suspendStepSync) return;
    const step = STEPS.find((s) => progress >= s.start && progress < s.end) || null;
    highlighter.setStep(step);

    const id = step ? step.id : null;
    if (id === activeCardId) return;
    // Reduced motion: cross-fade in place instead of sliding.
    if (activeCardId) {
      gsap.to(cardEls.get(activeCardId), {
        autoAlpha: 0,
        y: reducedMotion ? 0 : -36,
        duration: reducedMotion ? 0.15 : MOTION.cardOut,
        ease: 'power2.in',
        overwrite: 'auto',
      });
    }
    if (id) {
      gsap.fromTo(
        cardEls.get(id),
        { autoAlpha: 0, y: reducedMotion ? 0 : 48 },
        {
          autoAlpha: 1,
          y: 0,
          duration: reducedMotion ? 0.2 : MOTION.cardIn,
          ease: 'power3.out',
          delay: reducedMotion ? 0 : 0.12,
          overwrite: 'auto',
        }
      );
    }
    activeCardId = id;
  }

  // Render loop.
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (visible && !hidden) {
      // Free-look (tuner) takes the camera over; otherwise the scroll rig has it.
      if (!control.suspendCamera) rig.update(dt);
      if (control.onFrame) control.onFrame(dt);
      syncStep(rig.progress);
      quality.update(dt);
      scene3d.render(dt);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Prime the very first frame so the stage isn't blank pre-scroll.
  rig.update(1 / 60);
  scene3d.render(1 / 60);

  // Debug/tuning handle (also used by the headless verification script and,
  // when the page is loaded with ?tune, by src/tuner.js).
  window.__scrolly = {
    rig, highlighter, scene3d, gsap, steps: STEPS, control, postfx, quality,
    // The tuner's device preview resizes the sticky stage, which invalidates
    // every trigger's cached start/end — it needs this to recompute them.
    ScrollTrigger,
  };
}
