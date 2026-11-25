const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

/* GSAP is installed from npm and copied next to the site so GitHub Pages serves it itself (no third-party requests). */
function copyVendor() {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'assets', 'vendor');
  fs.mkdirSync(out, { recursive: true });
  for (const file of ['gsap.min.js', 'ScrollTrigger.min.js']) {
    fs.copyFileSync(path.join(root, 'node_modules', 'gsap', 'dist', file), path.join(out, file));
  }
}

async function build() {
  await Promise.all([
    esbuild.build({ entryPoints: ['assets/liquid.css'], outfile: 'assets/liquid.min.css', minify: true, legalComments: 'none' }),
    esbuild.build({ entryPoints: ['assets/liquid.js'], outfile: 'assets/liquid.min.js', minify: true, target: ['chrome90', 'edge90', 'firefox90', 'safari15'], legalComments: 'none' })
  ]);
  copyVendor();
}

build().catch(error => { console.error(error); process.exit(1); });
