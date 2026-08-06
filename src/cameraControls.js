import {
  Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster,
  MathUtils,
} from 'three';
import CameraControls from 'camera-controls';
import { CAMERA_SETTINGS } from './sections.js';

// The library only needs this slice of three; passing the subset instead of
// the whole namespace keeps the tuner chunk from re-bundling three.
CameraControls.install({
  THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster },
});

/**
 * Free-look authoring camera (yomotsu/camera-controls), for the tuner only.
 *
 * The shipped experience is scroll-driven and deliberately not drag-to-orbit
 * (see the Mobile & accessibility notes in the README) — attaching orbit
 * handlers in production is exactly what breaks vertical scrolling on touch.
 * So this exists to *author* keyframes, not to replace the rig: fly to an
 * angle you like, and `toKeyframe()` inverts your camera position back into
 * the `{ p, azimuth, polar, zoom }` line that CAMERA_KEYFRAMES already speaks.
 *
 * While free-look is on, the scroll rig is suspended (`control.suspendCamera`)
 * so the two never fight over camera.position.
 */
export class FreeLook {
  constructor(scene3d, control) {
    this.scene3d = scene3d;
    this.control = control;
    this.enabled = false;

    this.controls = new CameraControls(scene3d.camera, scene3d.canvas);
    this.controls.enabled = false;

    // Keep the operator inside distances where the model still frames well.
    const r = scene3d.framedRadius();
    this.controls.minDistance = r * 0.35;
    this.controls.maxDistance = r * 3;
    this.controls.smoothTime = 0.18;
    this.controls.draggingSmoothTime = 0.08;
    this.controls.dollyToCursor = true;

    // Don't let the operator roll under the floor or over the top pole — both
    // produce keyframes the rig's polar term cannot reproduce.
    this.controls.minPolarAngle = MathUtils.degToRad(4);
    this.controls.maxPolarAngle = MathUtils.degToRad(160);

    this.controls.setTarget(0, 0, 0, false);
  }

  setEnabled(on) {
    this.enabled = on;
    this.controls.enabled = on;
    this.control.suspendCamera = on;
    if (on) {
      // Adopt whatever the rig was showing, so enabling free-look never jumps.
      const p = this.scene3d.camera.position;
      this.controls.setLookAt(p.x, p.y, p.z, 0, 0, 0, false);
    }
  }

  /** Snap the orbit target back to the model center (the rig's invariant). */
  recenter() {
    this.controls.setTarget(0, 0, 0, true);
  }

  /**
   * How far the orbit target has drifted off the origin, as a fraction of the
   * model radius. Truck/pan moves the target, and any keyframe captured with a
   * drifted target will not reproduce under the rig — which always looks at
   * the origin. The tuner surfaces this as a warning.
   */
  targetDrift() {
    const t = this.controls.getTarget(new Vector3());
    return t.length() / this.scene3d.boundingRadius;
  }

  /**
   * Invert the current camera position into the rig's spherical convention.
   *
   * The rig places the camera at:
   *   x = r·sin(az)·cos(pol),  y = r·sin(pol),  z = r·cos(az)·cos(pol)
   * so this is that solved for (az, pol, r), with r divided back out by the
   * auto-framed radius to recover the per-keyframe `zoom` multiplier.
   *
   * `refAzimuth` keeps the track monotonic: CAMERA_KEYFRAMES sweeps
   * 78° -> 274° continuously rather than wrapping through 0, so a raw
   * [0,360) reading would make the camera spin the long way round. Passing the
   * rig's current azimuth picks the co-terminal angle nearest to it.
   */
  toKeyframe(refAzimuth = null) {
    const p = this.scene3d.camera.position;
    const radius = p.length();
    const polar = MathUtils.radToDeg(Math.asin(MathUtils.clamp(p.y / radius, -1, 1)));
    let azimuth = MathUtils.radToDeg(Math.atan2(p.x, p.z));
    if (azimuth < 0) azimuth += 360;

    if (refAzimuth != null) {
      const k = Math.round((refAzimuth - azimuth) / 360);
      azimuth += k * 360;
    }

    const zoom = radius / (this.scene3d.framedRadius() * CAMERA_SETTINGS.distanceScale);
    return { azimuth, polar, zoom };
  }

  update(dt) {
    return this.controls.update(dt);
  }

  dispose() {
    this.controls.dispose();
  }
}
