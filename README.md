# NYT-Style 3D Scrollytelling — Three.js + GSAP

An editorial article page where the second "hero image" is a scroll-driven 3D
fire appliance. As the reader scrolls, the camera orbits the model **right
side → back → left side** at a constant distance, a colored highlight fades
onto the part being discussed (dimming the rest), and a story card slides in
for each beat. After the last beat the highlight fades out, rotation stops,
and the page releases to normal scrolling.

Built with **Vite + vanilla Three.js + GSAP ScrollTrigger**. No framework.

## Quick start

```bash
npm install
npm run dev        # local dev server (add ?tune for the visual tuner)
npm run build      # production build to dist/
npm run preview    # serve the production build
```

Deploying is a static-host job: `npm run build`, then serve `dist/`. Enable
gzip/brotli on the host — the model compresses well on the wire.

## Where everything is tuned

**`src/sections.js` is the single source of truth** for the whole experience:
camera keyframes, highlight regions and look, card copy, motion feel, render
mode, post-processing (`POSTFX`) and the mobile performance budget
(`QUALITY`). Most changes are one line in that file. Don't hand-edit the highlight
coordinates — use the visual tuner below.

## The model pipeline

| File | Role |
| --- | --- |
| `blender-model.glb` | **source of truth** — 43MB clean Blender export, committed, never served |
| `public/models/model.glb` | **what the site loads** — 8.3MB meshopt-packed build of the above |

The served file is packed with meshopt: identical triangle and vertex counts,
no simplification, no visual difference — just efficient encoding. Shipping
the raw 43MB file costs 30–60s on cellular, so **always serve the packed one**.
After replacing the Blender export, re-pack it:

```bash
npx gltf-transform meshopt blender-model.glb public/models/model.glb
```

The loader (`src/scene.js`) is wired with `MeshoptDecoder`, so it just works.

### If a model has textures

`scripts/optimize-model.mjs` is the heavier pipeline for textured exports
(AI-generated, photogrammetry) — dedup/prune/weld, meshoptimizer
simplification, meshopt compression, and WebP texture resizing:

```bash
npm run optimize:model -- path/to/export.glb [output.glb] [textureSize]
# e.g. 76MB -> ~5MB at 4096; 1024/2048 for smaller files
```

Inspect any GLB with `npx gltf-transform inspect file.glb`.

### Swapping in a different model

1. Re-pack it to `public/models/model.glb` (above).
2. Check orientation — the camera convention wants the model facing **+Z**
   (right side +X, back −Z). Correct it with `MODEL_TRANSFORM.rotationY` in
   `src/sections.js` (the current export needs `90`). No mesh editing needed.
3. Re-place the highlight regions with the tuner.

Centering, framing distance, and camera radius all adapt automatically — the
scene measures the model's bounding box at load.

### Render mode

`RENDER_MODE` in `src/sections.js`:

- `'clay'` *(current)* — strips texture maps and applies a neutral matte
  material (`CLAY`) plus a contact shadow. The editorial "diagram" look; the
  highlight color does the talking.
- `'textured'` — uses the model's own texture maps. Requires a GLB that still
  has them (the served file is texture-free, so re-pack from a textured
  source first).

## Tuning visually (`?tune`)

```bash
npm run dev
# then open http://localhost:5173/?tune
```

A panel appears top-right:

1. Scroll to the beat you want, tick **Freeze scroll sequencing** so the
   camera and highlight hold still.
2. **Click anywhere on the model** — the highlight jumps there. (Shift-click
   also works with click-to-place off.)
3. Drag **Width / Height / Depth** to size the box. A wireframe shows its
   exact bounds, including off-model.
4. **Color** (picker + hex field) and **Opacity** (100 = solid, 0 = invisible)
   set the highlight look, along with **Feather / Tint / Glow / Dim rest**.
5. **Copy region line** → paste over that step's `region:` line in
   `src/sections.js`. **Copy HIGHLIGHT block** → paste over the `HIGHLIGHT`
   block. Reload without `?tune` — it's permanent.

**Camera** does the same for angles. Two ways to use it:

- *Read-only:* scroll anywhere and copy the `{ p, azimuth, polar, zoom }` line
  into `CAMERA_KEYFRAMES`.
