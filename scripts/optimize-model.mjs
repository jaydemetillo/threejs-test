/**
 * Compresses a GLB for web delivery. This is the answer to "how do I ship a
 * 76MB Meshy/Blender/scanner export on a website" — run it once per model:
 *
 *   npm run optimize:model -- path/to/raw-export.glb
 *
 * Output goes to public/models/model.glb (override with a 2nd argument),
 * which is the path the site loads. What it does, via gltf-transform:
 *
 *   - dedup / prune / weld     strip redundant data
 *   - simplify (meshoptimizer) reduce triangle count (visually lossless-ish)
 *   - Meshopt compression      EXT_meshopt_compression on vertex streams —
 *                              decodes far faster in the browser than Draco;
 *                              the loader in src/scene.js is already wired
 *                              with MeshoptDecoder to read it
 *   - WebP textures @1024px    usually the biggest win on AI/scan exports,
 *                              whose 2–4K PNG textures dominate file size
 *
 * Typical result: 76MB -> single-digit MB. Tuning knobs below.
 */
import { execFileSync } from 'node:child_process';
import { statSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [input, output = 'public/models/model.glb', textureSize = '2048'] =
  process.argv.slice(2);

if (!input) {
  console.error('Usage: npm run optimize:model -- <input.glb> [output.glb] [textureSize]');
  process.exit(1);
}

if (!existsSync(input)) {
  console.error(`Input file not found: ${resolve(input)}`);
  console.error('Check the path — quote it if it contains spaces, and include the .glb extension.');
  process.exit(1);
}

const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(2);
const bin = resolve('node_modules/.bin/gltf-transform');

mkdirSync(dirname(resolve(output)), { recursive: true });

console.log(`Optimizing ${input} (${mb(input)} MB)…`);

execFileSync(
  bin,
  [
    'optimize',
    input,
    output,
    '--compress', 'meshopt',
    '--texture-compress', 'webp',
    '--texture-size', textureSize, // 1024 = smallest file, 2048 = crisp (default), 4096 = max detail
    '--simplify-error', '0.001', // raise (e.g. 0.01) for more aggressive decimation
  ],
  { stdio: 'inherit' }
);

console.log(`\nDone: ${output}`);
console.log(`  before  ${mb(input)} MB`);
console.log(`  after   ${mb(output)} MB`);
console.log('\nInspect details with: npx gltf-transform inspect ' + output);
