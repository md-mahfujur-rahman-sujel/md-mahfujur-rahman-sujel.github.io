const esbuild = require('esbuild');

async function build() {
  await Promise.all([
    esbuild.build({ entryPoints: ['assets/liquid.css'], outfile: 'assets/liquid.min.css', minify: true, legalComments: 'none' }),
    esbuild.build({ entryPoints: ['assets/liquid.js'], outfile: 'assets/liquid.min.js', minify: true, target: ['chrome90', 'edge90', 'firefox90', 'safari15'], legalComments: 'none' })
  ]);
}

build().catch(error => { console.error(error); process.exit(1); });
