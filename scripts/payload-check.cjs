const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const cssPath = html.match(/<link rel="stylesheet" href="([^"]+\.css)">/);
const jsPath = html.match(/<script src="([^"]+\.js)" defer><\/script>/);
const css = cssPath && read(cssPath[1]);
const js = jsPath && read(jsPath[1]);
const bootstrap = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<link rel="stylesheet" href="[^"]+\.css">/);
const inlineBytes = bootstrap ? Buffer.byteLength(bootstrap[1]) : 0;
const cssBytes = css ? Buffer.byteLength(css) : 0;
const jsBytes = js ? Buffer.byteLength(js) : 0;
const total = cssBytes + jsBytes + inlineBytes;
/* Budget for the served (minified) CSS + JS + theme bootstrap, in raw bytes. The original 40 KB predates the arc reactor,
   tech objects and CV viewer; a typical gzip transfer is roughly a quarter of this (see gzipBytes in the output). */
const budget = 64 * 1024;
const gzipBytes = [css, js, bootstrap && bootstrap[1]].reduce((sum, part) => sum + (part ? zlib.gzipSync(part).length : 0), 0);
const failures = [];

if (!bootstrap) failures.push('theme bootstrap must run before the stylesheet');
if (!css) failures.push('one stylesheet must be linked on the critical path');
if (!js) failures.push('one deferred application script must be linked');
if (total > budget) failures.push(`critical CSS/JS ${total} bytes exceeds ${budget} bytes`);
if (/https?:\/\//i.test((html.match(/<script\b[^>]*src=[^>]*>/gi) || []).join(''))) failures.push('third-party scripts must not be on the page');
if (/assets\/(?:ironbot|assistant|os|site|fx-v2|motion-extras)\./i.test(html)) failures.push('legacy extras must stay off the critical path');

console.log(JSON.stringify({ cssBytes, jsBytes, inlineBytes, totalBytes: total, gzipBytes, budgetBytes: budget, failures }, null, 2));
if (failures.length) process.exitCode = 1;
