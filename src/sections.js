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

  /**
   * Where the model sits ON THE CANVAS, without changing the orbit angle.
   * [x, y] as a fraction of the viewport: [0.15, 0] puts it 15% of the
   * viewport width right of center, [0, -0.1] drops it 10% of the height.
   * Useful for keeping the subject clear of the story card.
   *
   * Implemented as a camera truck — the camera and its look target move
   * together, perpendicular to the view — so the model holds the SAME spot on
   * screen at every azimuth. Translating the model in world space instead
   * would make it swim across the frame as the camera orbits: pushed right at
   * the front, centered from the side, pushed left from the back. Because
   * both ends of the view move by the same vector, the framing shifts but
   * nothing about the orbit, the distance or the highlight math changes.
   */
  framingOffset: [0, 0],

  /**
   * Portrait rescue. `distanceScale` is a deliberately tight crop, and a wide
   * desktop viewport absorbs it — but a portrait phone does not: the side-on
   * beats measure 2–9% of the appliance past the screen edge, cutting off its
   * nose and tail.
   *
   * Below `belowAspect`, the crop eases out toward `minScale` in proportion to
   * how narrow the viewport is. At or above that aspect nothing changes at
   * all, so the desktop framing is untouched.
   *
   * Set `minScale` equal to `distanceScale` to disable and keep the tight crop
   * everywhere.
   */
  narrowCrop: {
    // Measured, not guessed: the crop is WORST at a square viewport (~11% of
    // the model off-screen at 1:1), not at the narrowest one. Below aspect 1
    // framedRadius() starts growing as the horizontal fov closes in, which
    // partly self-corrects; above it there is spare width. So the correction
    // has to start in landscape (1.3) and be at full strength by 1.0, rather
    // than starting at portrait.
    belowAspect: 1.3,
    fullyByAspect: 1.0,
    /**
     * Floor for the crop multiplier once the ramp is at full strength.
     *
     * Above 1.0 means "further out than the auto-framed fit" — deliberately.
     * 0.97 merely stopped the model being clipped, which still read as
     * edge-to-edge with ~4% of space around it; 1.10 leaves ~16%, against
     * ~25% on a landscape desktop. Because framedRadius() already folds in
     * the viewport's own aspect, one value produces the SAME relative margin
     * on every handset: a narrower phone is automatically pulled back further
     * in world units.
     */
    minScale: 1.1,
  },
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

/**
 * Post-processing (src/postfx.js). The bloom is thresholded, so it only picks
 * up the emissive boost the highlight shader adds to the focused region —
 * below the threshold the clay render is untouched. Set `intensity: 0` to
 * keep the chain alive but invisible; set `enabled: false` to skip it wholly.
 *
 * enabled: 'auto' runs it on the mid/high device tiers and skips it on low
 *          (see TIER_PROFILE in quality.js). true/false force the decision.
 */
export const POSTFX = {
  enabled: 'auto',
  // MSAA samples for the composer's buffers. Clamped down by device tier;
  // 0 disables it. This replaces the renderer's own antialias when the
  // composer is active, which is why it is not simply left at 0.
  multisampling: 4,
  bloom: {
    intensity: 0.85,
    // Raise to bloom less of the model, lower to bloom more. The clay body
    // sits well under 0.7 after tone mapping; the highlight's glow exceeds it.
    luminanceThreshold: 0.72,
    luminanceSmoothing: 0.08,
    radius: 0.72,
  },
  vignette: {
    offset: 0.32,
    darkness: 0.42,
  },
  /**
   * Screen-space ambient occlusion. On an untextured clay model this is the
   * single biggest readability win — it puts contact shading into every
   * crevice, which is what makes a diagram read as a solid object rather than
   * a flat silhouette.
   *
   * It is also the most expensive thing here: it needs a NormalPass, i.e. a
   * SECOND full geometry pass over ~1.5M triangles. That is why 'auto' means
   * high tier only, and why resolutionScale defaults to half — AO is low
   * frequency, so half-res is visually free and quarters the sampling cost.
   */
  ao: {
    enabled: 'auto',
    intensity: 1.7,
    radius: 0.09,
    bias: 0.03,
    resolutionScale: 0.5,
  },
};

/**
 * Mobile / performance budget (src/quality.js).
 *
 * Pixel ratio is the single biggest lever on phones: fragment shading
 * dominates on tile-based GPUs and scales with pixel count, so a 3x-DPR
 * phone rendering at 1.25 is doing ~6x less fragment work than at 3.
 * `adaptive` adds a closed loop on top — it measures real frame times and
 * scales resolution until the target framerate holds, which also covers
 * thermal throttling that no static device check can predict.
 */
export const QUALITY = {
  // Hard ceiling across all tiers; the per-tier caps in quality.js can only
  // lower it further. Above 2 there is essentially nothing left to see.
  maxPixelRatio: 2,
  // Floor for the adaptive loop, as an absolute pixel ratio.
  minPixelRatio: 0.75,
  adaptive: true,
  targetFps: 50,
  // Lowest multiplier the adaptive loop may apply to the tier's cap.
  minScale: 0.6,
  // Stop rendering entirely when the tab is backgrounded. The
  // IntersectionObserver in scrolly.js already handles off-screen; this
  // covers tab switches, which on mobile is where the battery actually goes.
  pauseWhenHidden: true,
};

// Overridable so single-file/preview builds can inject a data: URI or CDN URL.
export const MODEL_URL =
  (typeof window !== 'undefined' && window.__MODEL_URL) || '/models/model.glb';
