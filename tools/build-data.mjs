// Natural Earth (public domain) verisinden harita dosyalarını üretir.
//   tools/raw/ne_10m_admin_0_countries.geojson
//   tools/raw/ne_10m_admin_1_states_provinces.geojson
// Çıktı: data/europe.js, data/europe-regions.js (ana harita için hafif bölge sınırları), data/countries.js, data/c/<slug>.js (<script> ile yüklenir; file:// ile de çalışır)
// Kullanım: cd tools && npm install && npm run build-data
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data');
const RAW = path.join(import.meta.dirname, 'raw');
const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));

const a0 = read('ne_10m_admin_0_countries.geojson').features;
const a1 = read('ne_10m_admin_1_states_provinces.geojson').features;

// Avrupa görünümü kırpma kutusu [w, s, e, n]
const EUROPE_BBOX = [-32, 26, 85, 80];
// Not: genel görünüm (data/europe.js) kırpma kutusu daha geniştir ve tools/build-overview.mjs ile üretilir.

// Oyuna alınmayan bağımlı bölgeler (tek başlarına anlamlı bir ülke sayfası yok)
const SKIP = new Set(['ALD', 'JEY', 'GGY', 'IMN', 'GIB', 'FRO']);
// Avrupa dışında sayılan ama listeye eklenenler
const EXTRA = new Set(['TUR', 'CYP', 'CYN', 'GEO', 'AZE']);
// Natural Earth'ün Türkçe adı çok uzun olanlar için kısa ad
const NAME_OVERRIDE = { CYN: 'Kuzey Kıbrıs' };
// Ana kara parçasını bırak, uzak denizaşırı parçaları at [w, s, e, n]
const CROP = {
  FRA: [-6, 41, 10, 52],
  ESP: [-10.5, 35, 5, 44.5],
  PRT: [-10, 36.5, -6, 42.5],
  NOR: [4, 57, 32, 72],
  NLD: [3, 50.5, 7.5, 54],
};

// Kosova: 30 belediye yerine 7 il (belediye adm1_code -> il)
const KOS_DISTRICTS = {
  Priştine: [5902, 5898, 5900, 5903, 5901, 5899],
  Mitroviça: [5894, 5897, 5892, 5893, 5895, 5896],
  İpek: [5886, 5887, 5888],
  Yakova: [5890, 5889],
  Prizren: [5908, 5910, 5909, 5891, 5911],
  Gilan: [5904, 5905, 5907, 5906],
  Ferizovik: [5913, 5915, 5914, 5912],
};
// Kuzey Makedonya: 84 belediye yerine 8 planlama bölgesi
const MKD_DISTRICTS = {
  Üsküp: [2901, 2929, 2937, 2919, 2921, 2923, 2913, 2938, 2935, 2948, 5883, 2933, 2917, 2909, 2912, 2908, 2926],
  Vardar: [2915, 2930, 2927, 2936, 2931, 2946, 2907, 2914, 2922],
  Doğu: [3004, 3003, 3005, 2924, 2939, 3006, 3007, 2904, 2925, 2911, 2934],
  Güneydoğu: [2996, 2997, 2994, 2995, 2998, 3000, 2932, 2999, 2905, 2993],
  Pelagonya: [2896, 2897, 2928, 2941, 2942, 2945, 2947, 2903, 2894],
  Polog: [2960, 2961, 2959, 2962, 2918, 2963, 2955, 2957, 2958],
  Kuzeydoğu: [2943, 2920, 2910, 2940, 2906, 4846],
  Güneybatı: [2952, 2899, 2954, 2944, 2898, 2902, 4845, 2895, 2951, 2953, 2956, 2950, 2916],
};
const DISTRICTS = { KOS: KOS_DISTRICTS, MKD: MKD_DISTRICTS };

const tr = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', å: 'a', é: 'e' };
const slugify = (s) =>
  s.toLowerCase().replace(/[çğıöşüâîûåé]/g, (c) => tr[c]).replace(/i̇/g, 'i')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ringCenter = (ring) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
};
const inBox = ([x, y], [w, s, e, n]) => x >= w && x <= e && y >= s && y <= n;

// Poligon parçalarını kutuya göre süz; hiç parça kalmazsa null
function crop(geom, box) {
  if (!box) return geom;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const keep = polys.filter((p) => inBox(ringCenter(p[0]), box));
  if (!keep.length) return null;
  return keep.length === 1 ? { type: 'Polygon', coordinates: keep[0] } : { type: 'MultiPolygon', coordinates: keep };
}

