// "Haritayı Dışa Aktar" penceresi: önizleme ve PNG aynı çizim koduyla (render) canvas'a çizilir.
// Ekrandaki haritaya, zoom'a, moda ya da kayıtlı boyamaya hiçbir şey yazmaz; yalnızca PNG'yi etkiler.
(function () {
  'use strict';
  const A = window.HARITA_API;
  if (!A) return;
  const V = A.V;
  const $ = (id) => document.getElementById(id);

  const SET_KEY = 'harita-disa-ayar', TXT_KEY = 'harita-disa-metin', LEG_KEY = 'harita-lejant';
  const SITE_URL = 'ibrahimresul.github.io/turkiye-map';
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* yoksay */ } };
  const jget = (k) => { try { return JSON.parse(lsGet(k) || '{}') || {}; } catch (e) { return {}; } };

  // ---------- temalar ----------
  const THEMES = {
    gece: { name: 'Karanlık', bg: '#0f1424', bg2: '#1c2646', land: '#2c3e6e', border: '#05070d', sub: '#7184b8', text: '#ffffff', muted: '#98a3c0', label: '#ffffff', halo: 'rgba(0,0,0,.85)', accent: '#4d8dff' },
    aydinlik: { name: 'Aydınlık', bg: '#f4f6fb', bg2: '#dbe7f5', land: '#b9c4dc', border: '#1b2233', sub: '#8a93a8', text: '#1b2233', muted: '#5b6578', label: '#111111', halo: 'rgba(255,255,255,.9)', accent: '#2457e6' },
    okyanus: { name: 'Okyanus', bg: '#031e29', bg2: '#0c4a5e', land: '#0c4a5e', border: '#02121a', sub: '#5fa3b8', text: '#e6fbff', muted: '#8fc3d1', label: '#ffffff', halo: 'rgba(0,0,0,.85)', accent: '#00c2d1' },
    gunbatimi: { name: 'Gün Batımı', bg: '#231019', bg2: '#5c2c40', land: '#5c2c40', border: '#170a10', sub: '#b57f93', text: '#ffe9e2', muted: '#d3a89c', label: '#ffffff', halo: 'rgba(0,0,0,.85)', accent: '#ff7a59' },
    sepya: { name: 'Sepya / Eski Harita', bg: '#f1e3c6', bg2: '#e0c993', land: '#d6bd8a', border: '#4a3320', sub: '#8c6e47', text: '#3e2a17', muted: '#7a6244', label: '#3e2a17', halo: 'rgba(241,227,198,.9)', accent: '#8a5a2b', paper: true },
    neon: { name: 'Neon', bg: '#0a0014', bg2: '#2a0a4a', land: '#2b1850', border: '#ff2bd6', sub: '#7a4cc4', text: '#f5e9ff', muted: '#b08be0', label: '#ffffff', halo: 'rgba(0,0,0,.85)', accent: '#00f0ff' },
    orman: { name: 'Orman', bg: '#0f2418', bg2: '#1f4d33', land: '#2f6b45', border: '#06140c', sub: '#6fae85', text: '#e9fbe9', muted: '#9fcfae', label: '#ffffff', halo: 'rgba(0,0,0,.85)', accent: '#7ddc6a' },
    pastel: { name: 'Pastel', bg: '#fdf1f4', bg2: '#e8f1fd', land: '#f2d6df', border: '#7c5b73', sub: '#c7a5b5', text: '#5a3b52', muted: '#8d6f85', label: '#4a2f44', halo: 'rgba(255,255,255,.9)', accent: '#e0589a' },
    buz: { name: 'Buz Mavisi', bg: '#eaf4fb', bg2: '#bcdcf0', land: '#cfe6f5', border: '#1d4f73', sub: '#7fb0cf', text: '#12344d', muted: '#4f7893', label: '#0e2c42', halo: 'rgba(255,255,255,.9)', accent: '#1976d2' },
    mono: { name: 'Siyah-Beyaz', bg: '#111111', bg2: '#232323', land: '#e8e8e8', border: '#000000', sub: '#999999', text: '#ffffff', muted: '#aaaaaa', label: '#111111', halo: 'rgba(255,255,255,.9)', accent: '#ffcc00' },
  };
  const FONTS = {
    sans: { label: 'Modern', fam: 'HB Inter', w: 700 },
    serif: { label: 'Zarif', fam: 'HB Playfair', w: 700 },
    hand: { label: 'El yazısı', fam: 'HB Caveat', w: 700 },
    poster: { label: 'Poster', fam: 'HB Anton', w: 400 }
  };
  const SIZES = [
    { id: 'story', label: 'Instagram Story', w: 1080, h: 1920 },
    { id: 'square', label: 'Kare Gönderi', w: 1080, h: 1080 },
    { id: 'portrait', label: 'Dikey Gönderi', w: 1080, h: 1350 },
    { id: 'landscape', label: 'Yatay / Sunum', w: 1920, h: 1080 },
    { id: 'print', label: 'Baskı (A4 yatay)', w: 3508, h: 2480 },
    { id: 'printv', label: 'Baskı (A4 dikey)', w: 2480, h: 3508 },
    { id: 'screen', label: 'Ekran boyutu', w: 0, h: 0 },
    { id: 'custom', label: 'Özel', w: 1920, h: 1080 }
  ];
  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);

  // ---------- durum ----------
  let src = null;      // { mode: 'europe' | 'country', slug }
  let cap = null;      // pencere açıldığı andaki harita görünümü (zoom/pan); pencere açıkken sabit kalır
  let st = null;
  let token = 0, timer = null, lastFocus = null;

  const DEFAULTS = {
    size: 'landscape', cw: 1920, ch: 1080, q: 2, fitMode: 'expand', visOnly: false, font: 'sans', theme: 'gece', bg: 'solid',
    showTitle: true, showStats: true, showBar: false, scope: 'all', neighbors: true,
    cityBorders: true, flags: false, cityNames: true, countryNames: false, lineW: 'normal', glow: false,
    legend: false, legendPos: 'bl', autoLegend: true, watermark: true, date: false
  };
  function loadSettings() {
    const saved = jget(SET_KEY);
    const s = { ...DEFAULTS, ...saved };
    // site modlarından başlangıç değerleri (yalnızca ilk önerilen; sonra kullanıcı değiştirir)
    s.theme = THEMES[saved.theme] ? saved.theme : (THEMES[document.documentElement.dataset.theme] ? document.documentElement.dataset.theme : 'gece');
    s.cityBorders = A.cityBorders;
    s.flags = src.mode === 'europe' ? (saved.flags != null ? saved.flags : A.flagsOn) : false;
    s.cityNames = src.mode === 'country' ? A.showLabels : false;
    // eski/bozuk kayıtlı değerler pencerenin açılmasını engellemesin: her ayar izinli değerlerle doğrulanır
    const pick = (v, list, def) => (list.includes(v) ? v : def);
    s.size = pick(s.size, SIZES.map((z) => z.id), 'landscape');
    s.font = pick(s.font, Object.keys(FONTS), 'sans');
    s.bg = pick(s.bg, ['solid', 'gradient', 'transparent'], 'solid');
    s.lineW = pick(s.lineW, ['thin', 'normal', 'thick'], 'normal');
    s.legendPos = pick(s.legendPos, ['bl', 'br', 'tl', 'tr'], 'bl');
    s.fitMode = pick(s.fitMode, ['expand', 'fit', 'fill'], 'expand');
    s.scope = pick(s.scope, ['all', 'view', 'painted', 'painted+n'], 'all');
    s.q = pick(+s.q, [1, 2, 3], 2);
    s.cw = clamp(+s.cw || 1920, 200, 6000); s.ch = clamp(+s.ch || 1080, 200, 6000);
    ['showTitle', 'showStats', 'showBar', 'neighbors', 'glow', 'legend', 'autoLegend', 'watermark', 'date', 'visOnly', 'countryNames'].forEach((k) => { s[k] = !!s[k]; });
    return s;
  }
  const saveSettings = () => {
    const o = { ...st };
    delete o.cityBorders; delete o.cityNames; delete o.fitMode;   // kadraj modu her açılışta "genişlet"   // bunlar her açılışta sitedeki moddan başlar
    lsSet(SET_KEY, JSON.stringify(o));
  };

  const keyOf = () => (src.mode === 'europe' ? 'avrupa' : src.slug);
  function defaultTitle() {
    if (src.mode === 'country') return A.bySlug[src.slug].name + ' Gezim';
    const u = window.haritaKullanici;
    return u && u.name ? u.name + '’in Avrupa Gezileri' : 'Avrupa Gezilerim';
  }
  const texts = () => { const all = jget(TXT_KEY); return all[keyOf()] || {}; };
  const getTitle = () => { const t = texts(); return t.title != null ? t.title : defaultTitle(); };
  const getSub = () => { const t = texts(); return t.sub != null ? t.sub : ''; };
  function setText(field, v) {
    const all = jget(TXT_KEY);
    all[keyOf()] = { ...(all[keyOf()] || {}), [field]: v };
    lsSet(TXT_KEY, JSON.stringify(all));
  }

  // ---------- yardımcılar ----------
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const slugify = (s) => s.toLowerCase().replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  function fileName() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const what = src.mode === 'europe' ? 'avrupa' : slugify(A.bySlug[src.slug].name);
    return 'harita-boyama-' + what + (st.scope === 'view' ? '-gorunum' : '') + '-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.png';
  }
  function dims() {
    const z = SIZES.find((x) => x.id === st.size);
    let w = z.w, h = z.h;
    if (st.size === 'screen' && cap) { w = clamp(Math.round(cap.rw) || 1200, 200, 6000); h = clamp(Math.round(cap.rh) || 750, 200, 6000); }
    if (st.size === 'custom') { w = clamp(+st.cw || 1920, 200, 6000); h = clamp(+st.ch || 1080, 200, 6000); }
    return { w, h };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // çıktı ölçeği: istenen kalite canvas sınırlarını aşarsa düşürülür
  function outScale() {
    const { w, h } = dims();
    const maxSide = isMobile() ? 6000 : 8192, maxPx = isMobile() ? 16e6 : 60e6;
    let sc = st.q, reduced = false;
    while (sc > 0.25 && (w * sc > maxSide || h * sc > maxSide || w * sc * h * sc > maxPx)) { sc -= 0.25; reduced = true; }
    return { sc, reduced, pw: Math.round(w * sc), ph: Math.round(h * sc) };
  }

  const imgCache = new Map();
  function flagImage(code) {
    if (imgCache.has(code)) return imgCache.get(code);
    const uri = A.flagData.get(code);
    if (!uri) return Promise.resolve(null);
    const p = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = uri; });
    imgCache.set(code, p);
    return p;
  }

  // ülkenin ayrıntılı bölge verisi: ülke dosyası (data/c); Türkiye'nin dosyası düzlemsel (il SVG'si) olduğundan onun için hafif bölge verisi kullanılır
  function detailSource(sl) {
    const t = V[sl];
    if (t && t.objects && !t.planar) return { topo: t, obj: t.objects[Object.keys(t.objects)[0]] };
    const o = V.regions && V.regions.objects[sl];
    return o ? { topo: V.regions, obj: o } : null;
  }
  const polysOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []);
  // ülkenin parçaları: ana kara + yakın parçalar tek grup; uzak parçalar (adalar) ayrı gruplar
  function groupsOf(f, path) {
    const polys = polysOf(f.geometry).map((coords) => {
      const pf = { type: 'Polygon', coordinates: coords };
      return { coords, area: path.area(pf), b: path.bounds(pf) };
    }).filter((q) => isFinite(q.b[0][0]));
    if (!polys.length) return [];
    const main = polys.reduce((m, q) => (q.area > m.area ? q : m));
    const pad = 0.35 * Math.max(main.b[1][0] - main.b[0][0], main.b[1][1] - main.b[0][1]);
    const near = [], far = [];
    polys.forEach((q) => {
      const cx = (q.b[0][0] + q.b[1][0]) / 2, cy = (q.b[0][1] + q.b[1][1]) / 2;
      (cx > main.b[0][0] - pad && cx < main.b[1][0] + pad && cy > main.b[0][1] - pad && cy < main.b[1][1] + pad ? near : far).push(q);
    });
    return [near, ...far.map((q) => [q])].map((grp) => ({
      coords: grp.map((q) => q.coords),
      b: [[Math.min(...grp.map((q) => q.b[0][0])), Math.min(...grp.map((q) => q.b[0][1]))], [Math.max(...grp.map((q) => q.b[1][0])), Math.max(...grp.map((q) => q.b[1][1]))]]
    }));
  }

  // ---------- metin ----------
  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean), lines = [];
    let cur = '';
    words.forEach((w) => {
      const t = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  // verilen genişliğe ve satır sayısına sığana kadar yazıyı küçültür
  function fitText(ctx, text, fontFn, maxW, maxLines, start, min) {
    for (let s = start; s >= min; s -= Math.max(1, s * 0.05)) {
      ctx.font = fontFn(s);
      const lines = wrap(ctx, text, maxW);
      if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { size: s, lines };
    }
    ctx.font = fontFn(min);
    return { size: min, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- lejant verisi ----------
  function usedColors() {
    const count = {};
    const slugs = src.mode === 'country' ? [src.slug] : A.countries.map((c) => c.slug);
    slugs.forEach((s) => Object.values(A.load(s)).forEach((c) => { const k = String(c).toLowerCase(); count[k] = (count[k] || 0) + 1; }));
    return Object.entries(count).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  }
  const legendLabels = () => jget(LEG_KEY);

  // ---------- veri hazırlığı (kaynak haritaya göre) ----------
  async function prepare() {
    const out = { mode: src.mode };
    if (src.mode === 'country') {
      const topo = V[src.slug];
      out.planar = !!topo.planar;
      out.fc = out.planar ? { type: 'FeatureCollection', features: topo.features }
        : topojson.feature(topo, topo.objects[Object.keys(topo.objects)[0]]);
      out.colors = A.load(src.slug);
      out.outline = out.planar ? null : { type: 'Feature', properties: {}, geometry: topojson.merge(topo, topo.objects[Object.keys(topo.objects)[0]].geometries) };
      return out;
    }
    const fc = A.dropFar(topojson.feature(V.europe, V.europe.objects.in));
    out.bg = fc.features.filter((f) => !f.properties.l);
    out.listed = fc.features.filter((f) => f.properties.l && A.byId[f.properties.id]);
    out.paintedSlugs = new Set(A.countries.filter((c) => A.paintedOf(c.slug) > 0).map((c) => c.slug));
    const need = new Set(out.paintedSlugs);
    if (st.scope === 'view' && cap) {
      // yakın zoom'da görünen ülkelerin ayrıntılı verisi PNG'den önce yüklenir (ekrandaki kurallarla aynı eşikler)
      const pp = d3.geoPath(cap.proj), vis = expandedVis();
      if (cap.k >= 2.2 && st.cityBorders || cap.k >= 5) out.listed.forEach((f) => { if (hits(pp.bounds(f), vis)) need.add(A.byId[f.properties.id].slug); });
    }
    await Promise.all([...need].map((s) => A.loadDetail(s)));
    out.detail = {};
    need.forEach((s) => {
      const ds = detailSource(s);
      if (!ds) return;
      const topo = ds.topo, obj = ds.obj;
      out.detail[s] = { fc: topojson.feature(topo, obj), outline: { type: 'Feature', properties: {}, geometry: topojson.merge(topo, obj.geometries) }, colors: A.load(s) };
    });
    if (st.flags) {
      // bayrak yalnızca içinde boyalı bölge olan ülkelerde: yalnızca onların görselleri yüklenir
      const codes = [...new Set(out.listed.filter((f) => !out.paintedSlugs.size || out.paintedSlugs.has(A.byId[f.properties.id].slug)).map((f) => A.FLAG_CODE[f.properties.id]).filter(Boolean))];
      await A.ensureFlags(codes);
      out.flagImgs = {};
      await Promise.all(codes.map(async (c) => { out.flagImgs[c] = await flagImage(c); }));
    }
    return out;
  }

  // ---------- ana çizim (önizleme ve indirme aynı kodu kullanır) ----------
  let paperPattern = null;
  function paperTile() {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const x = c.getContext('2d'); let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 1400; i++) { x.fillStyle = 'rgba(' + (rnd() < 0.5 ? '90,60,20' : '255,250,235') + ',' + (0.02 + rnd() * 0.05).toFixed(3) + ')'; x.fillRect(rnd() * 160, rnd() * 160, 1 + rnd() * 2, 1 + rnd() * 2); }
    return c;
  }

  async function render(canvas, data, W, H, scale, isCancelled, opts) {
    const probe = !!(opts && opts.probe);   // yalnızca yerleşimi (harita alanı) hesapla
    const th = THEMES[st.theme], ft = FONTS[st.font], body = FONTS.sans;
    const fontOf = (s) => ft.w + ' ' + s + 'px "' + ft.fam + '", "HB Inter", sans-serif';
    const bodyOf = (s, w) => (w || 600) + ' ' + s + 'px "HB Inter", sans-serif';
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const transparent = st.bg === 'transparent';
    const mn = Math.min(W, H);
    const unit = Math.max(0.5, mn / 1000);
    const isView = st.scope === 'view' && !!cap;
    const mode = isView ? st.fitMode : null;
    const fillMode = mode === 'fill', expandMode = mode === 'expand', overlay = fillMode || expandMode;
    // kadrajı doldur: yazılar haritanın üstüne biner, okunsun diye ince kontur çizilir
    const ftxt = (t, x, y) => {
      if (overlay) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, mn * 0.006); ctx.strokeStyle = th.halo; ctx.strokeText(t, x, y); ctx.restore(); }
      ctx.fillText(t, x, y);
    };
    const drawMap = async (rect) => {
      const T = isView ? transformFor(rect, mode, W, H) : IDENT;
      if (src.mode === 'country') await drawCountry(ctx, data, th, rect, W, unit, bodyOf, T);
      else await drawEurope(ctx, data, th, rect, W, unit, bodyOf, isCancelled, T);
    };

    // arka plan
    if (!transparent) {
      if (st.bg === 'gradient') { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, th.bg); g.addColorStop(1, th.bg2); ctx.fillStyle = g; }
      else ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, W, H);
      if (th.paper) { paperPattern = paperPattern || ctx.createPattern(paperTile(), 'repeat'); ctx.fillStyle = paperPattern; ctx.fillRect(0, 0, W, H); }
    }

    if (fillMode && !probe) { await drawMap({ x: 0, y: 0, w: W, h: H }); if (isCancelled && isCancelled()) return; }

    if (expandMode && !probe) {
      // görünür alan başlık/lejant dışındaki alana sığar; harita verisi tüm çıktıyı dolduracak şekilde genişletilir (ekrandaki ölçek korunur)
      const mr = await render(document.createElement('canvas'), data, W, H, 0.02, null, { probe: true });
      await drawMap(mr);
      if (isCancelled && isCancelled()) return;
    }

    // ---- yerleşim: başlık, istatistik, lejant, alt şerit ----
    const pad = Math.round(mn * 0.045), maxW = W - 2 * pad;
    const portrait = H >= W * 0.9;
    let y = pad;
    const title = getTitle().trim(), sub = getSub().trim();
    const painted = src.mode === 'country' ? A.paintedOf(src.slug) : null;
    let statText = '', frac = 0;
    const visStats = st.visOnly && isView ? visibleStats(data) : null;
    if (visStats) { statText = visStats.text; frac = visStats.frac; }
    else if (src.mode === 'country') {
      const c = A.bySlug[src.slug], n = painted, unit = src.slug === 'turkiye' ? 'il' : 'bölge';
      statText = n + ' / ' + c.regions + ' ' + unit + ' • %' + Math.round((100 * n) / c.regions); frac = n / c.regions;
    } else {
      let cities = 0, ctry = 0, total = 0;
      A.countries.forEach((c) => { const n = A.paintedOf(c.slug); cities += n; total += c.regions; if (n > 0) ctry++; });
      statText = cities + ' şehir • ' + ctry + ' ülke'; frac = total ? cities / total : 0;
    }
    let titleSize = 0;
    if (st.showTitle && title) {
      const start = portrait ? W * 0.085 : Math.min(H * 0.085, W * 0.05);
      const f = fitText(ctx, title, fontOf, maxW, 2, start, Math.max(16, mn * 0.03));
      titleSize = f.size;
      ctx.fillStyle = th.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = fontOf(f.size);
      f.lines.forEach((l, i) => ftxt(l, pad, y + i * f.size * 1.08));
      y += f.lines.length * f.size * 1.08 + f.size * 0.12;
      if (sub) {
        const sz = Math.max(13, f.size * 0.42);
        ctx.font = fontOf(sz); ctx.fillStyle = th.muted;   // alt yazı da seçilen yazı tipiyle
        const lines = wrap(ctx, sub, maxW).slice(0, 2);
        lines.forEach((l, i) => ftxt(l, pad, y + i * sz * 1.2));
        y += lines.length * sz * 1.2 + sz * 0.2;
      }
    }
    if (st.showStats) {
      const sz = Math.max(14, (titleSize || mn * 0.07) * 0.4);
      ctx.font = fontOf(sz); ctx.fillStyle = th.accent; ctx.textAlign = 'left'; ctx.textBaseline = 'top';   // istatistik de seçilen yazı tipiyle
      ftxt(statText, pad, y + sz * 0.2);
      y += sz * 1.5;
      if (st.showBar) {
        const bh = Math.max(6, sz * 0.32), bw = Math.min(maxW, Math.max(mn * 0.4, maxW * 0.4));
        ctx.globalAlpha = 0.25; ctx.fillStyle = th.muted; roundRect(ctx, pad, y, bw, bh, bh / 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = th.accent; roundRect(ctx, pad, y, Math.max(bh, bw * Math.min(1, frac)), bh, bh / 2); ctx.fill();
        y += bh + sz * 0.5;
      }
    }

    // lejant ögeleri
    const labels = legendLabels();
    const leg = st.legend ? usedColors().map((c) => ({ c, t: (labels[c] || '').trim() || (st.autoLegend ? A.colorName(c) : '') })).filter((x) => x.t) : [];
    const lfs = Math.max(13, Math.round(mn * 0.021));
    let legendRows = [], legH = 0;
    if (leg.length) {
      ctx.font = bodyOf(lfs, 600);
      let row = [], rw = 0;
      const itemW = (e) => lfs * 1.7 + ctx.measureText(e.t).width + lfs * 1.1;
      leg.forEach((e) => { const w = itemW(e); if (row.length && rw + w > maxW * 0.62) { legendRows.push(row); row = []; rw = 0; } row.push(e); rw += w; });
      if (row.length) legendRows.push(row);
      legH = legendRows.length * lfs * 1.7;
    }
    const legTop = st.legendPos[0] === 't';
    if (leg.length && legTop) y += legH * 0 + 0;   // üst lejant başlığın altında çizilir (aşağıda yer ayrılır)
    let topLegY = y;
    if (leg.length && legTop) y += legH + lfs * 0.4;

    const wmH = (st.watermark || st.date) ? Math.max(12, mn * 0.016) * 1.8 : 0;
    const footH = Math.max(leg.length && !legTop ? legH : 0, wmH);
    const mapRect = { x: pad, y: y + pad * 0.2, w: maxW, h: Math.max(80, H - (y + pad * 0.2) - pad - (footH ? footH + pad * 0.2 : 0)) };

    if (probe) return mapRect;
    // ---- harita ----
    if (!overlay) { await drawMap(mapRect); if (isCancelled && isCancelled()) return; }

    // ---- lejant ----
    if (leg.length) {
      const right = st.legendPos[1] === 'r';
      const baseY = legTop ? topLegY : H - pad - legH;
      legendRows.forEach((row, ri) => {
        ctx.font = bodyOf(lfs, 600);
        const rowW = row.reduce((a, e) => a + lfs * 1.7 + ctx.measureText(e.t).width + lfs * 1.1, 0) - lfs * 1.1;
        let x = right ? W - pad - rowW : pad;
        const yy = baseY + ri * lfs * 1.7;
        row.forEach((e) => {
          ctx.fillStyle = e.c; roundRect(ctx, x, yy, lfs * 1.15, lfs * 1.15, lfs * 0.3); ctx.fill();
          ctx.strokeStyle = th.border; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
          ctx.fillStyle = th.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ftxt(e.t, x + lfs * 1.7, yy + lfs * 0.58);
          x += lfs * 1.7 + ctx.measureText(e.t).width + lfs * 1.1;
        });
      });
    }
    // ---- filigran + tarih (lejantın tersi köşede) ----
    if (st.watermark || st.date) {
      const fs = Math.max(12, mn * 0.016);
      ctx.font = bodyOf(fs, 600); ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 0.6; ctx.fillStyle = th.muted;
      const legBottom = leg.length && !legTop;
      const wmRight = !(legBottom && st.legendPos[1] === 'r');
      const parts = [];
      if (st.date) { const d = new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }); parts.push(d.charAt(0).toUpperCase() + d.slice(1)); }
      if (st.watermark) parts.push('Harita Boyama • ' + SITE_URL);
      const txt = parts.join('   •   ');
      ctx.textAlign = wmRight ? 'right' : 'left';
      ftxt(txt, wmRight ? W - pad : pad, H - pad * 0.55);
      ctx.globalAlpha = 1;
    }
  }

  // "Sadece görünen alandakileri say": görünür dikdörtgene değen boyalı bölgeler/ülkeler
  function visibleStats(data) {
    const pp = d3.geoPath(cap.proj), vis = visRect();
    if (src.mode === 'country') {
      const c = A.bySlug[src.slug];
      const feats = data.fc.features.filter((f) => hits(pp.bounds(f), vis));
      const n = feats.filter((f) => data.colors[f.properties.id]).length;
      return { text: n + ' / ' + feats.length + ' ' + (src.slug === 'turkiye' ? 'il' : 'bölge') + ' (görünen)', frac: feats.length ? n / feats.length : 0 };
    }
    let cities = 0, ctry = 0, total = 0;
    A.countries.forEach((c) => {
      const d = data.detail && data.detail[c.slug];
      if (!d) return;
      const n = d.fc.features.filter((f) => d.colors[f.properties.id] && hits(pp.bounds(f), vis)).length;
      cities += n; if (n > 0) ctry++;
    });
    A.countries.forEach((c) => { total += c.regions; });
    return { text: cities + ' şehir \u2022 ' + ctry + ' ülke (görünen)', frac: total ? cities / total : 0 };
  }

  // ---------- görünüm (zoom'u koru) yardımcıları ----------
  const FLAG_TINT = 0.2, FLAG_FADE = 0.2;   // bayrak + şehir sınırı modu: tonlama gücü ve boyasız bölgelerin bayrak opaklığı (ekrandakiyle aynı)
  // bayrak görseli grubun kutusuna, ülkenin paralel eğimi kadar döndürülerek tam kaplayacak şekilde çizilir (ekrandakiyle aynı)
  function drawFlagImg(ctx, img, g, th) {
    const w = g.b[1][0] - g.b[0][0], h = g.b[1][1] - g.b[0][1], { iw, ih } = A.flagDims(w, h, th);
    ctx.save();
    ctx.translate(g.b[0][0] + w / 2, g.b[0][1] + h / 2); ctx.rotate(th);
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
  }
  const IDENT = { s: 1, tx: 0, ty: 0, vis: null, clip: null };
  // yakalanan d3.zoom dönüşümü -> projeksiyon koordinatlarında görünür dikdörtgen; çıktı kutusuna ölçeklenir
  function transformFor(r, mode, W, H) {
    const v = cap, k = v.k;
    const vx0 = -v.x / k, vy0 = -v.y / k, vw = v.W / k, vh = v.H / k;
    const s = mode === 'fill' ? Math.max(r.w / vw, r.h / vh) : Math.min(r.w / vw, r.h / vh);   // ekrandaki ölçek korunarak çıktıya oturur (esneme yok)
    const tx = r.x + r.w / 2 - (vx0 + vw / 2) * s, ty = r.y + r.h / 2 - (vy0 + vh / 2) * s;
    if (mode === 'fit') return { s, tx, ty, vis: [vx0, vy0, vx0 + vw, vy0 + vh], clip: { x: tx + vx0 * s, y: ty + vy0 * s, w: vw * s, h: vh * s } };
    // genişlet / doldur: kırpma yok; harita çıktının tamamına yayılır, görünür dikdörtgen genişletilmiş alan olur (culling de buna göre)
    return { s, tx, ty, vis: [-tx / s, -ty / s, (W - tx) / s, (H - ty) / s], clip: null };
  }
  // çıktının oranına genişletilmiş görünür dikdörtgen (ayrıntılı veriyi yüklemek için; başlık payı nedeniyle biraz geniş tutulur)
  function expandedVis() {
    const { w, h } = dims(), k = cap.k;
    const vw = cap.W / k, vh = cap.H / k, cx = (-cap.x + cap.W / 2) / k, cy = (-cap.y + cap.H / 2) / k;
    const s = Math.min(w / vw, h / vh) * 0.8;
    return [cx - w / (2 * s), cy - h / (2 * s), cx + w / (2 * s), cy + h / (2 * s)];
  }
  const visRect = () => { const k = cap.k; return [-cap.x / k, -cap.y / k, (cap.W - cap.x) / k, (cap.H - cap.y) / k]; };
  const hits = (b, vis) => !vis || (b[1][0] >= vis[0] && b[0][0] <= vis[2] && b[1][1] >= vis[1] && b[0][1] <= vis[3]);
  function beginView(ctx, T) {
    ctx.save();
    if (T.clip) { ctx.beginPath(); ctx.rect(T.clip.x, T.clip.y, T.clip.w, T.clip.h); ctx.clip(); }
    ctx.translate(T.tx, T.ty); ctx.scale(T.s, T.s);
  }

  // ---------- ülke sayfası çizimi ----------
  async function drawCountry(ctx, data, th, r, W, unit, bodyOf, T) {
    const topo = V[src.slug], view = st.scope === 'view' && cap;
    let proj;
    if (view) proj = cap.proj;
    else {
      const base = data.planar ? d3.geoIdentity()
        : src.slug === 'rusya' ? d3.geoConicEqualArea().parallels([50, 70]).rotate([-100, 0]).center([0, 62]) : d3.geoMercator();
      proj = base.fitExtent([[r.x, r.y], [r.x + r.w, r.y + r.h]], data.fc);
    }
    const S = T.s, path = d3.geoPath(proj, ctx), pp = d3.geoPath(proj), mult = { thin: 0.6, normal: 1, thick: 1.7 }[st.lineW];
    const lw = Math.max(0.8, W * 0.0011) * mult / S, colors = data.colors;
    beginView(ctx, T);
    const feats = data.fc.features.filter((f) => hits(pp.bounds(f), T.vis));   // görünmeyen bölgeler çizilmez
    feats.forEach((f) => {
      const col = colors[f.properties.id];
      ctx.beginPath(); path(f);
      ctx.fillStyle = col || th.land;
      if (col && st.glow) { ctx.shadowColor = col; ctx.shadowBlur = Math.max(4, W * 0.006); }
      ctx.fill(); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    });
    if (st.cityBorders) {
      ctx.strokeStyle = th.sub; ctx.lineWidth = lw * (data.planar ? 1.4 : 0.6); ctx.globalAlpha = 0.85;
      feats.forEach((f) => { ctx.beginPath(); path(f); ctx.stroke(); });
      ctx.globalAlpha = 1;
    }
    if (data.outline) { ctx.beginPath(); path(data.outline); ctx.strokeStyle = th.border; ctx.lineWidth = lw * 1.9; ctx.stroke(); }
    else if (!st.cityBorders) { ctx.strokeStyle = th.border; ctx.lineWidth = lw; feats.forEach((f) => { ctx.beginPath(); path(f); ctx.stroke(); }); }
    if (st.cityNames) drawLabels(ctx, A.layoutLabels(feats, proj, pp, unit / S), th, bodyOf, S);
    ctx.restore();
  }
  function drawLabels(ctx, items, th, bodyOf, S) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    items.forEach((d) => {
      if (d.fs * S < 4) return;   // okunmayacak kadar küçük etiketler çizilmez
      ctx.font = bodyOf(d.fs, 700);
      const lh = d.fs * 1.08, y0 = d.y - ((d.lines.length - 1) * lh) / 2;
      d.lines.forEach((ln, i) => {
        ctx.lineWidth = d.fs * 0.2; ctx.strokeStyle = th.halo; ctx.strokeText(ln, d.x, y0 + i * lh);
        ctx.fillStyle = th.label; ctx.fillText(ln, d.x, y0 + i * lh);
      });
    });
  }

  // ---------- Avrupa çizimi ----------
  async function drawEurope(ctx, data, th, r, W, unit, bodyOf, isCancelled, T) {
    const mult = { thin: 0.6, normal: 1, thick: 1.7 }[st.lineW];
    const view = st.scope === 'view' && cap;
    const painted = data.paintedSlugs, scope = view ? 'view' : (painted.size ? st.scope : 'all');
    const prelim = d3.geoPath(d3.geoAzimuthalEqualArea().rotate([-10, -52]).scale(500));
    let proj;
    if (view) proj = cap.proj;
    else if (scope === 'all') {
      proj = d3.geoAzimuthalEqualArea().rotate([-10, -52]).fitExtent([[r.x, r.y], [r.x + r.w, r.y + r.h]], A.TARGET);
    } else {
      // boyalı ülkelerin (ana kara + yakın parçalar) en küçük kapsayan dikdörtgenine yaklaş
      const coll = { type: 'FeatureCollection', features: [] };
      data.listed.filter((f) => painted.has(A.byId[f.properties.id].slug)).forEach((f) => {
        const g = groupsOf(f, prelim)[0];
        if (g) coll.features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: g.coords } });
      });
      const c = d3.geoCentroid(coll);
      const m = Math.min(r.w, r.h) * 0.04;
      proj = d3.geoAzimuthalEqualArea().rotate([-c[0], -c[1]]).fitExtent([[r.x + m, r.y + m], [r.x + r.w - m, r.y + r.h - m]], coll);
    }
    const S = T.s, path = d3.geoPath(proj, ctx), pp = d3.geoPath(proj);
    const lw = Math.max(0.8, W * 0.0011) * mult / S, k = view ? cap.k : 1;
    const vis = (f) => hits(pp.bounds(f), T.vis);   // görünür alanın dışı çizime dahil edilmez
    const cityOp = view && k < 1.8 ? 0.45 : 1;       // ekrandaki gibi: uzaktayken şehir sınırları soluk
    beginView(ctx, T);
    // komşular / çevre ülkeler (soluk)
    if (st.neighbors && scope !== 'painted') {
      const bg = data.bg.filter(vis);
      ctx.globalAlpha = 0.4; ctx.fillStyle = th.land;
      bg.forEach((f) => { ctx.beginPath(); path(f); ctx.fill(); });
      ctx.globalAlpha = 0.3; ctx.strokeStyle = th.border; ctx.lineWidth = lw * 0.5;
      bg.forEach((f) => { ctx.beginPath(); path(f); ctx.stroke(); });
      ctx.globalAlpha = 1;
    }
    await nextFrame();
    if (isCancelled && isCancelled()) { ctx.restore(); return; }
    const slugOf = (f) => A.byId[f.properties.id].slug;
    const shown = data.listed.filter((f) => (scope !== 'painted' || painted.has(slugOf(f))) && vis(f));
    const shapeOf = (f) => { const d = data.detail[slugOf(f)]; return d ? d.outline : f; };
    const fade = (f) => (scope === 'painted+n' && !painted.has(slugOf(f)) ? 0.4 : 1);
    // taban dolgu: bayrak ya da tema rengi
    const flagInfo = {};   // bayrak + şehir sınırı modundaki boyalı ülkeler: bayrak görseli ve parça kutuları
    for (const f of shown) {
      const sl = slugOf(f), code = A.FLAG_CODE[f.properties.id], img = st.flags && data.flagImgs && (painted.has(sl) || !painted.size) ? data.flagImgs[code] : null;
      const shape = shapeOf(f);
      const soft = !!img && st.cityBorders && painted.has(sl) && !!data.detail[sl];   // boyasız bölgeler soluk bayrak, boyalılar tam bayrak
      ctx.globalAlpha = fade(f);
      if (img) {
        const gs = groupsOf(shape, pp), th = A.flagAngle(f, proj);
        if (soft) { flagInfo[sl] = { img, gs, th }; ctx.beginPath(); path(shape); ctx.fillStyle = th.land; ctx.fill(); }
        const baseA = ctx.globalAlpha;
        if (soft) ctx.globalAlpha = baseA * FLAG_FADE;
        gs.forEach((g) => {
          if (!hits(g.b, T.vis)) return;
          const w = g.b[1][0] - g.b[0][0], h = g.b[1][1] - g.b[0][1];
          if (w <= 0 || h <= 0) return;
          ctx.save(); ctx.beginPath(); path({ type: 'MultiPolygon', coordinates: g.coords }); ctx.clip();
          drawFlagImg(ctx, img, g, th);
          ctx.restore();
        });
        ctx.globalAlpha = baseA;
      } else { ctx.beginPath(); path(shape); ctx.fillStyle = th.land; ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // boyalı bölgeler bayrağın/tabanın üstünde; yakın zoom'da boyasız ülkelerin şehir sınırları da çizilir
    const regionLabels = [];
    shown.forEach((f) => {
      const sl = slugOf(f), d = data.detail[sl];
      if (!d) return;
      const isPainted = painted.has(sl);
      if (isPainted && !st.cityBorders) {
        if (st.flags && data.flagImgs && data.flagImgs[A.FLAG_CODE[f.properties.id]]) return;   // bayrak açıkken ülke tek parça bayrakla dolu
        const dom = A.dominantColor(sl);
        if (dom) { ctx.beginPath(); path(d.outline); ctx.fillStyle = dom; ctx.fill(); }
        return;
      }
      if (!st.cityBorders && !isPainted) return;
      const rfs = d.fc.features.filter((rf) => hits(pp.bounds(rf), T.vis));
      const fi = flagInfo[sl];
      if (isPainted && fi) rfs.forEach((rf) => {
        // boyalı bölge: ülkenin tek bayrak desenindeki kendi parçası + hafif renk tonu + renkli çerçeve
        const col = d.colors[rf.properties.id];
        if (!col) return;
        const c = pp.centroid(rf);
        const g = [...fi.gs].reverse().find((q) => c[0] >= q.b[0][0] && c[0] <= q.b[1][0] && c[1] >= q.b[0][1] && c[1] <= q.b[1][1]) || fi.gs[0];
        ctx.save(); ctx.beginPath(); path(rf); ctx.clip();
        if (g) drawFlagImg(ctx, fi.img, g, fi.th);
        ctx.globalAlpha = FLAG_TINT; ctx.fillStyle = col; ctx.beginPath(); path(rf); ctx.fill();
        ctx.restore();
        ctx.beginPath(); path(rf); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, 2.5 * (W / 1200)) / S; ctx.stroke();
        if (st.cityNames) regionLabels.push(rf);
      });
      else if (isPainted) rfs.forEach((rf) => {
        const col = d.colors[rf.properties.id];
        if (!col) return;
        ctx.beginPath(); path(rf); ctx.fillStyle = col;
        if (st.glow) { ctx.shadowColor = col; ctx.shadowBlur = Math.max(4, W * 0.005); }
        ctx.fill(); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
        if (st.cityNames) regionLabels.push(rf);
      });
      ctx.strokeStyle = th.sub; ctx.lineWidth = lw * 0.45; ctx.globalAlpha = 0.6 * cityOp;
      rfs.forEach((rf) => { ctx.beginPath(); path(rf); ctx.stroke(); });
      ctx.globalAlpha = 1;
    });
    // ülke sınırları (küçük ülkelerde en az ~1,5 px)
    ctx.strokeStyle = th.border; ctx.lineWidth = Math.max(lw * 1.4, 1.5 / S);
    shown.forEach((f) => { ctx.globalAlpha = fade(f); ctx.beginPath(); path(shapeOf(f)); ctx.stroke(); });
    ctx.globalAlpha = 1;
    // etiketler: ülke adları (boyalı ülkeler) ve boyalı şehirlerin adları — yalnızca görünür olanlar
    if (st.countryNames && painted.size) {
      const feats = shown.filter((f) => painted.has(slugOf(f)));
      drawLabels(ctx, A.layoutLabels(feats, proj, pp, (unit * 1.1) / S), th, bodyOf, S);
    }
    if (regionLabels.length) drawLabels(ctx, A.layoutLabels(regionLabels, proj, pp, (unit * 0.9) / S), th, bodyOf, S);
    ctx.restore();
  }

  // ---------- yazı tipleri ----------
  async function ensureFonts() {
    const loads = [];
    ['HB Inter', (FONTS[st.font] || FONTS.sans).fam].forEach((fam) => {
      const w = (Object.values(FONTS).find((f) => f.fam === fam) || FONTS.sans).w;
      loads.push(document.fonts.load(w + ' 40px "' + fam + '"', 'AaÇçĞğİıÖöŞşÜü'), document.fonts.load(w + ' 40px "' + fam + '"', 'Abc'));
    });
    try { await Promise.all(loads); } catch (e) { /* yedek yazı tipi kullanılır */ }
  }

  // ---------- arayüz ----------
  let modal = null, canvas = null, dataCache = null, dataKey = '';
  function build() {
    modal = document.createElement('div');
    modal.className = 'exp-modal'; modal.id = 'expModal'; modal.hidden = true;
    modal.innerHTML =
      '<div class="exp-card" role="dialog" aria-modal="true" aria-labelledby="expTitle">' +
      '<header class="exp-head"><h2 id="expTitle">Haritayı Dışa Aktar</h2><button type="button" class="exp-x" id="expX" aria-label="Kapat">✕</button></header>' +
      '<div class="exp-body"><div class="exp-settings" id="expSettings"></div>' +
      '<div class="exp-preview"><div class="exp-stage" id="expStage"><canvas id="expCanvas" aria-label="Önizleme"></canvas><div class="exp-busy" id="expBusy" hidden><span class="spin"></span> Hazırlanıyor…</div></div>' +
      '<p class="exp-info" id="expInfo"></p></div></div>' +
      '<footer class="exp-foot"><span class="exp-warn" id="expWarn" role="status"></span>' +
      '<button type="button" class="exp-btn" id="expShare" hidden>Paylaş</button>' +
      '<button type="button" class="exp-btn" id="expCopy" hidden>Panoya kopyala</button>' +
      '<button type="button" class="exp-btn" id="expClose">Kapat</button>' +
      '<button type="button" class="exp-btn primary" id="expDl">PNG olarak indir</button></footer></div>';
    document.body.appendChild(modal);
    canvas = modal.querySelector('#expCanvas');
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#expX').addEventListener('click', close);
    modal.querySelector('#expClose').addEventListener('click', close);
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        const f = [...modal.querySelectorAll('button, input, select, textarea')].filter((el) => !el.disabled && el.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    modal.querySelector('#expDl').addEventListener('click', download);
    modal.querySelector('#expShare').addEventListener('click', share);
    modal.querySelector('#expCopy').addEventListener('click', copy);
    window.addEventListener('resize', () => { if (!modal.hidden) schedule(); });
    // ayar denetimleri (olay delegasyonu)
    const box = modal.querySelector('#expSettings');
    box.addEventListener('input', onCtl); box.addEventListener('change', onCtl);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-size], [data-font], [data-q], [data-theme]');
      if (!b) return;
      if (b.dataset.theme) st.theme = b.dataset.theme;
      if (b.dataset.size) st.size = b.dataset.size;
      if (b.dataset.font) st.font = b.dataset.font;
      if (b.dataset.q) st.q = +b.dataset.q;
      saveSettings(); fillSettings(); schedule();
    });
  }
  function onCtl(e) {
    const el = e.target, k = el.dataset.k;
    if (k) {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'cw' || k === 'ch') v = clamp(+v || 0, 0, 6000);
      st[k] = v;
      saveSettings();
      if (k === 'legend' || k === 'autoLegend' || k === 'size' || k === 'scope' || k === 'fitMode') fillSettings();
      schedule();
    } else if (el.dataset.txt) {
      setText(el.dataset.txt, el.value); schedule();
    } else if (el.dataset.leg) {
      const m = legendLabels(); m[el.dataset.leg] = el.value; lsSet(LEG_KEY, JSON.stringify(m)); schedule();
    }
  }

  const chk = (k, label) => '<label class="exp-chk"><input type="checkbox" data-k="' + k + '"' + (st[k] ? ' checked' : '') + '> <span>' + label + '</span></label>';
  const sel = (k, opts) => '<select data-k="' + k + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (st[k] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
  const sec = (t, body) => '<fieldset class="exp-sec"><legend>' + t + '</legend>' + body + '</fieldset>';
  function fillSettings() {
    const eu = src.mode === 'europe';
    const fonts = Object.entries(FONTS).map(([id, f]) => '<button type="button" class="exp-card-btn' + (st.font === id ? ' on' : '') + '" data-font="' + id + '" style="font-family:\'' + f.fam + '\',sans-serif;font-weight:' + f.w + '" aria-pressed="' + (st.font === id) + '">' + f.label + '</button>').join('');
    const sizes = SIZES.map((z) => '<button type="button" class="exp-card-btn' + (st.size === z.id ? ' on' : '') + '" data-size="' + z.id + '" aria-pressed="' + (st.size === z.id) + '"><b>' + z.label + '</b><small>' + (z.id === 'custom' ? 'elle gir' : z.id === 'screen' ? (cap ? Math.round(cap.rw) + '×' + Math.round(cap.rh) : 'ekran') : z.w + '×' + z.h) + '</small></button>').join('');
    const qs = [1, 2, 3].map((q) => '<button type="button" class="exp-card-btn' + (st.q === q ? ' on' : '') + '" data-q="' + q + '" aria-pressed="' + (st.q === q) + '"><b>' + q + 'x</b></button>').join('');
    const themeCards = Object.entries(THEMES).map(([id, t]) =>
      '<button type="button" class="exp-theme' + (st.theme === id ? ' on' : '') + '" data-theme="' + id + '" aria-pressed="' + (st.theme === id) + '">' +
      '<span class="exp-sw" style="background:linear-gradient(135deg,' + t.bg + ' 0 50%,' + t.land + ' 50% 100%);border-color:' + t.border + '"><i style="background:' + t.accent + '"></i></span>' +
      '<b>' + t.name + '</b></button>').join('');
    const used = usedColors(), labels = legendLabels();
    const legRows = used.filter((c) => st.autoLegend || (labels[c] || '').trim()).map((c) =>
      '<label class="exp-leg"><i style="background:' + c + '"></i><input type="text" data-leg="' + c + '" value="' + String(labels[c] || '').replace(/"/g, '&quot;') + '" placeholder="' + A.colorName(c) + '" maxlength="40" aria-label="' + A.colorName(c) + ' rengi için etiket"></label>').join('');
    modal.querySelector('#expSettings').innerHTML =
      sec('Boyut', '<div class="exp-grid">' + sizes + '</div>' +
        (st.size === 'custom' ? '<div class="exp-row"><label>Genişlik <input type="number" data-k="cw" min="200" max="6000" value="' + st.cw + '"></label><label>Yükseklik <input type="number" data-k="ch" min="200" max="6000" value="' + st.ch + '"></label></div><small class="exp-hint">En fazla 6000 px.</small>' : '') +
        '<div class="exp-sub">Kalite (piksel yoğunluğu)</div><div class="exp-grid q">' + qs + '</div>') +
      sec('Başlık', chk('showTitle', 'Başlığı göster') +
        '<label class="exp-fld">Başlık <input type="text" data-txt="title" value="' + getTitle().replace(/"/g, '&quot;') + '" maxlength="90"></label>' +
        '<label class="exp-fld">Alt yazı <input type="text" data-txt="sub" value="' + getSub().replace(/"/g, '&quot;') + '" maxlength="90" placeholder="ör. 2022-2026"></label>' +
        '<div class="exp-sub">Yazı tipi</div><div class="exp-grid q">' + fonts + '</div>' +
        chk('showStats', 'İstatistik satırı') + chk('showBar', 'İlerleme çubuğu')) +
      sec('Tema ve arka plan', '<div class="exp-sub">Tema</div><div class="exp-grid themes">' + themeCards + '</div>' +
        '<label class="exp-fld">Arka plan ' + sel('bg', [['solid', 'Düz renk'], ['gradient', 'Degrade'], ['transparent', 'Şeffaf']]) + '</label>') +
      sec('Kapsam', '<label class="exp-fld">' + sel('scope', (eu ? [['all', 'Tüm Avrupa'], ['view', 'Şu anki görünüm (zoom’u koru)'], ['painted', 'Sadece boyadığım ülkeler'], ['painted+n', 'Boyadığım ülkeler + komşuları']]
        : [['all', 'Tüm ülke'], ['view', 'Şu anki görünüm (zoom’u koru)']])) + '</label>' +
        (st.scope === 'view' ? '<label class="exp-fld">Kadraj ' + sel('fitMode', [['expand', 'Kadrajı genişlet (önerilen)'], ['fit', 'Kadrajı sığdır (boşluk kalır)'], ['fill', 'Kadrajı doldur (kenarlardan kırpar)']]) + '</label>' +
          (st.fitMode === 'fill' ? '<small class="exp-hint" style="color:#e0a43a">Dikkat: bu modda ekrandaki görünümün kenarları çıktı oranına göre kırpılır.</small>' : st.fitMode === 'expand' ? '<small class="exp-hint">Ekrandaki alan aynen korunur; eksik kalan üst/alt (ya da yan) kısımlar harita ile doldurulur.</small>' : '') + chk('visOnly', 'Sadece görünen alandakileri say') : '') +
        (eu ? chk('neighbors', 'Çevre ülkeleri göster') + (st.scope === 'view' ? chk('cityNames', 'Boyalı şehirlerin adlarını göster') : '') : '')) +
      sec('Görünüm', chk('cityBorders', 'Şehir sınırlarını göster') + (eu ? chk('flags', 'Bayrakları göster') + chk('countryNames', 'Ülke adlarını göster') : chk('cityNames', 'Şehir adlarını göster')) +
        '<label class="exp-fld">Sınır kalınlığı ' + sel('lineW', [['thin', 'İnce'], ['normal', 'Normal'], ['thick', 'Kalın']]) + '</label>' + chk('glow', 'Boyalı bölgelerde hafif parlama')) +
      sec('Lejant', chk('legend', 'Lejantı göster') +
        (st.legend ? '<label class="exp-fld">Konum ' + sel('legendPos', [['bl', 'Sol alt'], ['br', 'Sağ alt'], ['tl', 'Sol üst'], ['tr', 'Sağ üst']]) + '</label>' + chk('autoLegend', 'Kullanılan renkleri otomatik ekle') +
          (legRows ? '<div class="exp-legs">' + legRows + '</div><small class="exp-hint">Etiket yazmazsan renk adı (ör. Mavi) kullanılır; otomatik ekleme kapalıysa etiketsiz renkler görünmez.</small>' : '<small class="exp-hint">Henüz boyanmış renk yok.</small>') : '')) +
      sec('Diğer', chk('watermark', 'Filigran (Harita Boyama)') + chk('date', 'Tarih etiketi'));
  }

  function open(opts) {
    if (!modal) build();
    src = A.slug ? { mode: 'country', slug: A.slug } : { mode: 'europe', slug: null };
    try { cap = A.getView(); } catch (e) { cap = null; }   // açıldığı andaki görünüm; pencere açıkken ana haritada zoom değişse de sabit kalır
    if (!cap || !cap.proj) cap = { k: 1, x: 0, y: 0, W: 1000, H: 700, rw: 1200, rh: 750, proj: null, zoomed: false };
    st = loadSettings();
    const valid = src.mode === 'europe' ? ['all', 'painted', 'painted+n'] : ['all'];
    // zoom/pan yapılmışsa "şu anki görünüm"; yapılmamışsa son seçilen kapsam (görünüm hariç)
    if (cap.proj && ((opts && opts.view) || cap.zoomed)) st.scope = 'view';
    else st.scope = valid.includes(st.scope) ? st.scope : 'all';
    if (st.scope === 'view' && !cap.proj) st.scope = 'all';
    lastFocus = document.activeElement;
    dataCache = null; dataKey = '';
    fillSettings();
    modal.hidden = false;
    document.body.classList.add('exp-open');
    modal.querySelector('#expShare').hidden = !(navigator.canShare && navigator.share);
    modal.querySelector('#expCopy').hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
    modal.querySelector('#expDl').focus();
    schedule(0);
  }
  function close() {
    if (!modal || modal.hidden) return;
    token++;
    modal.hidden = true;
    document.body.classList.remove('exp-open');
    dataCache = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(runPreview, delay == null ? 90 : delay);
  }
  async function getData() {
    const dm = dims();
    const key = src.mode + '|' + (src.slug || '') + '|' + st.flags + '|' + st.scope + '|' + st.cityBorders + '|' + dm.w + 'x' + dm.h + '|' + JSON.stringify(A.countries.map((c) => A.paintedOf(c.slug)));
    if (dataCache && dataKey === key) return dataCache;
    dataCache = await prepare(); dataKey = key;
    return dataCache;
  }
  async function runPreview() {
    const my = ++token, busy = modal.querySelector('#expBusy');
    busy.hidden = false;
    try {
      await ensureFonts();
      const data = await getData();
      if (my !== token) return;
      const { w, h } = dims();
      const stage = modal.querySelector('#expStage');
      stage.classList.toggle('checker', st.bg === 'transparent');
      // önizleme: sahneye sığan, ekran yoğunluğuna uygun düşük çözünürlük
      const maxW = stage.clientWidth - 8, maxH = stage.clientHeight - 8;
      const k = Math.min(maxW / w, maxH / h);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = Math.max(40, Math.floor(w * k)) + 'px'; canvas.style.height = Math.max(40, Math.floor(h * k)) + 'px';
      await render(canvas, data, w, h, Math.max(0.05, (w * k * dpr) / w), () => my !== token);
      if (my !== token) return;
      const o = outScale();
      modal.querySelector('#expInfo').textContent = 'Çıktı: ' + o.pw + ' × ' + o.ph + ' piksel';
      modal.querySelector('#expWarn').textContent = o.reduced ? 'Seçilen kalite bu boyutta çok büyük olduğu için ' + o.sc + 'x’e düşürüldü.' : '';
    } catch (e) {
      console.error(e);
      modal.querySelector('#expWarn').textContent = 'Önizleme oluşturulamadı. Ayarları değiştirip tekrar dene.';
    } finally {
      if (my === token) busy.hidden = true;
    }
  }

  async function makeBlob() {
    const o = outScale(), { w, h } = dims();
    await ensureFonts();
    const data = await getData();
    const c = document.createElement('canvas');
    await render(c, data, w, h, o.sc, null);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
  }
  async function withBusy(btn, label, fn) {
    const old = btn.textContent;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + label;
    try { await fn(); } catch (e) {
      console.error(e);
      modal.querySelector('#expWarn').textContent = 'PNG oluşturulamadı. Boyutu ya da kaliteyi düşürüp tekrar dene.';
    } finally { btn.disabled = false; btn.textContent = old; }
  }
  function download() {
    const btn = modal.querySelector('#expDl');
    withBusy(btn, 'Hazırlanıyor…', async () => {
      const blob = await makeBlob();
      const a = document.createElement('a');
      a.download = fileName(); a.href = URL.createObjectURL(blob);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      modal.querySelector('#expWarn').textContent = '';
    });
  }
  function share() {
    withBusy(modal.querySelector('#expShare'), 'Hazırlanıyor…', async () => {
      const blob = await makeBlob();
      const file = new File([blob], fileName(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: getTitle() }); } catch (e) { if (e.name !== 'AbortError') throw e; } }
      else modal.querySelector('#expWarn').textContent = 'Bu cihaz dosya paylaşımını desteklemiyor.';
    });
  }
  function copy() {
    withBusy(modal.querySelector('#expCopy'), 'Hazırlanıyor…', async () => {
      const blob = await makeBlob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      modal.querySelector('#expWarn').textContent = 'Panoya kopyalandı.';
    });
  }

  window.HaritaDisa = { open, close };
})();
