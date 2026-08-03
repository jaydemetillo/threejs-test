import * as THREE from 'three';

/**
 * DEV-ONLY visual tuner. Loaded only when the page URL contains ?tune
 * (see src/main.js), so none of this ships in the normal bundle.
 *
 * What it gives you:
 *   - click anywhere on the model to move the green highlight there
 *   - sliders for the highlight box size, edge softness and look
 *   - a wireframe outline showing exactly where the box is
 *   - a live camera readout + "capture keyframe"
 *   - copy-paste-ready snippets for src/sections.js
 *
 * It edits the running scene directly; nothing is persisted. When a placement
 * looks right, copy the snippet into src/sections.js to make it permanent.
 */
export function initTuner() {
  const dbg = window.__scrolly;
  if (!dbg) return;

  const { scene3d, highlighter, rig, steps, control } = dbg;
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

  // ------------------------------------------------------------- click-to-place
  const raycaster = new THREE.Raycaster();
  scene3d.canvas.addEventListener('pointerdown', (e) => {
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
        width: 290px; max-height: calc(100vh - 24px); overflow-y: auto;
        background: rgba(18, 20, 24, 0.94); color: #e8e8ea;
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        border: 1px solid #33363d; border-radius: 8px; padding: 12px 13px 14px;
        backdrop-filter: blur(8px);
      }
      .tuner h2 { font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
        color: #2fbf71; margin: 0 0 8px; }
      .tuner h3 { font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
        color: #8b8f98; margin: 14px 0 6px; font-weight: 600; }
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
    </style>

    <h2>Highlight tuner</h2>

    <select id="tn-step"></select>
    <label class="check"><input type="checkbox" id="tn-place" checked>
      Click model to place green</label>
    <label class="check"><input type="checkbox" id="tn-freeze">
      Freeze scroll sequencing</label>
    <label class="check"><input type="checkbox" id="tn-wire" checked>
      Show box outline</label>

    <h3>Box size</h3>
    <label><span>Width</span><input type="range" id="tn-sx" min="0.02" max="1.2" step="0.01"><span class="val" id="tn-sx-v"></span></label>
    <label><span>Height</span><input type="range" id="tn-sy" min="0.02" max="1.2" step="0.01"><span class="val" id="tn-sy-v"></span></label>
    <label><span>Depth</span><input type="range" id="tn-sz" min="0.02" max="1.2" step="0.01"><span class="val" id="tn-sz-v"></span></label>

    <h3>Position (or just click the model)</h3>
    <label><span>Left/right</span><input type="range" id="tn-cx" min="0" max="1" step="0.01"><span class="val" id="tn-cx-v"></span></label>
    <label><span>Up/down</span><input type="range" id="tn-cy" min="0" max="1" step="0.01"><span class="val" id="tn-cy-v"></span></label>
    <label><span>Front/back</span><input type="range" id="tn-cz" min="0" max="1" step="0.01"><span class="val" id="tn-cz-v"></span></label>

    <h3>Look</h3>
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

    <h3>Paste into sections.js</h3>
    <pre id="tn-out"></pre>
    <button id="tn-copy">Copy region line</button>
    <pre id="tn-look"></pre>
    <button id="tn-lookcopy">Copy HIGHLIGHT block</button>

    <h3>Camera here</h3>
    <pre id="tn-cam"></pre>
    <button id="tn-camcopy">Copy keyframe line</button>

    <p class="hint">Scroll the page to move the camera; the panel follows.
      Shift-click also places the green.</p>
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

  $('tn-copy').addEventListener('click', () => copy(out.textContent, $('tn-copy'), 'Copy region line'));
  $('tn-lookcopy').addEventListener('click', () => copy(lookOut.textContent, $('tn-lookcopy'), 'Copy HIGHLIGHT block'));
  $('tn-camcopy').addEventListener('click', () => copy(camOut.textContent, $('tn-camcopy'), 'Copy keyframe line'));

  function copy(text, btn, label) {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied ✓';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = label; btn.classList.remove('ok'); }, 1200);
    });
  }

  // Live camera readout, sampled from the rig's current damped progress.
  function updateCamera() {
    const s = rig.sample(rig.progress);
    camOut.textContent =
      `{ p: ${rig.progress.toFixed(2)}, azimuth: ${Math.round(s.azimuth)}, ` +
      `polar: ${Math.round(s.polar)}, zoom: ${s.zoom.toFixed(2)} },`;
  }
  setInterval(updateCamera, 120);

  // The main loop only renders while the section is on screen; nudge a frame
  // after edits made while it is parked.
  function render() {
    scene3d.render();
  }

  refreshInputs();
  refreshLookOut();
  updateCamera();
  syncScene();

  console.log('[tuner] active — click the model to place the green highlight.');
}