function bboxOf(geom) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const walk = (c) => (typeof c[0] === 'number'
    ? ((x0 = Math.min(x0, c[0])), (x1 = Math.max(x1, c[0])), (y0 = Math.min(y0, c[1])), (y1 = Math.max(y1, c[1])))
    : c.forEach(walk));
  walk(geom.coordinates);
  return [x0, y0, x1, y1];
}

async function topo(fc, args, name = 'k') {
  const out = await mapshaper.applyCommands(
    `-i in.json -simplify ${args} keep-shapes -filter-fields id,name,l -o out.json format=topojson quantization=20000 target=*`,
    { 'in.json': JSON.stringify(fc) });
  return JSON.parse(out['out.json'].toString());
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'c'), { recursive: true });

// ---- Avrupa genel görünümü ----
const overview = {
  type: 'FeatureCollection',
  features: a0.map((f) => {
    const p = f.properties, id = p.ADM0_A3;
    const listed = (p.CONTINENT === 'Europe' || EXTRA.has(id)) && !SKIP.has(id);
    return { type: 'Feature', properties: { id, name: NAME_OVERRIDE[id] || p.NAME_TR || p.NAME, l: listed ? 1 : 0 }, geometry: f.geometry };
  }),
};
{
  const out = await mapshaper.applyCommands(
    `-i in.json -clip bbox=${EUROPE_BBOX.join(',')} -simplify interval=2000 keep-shapes -filter-fields id,name,l -o out.json format=topojson quantization=20000`,
    { 'in.json': JSON.stringify(overview) });
  fs.writeFileSync(path.join(OUT, 'europe.js'), `(window.HARITA_VERI=window.HARITA_VERI||{}).europe=${out['out.json']};`);
}

// ---- Ülke listesi + ülke başına bölge verisi ----
const manifest = [];
const light = {}; // slug -> hafif (Avrupa ana haritası) GeoJSON

// Türkiye: Natural Earth illerini mevcut SVG'nin il numaralarıyla (kayıt anahtarları) eşleştir
const norm = (s) => s.toLowerCase().replace(/[çğıöşüâî]/g, (c) => tr[c]).replace(/i̇/g, 'i').replace(/[^a-z]/g, '');
const TR_ALIAS = { icel: 'mersin', afyonkarahisar: 'afyon', kahramanmaras: 'kahramanmaras', sanliurfa: 'sanliurfa' };
const trIl = [...fs.readFileSync(path.join(ROOT, 'turkiye.html'), 'utf8')
  .matchAll(/<path class="il" data-number="(\d+)" data-name="([^"]+)"/g)].map((m) => [m[1], norm(m[2])]);
function turkeyId(p) {
  const names = [p.name, p.name_tr, p.name_en, p.name_alt].filter(Boolean).flatMap((x) => x.split('|')).map(norm);
  names.push(...names.map((n) => TR_ALIAS[n]).filter(Boolean));
  const hit = trIl.find(([, n]) => names.includes(n));
  return hit ? hit[0] : null;
}
const list = a0.filter((f) => {
  const id = f.properties.ADM0_A3;
  return (f.properties.CONTINENT === 'Europe' || EXTRA.has(id)) && !SKIP.has(id);
});