- *Free look:* tick **Free look** to orbit/dolly the model directly
  (yomotsu/camera-controls). The scroll rig is suspended while it's on, so the
  two never fight over the camera. Scroll the page to pick **p**, fly to the
  angle you want, then **Copy keyframe** — the panel inverts your actual camera
  position back into the rig's spherical convention.

Two details that matter when capturing keyframes:

- The azimuth is **unwrapped** against the current track rather than wrapped to
  `0..360`. `CAMERA_KEYFRAMES` sweeps 78° → 274° continuously; a raw reading
  would send the camera the long way round between beats.
- Truck/pan moves the orbit *target*. The rig always looks at the origin, so a
  keyframe captured with a drifted target won't reproduce — the panel warns you
  and **Recenter target** fixes it.

With free look on, a bare drag orbits, so shift-click (not plain click) places
the highlight.

**Post FX** tunes bloom and vignette live — the same sliders the shipped look
is built from — and emits a ready-to-paste `POSTFX` block. `enabled` and
`multisampling` are echoed from config rather than made editable, because both
are decided when the renderer is constructed.

**Performance** is a live HUD: FPS, frame time, draw calls, triangles, program
count, the current pixel ratio and the detected device tier. Below it, **Ratio**
overrides the resolution by hand (which switches the adaptive loop off), and
**Preview tier** applies another tier's pixel-ratio cap and post-FX budget so
you can see roughly what a budget phone gets without one. MSAA and the
renderer's own antialias are fixed at construction, so reload to test those.

Nothing the tuner does is persisted until you paste — experiment freely, and
reload to reset. Color, opacity and feather are **global** (all beats share
them); regions are per-beat.

The tuner is a dynamic import behind the URL check, so the normal page never
loads or even downloads it (`src/tuner.js`, its own build chunk).

### Coordinate cheat-sheet

Highlight regions live in normalized bounding-box space, `0..1` per axis, so
they survive a model swap:

| Axis | `0` | `1` |
| --- | --- | --- |
| x | left side | right side |
| y | ground | roof |
| z | rear | front |

`size` is the box's full extent as a fraction of the bounding box — `0.35`
width = 35% of the truck's width. The highlight is a **box in space**, not an
attachment to any mesh: everything inside is tinted, everything outside dims.
That's why it works on a single fused mesh with no named parts.

## Architecture

```
index.html                the article: hero, prose, duo-grid, scrolly section
src/style.css             typography + sticky stage + card styles
src/main.js               boot: load model -> hide loader -> init scrolly
src/scene.js              renderer, camera, lights, GLB load, auto-center + auto-frame
src/cameraRig.js          spherical orbit rig + keyframe sampling + scroll damping
src/highlights.js         box-region highlight shader injection + fade timelines
src/scrolly.js            ScrollTrigger wiring, story cards, render loop
src/sections.js           ⭐ ALL tuning lives here
src/postfx.js             bloom + vignette composer (pmndrs/postprocessing)
src/quality.js            device tiering + adaptive resolution scaling
src/cameraControls.js     dev-only free-look rig (camera-controls) + keyframe inverse
src/tuner.js              dev-only ?tune overlay
scripts/optimize-model.mjs              textured-model compression pipeline
scripts/generate-placeholder-model.mjs  low-poly stand-in truck
scripts/verify-scrolly.mjs              headless scroll-through + screenshots
```

### Scroll → camera

- `.scrolly` is 4 viewports tall (one per beat + one release beat); the stage
  inside is `position: sticky; top: 0`, so the canvas holds the viewport while
  scroll progress advances.
- One ScrollTrigger (`scrub: true`) maps section progress 0→1 to the rig.
- The rig **exponentially damps** raw progress every frame
  (`MOTION.progressDamping`), turning notchy wheel input into one continuous
  cinematic move. Cards and highlights key off the *damped* value, so they
  land when the camera does, not when the wheel moves.
- Camera position is spherical around the model center (world origin);
  `CAMERA_KEYFRAMES` define `{p, azimuth, polar, zoom}`, sampled with
  smoothstep easing per segment. `lookAt(origin)` every frame + a constant
  auto-framed radius is what keeps the model centered at a fixed distance.
  Azimuth: 0° front, 90° right, 180° back, 270° left.
