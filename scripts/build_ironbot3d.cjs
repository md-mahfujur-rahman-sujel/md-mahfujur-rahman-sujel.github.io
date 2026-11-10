/* Bundles the 3D Ironbot source (which imports bare 'three') into one minified ES
   module, because the site has no bundler and three ships no minified build. The
   output is committed like the SVG panels; run with --check to fail on drift (CI). */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'assets', 'ironbot3d.js');
const OUT = path.join(ROOT, 'assets', 'ironbot3d.bundle.js');

async function build() {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2020',
    legalComments: 'none',
    logLevel: 'silent',
    write: false
  });
  return result.outputFiles[0].contents;
}

(async () => {
  const bytes = await build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT) : null;
    const ok = current !== null && current.equals(Buffer.from(bytes));
    console.log(JSON.stringify({ ok, bytes: bytes.length, drift: ok ? null : '3D bundle is stale; run npm run build:3d' }));
    if (!ok) process.exitCode = 1;
    return;
  }
  fs.writeFileSync(OUT, bytes);
  console.log(JSON.stringify({ written: true, bytes: bytes.length }));
})().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
