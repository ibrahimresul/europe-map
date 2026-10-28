// Türkiye'nin 81 ilini (turkiye.html içindeki SVG yolları) ülke sayfası verisine çevirir:
//   data/c/turkiye.js  (düzlemsel koordinat; europe.js geoIdentity ile çizer)
// Kullanım: node tools/build-turkey.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'turkiye.html'), 'utf8');
const features = [];
for (const m of html.matchAll(/<path class="il" data-number="(\d+)" data-name="([^"]+)" d="([^"]+)"/g)) {
  const rings = m[3].split('M').map((s) => s.trim()).filter(Boolean).map((sub) => {
    const pts = [...sub.replace(/Z/g, '').matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((p) => [+p[1], +p[2]]);
    const first = pts[0], last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
    return [pts];
  });
  features.push({ type: 'Feature', properties: { id: m[1], name: m[2] }, geometry: { type: 'MultiPolygon', coordinates: rings } });
}
if (features.length !== 81) throw new Error('81 il bekleniyordu, bulunan: ' + features.length);
const out = '(window.HARITA_VERI=window.HARITA_VERI||{}).turkiye=' + JSON.stringify({ planar: true, features }) + ';\n';
fs.writeFileSync(path.join(ROOT, 'data', 'c', 'turkiye.js'), out);
console.log('data/c/turkiye.js', out.length, 'bayt,', features.length, 'il');