- `Scene3D.framedRadius()` derives the radius from the bounding sphere and
  fov, corrected for narrow viewports, so framing survives any screen size.
  `CAMERA_SETTINGS.distanceScale` scales it globally; per-keyframe `zoom`
  stacks on top.

### The highlight shader

No mesh names required. `src/highlights.js` injects a chunk into every
material via `onBeforeCompile`: a world-space **box SDF** defines the region;
inside it the surface is tinted toward `HIGHLIGHT.color` and given an emissive
boost, outside it everything dims toward `HIGHLIGHT.dimLevel`. Scalar uniforms
(`uFocusStrength`, `uDimStrength`, `uFocusOpacity`) are GSAP-tweened on step
change — fade old out → move region → fade new in — which is what makes
transitions read as one motion. No postprocessing pass, so it stays cheap on
mobile.

### Post-processing

`POSTFX` in `src/sections.js`, implemented in `src/postfx.js` on
[pmndrs/postprocessing](https://github.com/pmndrs/postprocessing).

The chain is deliberately small — a thresholded bloom plus a vignette. The
point is to make the highlight's emissive boost actually *glow*: the shader
already pushes `totalEmissiveRadiance` on the focused region, and bloom is what
turns that from "brighter pixels" into light spilling off the part being
discussed. Everything under `luminanceThreshold` is untouched, so the clay
render is unchanged when no highlight is active.

- `enabled: 'auto'` runs it on the mid/high device tiers and skips it on low.
  `true`/`false` force the decision.
- Both effects are merged into **one** fullscreen pass. On tile-based mobile
  GPUs every extra fullscreen pass is a full framebuffer round-trip, which is
  why pmndrs/postprocessing is used here rather than three's own
  `EffectComposer` (one pass per effect).
- **No SMAA.** The composer's `multisampling` gives real MSAA on WebGL2, which
  is better and cheaper here, and SMAA ships its lookup textures as `data:`
  URIs — which the strict-CSP hosts this project targets refuse. When the
  composer is active the renderer's own `antialias` is switched off, since the
  composer bypasses the default framebuffer and that buffer would be allocated
  and never resolved to.

## Mobile & accessibility

Handled in code — worth knowing before changing layout:

- **Viewport units**: the stage uses `svh` (with `vh` fallback). Plain `100vh`
  makes the sticky stage jump when mobile Safari/Chrome collapse their
  toolbars mid-scroll — the classic scrollytelling bug.
- **Touch**: `touch-action: pan-y` on the canvas; no touch/drag handlers are
  attached in production, so vertical scrolling stays native. The experience
  is scroll-driven only — deliberately not drag-to-orbit.
- **Pixel ratio**: clamped and re-applied on **every** resize, so rotation,
  zoom, and moving between screens don't leave a stale value. The ceiling is
  per-tier (`quality.js`), not a flat 2 — see below.
- **Device tiering** (`src/quality.js`): a cheap probe (coarse pointer, core
  count, device memory, WebGL2) picks `low`/`mid`/`high`, which sets the
  pixel-ratio cap, the MSAA sample count, and whether post-processing runs.
- **Adaptive resolution**: on top of that, a closed loop measures real frame
  times and scales resolution until `QUALITY.targetFps` holds. Pixel ratio is
  the biggest lever on phones — fragment work dominates on tile-based GPUs and
  scales with pixel count — and it's the only one that also covers *thermal
  throttling*, which no static device check can predict. Drops are fast and
  large, recoveries slow and small, with a cooldown between changes so a single
  hitch can't start an oscillation.
- **Backgrounded tabs**: rendering stops on `visibilitychange`. The
  IntersectionObserver only knows about scroll position; a backgrounded tab
  still fires rAF on some platforms, which is pure battery drain.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, the camera tracks
  scroll directly instead of damping, cards cross-fade in place instead of
  sliding, highlight fades shorten, and the takeover zoom is skipped.
- **Render loop**: an IntersectionObserver pauses rendering when the section
  is off-screen.

## Verifying changes

```bash
npm run build && npm run preview &
node scripts/verify-scrolly.mjs http://localhost:4173 shots
```

Scrolls through every beat headlessly, screenshots each, fails on any console
error. In a sandbox, point `CHROMIUM_PATH` at a system Chromium. The script
compensates for slow software rendering (snaps damped progress, disables GSAP
lag smoothing) — real GPUs don't need that.
