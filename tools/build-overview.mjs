// Yalnızca Avrupa genel görünümünü (data/europe.js) yeniden üretir; diğer veri dosyalarına dokunmaz.
// Kırpma kutusu kadrajdan belirgin şekilde geniştir: kartın kenarlarında verinin bittiği (çapraz/eğimli) iz kalmaz,
// Rusya/Orta Doğu/Kuzey Afrika kartın kenarından doğal biçimde taşar.
//   tools/raw/ne_10m_admin_0_countries.geojson gerekir (Natural Earth, kamu malı)
// Kullanım: cd tools && npm install && node build-overview.mjs
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(import.meta.dirname, 'raw');
const a0 = JSON.parse(fs.readFileSync(path.join(RAW, 'ne_10m_admin_0_countries.geojson'), 'utf8')).features;

// [w, s, e, n]
const OVERVIEW_BBOX = [-45, 0, 125, 89];
const SKIP = new Set(['ALD', 'JEY', 'GGY', 'IMN', 'GIB', 'FRO']);
const EXTRA = new Set(['TUR', 'CYP', 'CYN', 'GEO', 'AZE']);
const NAME_OVERRIDE = { CYN: 'Kuzey Kıbrıs' };

const overview = {
  type: 'FeatureCollection',
  features: a0.map((f) => {
    const p = f.properties, id = p.ADM0_A3;
    const listed = (p.CONTINENT === 'Europe' || EXTRA.has(id)) && !SKIP.has(id);
    return { type: 'Feature', properties: { id, name: NAME_OVERRIDE[id] || p.NAME_TR || p.NAME, l: listed ? 1 : 0 }, geometry: f.geometry };
  }),
};
const out = await mapshaper.applyCommands(
  `-i in.json -clip bbox=${OVERVIEW_BBOX.join(',')} -simplify interval=2000 keep-shapes -filter-fields id,name,l -o out.json format=topojson quantization=20000`,
  { 'in.json': JSON.stringify(overview) });
const file = path.join(ROOT, 'data', 'europe.js');
fs.writeFileSync(file, `(window.HARITA_VERI=window.HARITA_VERI||{}).europe=${out['out.json']};`);
console.log('europe.js', (fs.statSync(file).size / 1024).toFixed(0), 'KB');
