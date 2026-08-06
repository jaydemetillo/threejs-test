import * as THREE from 'three';
import { FreeLook } from './cameraControls.js';
import { TIER_PROFILE } from './quality.js';
import { POSTFX, CAMERA_SETTINGS } from './sections.js';

/**
 * DEV-ONLY visual tuner. Loaded only when the page URL contains ?tune
 * (see src/main.js), so none of this ships in the normal bundle — and neither
 * does camera-controls, which is imported only from here.
 *
 * What it gives you:
 *   - click anywhere on the model to move the highlight there
 *   - sliders for the highlight box size, edge softness and look
 *   - a wireframe outline showing exactly where the box is
 *   - free-look orbit (camera-controls) that inverts back into a keyframe line
 *   - live bloom / vignette controls
 *   - a performance HUD with adaptive-resolution state and a tier preview
 *   - copy-paste-ready snippets for src/sections.js
 *
 * It edits the running scene directly; nothing is persisted. When something
 * looks right, copy the snippet into src/sections.js to make it permanent.
 */
export function initTuner() {
  const dbg = window.__scrolly;
  if (!dbg) return;

  const { scene3d, highlighter, rig, steps, control, postfx, quality } = dbg;
  const bounds = scene3d.bounds;
  const size = bounds.getSize(new THREE.Vector3());

  // Working copy of each step's region, so edits are live but non-destructive.
  const regions = steps.map((s) => ({
    id: s.id,
    kicker: s.kicker,
    center: [...s.region.center],
    size: [...s.region.size],
  }));
  let active = 0;
  let frozen = false;

  // ---------------------------------------------------------------- wireframe
  const boxHelper = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false })
  );
  boxHelper.renderOrder = 999;
  scene3d.scene.add(boxHelper);

  function syncScene() {
    const r = regions[active];
    highlighter.applyRegion(r);
    // Mirror the region onto the wireframe.
    boxHelper.position.copy(scene3d.normalizedToWorld(r.center));
    boxHelper.scale.set(size.x * r.size[0], size.y * r.size[1], size.z * r.size[2]);
    // Force the highlight fully on so placement is always visible.
    highlighter.uniforms.uFocusStrength.value = 1;
    highlighter.uniforms.uDimStrength.value = 1;
    render();
  }

  // ------------------------------------------------------------- free-look rig
  // Suspends the scroll rig while active so the two never fight over
  // camera.position; see src/cameraControls.js.
  const freeLook = new FreeLook(scene3d, control, rig);
  // Expose it alongside the rest of the debug handle, so the free-look rig can
  // be driven from the console (and from the verification scripts).
  dbg.freeLook = freeLook;
  control.onFrame = (dt) => {
    if (freeLook.enabled && freeLook.update(dt)) render();
  };

  // ------------------------------------------------------------- click-to-place
  const raycaster = new THREE.Raycaster();
  scene3d.canvas.addEventListener('pointerdown', (e) => {
    // With free-look on, a bare drag is an orbit — require shift to place.
    if (freeLook.enabled && !e.shiftKey) return;
    if (!e.shiftKey && !placeMode.checked) return;
    const rect = scene3d.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, scene3d.camera);
    const hit = raycaster.intersectObject(scene3d.model, true)[0];
    if (!hit) return;
    // World hit point -> normalized bounding-box coords.
    const r = regions[active];
    r.center = [
      (hit.point.x - bounds.min.x) / size.x,
      (hit.point.y - bounds.min.y) / size.y,
      (hit.point.z - bounds.min.z) / size.z,
    ].map((v) => Math.min(1, Math.max(0, v)));
    refreshInputs();
    syncScene();
  });

  // -------------------------------------------------------------------- panel
  const panel = document.createElement('div');
  panel.className = 'tuner';
  panel.innerHTML = `
    <style>
      .tuner {
        position: fixed; top: 12px; right: 12px; z-index: 9999;
        width: 296px; max-height: calc(100vh - 24px); overflow-y: auto;
        background: rgba(18, 20, 24, 0.94); color: #e8e8ea;
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        border: 1px solid #33363d; border-radius: 8px; padding: 12px 13px 14px;
        backdrop-filter: blur(8px);
      }
      .tuner h2 { font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
        color: #2fbf71; margin: 0; }
      /* Header stays put when the body is collapsed away. */
      .tuner__bar { display: flex; align-items: center; justify-content: space-between;
        gap: 10px; margin-bottom: 8px; }
      .tuner__bar button { flex: 0 0 22px; width: 22px; height: 22px; padding: 0;
        font-size: 15px; line-height: 1; display: flex; align-items: center;
        justify-content: center; }
      .tuner.is-min { width: auto; }
      .tuner.is-min .tuner__bar { margin-bottom: 0; }
      .tuner.is-min .tuner__body { display: none; }
      .tuner details { border-top: 1px solid #26292f; margin-top: 10px; }
      .tuner details[open] { padding-bottom: 4px; }
      .tuner summary { font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
        color: #8b8f98; margin: 10px 0 6px; font-weight: 600; cursor: pointer;
        list-style: none; display: flex; align-items: center; gap: 6px; }
      .tuner summary::-webkit-details-marker { display: none; }
      .tuner summary::before { content: '▸'; font-size: 9px; transition: transform .15s; }
      .tuner details[open] > summary::before { transform: rotate(90deg); }
      .tuner label { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
      .tuner label span:first-child { flex: 0 0 62px; color: #b9bcc3; }
      .tuner input[type=range] { flex: 1; min-width: 0; accent-color: #2fbf71; }
      .tuner .val { flex: 0 0 34px; text-align: right;
        font-variant-numeric: tabular-nums; color: #e8e8ea; }
      .tuner select, .tuner button {
        width: 100%; background: #23262c; color: #e8e8ea; border: 1px solid #3a3e46;
        border-radius: 5px; padding: 6px 8px; font: inherit; cursor: pointer;
      }
      .tuner button:hover { background: #2c3038; border-color: #2fbf71; }
      .tuner button:disabled { opacity: .45; cursor: not-allowed; }
      .tuner .row { display: flex; gap: 6px; }
      .tuner .check { display: flex; align-items: center; gap: 7px; margin: 7px 0;
        color: #b9bcc3; cursor: pointer; }
      .tuner pre {
        background: #0e1013; border: 1px solid #2a2d34; border-radius: 5px;
        padding: 8px; margin: 6px 0 0; font-size: 10.5px; line-height: 1.5;
        white-space: pre-wrap; word-break: break-all; color: #a8e6c4;
      }
      .tuner .hint { color: #7d818a; font-size: 10.5px; margin: 6px 0 0; }
      .tuner .ok { color: #2fbf71; }
      .tuner .warn { color: #e8b339; font-size: 10.5px; margin: 6px 0 0; }
      .tuner .stats { display: grid; grid-template-columns: 1fr auto; gap: 1px 8px;
        font-size: 11px; margin: 4px 0 0; }
      .tuner .stats dt { color: #8b8f98; }
      .tuner .stats dd { margin: 0; text-align: right; color: #e8e8ea;
        font-variant-numeric: tabular-nums; }
      .tuner .stats dd.good { color: #2fbf71; }
      .tuner .stats dd.bad { color: #e8733f; }
    </style>

    <div class="tuner__bar">
      <h2>Three.js tuner</h2>
      <button id="tn-min" title="Minimize panel" aria-label="Minimize panel">–</button>
    </div>

    <div class="tuner__body">
    <select id="tn-step"></select>
    <label class="check"><input type="checkbox" id="tn-place" checked>
      Click model to place green</label>
    <label class="check"><input type="checkbox" id="tn-freeze">
      Freeze scroll sequencing</label>
    <label class="check"><input type="checkbox" id="tn-wire" checked>
      Show box outline</label>

    <details open>
      <summary>Box size</summary>
      <label><span>Width</span><input type="range" id="tn-sx" min="0.02" max="1.2" step="0.01"><span class="val" id="tn-sx-v"></span></label>
      <label><span>Height</span><input type="range" id="tn-sy" min="0.02" max="1.2" step="0.01"><span class="val" id="tn-sy-v"></span></label>
      <label><span>Depth</span><input type="range" id="tn-sz" min="0.02" max="1.2" step="0.01"><span class="val" id="tn-sz-v"></span></label>
    </details>

    <details open>
      <summary>Position (or click the model)</summary>
      <label><span>Left/right</span><input type="range" id="tn-cx" min="0" max="1" step="0.01"><span class="val" id="tn-cx-v"></span></label>
      <label><span>Up/down</span><input type="range" id="tn-cy" min="0" max="1" step="0.01"><span class="val" id="tn-cy-v"></span></label>
      <label><span>Front/back</span><input type="range" id="tn-cz" min="0" max="1" step="0.01"><span class="val" id="tn-cz-v"></span></label>
    </details>

    <details open>
      <summary>Look</summary>
      <label><span>Color</span>
        <input type="color" id="tn-color" style="flex:0 0 34px;height:24px;padding:1px;border:1px solid #3a3e46;border-radius:4px;background:#23262c;cursor:pointer">
        <input type="text" id="tn-hex" spellcheck="false" maxlength="7"
          style="flex:1;min-width:0;background:#23262c;color:#e8e8ea;border:1px solid #3a3e46;border-radius:4px;padding:4px 6px;font:inherit;font-variant-numeric:tabular-nums">
      </label>
      <label><span>Opacity</span><input type="range" id="tn-opacity" min="0" max="100" step="1"><span class="val" id="tn-opacity-v"></span></label>
      <label><span>Feather</span><input type="range" id="tn-feather" min="0" max="0.4" step="0.01"><span class="val" id="tn-feather-v"></span></label>
      <label><span>Tint</span><input type="range" id="tn-tint" min="0" max="1" step="0.05"><span class="val" id="tn-tint-v"></span></label>
      <label><span>Glow</span><input type="range" id="tn-glow" min="0" max="2.5" step="0.05"><span class="val" id="tn-glow-v"></span></label>
      <label><span>Dim rest</span><input type="range" id="tn-dim" min="0" max="1" step="0.05"><span class="val" id="tn-dim-v"></span></label>
    </details>

    <details open>
      <summary>Camera</summary>
      <label class="check"><input type="checkbox" id="tn-free">
        Free look (drag / scroll to orbit)</label>
      <pre id="tn-cam"></pre>
      <p class="warn" id="tn-drift" style="display:none"></p>
      <div class="row" style="margin-top:6px">
        <button id="tn-recenter">Recenter target</button>
        <button id="tn-camcopy">Copy keyframe</button>
      </div>
      <p class="hint">Scroll the page to pick <b>p</b>, free-look to pick the
        angle, then copy. The azimuth is unwrapped to continue the existing
        track rather than snapping back through 0°.</p>

      <span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8b8f98">Model on canvas</span>
      <label><span>Model X</span><input type="range" id="tn-fox" min="-0.5" max="0.5" step="0.01"><span class="val" id="tn-fox-v"></span></label>
      <label><span>Model Y</span><input type="range" id="tn-foy" min="-0.5" max="0.5" step="0.01"><span class="val" id="tn-foy-v"></span></label>
      <label><span>Distance</span><input type="range" id="tn-dist" min="0.5" max="1.6" step="0.01"><span class="val" id="tn-dist-v"></span></label>
      <pre id="tn-camset"></pre>
      <div class="row" style="margin-top:6px">
        <button id="tn-framereset">Reset framing</button>
        <button id="tn-camsetcopy">Copy CAMERA_SETTINGS</button>
      </div>
      <p class="hint">Moves the model around the canvas without changing the
        orbit — as a fraction of the viewport, so it frames the same on any
        screen. It holds the same spot at every angle, which a world-space
        nudge would not.</p>
    </details>

    <details>
      <summary>Post FX</summary>
      <div id="tn-fx-body">
        <label class="check"><input type="checkbox" id="tn-fx-on">
          Enable post-processing</label>
        <label><span>Bloom</span><input type="range" id="tn-bloom" min="0" max="3" step="0.05"><span class="val" id="tn-bloom-v"></span></label>
        <label><span>Threshold</span><input type="range" id="tn-thresh" min="0" max="1.2" step="0.01"><span class="val" id="tn-thresh-v"></span></label>
        <label><span>Smoothing</span><input type="range" id="tn-smooth" min="0" max="0.5" step="0.01"><span class="val" id="tn-smooth-v"></span></label>
        <label><span>Radius</span><input type="range" id="tn-radius" min="0" max="1" step="0.01"><span class="val" id="tn-radius-v"></span></label>
        <label><span>Vig offset</span><input type="range" id="tn-vigo" min="0" max="1" step="0.01"><span class="val" id="tn-vigo-v"></span></label>
        <label><span>Vig dark</span><input type="range" id="tn-vigd" min="0" max="1.5" step="0.01"><span class="val" id="tn-vigd-v"></span></label>
        <pre id="tn-fxout"></pre>
        <button id="tn-fxcopy">Copy POSTFX block</button>
      </div>
      <p class="hint" id="tn-fx-off" style="display:none">Post-processing is not
        active on this device tier. Set <b>POSTFX.enabled = true</b> in
        sections.js and reload to force it on.</p>
    </details>

    <details>
      <summary>Performance</summary>
      <dl class="stats">
        <dt>FPS</dt><dd id="tn-fps">–</dd>
        <dt>Frame</dt><dd id="tn-ms">–</dd>
        <dt>Draw calls</dt><dd id="tn-calls">–</dd>
        <dt>Triangles</dt><dd id="tn-tris">–</dd>
        <dt>Programs</dt><dd id="tn-progs">–</dd>
        <dt>Pixel ratio</dt><dd id="tn-dpr">–</dd>
        <dt>Device tier</dt><dd id="tn-tier">–</dd>
        <dt>Auto rescales</dt><dd id="tn-rescales">–</dd>
      </dl>
      <label class="check"><input type="checkbox" id="tn-adaptive" checked>
        Adaptive resolution</label>
      <label><span>Ratio</span><input type="range" id="tn-scale" min="0.4" max="1" step="0.05"><span class="val" id="tn-scale-v"></span></label>
      <span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8b8f98">Preview tier</span>
      <select id="tn-tiersel" style="margin-top:4px">
        <option value="">— current —</option>
        <option value="low">low (budget phone)</option>
        <option value="mid">mid (good phone)</option>
        <option value="high">high (desktop)</option>
      </select>
      <p class="hint">Preview applies that tier's pixel-ratio cap and post-FX
        budget live. MSAA and the renderer's antialias are fixed at construction,
        so reload to test those.</p>
    </details>

    <details open>
      <summary>Paste into sections.js</summary>
      <pre id="tn-out"></pre>
      <button id="tn-copy">Copy region line</button>
      <pre id="tn-look"></pre>
      <button id="tn-lookcopy">Copy HIGHLIGHT block</button>
    </details>
    </div>
  `;
  document.body.appendChild(panel);

  const $ = (id) => panel.querySelector('#' + id);
  const stepSel = $('tn-step');
  const placeMode = $('tn-place');
  const out = $('tn-out');
  const camOut = $('tn-cam');

  steps.forEach((s, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${i + 1}. ${s.kicker}`;
    stepSel.appendChild(o);
  });

  const sliders = {
    sx: $('tn-sx'), sy: $('tn-sy'), sz: $('tn-sz'),
    cx: $('tn-cx'), cy: $('tn-cy'), cz: $('tn-cz'),
  };

  function refreshInputs() {
    const r = regions[active];
    sliders.sx.value = r.size[0]; sliders.sy.value = r.size[1]; sliders.sz.value = r.size[2];
    sliders.cx.value = r.center[0]; sliders.cy.value = r.center[1]; sliders.cz.value = r.center[2];
    for (const k of Object.keys(sliders)) $(`tn-${k}-v`).textContent = (+sliders[k].value).toFixed(2);
    const n = (v) => +v.toFixed(2);
    out.textContent =
      `region: { center: [${r.center.map(n).join(', ')}], ` +
      `size: [${r.size.map(n).join(', ')}] },`;
  }

  for (const [key, el] of Object.entries(sliders)) {
    el.addEventListener('input', () => {
      const r = regions[active];
      const target = key[0] === 's' ? r.size : r.center;
      target[{ x: 0, y: 1, z: 2 }[key[1]]] = +el.value;
      refreshInputs();
      syncScene();
    });
  }

  stepSel.addEventListener('change', () => {
    active = +stepSel.value;
    refreshInputs();
    syncScene();
  });

  $('tn-freeze').addEventListener('change', (e) => {
    frozen = e.target.checked;
    control.suspendStepSync = frozen;
    if (frozen) syncScene();
  });

  $('tn-wire').addEventListener('change', (e) => {
    boxHelper.visible = e.target.checked;
    render();
  });

  // Look controls write straight to the live uniforms. Feather is stored on
  // the uniform in world units, so track the normalized fraction here for
  // the config snippet.
  const u = highlighter.uniforms;
  let featherFrac = 0.1;
  const lookOut = $('tn-look');

  function refreshLookOut() {
    const n = (v) => +(+v).toFixed(2);
    lookOut.textContent =
      `export const HIGHLIGHT = {\n` +
      `  color: 0x${u.uFocusColor.value.getHexString()},\n` +
      `  opacity: ${n(u.uFocusOpacity.value)},\n` +
      `  tintStrength: ${n(u.uTintStrength.value)},\n` +
      `  emissiveBoost: ${n(u.uEmissiveBoost.value)},\n` +
      `  dimLevel: ${n(u.uDimLevel.value)},\n` +
      `  edgeFeather: ${n(featherFrac)},\n` +
      `};`;
  }

  const look = [
    ['tn-opacity', (v) => { u.uFocusOpacity.value = v / 100; }, () => Math.round(u.uFocusOpacity.value * 100), 0],
    ['tn-feather', (v) => { featherFrac = v; u.uFocusFeather.value = scene3d.boundingRadius * v; }, () => featherFrac, 2],
    ['tn-tint', (v) => { u.uTintStrength.value = v; }, () => u.uTintStrength.value, 2],
    ['tn-glow', (v) => { u.uEmissiveBoost.value = v; }, () => u.uEmissiveBoost.value, 2],
    ['tn-dim', (v) => { u.uDimLevel.value = v; }, () => u.uDimLevel.value, 2],
  ];
  for (const [id, apply, initial, decimals] of look) {
    const el = $(id);
    el.value = initial();
    $(`${id}-v`).textContent = (+el.value).toFixed(decimals);
    el.addEventListener('input', () => {
      apply(+el.value);
      $(`${id}-v`).textContent = (+el.value).toFixed(decimals);
      refreshLookOut();
      render();
    });
  }

  // Color: native picker + hex text field, kept in sync both ways. Wireframe
  // outline follows so it always matches the highlight.
  const colorEl = $('tn-color');
  const hexEl = $('tn-hex');
  function setColor(hex, from) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    u.uFocusColor.value.set(hex);
    boxHelper.material.color.set(hex);
    if (from !== colorEl) colorEl.value = hex;
    if (from !== hexEl) hexEl.value = hex;
    refreshLookOut();
    render();
  }
  colorEl.value = hexEl.value = '#' + u.uFocusColor.value.getHexString();
  colorEl.addEventListener('input', () => setColor(colorEl.value, colorEl));
  hexEl.addEventListener('input', () => {
    const v = hexEl.value.startsWith('#') ? hexEl.value : '#' + hexEl.value;
    setColor(v, hexEl);
  });

  // ---------------------------------------------------------------- minimize
  const minBtn = $('tn-min');
  minBtn.addEventListener('click', () => {
    const min = panel.classList.toggle('is-min');
    minBtn.textContent = min ? '+' : '–';
    minBtn.title = minBtn.ariaLabel = min ? 'Expand panel' : 'Minimize panel';
  });

  // ------------------------------------------------------------------- camera
  $('tn-free').addEventListener('change', (e) => {
    freeLook.setEnabled(e.target.checked);
    updateCamera();
  });
  $('tn-recenter').addEventListener('click', () => freeLook.recenter());

  // Framing: writes straight into the live CAMERA_SETTINGS object, which the
  // rig re-reads every frame — so there is nothing to re-apply.
  const camSetOut = $('tn-camset');
  function refreshCamSet() {
    const [x, y] = CAMERA_SETTINGS.framingOffset;
    camSetOut.textContent =
      `export const CAMERA_SETTINGS = {\n` +
      `  distanceScale: ${CAMERA_SETTINGS.distanceScale.toFixed(2)},\n` +
      `  framingOffset: [${x.toFixed(2)}, ${y.toFixed(2)}],\n` +
      `};`;
  }
  const framing = [
    ['tn-fox', (v) => { CAMERA_SETTINGS.framingOffset[0] = v; }, () => CAMERA_SETTINGS.framingOffset[0]],
    ['tn-foy', (v) => { CAMERA_SETTINGS.framingOffset[1] = v; }, () => CAMERA_SETTINGS.framingOffset[1]],
    ['tn-dist', (v) => { CAMERA_SETTINGS.distanceScale = v; }, () => CAMERA_SETTINGS.distanceScale],
  ];
  for (const [id, apply, initial] of framing) {
    const el = $(id);
    el.value = initial();
    $(`${id}-v`).textContent = (+el.value).toFixed(2);
    el.addEventListener('input', () => {
      apply(+el.value);
      $(`${id}-v`).textContent = (+el.value).toFixed(2);
      refreshCamSet();
      // Free-look owns the camera outright, so the rig won't re-apply framing
      // until it is switched back off.
      if (!freeLook.enabled) rig.update(1 / 60);
      render();
    });
  }
  $('tn-framereset').addEventListener('click', () => {
    CAMERA_SETTINGS.framingOffset[0] = 0;
    CAMERA_SETTINGS.framingOffset[1] = 0;
    for (const [id, , initial] of framing) {
      $(id).value = initial();
      $(`${id}-v`).textContent = (+$(id).value).toFixed(2);
    }
    refreshCamSet();
    if (!freeLook.enabled) rig.update(1 / 60);
    render();
  });
  $('tn-camsetcopy').addEventListener('click', () =>
    copy(camSetOut.textContent, $('tn-camsetcopy'), 'Copy CAMERA_SETTINGS'));

  // ------------------------------------------------------------------ post fx
  const fxOut = $('tn-fxout');
  if (postfx && postfx.composer) {
    const v = postfx.values();
    const fx = [
      ['tn-fx-on'],
      ['tn-bloom', (x) => { postfx.bloomIntensity = x; }, v.intensity, 2],
      ['tn-thresh', (x) => { postfx.bloomThreshold = x; }, v.luminanceThreshold, 2],
      ['tn-smooth', (x) => { postfx.bloomSmoothing = x; }, v.luminanceSmoothing, 2],
      ['tn-radius', (x) => { postfx.bloomRadius = x; }, v.radius, 2],
      ['tn-vigo', (x) => { postfx.vignetteOffset = x; }, v.offset, 2],
      ['tn-vigd', (x) => { postfx.vignetteDarkness = x; }, v.darkness, 2],
    ];
    for (const [id, apply, initial, decimals] of fx.slice(1)) {
      const el = $(id);
      el.value = initial;
      $(`${id}-v`).textContent = (+el.value).toFixed(decimals);
      el.addEventListener('input', () => {
        apply(+el.value);
        $(`${id}-v`).textContent = (+el.value).toFixed(decimals);
        refreshFxOut();
        render();
      });
    }
    const onEl = $('tn-fx-on');
    onEl.checked = postfx.active;
    onEl.addEventListener('change', () => {
      postfx.setEnabled(onEl.checked);
      render();
    });
    $('tn-fxcopy').addEventListener('click', () =>
      copy(fxOut.textContent, $('tn-fxcopy'), 'Copy POSTFX block'));
  } else {
    $('tn-fx-body').style.display = 'none';
    $('tn-fx-off').style.display = '';
  }

  function refreshFxOut() {
    if (!postfx || !postfx.composer) return;
    const v = postfx.values();
    const n = (x) => +x.toFixed(2);
    // enabled/multisampling are not live-editable (they decide renderer
    // construction), so echo what is actually configured rather than a guess.
    const enabled = typeof POSTFX.enabled === 'string'
      ? `'${POSTFX.enabled}'`
      : String(POSTFX.enabled);
    fxOut.textContent =
      `export const POSTFX = {\n` +
      `  enabled: ${enabled},\n` +
      `  multisampling: ${POSTFX.multisampling},\n` +
      `  bloom: {\n` +
      `    intensity: ${n(v.intensity)},\n` +
      `    luminanceThreshold: ${n(v.luminanceThreshold)},\n` +
      `    luminanceSmoothing: ${n(v.luminanceSmoothing)},\n` +
      `    radius: ${n(v.radius)},\n` +
      `  },\n` +
      `  vignette: { offset: ${n(v.offset)}, darkness: ${n(v.darkness)} },\n` +
      `};`;
  }

  // -------------------------------------------------------------- performance
  const scaleEl = $('tn-scale');
  scaleEl.value = scene3d.pixelRatioScale;
  $('tn-scale-v').textContent = (+scaleEl.value).toFixed(2);
  scaleEl.addEventListener('input', () => {
    // Manual override switches the closed loop off; the checkbox turns it back on.
    quality.setScale(+scaleEl.value);
    $('tn-adaptive').checked = false;
    $('tn-scale-v').textContent = (+scaleEl.value).toFixed(2);
    render();
  });
  $('tn-adaptive').addEventListener('change', (e) => {
    if (e.target.checked) quality.resume();
    else quality.enabled = false;
  });
  $('tn-tiersel').addEventListener('change', (e) => {
    const tier = e.target.value;
    if (!tier) {
      scene3d.applyPixelRatio(scene3d.tier, 1);
    } else {
      scene3d.applyPixelRatio(tier, 1);
      if (postfx && postfx.composer) {
        postfx.setEnabled(TIER_PROFILE[tier].postfx);
        $('tn-fx-on').checked = postfx.active;
      }
    }
    render();
  });

  function refreshStats() {
    const info = scene3d.renderer.info;
    const fps = quality.fps;
    const fpsEl = $('tn-fps');
    fpsEl.textContent = fps ? fps.toFixed(0) : '–';
    fpsEl.className = fps >= 50 ? 'good' : fps && fps < 30 ? 'bad' : '';
    $('tn-ms').textContent = quality.frameMs ? quality.frameMs.toFixed(1) + ' ms' : '–';
    $('tn-calls').textContent = info.render.calls;
    $('tn-tris').textContent = info.render.triangles.toLocaleString();
    $('tn-progs').textContent = info.programs ? info.programs.length : '–';
    $('tn-dpr').textContent = scene3d.renderer.getPixelRatio().toFixed(2);
    $('tn-tier').textContent = scene3d.tier;
    $('tn-rescales').textContent = quality.changes;
    // Mirror closed-loop changes back into the slider.
    if (quality.enabled) {
      scaleEl.value = scene3d.pixelRatioScale;
      $('tn-scale-v').textContent = scene3d.pixelRatioScale.toFixed(2);
    }
  }

  // ------------------------------------------------------------------- copies
  $('tn-copy').addEventListener('click', () => copy(out.textContent, $('tn-copy'), 'Copy region line'));
  $('tn-lookcopy').addEventListener('click', () => copy(lookOut.textContent, $('tn-lookcopy'), 'Copy HIGHLIGHT block'));
  $('tn-camcopy').addEventListener('click', () => copy(camOut.textContent, $('tn-camcopy'), 'Copy keyframe'));

  function copy(text, btn, label) {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied ✓';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = label; btn.classList.remove('ok'); }, 1200);
    });
  }

  /**
   * Live camera readout. Under free-look the numbers are inverted back out of
   * the actual camera position (see FreeLook.toKeyframe); otherwise they come
   * straight off the rig's keyframe track.
   */
  function updateCamera() {
    const s = freeLook.enabled
      ? freeLook.toKeyframe(rig.sample(rig.progress).azimuth)
      : rig.sample(rig.progress);
    camOut.textContent =
      `{ p: ${rig.progress.toFixed(2)}, azimuth: ${Math.round(s.azimuth)}, ` +
      `polar: ${Math.round(s.polar)}, zoom: ${s.zoom.toFixed(2)} },`;

    // A drifted orbit target makes the captured keyframe unreproducible: the
    // rig always looks at the origin.
    const driftEl = $('tn-drift');
    const drift = freeLook.enabled ? freeLook.targetDrift() : 0;
    if (drift > 0.02) {
      driftEl.style.display = '';
      driftEl.textContent =
        `⚠ Orbit target is ${(drift * 100).toFixed(0)}% of the model radius off ` +
        `center — the rig always looks at the origin, so this angle won't ` +
        `reproduce. Recenter before copying.`;
    } else {
      driftEl.style.display = 'none';
    }
  }
  setInterval(() => { updateCamera(); refreshStats(); }, 120);

  // The main loop only renders while the section is on screen; nudge a frame
  // after edits made while it is parked.
  function render() {
    scene3d.render(1 / 60);
  }

  refreshInputs();
  refreshLookOut();
  refreshFxOut();
  refreshCamSet();
  updateCamera();
  refreshStats();
  syncScene();

  console.log('[tuner] active — click the model to place the highlight, or ' +
    'enable Free look to author camera keyframes.');
}
