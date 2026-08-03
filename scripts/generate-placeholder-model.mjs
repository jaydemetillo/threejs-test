/**
 * Generates a low-poly stand-in fire appliance GLB at public/models/model.glb.
 *
 * This exists so the whole scrollytelling experience can be built and tested
 * before the real (Meshy AI) firetruck export is dropped in. The truck faces
 * +Z, so its right side is +X, back is -Z, left is -X — matching the camera
 * azimuth convention in src/sections.js.
 *
 * Usage: npm run generate:placeholder
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { mkdirSync } from 'node:fs';

const doc = new Document();
doc.createBuffer();
const scene = doc.createScene('Scene');
doc.getRoot().setDefaultScene(scene);

// ---------------------------------------------------------------- materials
const material = (name, [r, g, b], rough, metal) =>
  doc
    .createMaterial(name)
    .setBaseColorFactor([r, g, b, 1])
    .setRoughnessFactor(rough)
    .setMetallicFactor(metal);

const RED = material('EngineRed', [0.68, 0.08, 0.08], 0.45, 0.15);
const SILVER = material('Silver', [0.72, 0.73, 0.75], 0.35, 0.85);
const DARK = material('Dark', [0.08, 0.08, 0.09], 0.9, 0.0);
const GLASS = material('Glass', [0.09, 0.12, 0.16], 0.15, 0.6);
const WHITE = material('White', [0.9, 0.9, 0.88], 0.5, 0.1);
const BLUE = material('SignalBlue', [0.1, 0.22, 0.8], 0.4, 0.2);

// ------------------------------------------------------------- shared geometry
const accessor = (type, array) =>
  doc.createAccessor().setType(type).setArray(array);

// Unit cube centered on the origin (24 verts, per-face normals).
function cubeGeometry() {
  const faces = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },   // +Z
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }, // -Z
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },  // +X
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },  // -X
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },  // +Y
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },  // -Y
  ];
  const pos = [];
  const nrm = [];
  const idx = [];
  faces.forEach(({ n, u, v }, f) => {
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(
        0.5 * (n[0] + su * u[0] + sv * v[0]),
        0.5 * (n[1] + su * u[1] + sv * v[1]),
        0.5 * (n[2] + su * u[2] + sv * v[2])
      );
      nrm.push(...n);
    }
    const o = f * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return {
    pos: accessor('VEC3', new Float32Array(pos)),
    nrm: accessor('VEC3', new Float32Array(nrm)),
    idx: accessor('SCALAR', new Uint16Array(idx)),
  };
}

// Unit cylinder: axis along X, x in [-0.5, 0.5], radius 1, with caps.
function cylinderGeometry(segments = 20) {
  const pos = [];
  const nrm = [];
  const idx = [];
  // side
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    const y = Math.cos(t);
    const z = Math.sin(t);
    pos.push(-0.5, y, z, 0.5, y, z);
    nrm.push(0, y, z, 0, y, z);
  }
  for (let s = 0; s < segments; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // caps
  for (const side of [-0.5, 0.5]) {
    const nx = Math.sign(side);
    const centerIndex = pos.length / 3;
    pos.push(side, 0, 0);
    nrm.push(nx, 0, 0);
    const ringStart = pos.length / 3;
    for (let s = 0; s <= segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      pos.push(side, Math.cos(t), Math.sin(t));
      nrm.push(nx, 0, 0);
    }
    for (let s = 0; s < segments; s++) {
      const a = ringStart + s;
      if (nx > 0) idx.push(centerIndex, a, a + 1);
      else idx.push(centerIndex, a + 1, a);
    }
  }
  return {
    pos: accessor('VEC3', new Float32Array(pos)),
    nrm: accessor('VEC3', new Float32Array(nrm)),
    idx: accessor('SCALAR', new Uint16Array(idx)),
  };
}

const cube = cubeGeometry();
const cyl = cylinderGeometry();

function part(name, geo, mat, translation, scale) {
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', geo.pos)
    .setAttribute('NORMAL', geo.nrm)
    .setIndices(geo.idx)
    .setMaterial(mat);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  const node = doc
    .createNode(name)
    .setMesh(mesh)
    .setTranslation(translation)
    .setScale(scale);
  scene.addChild(node);
  return node;
}

// ------------------------------------------------------------------- assembly
// Truck faces +Z. Dimensions in meters-ish. Ground at y = 0.
part('Chassis', cube, DARK, [0, 0.75, 0], [2.3, 0.5, 8.8]);
part('FrontBumper', cube, SILVER, [0, 0.7, 4.5], [2.4, 0.45, 0.35]);
part('Cab', cube, RED, [0, 2.0, 3.3], [2.4, 1.9, 2.2]);
part('Windshield', cube, GLASS, [0, 2.45, 4.36], [2.2, 0.75, 0.14]);
part('LightBarRed', cube, RED, [-0.38, 3.06, 3.3], [0.5, 0.2, 0.42]);
part('LightBarBlue', cube, BLUE, [0.38, 3.06, 3.3], [0.5, 0.2, 0.42]);
part('Body', cube, RED, [0, 2.1, -1.3], [2.5, 2.1, 5.6]);
part('LadderRack', cube, WHITE, [0, 3.32, -1.2], [0.95, 0.24, 5.2]);

// Roller-shutter locker doors — the surfaces the story highlights.
for (const [i, z] of [0.55, -1.25, -3.05].entries()) {
  part(`LockerRight${i + 1}`, cube, SILVER, [1.27, 2.05, z], [0.07, 1.5, 1.5]);
  part(`LockerLeft${i + 1}`, cube, SILVER, [-1.27, 2.05, z], [0.07, 1.5, 1.5]);
}

part('RearPumpPanel', cube, SILVER, [0, 1.95, -4.16], [1.95, 1.6, 0.16]);
part('RearStep', cube, DARK, [0, 0.62, -4.35], [2.3, 0.28, 0.5]);

for (const [i, z] of [3.0, -1.6, -2.95].entries()) {
  part(`WheelRight${i + 1}`, cyl, DARK, [1.12, 0.56, z], [0.38, 0.56, 0.56]);
  part(`WheelLeft${i + 1}`, cyl, DARK, [-1.12, 0.56, z], [0.38, 0.56, 0.56]);
}

// ---------------------------------------------------------------------- write
mkdirSync('public/models', { recursive: true });
const io = new NodeIO();
await io.write('public/models/model.glb', doc);
console.log('Wrote public/models/model.glb (placeholder fire appliance)');
