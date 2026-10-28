const d3=require('d3');const topojson=require('topojson-client');
const CAP={almanya:[13.40,52.52],andorra:[1.52,42.51],arnavutluk:[19.82,41.33],avusturya:[16.37,48.21],azerbaycan:[49.87,40.41],belcika:[4.35,50.85],'beyaz-rusya':[27.57,53.9],'birlesik-krallik':[-0.12,51.51,.4],'bosna-hersek':[18.41,43.86],bulgaristan:[23.32,42.7],'cek-cumhuriyeti':[14.42,50.09],danimarka:[12.57,55.68],estonya:[24.75,59.44],finlandiya:[24.94,60.17],fransa:[2.35,48.86,.2],gurcistan:[44.79,41.72],hirvatistan:[15.98,45.81],hollanda:[4.9,52.37],irlanda:[-6.26,53.35,.2],ispanya:[-3.7,40.42],isvec:[18.07,59.33],isvicre:[7.45,46.95],italya:[12.5,41.9],izlanda:[-21.9,64.15],karadag:[19.26,42.44],'kibris-cumhuriyeti':[33.37,35.18],kosova:[21.17,42.67],'kuzey-kibris':[33.37,35.18],'kuzey-makedonya':[21.43,42.0],letonya:[24.11,56.95],lihtenstayn:[9.52,47.14],litvanya:[25.28,54.69],luksemburg:[6.13,49.61],macaristan:[19.04,47.5],malta:[14.51,35.9],moldova:[28.86,47.01],monako:[7.42,43.73],norvec:[10.75,59.91],polonya:[21.01,52.23],portekiz:[-9.14,38.72],romanya:[26.1,44.43],rusya:[37.62,55.75,.3],'san-marino':[12.45,43.94],sirbistan:[20.46,44.79],slovakya:[17.11,48.15],slovenya:[14.51,46.06],ukrayna:[30.52,50.45],vatikan:[12.45,41.9],yunanistan:[23.73,37.98]};
// komşuluk: paylaşılan yay uzunluklarına göre ağırlık
function adjacency(t, geoms) {
  const arcOwner = new Map();
  geoms.forEach((g, i) => {
    const seen = new Set();
    const walk = (a) => { if (typeof a === 'number') { const k = a < 0 ? ~a : a; if (!seen.has(k)) { seen.add(k); (arcOwner.get(k) || arcOwner.set(k, []).get(k)).push(i); } } else a.forEach(walk); };
    walk(g.arcs);
  });
  const w = geoms.map(() => new Map());
  arcOwner.forEach((owners, k) => {
    if (owners.length < 2) return;
    const len = t.arcs[k].length;
    for (let x = 0; x < owners.length; x++) for (let y = 0; y < owners.length; y++) if (x !== y) w[owners[x]].set(owners[y], (w[owners[x]].get(owners[y]) || 0) + len);
  });
  // toplam sınır (komşuluk olmayan dış kıyı dahil) için kendi yay sayıları
  const own = geoms.map(() => 0);
  arcOwner.forEach((owners, k) => owners.forEach((i) => { own[i] += t.arcs[k].length; }));
  return { w, own };
}
function isCapital(slug, f) {
  const cp = CAP[slug]; if (!cp) return false;
  const r = cp[2] || 0.1;
  try {
    if (d3.geoContains(f, [cp[0], cp[1]])) return true;
    const ct = d3.geoCentroid(f); return Math.hypot(ct[0] - cp[0], ct[1] - cp[1]) < r;
  } catch (e) { return false; }
}
module.exports = { adjacency, isCapital, CAP };
