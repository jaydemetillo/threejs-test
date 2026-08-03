import * as THREE from 'three';
import { CAMERA_KEYFRAMES, CAMERA_SETTINGS, MOTION } from './sections.js';

const deg = THREE.MathUtils.degToRad;

/** Hermite smoothstep — eases every keyframe segment so dwells feel settled
 *  and sweeps accelerate/decelerate like a camera operator, not a lerp. */
const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * Scroll-driven orbital camera.
 *
 * The camera lives on a sphere around the model's center (the world origin):
 * constant base radius = auto-framed distance, azimuth/polar/zoom keyframed
 * against scroll progress in sections.js. lookAt(origin) runs every frame,
 * which is what guarantees the model never drifts off-center and the
 * distance never "breaks" — the two invariants of the brief.
 *
 * Raw ScrollTrigger progress is exponentially damped here, so notchy mouse
 * wheels produce one continuous cinematic move instead of stepped jumps.
 */
export class CameraRig {
  constructor(scene3d) {
    this.scene3d = scene3d;
    this.targetProgress = 0;
    this.progress = 0; // damped
    this.lookTarget = new THREE.Vector3(0, 0, 0);
    // Accessibility: when the OS asks for reduced motion, track scroll
    // directly instead of gliding after it.
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setTargetProgress(p) {
    this.targetProgress = THREE.MathUtils.clamp(p, 0, 1);
  }

  /** Interpolate azimuth/polar/zoom from the keyframe track. */
  sample(p) {
    const k = CAMERA_KEYFRAMES;
    if (p <= k[0].p) return k[0];
    if (p >= k[k.length - 1].p) return k[k.length - 1];
    let i = 0;
    while (p > k[i + 1].p) i++;
    const a = k[i];
    const b = k[i + 1];
    const t = smoothstep((p - a.p) / (b.p - a.p));
    return {
      azimuth: THREE.MathUtils.lerp(a.azimuth, b.azimuth, t),
      polar: THREE.MathUtils.lerp(a.polar, b.polar, t),
      zoom: THREE.MathUtils.lerp(a.zoom, b.zoom, t),
    };
  }

  update(dt) {
    if (this.reducedMotion) {
      this.progress = this.targetProgress;
    } else {
      // Exponential damping: frame-rate independent, silky on any wheel/trackpad.
      const alpha = 1 - Math.exp(-MOTION.progressDamping * dt);
      this.progress += (this.targetProgress - this.progress) * alpha;
    }

    const { azimuth, polar, zoom } = this.sample(this.progress);
    const radius =
      this.scene3d.framedRadius() * zoom * CAMERA_SETTINGS.distanceScale;

    const az = deg(azimuth);
    const pol = deg(polar);
    const cam = this.scene3d.camera;
    cam.position.set(
      radius * Math.sin(az) * Math.cos(pol),
      radius * Math.sin(pol),
      radius * Math.cos(az) * Math.cos(pol)
    );
    cam.lookAt(this.lookTarget);
  }
}
