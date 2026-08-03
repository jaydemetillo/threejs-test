/**
 * ONE-STOP TUNING CONFIG for the scroll-driven 3D hero.
 *
 * Everything an engineer needs to retune the experience is in this file:
 *   - CAMERA_KEYFRAMES : where the camera sits at each point of scroll progress
 *   - STEPS            : the story beats (highlight region + card copy)
 *   - MOTION           : damping / feel constants
 *   - HIGHLIGHT        : the green glow look
 *
 * Coordinate conventions
 * ----------------------
 * The model is auto-centered at the world origin after load (see scene.js).
 * Camera position is spherical around that origin:
 *   azimuth   0° = front of the model (+Z), 90° = its right side (+X),
 *             180° = back (-Z), 270° = its left side (-X).
 *   polar     elevation above the horizon, degrees.
 *   zoom      multiplier on the auto-framed orbit radius. Keep within
 *             ~0.94–1.06 so the model never "breaks distance" or clips.
 *
 * Highlight regions are expressed in normalized bounding-box space [0..1]
 * per axis (x: 0 = -X face … 1 = +X face, same for y/z), so the exact same
 * config works on ANY swapped-in GLB regardless of its real-world size.
 * Regions are soft-edged BOXES: `center` positions them, `size` is their
 * full extent per axis as a fraction of the model's bounding box.
 */

/**
 * One-time correction for the source model's authoring orientation, applied
 * before anything is measured. The camera convention needs the front of the
 * vehicle on +Z; the Meshy export faces -X, so spin it 90° about Y.
 */
export const MODEL_TRANSFORM = { rotationY: 90 };

/**
 * 'clay'     NYT-style editorial look: textures stripped, neutral matte
 *            material, contact shadow. The green annotation does the talking.
 * 'textured' the model's own texture maps. The served GLB is texture-free,
 *            so re-pack from a textured source first:
 *            npm run optimize:model -- path/to/textured-export.glb
 */
export const RENDER_MODE = 'clay';

export const CLAY = {
  color: 0xdcdcdf,   // neutral clay
  metalness: 0.05,
  roughness: 0.65,
};

export const CAMERA_SETTINGS = {
  // Global multiplier on the auto-framed orbit distance. 1.0 frames the whole
  // model with margin; lower = closer crop. Kept moderate — very close crops
  // magnify the scanned mesh's surface noise.
  distanceScale: 0.85,
};

export const CAMERA_KEYFRAMES = [
  // p = overall scroll progress through the scrolly section (0..1).
  // Segment plan (4 x 100vh): right side -> back -> left side -> settle.
  { p: 0.0,  azimuth: 78,  polar: 11, zoom: 1.04 }, // takeover: right-front
  { p: 0.2,  azimuth: 96,  polar: 13, zoom: 0.97 }, // dwell on the right side
  { p: 0.34, azimuth: 176, polar: 19, zoom: 1.12 }, // sweep to the back
  { p: 0.52, azimuth: 186, polar: 15, zoom: 1.2  }, // dwell on the back (end-on
                                                    // views need extra distance
                                                    // with the closer global crop)
  { p: 0.68, azimuth: 266, polar: 13, zoom: 1.1  }, // sweep to the left side
  { p: 0.84, azimuth: 274, polar: 11, zoom: 0.98 }, // dwell on the left side
  { p: 1.0,  azimuth: 274, polar: 11, zoom: 1.0  }, // hold: no more rotation,
                                                    // page releases to normal scroll
];

export const STEPS = [
  {
    id: 'right-side',
    // active while damped progress is inside [start, end)
    start: 0.0,
    end: 0.3,
    region: { center: [0.85, 0.45, 0.31], size: [0.02, 0.6, 0.48] },
    kicker: 'The right locker bay',
    title: 'Where the tags used to live',
    body:
      'Every roller shutter on this side hides equipment that once carried an RFID tag. The tags burned in fires and washed off in water — officers could scan a tag while the gear itself was somewhere else entirely.',
  },
  {
    id: 'rear',
    start: 0.3,
    end: 0.62,
    region: { center: [0.46, 0.44, 0], size: [0.54, 0.6, 0.02] },
    kicker: 'The rear pump panel',
    title: 'Checked before every shift',
    body:
      'Pump pressure, hose couplings, foam levels — the checks that used to end life in a binder. Digitised, the same three minutes of work now tells headquarters which stations run late and which equipment keeps failing.',
  },
  {
    id: 'left-side',
    start: 0.62,
    end: 0.88,
    region: { center: [0.12, 0.41, 0.31], size: [0.02, 0.6, 0.49] },
    kicker: 'The left crew side',
    title: '38.5 minutes, down from an hour',
    body:
      'Crew doors, breathing apparatus, the ladder rack above. Median check time across all 23 stations fell to 38.5 minutes after the rebuild — faster than paper, even though the interface now does more.',
  },
  // After the last step (p >= 0.88) all highlights fade out, the camera
  // stops rotating, and the reader scrolls off the pinned stage normally.
];

export const MOTION = {
  // Exponential damping factor applied to raw scroll progress each frame.
  // Higher = snappier tracking of the wheel; lower = floatier, smoother.
  progressDamping: 3.2,
  // Seconds for the green highlight to fade in / out on step changes.
  highlightFadeIn: 0.7,
  highlightFadeOut: 0.45,
  // Seconds for a story card to enter / leave.
  cardIn: 0.6,
  cardOut: 0.35,
};

export const HIGHLIGHT = {
  color: 0x0055ff,
  opacity: 0.5,
  tintStrength: 0.5,
  emissiveBoost: 0.9,
  dimLevel: 0.45,
  edgeFeather: 0.1,
};

// Overridable so single-file/preview builds can inject a data: URI or CDN URL.
export const MODEL_URL =
  (typeof window !== 'undefined' && window.__MODEL_URL) || '/models/model.glb';