for (const c of list) {
  const id = c.properties.ADM0_A3;
  const name = NAME_OVERRIDE[id] || c.properties.NAME_TR || c.properties.NAME;
  const slug = slugify(name);
  const entry = { id, slug, name, regions: 0, file: null };

  const box = CROP[id];
  const seenIds = new Set();
  // Almanya: eyalet yerine ilçe/şehir (Kreis) düzeyi — Berlin, Dortmund gibi kreisfreie şehirler ayrı bölge
  let feats = a1.filter((f) => f.properties.adm0_a3 === id).map((f, i) => {
    const g = crop(f.geometry, box);
    if (!g) return null;
    const p = f.properties;
    let fid = id === 'TUR' ? turkeyId(p) : (p.adm1_code || `${id}-${i}`);
    if (fid === null) { console.warn('Türkiye eşleşmedi:', p.name); return null; }
    if (seenIds.has(fid)) fid = `${fid}#${i}`; // aynı kod iki bölgede: anahtarlar çakışmasın
    seenIds.add(fid);
    return { type: 'Feature', properties: { id: fid, name: p.name_tr || p.name || p.name_en, l: 0 }, geometry: g };
  }).filter(Boolean);
  if (id === 'GRC') feats.forEach((f) => { if (f.properties.name === 'Attika') f.properties.name = 'Atina'; }); // Attika bölgesi Atina olarak gösterilir

  if (DISTRICTS[id]) { // küçük belediyeleri il/bölge düzeyinde birleştir
    const dm = DISTRICTS[id];
    const inp = { type: 'FeatureCollection', features: feats.map((f) => ({ ...f, properties: { d: Object.keys(dm).find((k) => dm[k].includes(+String(f.properties.id).replace(/\D/g, ''))) } })) };
    if (inp.features.some((f) => !f.properties.d)) throw new Error(name + ': eşleşmeyen bölge');
    const out = await mapshaper.applyCommands('-i in.json -dissolve d -o out.json format=geojson', { 'in.json': JSON.stringify(inp) });
    feats = JSON.parse(out['out.json']).features.map((f) => ({ type: 'Feature', properties: { id: id + '-' + slugify(f.properties.d), name: f.properties.d, l: 0 }, geometry: f.geometry }));
  }
  if (feats.length <= 1) { // alt bölge verisi yok -> ülke tek parça
    feats = [{ type: 'Feature', properties: { id, name, l: 0 }, geometry: crop(c.geometry, box) }];
  }
  const fc = { type: 'FeatureCollection', features: feats };
  const [x0, y0, x1, y1] = bboxOf({ coordinates: feats.map((f) => f.geometry.coordinates) });
  const diagKm = Math.hypot((x1 - x0) * 111 * Math.cos(((y0 + y1) / 2) * Math.PI / 180), (y1 - y0) * 111);
  // Avrupa ana haritası için hafif sürüm
  light[slug] = { fc: { type: 'FeatureCollection', features: feats.map((f) => ({ type: 'Feature', properties: { id: f.properties.id }, geometry: f.geometry })) }, interval: Math.round(Math.min(4000, diagKm * 6)) };
  if (id === 'TUR') { // Türkiye'nin kendi (mevcut) 81 il SVG'si vardır; ayrı detay dosyası üretilmez
    entry.regions = 81;
    if (feats.length !== 81) console.warn('Türkiye bölge sayısı', feats.length);
    manifest.push(entry);
    continue;
  }
  const interval = Math.max(0.15, diagKm / 1800); // küçük ülkeler neredeyse hiç sadeleşmez
  const t = await topo(fc, `interval=${(interval * 1000).toFixed(0)}`);
  fs.writeFileSync(path.join(OUT, 'c', `${slug}.js`), `(window.HARITA_VERI=window.HARITA_VERI||{})[${JSON.stringify(slug)}]=${JSON.stringify(t)};`);
  entry.regions = feats.length;
  entry.file = `data/c/${slug}.js`;
  manifest.push(entry);
}

// ---- Avrupa ana haritası: tüm ülkelerin hafif bölge sınırları tek dosyada ----
{
  const inputs = {};
  for (const [slug, { fc, interval }] of Object.entries(light)) {
    const out = await mapshaper.applyCommands(
      `-i in.json -clip bbox=${EUROPE_BBOX.join(',')} -simplify interval=${interval} keep-shapes -filter-fields id -o out.json format=geojson`,
      { 'in.json': JSON.stringify(fc) });
    inputs[`${slug}.json`] = out['out.json'];
  }
  const out = await mapshaper.applyCommands(
    `-i ${Object.keys(inputs).join(' ')} combine-files -o out.json format=topojson quantization=100000`, inputs);
  const t = JSON.parse(out['out.json'].toString());
  fs.writeFileSync(path.join(OUT, 'europe-regions.js'), `(window.HARITA_VERI=window.HARITA_VERI||{}).regions=${JSON.stringify(t)};`);
  console.log('europe-regions', (fs.statSync(path.join(OUT, 'europe-regions.js')).size / 1024).toFixed(0), 'KB; nesneler:', Object.keys(t.objects).length);
}

manifest.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
fs.writeFileSync(path.join(OUT, 'countries.js'), `window.HARITA_ULKELER=${JSON.stringify(manifest)};`);

let total = 0;
for (const f of fs.readdirSync(path.join(OUT, 'c'))) total += fs.statSync(path.join(OUT, 'c', f)).size;
console.log(`${manifest.length} ülke, ülke dosyaları toplam ${(total / 1024).toFixed(0)} KB, europe ${(fs.statSync(path.join(OUT, 'europe.js')).size / 1024).toFixed(0)} KB`);
console.log(manifest.map((m) => `${m.slug}:${m.regions}`).join(' '));
