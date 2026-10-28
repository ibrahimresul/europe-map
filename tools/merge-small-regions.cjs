// build-data'dan SONRA çalıştırılır: büyük bölgelerin içinde/arasında kalan küçük bölgeleri (ör. Macaristan'ın "il hakkına sahip şehirleri")
// sınırı en çok paylaştığı komşuyla birleştirir. Başkentler birleştirilmez. Gürcistan'a Batum eklenir.
// Kullanım: cd tools && node merge-small-regions.cjs   (data/c/*.js, data/europe-regions.js, data/countries.js, data/merge-map.js yazar)
const fs = require('fs');
const path = require('path');
const d3 = require('d3');
const topojson = require('topojson-client');
const { adjacency, isCapital } = require('./lib-merge.cjs');

const DATA = path.resolve(__dirname, '..', 'data');
const FR = 0.1;         // küçük: ülkenin %75'lik bölge alanının %10'undan küçük
const SHARE = 0.6;      // ve sınırının en az %60'ı tek bir komşuyla ortak ("arasında kalan")
// bazı ülkelerde küçük şehir/belediye çokluğu var: eşikler gevşetilir [alan oranı, ortak sınır payı]
const OVERRIDE = { macaristan: [0.2, 0.25], letonya: [0.15, 0.3], slovenya: [0.15, 0.3], azerbaycan: [0.1, 0.45] };
const KEEP = new Set(['Nahçıvan', 'Appenzell Innerrhoden']);   // gerçek (ayrık/yarım) bölgeler birleştirilmez
// Batum şehri (yaklaşık sınır; Acara'dan kesilir) [boylam, enlem]
const BATUM = [[41.45, 41.55], [41.45, 41.72], [41.69, 41.72], [41.72, 41.69], [41.74, 41.64], [41.71, 41.60], [41.62, 41.57], [41.45, 41.55]];

