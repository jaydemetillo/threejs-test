import { HalfFloatType } from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { POSTFX } from './sections.js';
import { TIER_PROFILE, postFXWanted } from './quality.js';

/**
 * Optional post-processing chain (pmndrs/postprocessing).
 *
 * Deliberately small: selective-feeling bloom plus a vignette. The point is to
 * make the highlight's emissive boost actually *glow* — the shader in
 * highlights.js already pushes `totalEmissiveRadiance` on the focused region,
 * and a thresholded bloom is what turns that from "brighter pixels" into light
 * spilling off the part being discussed. Everything below the luminance
 * threshold is untouched, so the clay look is bit-identical when no highlight
 * is active.
 *
 * Why pmndrs/postprocessing over three's own EffectComposer: it merges every
 * effect into a single fullscreen shader pass instead of one pass per effect.
 * On tile-based mobile GPUs each extra fullscreen pass is a full framebuffer
 * round-trip, so merging is the difference between "affordable" and "not".
 *
 * Why no SMAA: the composer's `multisampling` gives real MSAA on WebGL2, which
 * is both better and cheaper here, and SMAA ships lookup textures as data:
 * URIs — which the strict-CSP hosts this project targets refuse (see the
 * texture-recovery note in scene.js). On the low tier post-processing is off
 * entirely, so the renderer's own `antialias: true` covers that case.
 */
export class PostFX {
  constructor(scene3d, tier) {
    this.scene3d = scene3d;
    this.tier = tier;
    this.composer = null;
    this.bloom = null;
    this.vignette = null;
    this.available = false;
    this.enabled = false;

    if (!postFXWanted(tier)) return;

    try {
      this._build();
      this.available = true;
      this.enabled = true;
    } catch (err) {
      // A composer failure must never take the page down — the scene renders
      // perfectly well without it.
      console.warn('[postfx] disabled:', err);
      this.composer = null;
    }
  }

  _build() {
    const { renderer, scene, camera } = this.scene3d;

    this.composer = new EffectComposer(renderer, {
      // HalfFloat keeps bloom's bright end from clipping into flat white.
      frameBufferType: HalfFloatType,
      multisampling: Math.min(
        POSTFX.multisampling,
        TIER_PROFILE[this.tier].multisampling
      ),
    });

    this.bloom = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      mipmapBlur: true,
      intensity: POSTFX.bloom.intensity,
      radius: POSTFX.bloom.radius,
      luminanceThreshold: POSTFX.bloom.luminanceThreshold,
      luminanceSmoothing: POSTFX.bloom.luminanceSmoothing,
    });

    this.vignette = new VignetteEffect({
      offset: POSTFX.vignette.offset,
      darkness: POSTFX.vignette.darkness,
    });

    this.composer.addPass(new RenderPass(scene, camera));
    // One EffectPass = one merged fragment shader for both effects.
    this.composer.addPass(new EffectPass(camera, this.bloom, this.vignette));

    this.resize();
  }

  /** True only when the chain exists AND is switched on. */
  get active() {
    return this.enabled && !!this.composer;
  }

  setEnabled(on) {
    this.enabled = on && !!this.composer;
  }

  /** Live setters, used by the tuner. */
  set bloomIntensity(v) { if (this.bloom) this.bloom.intensity = v; }
  set bloomRadius(v) { if (this.bloom) this.bloom.mipmapBlurPass.radius = v; }
  set bloomThreshold(v) { if (this.bloom) this.bloom.luminanceMaterial.threshold = v; }
  set bloomSmoothing(v) { if (this.bloom) this.bloom.luminanceMaterial.smoothing = v; }
  set vignetteOffset(v) { if (this.vignette) this.vignette.offset = v; }
  set vignetteDarkness(v) { if (this.vignette) this.vignette.darkness = v; }

  values() {
    if (!this.composer) return null;
    return {
      intensity: this.bloom.intensity,
      radius: this.bloom.mipmapBlurPass.radius,
      luminanceThreshold: this.bloom.luminanceMaterial.threshold,
      luminanceSmoothing: this.bloom.luminanceMaterial.smoothing,
      offset: this.vignette.offset,
      darkness: this.vignette.darkness,
    };
  }

  resize() {
    if (!this.composer) return;
    const { canvas } = this.scene3d;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    // updateStyle=false: the canvas is sized by CSS (sticky stage), and
    // letting the composer write inline width/height would fight the layout.
    this.composer.setSize(w, h, false);
  }

  render(dt) {
    this.composer.render(dt);
  }

  dispose() {
    if (this.composer) this.composer.dispose();
    this.composer = null;
  }
}