(async () => {
  const mapshaper = (await import('mapshaper')).default;
  const read = (f, key) => { global.window = { HARITA_VERI: {} }; eval(fs.readFileSync(f, 'utf8')); return key ? global.window.HARITA_VERI[key] : null; };
  global.window = {}; eval(fs.readFileSync(path.join(DATA, 'countries.js'), 'utf8'));
  const countries = global.window.HARITA_ULKELER;
  const mergeMap = {};      // birleşen id -> hedef id
  const counts = {};
  const batumPoly = JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [BATUM] } });

  async function topo(fc, q) {
    const out = await mapshaper.applyCommands(`-i in.json -o out.json format=topojson quantization=${q}`, { 'in.json': JSON.stringify(fc) });
    return JSON.parse(out['out.json'].toString());
  }
  async function carveBatum(adjara) {   // Acara özelliğini Batum ve kalan Acara olarak ikiye ayırır
    const fc = JSON.stringify({ type: 'FeatureCollection', features: [adjara] });
    const bat = await mapshaper.applyCommands('-i in.json -clip poly.json -o out.json format=geojson', { 'in.json': fc, 'poly.json': batumPoly });
    const rest = await mapshaper.applyCommands('-i in.json -erase poly.json -o out.json format=geojson', { 'in.json': fc, 'poly.json': batumPoly });
    const b = JSON.parse(bat['out.json'].toString()).features[0], r = JSON.parse(rest['out.json'].toString()).features[0];
    return { batum: { type: 'Feature', properties: { id: 'GEO-BATUM', name: 'Batum', l: 0 }, geometry: b.geometry }, adjara: { type: 'Feature', properties: adjara.properties, geometry: r.geometry } };
  }

  const lightIn = read(path.join(DATA, 'europe-regions.js'), 'regions');
  const lightFiles = {};

  for (const c of countries) {
    if (c.slug === 'turkiye') { counts[c.slug] = c.regions; continue; }
    const t = read(path.join(DATA, 'c', c.slug + '.js'), c.slug);
    const objName = Object.keys(t.objects)[0], obj = t.objects[objName], geoms = obj.geometries;
    const feats = topojson.feature(t, obj).features;
    const A = feats.map((f) => d3.geoArea(f) * 6371 * 6371);
    const sorted = [...A].sort((a, b) => a - b), p75 = sorted[Math.floor(sorted.length * 0.75)];
    const { w, own } = adjacency(t, geoms);
    const parent = feats.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const small = [];
    feats.forEach((f, i) => {
      const [fr, share] = OVERRIDE[c.slug] || [FR, SHARE];
      if (A[i] >= fr * p75 || isCapital(c.slug, f) || KEEP.has(f.properties.name)) return;
      if (!w[i].size) return;
      const best = [...w[i].entries()].sort((a, b) => b[1] - a[1])[0];
      if (best[1] / own[i] >= share) small.push([i, best[0]]);
    });
    small.sort((a, b) => A[a[0]] - A[b[0]]);
    small.forEach(([i, j]) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; });
    // her kümenin temsilcisi: en büyük üye (kimliği ve adı o kalır)
    const groups = new Map();
    feats.forEach((_, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(i); });
    let outFeats = [];
    groups.forEach((members) => {
      const rep = members.reduce((m, i) => (A[i] > A[m] ? i : m), members[0]);
      const geometry = members.length === 1 ? feats[rep].geometry : topojson.merge(t, members.map((i) => geoms[i]));
      members.forEach((i) => { if (i !== rep) mergeMap[feats[i].properties.id] = feats[rep].properties.id; });
      outFeats.push({ type: 'Feature', properties: feats[rep].properties, geometry });
    });
    outFeats.sort((a, b) => 0);
    if (c.slug === 'gurcistan') {
      const ix = outFeats.findIndex((f) => f.properties.id === 'GEO-3027');
      const { batum, adjara } = await carveBatum(outFeats[ix]);
      outFeats[ix] = adjara; outFeats.push(batum);
    }
    counts[c.slug] = outFeats.length;
    const nt = await topo({ type: 'FeatureCollection', features: outFeats }, 20000);
    fs.writeFileSync(path.join(DATA, 'c', c.slug + '.js'), `(window.HARITA_VERI=window.HARITA_VERI||{})[${JSON.stringify(c.slug)}]=${JSON.stringify(nt)};`);
    if (feats.length !== outFeats.length) console.log(c.slug, feats.length, '->', outFeats.length);
  }

  // hafif (Avrupa ana haritası) bölge verisi: aynı birleştirmeler
  for (const c of countries) {
    const lobj = lightIn.objects[c.slug];
    if (!lobj) continue;
    const groups = new Map();
    lobj.geometries.forEach((g) => { const rep = mergeMap[g.properties.id] || g.properties.id; (groups.get(rep) || groups.set(rep, []).get(rep)).push(g); });
    let feats = [];
    groups.forEach((gs, rep) => {
      const geometry = gs.length === 1 ? topojson.feature(lightIn, { type: 'GeometryCollection', geometries: [gs[0]] }).features[0].geometry : topojson.merge(lightIn, gs);
      feats.push({ type: 'Feature', properties: { id: rep }, geometry });
    });
    if (c.slug === 'gurcistan') {
      const ix = feats.findIndex((f) => f.properties.id === 'GEO-3027');
      const { batum, adjara } = await carveBatum(feats[ix]);
      feats[ix] = adjara; feats.push({ type: 'Feature', properties: { id: 'GEO-BATUM' }, geometry: batum.geometry });
    }
    lightFiles[c.slug + '.json'] = JSON.stringify({ type: 'FeatureCollection', features: feats });
  }
  const lout = await mapshaper.applyCommands(`-i ${Object.keys(lightFiles).join(' ')} combine-files -o out.json format=topojson quantization=100000`, lightFiles);
  fs.writeFileSync(path.join(DATA, 'europe-regions.js'), `(window.HARITA_VERI=window.HARITA_VERI||{}).regions=${lout['out.json'].toString()};`);

  countries.forEach((c) => { c.regions = counts[c.slug]; });
  fs.writeFileSync(path.join(DATA, 'countries.js'), `window.HARITA_ULKELER=${JSON.stringify(countries)};`);
  fs.writeFileSync(path.join(DATA, 'merge-map.js'), `window.HARITA_BIRLESIK=${JSON.stringify(mergeMap)};`);
  console.log('birleşen bölge sayısı:', Object.keys(mergeMap).length);
})();
