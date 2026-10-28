// Avrupa haritası: ülke genel görünümü + ülke içinde bölge boyama
(function () {
  'use strict';

  const PREFIX = 'harita-boyama:v1:';
  const V = window.HARITA_VERI || {};
  const countries = window.HARITA_ULKELER || [];
  const byId = Object.fromEntries(countries.map(c => [c.id, c]));
  const bySlug = Object.fromEntries(countries.map(c => [c.slug, c]));
  const $ = id => document.getElementById(id);

  const W = 1000;
  let H = 720;             // kutunun en-boy oranına göre ölçülür (measure)
  const SMALL_AREA = 150;      // px² (Avrupa görünümünde): altındaki ülkelere geniş (görünmez) tıklama alanı eklenir
  const svg = d3.select('#euroMap');
  const tooltip = $('tooltip');
  const colorPicker = $('colorPicker');
  const selectedName = $('selectedName');
  const backBtn = $('backBtn');
  const titleEl = $('title');
  const subtitleEl = $('subtitle');
  const sumMain = $('sumMain');
  const sumSub = $('sumSub');
  const pngBtn = $('pngBtn');
  const eraseBtn = $('eraseBtn');
  const fileOf = c => c.file || ('data/c/' + c.slug + '.js');
  // veri adlarındaki "ili" gibi ekleri temizle (etiketlerde "II" gibi görünüyordu)
  const SUFFIX = /\s+(ili|İli|Ili|Belediyesi|Beledyesi|Oblastı|Voblastı|Rayonu|rayonu|Bölgesi|İlçesi|Voyvodalığı|Kantonu|Krayı|Kontluğu|Okrugu|kazası)$/;
  const nameOf = d => (d.properties.name || '').replace(/\s+(ili|İli|Ili)$/, '').trim() || 'Bölge';
  const labelOf = d => { const n = (d.properties.name || '').trim(); return n.replace(SUFFIX, '').trim() || n; };

  const presetColors = [
    '#1032ff', '#ff1010', '#0eff0e', '#fff609', '#c209ff', '#ff09f1',
    '#00c6ff', '#ff7800', '#119300', '#90ff00', '#00ffa8', '#c8c8c8'
  ];
  // renk adları (Türkçe): hazır renkler tam adıyla, özel renkler en yakın adla gösterilir (#ff10... gibi kod görünmesin)
  const COLOR_NAMES = [
    ['#1032ff', 'Mavi'], ['#ff1010', 'Kırmızı'], ['#0eff0e', 'Yeşil'], ['#fff609', 'Sarı'], ['#c209ff', 'Mor'], ['#ff09f1', 'Pembe'],
    ['#00c6ff', 'Açık mavi'], ['#ff7800', 'Turuncu'], ['#119300', 'Koyu yeşil'], ['#90ff00', 'Limon yeşili'], ['#00ffa8', 'Turkuaz'], ['#c8c8c8', 'Gri'],
    ['#000000', 'Siyah'], ['#ffffff', 'Beyaz'], ['#7f7f7f', 'Koyu gri'], ['#8b4513', 'Kahverengi'], ['#ffc0cb', 'Açık pembe'], ['#000080', 'Lacivert'],
    ['#800000', 'Bordo'], ['#808000', 'Zeytin yeşili'], ['#f5deb3', 'Bej'], ['#ffd700', 'Altın'], ['#4b0082', 'Çivit'], ['#40e0d0', 'Turkuaz'], ['#e6e6fa', 'Lavanta']
  ];
  const rgbOf = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  function colorName(hex) {
    const key = String(hex).toLowerCase(), exact = COLOR_NAMES.find(c => c[0] === key);
    if (exact) return exact[1];
    const a = rgbOf(key);
    if (!a) return 'Renk';
    let best = null, bd = Infinity;
    COLOR_NAMES.forEach(c => { const b = rgbOf(c[0]), d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bd) { bd = d; best = c[1]; } });
    return best;
  }
  const notify = msg => (window.haritaBildir ? window.haritaBildir(msg) : console.warn(msg));

  let slug = null;       // açık ülke (null = Avrupa görünümü)
  let selected = null;   // seçili bölge id'si
  let color = '#ff1010';
  let root = null;       // yakınlaştırma uygulanan <g>
  let loadToken = 0;
  let zoomK = 1;
  const loadedDetail = new Set();   // ayrıntı dosyası istenmiş küçük ülkeler
  let rescale = () => {};
  let applyDetail = () => {};   // Avrupa görünümünde yakınlaşınca ayrıntılı ülke sınırlarına geçer

  // ---------- yerel kayıt ----------
  // birleştirilen küçük bölgelerin eski kayıtları (data/merge-map.js) büyük bölgeye taşınır; kayıt dosyası değişmeden okunur
  const MERGED = window.HARITA_BIRLESIK || {};
  function migrate(o) {
    Object.keys(o).forEach(k => {
      const t = MERGED[k];
      if (t === undefined) return;
      if (!o[t]) o[t] = o[k];
      delete o[k];
    });
    return o;
  }
  function load(s) {
    try {
      const o = JSON.parse(localStorage.getItem(PREFIX + s) || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? migrate(o) : {};
    } catch (e) { return {}; }
  }
  function save(s, obj) {
    try {
      if (Object.keys(obj).length) localStorage.setItem(PREFIX + s, JSON.stringify(obj));
      else localStorage.removeItem(PREFIX + s);
    } catch (e) {
      notify('Boyama bu cihaza kaydedilemedi (tarayıcı depolaması kapalı olabilir).');
    }
    window.dispatchEvent(new CustomEvent('harita:kayit', { detail: { slug: s } }));
  }
  const paintedOf = s => Object.keys(load(s)).length;
  const unitOf = s => (s === 'turkiye' ? 'şehir' : 'bölge');

  // ---------- arayüz: tema, palet ----------
  const THEMES = [
    { id: 'gece', label: 'Karanlık', dot: '#424242' },
    { id: 'aydinlik', label: 'Aydınlık', dot: '#ffffff' },
    { id: 'okyanus', label: 'Okyanus', dot: '#00c2d1' },
    { id: 'gunbatimi', label: 'Gün Batımı', dot: '#ff7a59' }
  ];
  const themesEl = $('themes');
  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem('harita-tema', id); } catch (e) { /* yoksay */ }
    themesEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === id)));
  }
  THEMES.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-card';
    b.dataset.theme = t.id;
    b.innerHTML = '<i class="theme-dot" style="background:' + t.dot + '"></i><span>' + t.label + '</span>';
    b.addEventListener('click', () => applyTheme(t.id));
    themesEl.appendChild(b);
  });
  applyTheme(THEMES.some(t => t.id === document.documentElement.dataset.theme) ? document.documentElement.dataset.theme : 'gece');


  const swatchesEl = $('swatches');
  function setColor(c, btn) {
    color = c;
    colorPicker.value = c;
    swatchesEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    $('colorPicker').parentNode.classList.toggle('active', !btn);
  }
  presetColors.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = c;
    b.title = colorName(c);
    b.setAttribute('aria-label', 'Renk ' + colorName(c));
    b.setAttribute('aria-pressed', String(c === color));
    b.addEventListener('click', () => setColor(c, b));
    swatchesEl.appendChild(b);
  });
  colorPicker.addEventListener('input', e => setColor(e.target.value, null));

  // seçili bölge: panelde adı, "Seçili Şehri Sil" ancak seçim varken etkin
  function setSelected(id, name) {
    selected = id;
    selectedName.textContent = id == null ? '-' : name;
    eraseBtn.disabled = id == null;
    const bub = $('selBubble');
    if (bub) { bub.textContent = id == null ? '' : name; bub.hidden = id == null; }
    svg.selectAll('path.region').classed('selected', r => id != null && r.properties.id === id);
  }
  eraseBtn.addEventListener('click', () => {
    if (!slug || selected == null) return;
    const cur = load(slug);
    delete cur[selected];
    save(slug, cur);
    svg.selectAll('path.region').filter(r => r.properties.id === selected).style('fill', null);
    updateSummary();
  });

  // şehir adlarını göster/gizle
  let showLabels = true;
  const labelsBtn = $('labelsBtn');
  labelsBtn.addEventListener('click', () => {
    showLabels = !showLabels;
    svg.classed('no-labels', !showLabels);
    labelsBtn.textContent = showLabels ? 'Şehir İsimlerini Gizle' : 'Şehir İsimlerini Göster';
    labelsBtn.setAttribute('aria-pressed', String(showLabels));
  });

  // ---------- ipucu kutusu ----------
  let tipTimer = null;
  function tip(e, text, hold) {
    tooltip.style.display = 'block';
    tooltip.textContent = text;
    const x = Math.min(e.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8);
    tooltip.style.left = Math.max(4, x) + 'px';
    tooltip.style.top = (e.clientY + 14) + 'px';
    clearTimeout(tipTimer);
    if (e.pointerType === 'touch') tipTimer = setTimeout(hideTip, hold || 1600);
  }
  function hideTip() { tooltip.style.display = 'none'; }

  // ---------- yakınlaştırma / kaydırma ----------
  // Zoom: tek <g> dönüşümü, kareler requestAnimationFrame ile birleştirilir; ağır işler (çizgi kalınlığı, LOD,
  // ayrıntılı geometri) zoom/pan bitince yapılır. En fazla uzaklaşma = "tümü sığar" (k=1).
  let curProj = null;   // ekrandaki haritanın projeksiyonu (dışa aktarma "şu anki görünüm" için)
  const isZoomedT = t => t.k > 1.01 || Math.abs(t.x) > 1 || Math.abs(t.y) > 1;
  function updateViewBtn() {
    const b = $('viewPngBtn');
    if (b) b.hidden = !isZoomedT(d3.zoomTransform(svg.node()));
  }
  let rafId = 0, pendingT = null, wasOpen = false;
  const zoom = d3.zoom()
    .scaleExtent([1, 60])
    .on('start', () => { svg.classed('moving', true); })
    .on('zoom', e => {
      pendingT = e.transform;
      zoomK = e.transform.k;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (root && pendingT) root.attr('transform', pendingT);
        const open = zoomK >= 2.2;
        if (open !== wasOpen) { wasOpen = open; rescale(); }   // ülkelerin şehir sınırlarıyla açılma eşiği
      });
    })
    .on('end', () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; if (root && pendingT) root.attr('transform', pendingT); }
      svg.classed('zoomed', zoomK > 1).classed('moving', false);
      updateViewBtn();
      applyStrokes();
      rescale();
      applyDetail();
    });
  // SVG kutusunun oranına göre viewBox'ı ayarla: harita kutuyu doldursun
  function measure() {
    const r = svg.node().getBoundingClientRect();
    if (r.width > 50 && r.height > 50) H = Math.round(Math.min(1500, Math.max(450, W * r.height / r.width)));
    svg.attr('viewBox', '0 0 ' + W + ' ' + H);
    // harita kartın tamamen dışına sürüklenemez
    zoom.extent([[0, 0], [W, H]]).translateExtent([[0, 0], [W, H]]);
  }
  svg.call(zoom);
  // dokunma/tıklama koruması: sürükleme (>8px) ya da iki parmak (pinch) sonrası gelen "click" yok sayılır
  let tapMoved = false, downXY = null;
  const downPtrs = new Set();
  svg.on('pointerdown.guard', e => { downPtrs.add(e.pointerId); tapMoved = downPtrs.size > 1; downXY = [e.clientX, e.clientY]; })
    .on('pointermove.guard', e => { if (downXY && Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 8) tapMoved = true; })
    .on('pointerup.guard pointercancel.guard', e => { downPtrs.delete(e.pointerId); if (!downPtrs.size) downXY = null; });
  const resetZoom = () => svg.call(zoom.transform, d3.zoomIdentity);
  $('zoomIn').addEventListener('click', () => svg.transition().duration(250).call(zoom.scaleBy, 1.6));
  $('zoomOut').addEventListener('click', () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6));
  $('zoomReset').addEventListener('click', () => svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity));

  // ---------- şehir sınırlarını gizle/göster, zoom'a göre çizgi kalınlığı ----------
  const BORDERS_KEY = 'harita-sehir-sinirlari';
  let cityBorders = true;
  try { cityBorders = localStorage.getItem(BORDERS_KEY) !== '0'; } catch (e) { /* yoksay */ }
  let refreshMerge = () => {};   // Avrupa görünümünde ülke bazlı boyamayı günceller

  // ---------- bayrak görünümü (yalnızca Avrupa ana sayfası, yalnızca görünüm) ----------
  // Bayraklar: flag-icons 7.2.3 (MIT), 4x3 SVG; ./flags/<iso2>.svg. Kuzey Kıbrıs (cyn) elle çizilmiştir.
  const FLAGS_KEY = 'harita-bayraklar';
  const FLAG_TINT = 0.2;   // bayrak + şehir sınırı modunda boyalı bölgelerin renk tonlaması gücü (0-1)
  const FLAG_FADE = 0.2;   // aynı modda boyasız bölgelerin bayrak opaklığı
  // ülkenin merkezindeki paralelin ekrandaki eğimi (radyan): bayrağın yatay ekseni bu açıyla döner
  function flagAngle(f, pr) {
    try {
      const c = d3.geoCentroid(f), a = pr(c), b = pr([c[0] + 0.5, c[1]]);
      const t = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const lim = 14 * Math.PI / 180;   // hafif eğim: çok doğudaki/geniş ülkelerde bayrak aşırı dönmesin
      return isFinite(t) ? Math.max(-lim, Math.min(lim, t)) : 0;
    } catch (e) { return 0; }
  }
  const FLAG_CODE = {
    DEU: 'de', AND: 'ad', ALB: 'al', AUT: 'at', AZE: 'az', BEL: 'be', BLR: 'by', GBR: 'gb', BIH: 'ba', BGR: 'bg', CZE: 'cz',
    DNK: 'dk', EST: 'ee', FIN: 'fi', FRA: 'fr', GEO: 'ge', HRV: 'hr', NLD: 'nl', IRL: 'ie', ESP: 'es', SWE: 'se', CHE: 'ch',
    ITA: 'it', ISL: 'is', MNE: 'me', CYP: 'cy', KOS: 'xk', CYN: 'cyn', MKD: 'mk', LVA: 'lv', LIE: 'li', LTU: 'lt', LUX: 'lu',
    HUN: 'hu', MLT: 'mt', MDA: 'md', MCO: 'mc', NOR: 'no', POL: 'pl', PRT: 'pt', ROU: 'ro', RUS: 'ru', SMR: 'sm', SRB: 'rs',
    SVK: 'sk', SVN: 'si', TUR: 'tr', UKR: 'ua', VAT: 'va', GRC: 'gr'
  };
  let flagsOn = false;
  try { flagsOn = localStorage.getItem(FLAGS_KEY) === '1'; } catch (e) { /* yoksay */ }
  const flagData = new Map();        // iso2 -> data URI (yüklendikten sonra; dışa aktarmada da gömülü kalır)
  const flagsTried = {};             // iso2 -> yükleme denendi (başarısız olsa da yeniden denenmez)
  let addFlags = () => {};           // Avrupa görünümünde bayrak katmanını (yeniden) kurar
  const flagsBtn = $('flagsBtn');
  // Bayrak yalnızca içinde boyalı bölge olan ülkelerde görünür; yalnızca onların görselleri yüklenir (tembel)
  // hiç boyalı ülke yoksa bayrak modu tüm ülkelerin bayrağını gösterir
  const nonePainted = () => !countries.some(c => paintedOf(c.slug) > 0);
  const neededCodes = () => { const all = nonePainted(); return [...new Set(countries.filter(c => all || paintedOf(c.slug) > 0).map(c => FLAG_CODE[c.id]).filter(Boolean))]; };
  // bayrak görselinin kutuya oturumu: tam kaplar; çok geniş/uzun ülkelerde (Türkiye gibi) bayrağın aşırı büyümemesi için
  // bir eksen en fazla ~%38 sıkıştırılır (hafif yatay/dikey esneme)
  function flagDims(w, h, th) {
    const cs = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
    let sx = (w * cs + h * sn) / 4, sy = (w * sn + h * cs) / 3;
    if (sx > sy) sy = Math.max(sy, 0.62 * sx); else sx = Math.max(sx, 0.62 * sy);
    return { iw: 4 * sx, ih: 3 * sy };
  }
  const missingCodes = () => neededCodes().filter(c => !flagsTried[c]);
  function loadFlags(codes) {
    return Promise.all((codes || neededCodes()).filter(code => !flagsTried[code]).map(code => (flagsTried[code] = fetch('./flags/' + code + '.svg')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(t => { if (/<svg/.test(t)) {
        // iç boyut yoksa <image> "slice" kutuyu yanlış doldurur: 4:3 boyutu açıkça yazılır
        const sized = /<svg[^>]*\swidth=/.test(t) ? t : t.replace('<svg', '<svg width="640" height="480"');
        flagData.set(code, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized));
      } })
      .catch(() => { /* bu ülke düz renkte kalır */ }))));
  }
  function applyFlags() {
    flagsBtn.textContent = flagsOn ? 'Bayrakları gizle' : 'Bayrakları göster';
    flagsBtn.setAttribute('aria-pressed', String(flagsOn));
    svg.classed('flags-on', flagsOn && !slug);
    flagsBtn.disabled = false;
    if (flagsOn && !slug && missingCodes().length) startFlags();
  }
  function startFlags() {
    flagsBtn.disabled = true;
    flagsBtn.textContent = 'Bayraklar yükleniyor…';
    loadFlags().then(() => { addFlags(); refreshMerge(); applyFlags(); });
  }
  flagsBtn.addEventListener('click', () => {
    flagsOn = !flagsOn;
    try { localStorage.setItem(FLAGS_KEY, flagsOn ? '1' : '0'); } catch (e) { /* yoksay */ }
    if (flagsOn && missingCodes().length) startFlags(); else { addFlags(); refreshMerge(); applyFlags(); }
  });

  const bordersBtn = $('bordersBtn');
  function applyBorders() {
    svg.classed('no-city', !cityBorders && !slug);
    bordersBtn.textContent = cityBorders ? 'Şehir sınırlarını gizle' : 'Şehir sınırlarını göster';
    bordersBtn.setAttribute('aria-pressed', String(cityBorders));
    refreshMerge();
  }
  bordersBtn.addEventListener('click', () => {
    cityBorders = !cityBorders;
    try { localStorage.setItem(BORDERS_KEY, cityBorders ? '1' : '0'); } catch (e) { /* yoksay */ }
    applyBorders();
  });

  // Şehir sınırları gizliyken ülke tek renk görünür: en çok kullanılan renk, eşitlikte en son boyanan.
  // Yalnızca görünüm; kayıtlı veriye dokunulmaz.
  function dominantColor(s) {
    const counts = {}, last = {};
    Object.values(load(s)).forEach((c, i) => { counts[c] = (counts[c] || 0) + 1; last[c] = i; });
    let best = null;
    Object.keys(counts).forEach(c => {
      if (best === null || counts[c] > counts[best] || (counts[c] === counts[best] && last[c] > last[best])) best = c;
    });
    return best;
  }
  function applyStrokes() {
    const f = Math.min(1.6, 1 + 0.18 * Math.log2(zoomK));
    svg.node().style.setProperty('--sw-sub', (0.4 * f).toFixed(2));
    svg.node().style.setProperty('--sw-country', (0.9 * f).toFixed(2));
    svg.node().style.setProperty('--city-op', zoomK < 1.8 ? '.45' : '1');   // uzaktayken şehir sınırları gürültü yapmasın
    svg.node().style.setProperty('--pad', Math.max(2, 16 / zoomK).toFixed(1));   // küçük ülke tıklama alanı yakınlaştıkça daralır
  }

  // ---------- özet / ilerleme ----------
  function setBar(n, total) {
    const pct = total ? Math.min(100, 100 * n / total) : 0;
    $('barFill').style.width = (n > 0 ? Math.max(pct, 1.5) : 0) + '%';
    $('bar').setAttribute('aria-valuenow', String(Math.round(pct)));
  }
  function updateSummary() {
    if (slug) {
      const c = bySlug[slug], n = paintedOf(slug);
      sumMain.textContent = n + ' / ' + c.regions + ' ' + unitOf(slug) + ' boyandı';
      sumSub.textContent = '';
      $('statPainted').textContent = n;
      $('statTotal').textContent = c.regions;
      setBar(n, c.regions);
    } else {
      let cities = 0, started = 0, done = 0;
      countries.forEach(c => {
        const n = paintedOf(c.slug);
        cities += n;
        if (n > 0) started++;
        if (n >= c.regions) done++;
      });
      sumMain.textContent = cities + ' şehir, ' + started + ' ülke';
      sumSub.textContent = done ? done + ' ülke tamamlandı ✓' : '';
      setBar(cities, countries.reduce((a, c) => a + c.regions, 0));
    }
  }

  // ---------- mobil alt çekmece (ülke sayfası): küçük / yarı / tam ----------
  const sheet = $('sidePanel'), handle = $('sheetHandle');
  const SHEET_STATES = ['peek', 'half', 'full'];
  function setSheet(st) {
    sheet.dataset.sheet = st;
    sheet.style.removeProperty('--sheet-h');
    handle.setAttribute('aria-expanded', String(st !== 'peek'));
  }
  const sheetPx = () => ({ peek: 162, half: Math.round(window.innerHeight * 0.52), full: Math.round(window.innerHeight * 0.88) });
  let sdrag = null;
  handle.addEventListener('pointerdown', e => {
    sdrag = { y: e.clientY, h: sheet.getBoundingClientRect().height, moved: false };
    handle.setPointerCapture(e.pointerId);
    sheet.classList.add('dragging');
  });
  handle.addEventListener('pointermove', e => {
    if (!sdrag) return;
    const dy = sdrag.y - e.clientY;
    if (Math.abs(dy) > 6) sdrag.moved = true;
    if (sdrag.moved) { const px = sheetPx(); sheet.style.setProperty('--sheet-h', Math.max(px.peek, Math.min(px.full, sdrag.h + dy)) + 'px'); }
  });
  const endDrag = e => {
    if (!sdrag) return;
    const d = sdrag; sdrag = null;
    sheet.classList.remove('dragging');
    if (!d.moved) { if (e && e.type === 'pointerup') setSheet(SHEET_STATES[(SHEET_STATES.indexOf(sheet.dataset.sheet) + 1) % 3]); return; }
    const h = sheet.getBoundingClientRect().height, px = sheetPx();
    setSheet(SHEET_STATES.reduce((a, b) => (Math.abs(px[b] - h) < Math.abs(px[a] - h) ? b : a)));
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', () => endDrag(null));
  handle.addEventListener('click', e => { if (e.detail === 0) setSheet(SHEET_STATES[(SHEET_STATES.indexOf(sheet.dataset.sheet) + 1) % 3]); });   // klavye

  function setView(isCountry) {
    if (isCountry && document.body.classList.contains('in-country') === false) setSheet('peek');
    backBtn.hidden = !isCountry;
    $('sidePanel').hidden = !isCountry;
    document.body.classList.toggle('in-country', isCountry);
    hideTip();
    setSelected(null);
  }

  // ---------- Avrupa görünümü ----------
  function anchorOf(path, f) {
    const g = f.geometry;
    if (g.type === 'MultiPolygon') {
      let best = null, bestArea = -1;
      g.coordinates.forEach(coords => {
        const poly = { type: 'Polygon', coordinates: coords };
        const a = path.area(poly);
        if (a > bestArea) { bestArea = a; best = poly; }
      });
      return path.centroid(best);
    }
    return path.centroid(f);
  }

  function stateOf(c) {
    const n = paintedOf(c.slug);
    return n >= c.regions ? 'done' : n > 0 ? 'started' : '';
  }

  // Avrupa kadrajı: sabit hedef dikdörtgen (boylam -25…51, enlem 33…71,5; İzlanda, Kıbrıs, Kuzey Burnu, Kuzey Afrika kıyısı)
  // Lambert azimutal eşit alan (merkez 10°D, 52°K). Hedefin kenarları paralel/meridyen boyunca sıklaştırılır,
  // kartın gerçek ölçüsüne her kenardan 14px boşlukla ortalanarak sığdırılır. Grönland/Svalbard/Azorlar vb. hesaba girmez.
  const TARGET = (() => {
    const pts = [];
    for (let lo = -25; lo <= 51; lo += 1) { pts.push([lo, 33], [lo, 71.5]); }
    for (let la = 33; la <= 71.5; la += 1) { pts.push([-25, la], [51, la]); }
    return { type: 'MultiPoint', coordinates: pts };
  })();
  function europeProjection() {
    const rect = svg.node().getBoundingClientRect();
    const m = 14 * W / Math.max(rect.width || W, 1);
    return d3.geoAzimuthalEqualArea().rotate([-10, -52]).fitExtent([[m, m], [W - m, H - m]], TARGET);
  }
  // Kadraj dışı uzak parçalar çizilmez: Grönland, Azorlar, Madeira/Kanarya, Svalbard ve kuzey adaları
  function dropFar(fc) {
    const far = pc => {
      let c; try { c = d3.geoCentroid({ type: 'Polygon', coordinates: pc }); } catch (e) { return false; }
      const lo = c[0], la = c[1];
      return (lo < -25.5 && lo > -60) || la > 72.5 || (la < 31.5 && lo > -20 && lo < -8) || (la < 28 && lo < -5 && lo > -60);
    };
    fc.features = fc.features.filter(f => f.properties.id !== 'GRL' && f.geometry).map(f => {
      if (f.geometry.type !== 'MultiPolygon') return f;
      const kept = f.geometry.coordinates.filter(pc => !far(pc));
      return kept.length ? { ...f, geometry: { type: 'MultiPolygon', coordinates: kept } } : null;
    }).filter(Boolean);
    return fc;
  }

  function showEurope() {
    loadToken++;
    slug = null;
    setView(false);
    titleEl.textContent = 'Bir ülke seç';
    subtitleEl.textContent = 'Avrupa haritasında boyamak istediğin ülkeye tıkla';
    measure();
    applyBorders();
    refreshMerge = () => {};
    addFlags = () => {};
    applyDetail = () => {};
    svg.attr('aria-label', 'Avrupa haritası').selectAll('*').remove();
    root = svg.append('g').attr('class', 'root');
    resetZoom();

    const fc = dropFar(topojson.feature(V.europe, V.europe.objects.in));
    const proj = europeProjection();
    curProj = proj;
    const path = d3.geoPath(proj);

    root.append('g').selectAll('path').data(fc.features.filter(f => !f.properties.l))
      .join('path').attr('class', 'bg').attr('d', path);

    // alt bölgeler (boyalıysa seçilen renk, değilse açık gri).
    // Boyama yapılmamış ülkeler kapalı (düz koyu) başlar; yaklaşınca açılır.
    const groups = {}, hitNodes = {}, bounds = {};
    const started = new Set(countries.filter(c => paintedOf(c.slug) > 0).map(c => c.slug));
    const flagG = root.append('g').attr('class', 'flags');   // bayraklar bölgelerin altında: boyalı yerler bayrağı örter
    const regionsG = root.append('g');
    const tintFeats = [];   // boyalı bölgeler: bayrak modunda rengin tonlaması ayrı katmanda çizilir
    countries.forEach(c => {
      const obj = V.regions && V.regions.objects[c.slug];
      if (!obj) return;
      const colors = load(c.slug);
      const feats = topojson.feature(V.regions, obj).features;
      groups[c.slug] = regionsG.append('g').attr('class', 'cregions closed');
      groups[c.slug].selectAll('path').data(feats)
        .join('path').attr('class', d => 'region' + (colors[d.properties.id] ? ' painted' : '')).attr('d', path)
        .style('fill', d => colors[d.properties.id] || null)
        .style('--rc', d => colors[d.properties.id] || null);
      feats.forEach(f => { if (colors[f.properties.id]) tintFeats.push({ f, color: colors[f.properties.id] }); });
    });
    svg.node().style.setProperty('--tint', FLAG_TINT);
    svg.node().style.setProperty('--flag-fade', FLAG_FADE);
    const tintG = root.append('g').attr('class', 'tints');
    tintG.selectAll('path').data(tintFeats).join('path').attr('class', 'tint').attr('d', d => path(d.f)).style('--tc', d => d.color);

    // Küçük ülkelerde ana haritadaki sadeleşmiş çokgen kaybolmuş olabilir: ülkenin kendi (ayrıntılı) verisinden
    // birleştirilmiş gerçek sınır kullanılır. Ayrıntı dosyası henüz yüklenmemişse yüklenip harita yeniden çizilir.
    const missing = [];
    const listed = fc.features.filter(f => f.properties.l && byId[f.properties.id]).map(f => {
      if (path.area(f) >= SMALL_AREA) return f;
      const sl = byId[f.properties.id].slug;
      const topo = V[sl];
      if (!topo && !loadedDetail.has(sl)) missing.push(sl);
      const src = topo || V.regions, obj = topo ? topo.objects[Object.keys(topo.objects)[0]] : V.regions && V.regions.objects[sl];
      if (!obj) return f;
      const alt = { type: 'Feature', properties: f.properties, geometry: topojson.merge(src, obj.geometries) };
      return path.area(alt) > 0 ? alt : f;
    });
    if (missing.length) {
      const token = loadToken;
      Promise.all(missing.map(sl => new Promise(res => {
        loadedDetail.add(sl);
        const el = document.createElement('script');
        el.src = './' + fileOf(bySlug[sl]);
        el.onload = el.onerror = res;
        document.head.appendChild(el);
      }))).then(() => { if (token === loadToken && !slug) showEurope(); });
    }
    const big = listed.filter(f => path.area(f) >= SMALL_AREA);
    const small = listed.filter(f => path.area(f) < SMALL_AREA);

    // bayrak katmanı: ülke başına bir kez pattern (ülkenin tüm parçalarının bbox'ına "slice"), zoom/pan'de yeniden hesap yok
    addFlags = () => {
      flagG.selectAll('*').remove();
      svg.select('defs.flagdefs').remove();
      if (!flagData.size) return;
      const defs = svg.insert('defs', ':first-child').attr('class', 'flagdefs');
      listed.forEach(f => {
        const code = FLAG_CODE[f.properties.id];
        if (!code || !flagData.has(code) || !(started.has(byId[f.properties.id].slug) || started.size === 0)) return;   // hiç boyası olmayan ülkede bayrak yok
        // Ülkenin parçaları (ana kara + yakın adalar/ayrık bölgeler) tek bir kutuya oturur: desen hiçbir parçada
        // tekrarlanıp kırık görünmez. Uzaktaki parçalar (Azorlar, Svalbard…) ana kutuyu şişirmesin diye kendi kutusunu alır.
        const g = f.geometry;
        const polys = (g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [])
          .map(coords => { const pf = { type: 'Polygon', coordinates: coords }; return { coords, area: path.area(pf), b: path.bounds(pf) }; })
          .filter(q => isFinite(q.b[0][0]));
        if (!polys.length) return;
        const main = polys.reduce((m, q) => (q.area > m.area ? q : m));
        const pad = 0.35 * Math.max(main.b[1][0] - main.b[0][0], main.b[1][1] - main.b[0][1]);
        const near = [], far = [];
        polys.forEach(q => {
          const cx = (q.b[0][0] + q.b[1][0]) / 2, cy = (q.b[0][1] + q.b[1][1]) / 2;
          (cx > main.b[0][0] - pad && cx < main.b[1][0] + pad && cy > main.b[0][1] - pad && cy < main.b[1][1] + pad ? near : far).push(q);
        });
        const groups2 = [near, ...far.map(q => [q])], gboxes = [];
        const slugF = byId[f.properties.id].slug, isStarted = started.has(slugF);
        groups2.forEach((grp, gi) => {
          const x0 = Math.min(...grp.map(q => q.b[0][0])), y0 = Math.min(...grp.map(q => q.b[0][1]));
          const x1 = Math.max(...grp.map(q => q.b[1][0])), y1 = Math.max(...grp.map(q => q.b[1][1]));
          const w = x1 - x0, h = y1 - y0, id = 'fl-' + code + '-' + gi;
          if (w <= 0 || h <= 0) return;
          gboxes.push({ id, x0, y0, x1, y1 });
          const pat = defs.append('pattern').attr('id', id).attr('patternUnits', 'userSpaceOnUse')
            .attr('x', x0).attr('y', y0).attr('width', w).attr('height', h);
          // "slice" elle hesaplanır (bayraklar 4:3): kutuyu tamamen kapla, fazlası desen kutusunda kırpılır
          // bayrak, projeksiyonun meridyen yakınsaması kadar döndürülür: yatay çizgileri ülkenin paralelini izler (eğik durmaz)
          const th = flagAngle(f, proj);
          const { iw, ih } = flagDims(w, h, th);
          pat.append('image').attr('href', flagData.get(code)).attr('x', (w - iw) / 2).attr('y', (h - ih) / 2)
            .attr('width', iw).attr('height', ih).attr('preserveAspectRatio', 'none')
            .attr('transform', 'rotate(' + (th * 180 / Math.PI).toFixed(2) + ' ' + (w / 2).toFixed(2) + ' ' + (h / 2).toFixed(2) + ')');
          flagG.append('path').attr('class', 'flag' + (isStarted ? ' started' : '')).attr('fill', 'url(#' + id + ')')
            .attr('d', path({ type: 'MultiPolygon', coordinates: grp.map(q => q.coords) }));
        });
        // boyalı bölgeler ülkenin bayrak desenini (bölgenin düştüğü parçanın deseni) doldurur; renk yalnızca çerçeve + hafif tonlama
        if (isStarted && groups[slugF] && gboxes.length) {
          groups[slugF].selectAll('path.painted').each(function (d) {
            const c = path.centroid(d);
            const hit = [...gboxes].reverse().find(g => c[0] >= g.x0 && c[0] <= g.x1 && c[1] >= g.y0 && c[1] <= g.y1) || gboxes[0];
            this.style.setProperty('--ff', 'url(#' + hit.id + ')');
            this.classList.add('flagfill');
          });
        }
      });
    };
    addFlags();

    // ülke sınırları (kalın) + tıklama alanı
    // dokunmatikte ilk dokunuş ülke adını gösterir, ikinci dokunuş ülkeyi açar; fare/klavye doğrudan açar
    let tapSlug = null, tapTimer = null;
    const openFn = (e, d) => {
      if (tapMoved) return;
      const sl = byId[d.properties.id].slug;
      if (e.pointerType === 'touch' && tapSlug !== sl) {
        tapSlug = sl; clearTimeout(tapTimer); tapTimer = setTimeout(() => { tapSlug = null; }, 3000);
        tip(e, byId[d.properties.id].name + ' \u2022 açmak için tekrar dokun', 2800);
        return;
      }
      tapSlug = null;
      go(sl);
    };
    const onKey = (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFn(e, d); } };
    root.append('g').selectAll('path').data(listed.filter(f => path.bounds(f)[0][0] < Infinity))
      .join('path')
      .attr('class', d => 'hit ' + stateOf(byId[d.properties.id]) + (path.area(d) < SMALL_AREA ? ' tiny' : ''))
      .attr('d', path)
      .each(function (d) {
        const slug = byId[d.properties.id].slug;
        hitNodes[slug] = this;
        const b = path.bounds(d);
        if (isFinite(b[0][0])) bounds[slug] = b;
      })
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', d => byId[d.properties.id].name + ' haritasını aç')
      .on('pointermove', (e, d) => tip(e, byId[d.properties.id].name))
      .on('pointerleave', hideTip)
      .on('click', openFn)
      .on('keydown', onKey);

    // tamamlanan büyük ülkelerde ✓
    const marks = root.append('g').selectAll('text')
      .data(big.filter(f => stateOf(byId[f.properties.id]) === 'done'))
      .join('text').attr('class', 'done-mark').text('✓')
      .attr('transform', d => 'translate(' + anchorOf(path, d) + ')');

    // küçük ülkelerin üstünde görünmez, geniş bir tıklama/hover alanı (yakınlaştıkça daralır, --pad)
    root.append('g').selectAll('path').data(small).join('path').attr('class', 'hitpad').attr('d', path)
      .on('pointermove', (e, d) => { tip(e, byId[d.properties.id].name); hitNodes[byId[d.properties.id].slug]?.classList.add('hover'); })
      .on('pointerleave', (e, d) => { hideTip(); hitNodes[byId[d.properties.id].slug]?.classList.remove('hover'); })
      .on('click', openFn);

    // şehir sınırları gizliyken boyalı ülkeler bütün olarak tek renkte görünür
    refreshMerge = () => {
      const merged = !cityBorders;
      countries.forEach(c => {
        const dom = merged ? dominantColor(c.slug) : null;
        const withFlag = !!dom && flagsOn && flagData.has(FLAG_CODE[c.id]);   // bayrak açıkken boyalı ülke tek parça bayrakla dolu
        const col = withFlag ? null : dom;
        if (groups[c.slug]) groups[c.slug].style('display', dom ? 'none' : null);
        if (hitNodes[c.slug]) d3.select(hitNodes[c.slug]).classed('merged', !!dom).style('fill', col);
        if (hitNodes[c.slug]) hitNodes[c.slug].classList.toggle('hasflag', flagsOn && flagData.has(FLAG_CODE[c.id]) && (started.has(c.slug) || started.size === 0));
        if (groups[c.slug]) groups[c.slug].classed('hasflag', flagsOn && flagData.has(FLAG_CODE[c.id]) && (started.has(c.slug) || started.size === 0));
      });
    };

    // boyanmış ya da ekrana yaklaşılmış ülkeler şehir sınırlarıyla açılır
    const updateLOD = () => {
      const t = d3.zoomTransform(svg.node()), k = t.k;
      const x0 = -t.x / k, y0 = -t.y / k, x1 = x0 + W / k, y1 = y0 + H / k;
      countries.forEach(c => {
        const g = groups[c.slug];
        if (!g) return;
        const b = bounds[c.slug];
        const open = started.has(c.slug) ||
          (k >= 2.2 && b && b[1][0] > x0 && b[0][0] < x1 && b[1][1] > y0 && b[0][1] < y1);
        g.classed('closed', !open).classed('fresh', !started.has(c.slug));
        if (hitNodes[c.slug]) hitNodes[c.slug].classList.toggle('closed', !open);
      });
    };

    // Yakınlaşınca (k≥5) görünen ülkeler kendi ayrıntılı verisinden çizilir (dosya tembel yüklenir); kaba sınır köşeli kalmasın
    const requested = new Set(), myRoot = root;
    const swapDetail = f => {
      const sl = byId[f.properties.id].slug, topo = V[sl];
      if (!topo || f.__detail) return;
      if (topo.planar || !topo.objects) { f.__detail = true; return; }   // Türkiye'nin dosyası düzlemsel: ayrıntı değişimi yok
      const g = topojson.merge(topo, topo.objects[Object.keys(topo.objects)[0]].geometries);
      if (!(path.area({ type: 'Feature', geometry: g }) > 0)) { f.__detail = true; return; }
      f.geometry = g;
      f.__detail = true;
      root.selectAll('path.hit, path.hitpad').filter(d => d === f).attr('d', path);
      // bölge (şehir) sınırları da ayrıntılı veriden: aynı id'li özellikler yeniden çizilir
      if (groups[sl]) {
        const det = {};
        topojson.feature(topo, topo.objects[Object.keys(topo.objects)[0]]).features.forEach(ft => { det[ft.properties.id] = ft; });
        groups[sl].selectAll('path').attr('d', d => (det[d.properties.id] ? path(det[d.properties.id]) : path(d)));
        tintG.selectAll('path.tint').filter(t => det[t.f.properties.id]).attr('d', t => path(det[t.f.properties.id]));
      }
      if (flagData.size) addFlags();
    };
    applyDetail = () => {
      if (zoomK < 5 || root !== myRoot) return;
      const t = d3.zoomTransform(svg.node()), k = t.k;
      const x0 = -t.x / k, y0 = -t.y / k, x1 = x0 + W / k, y1 = y0 + H / k;
      listed.forEach(f => {
        if (f.__detail) return;
        const sl = byId[f.properties.id].slug, b = bounds[sl];
        if (!b || !(b[1][0] > x0 && b[0][0] < x1 && b[1][1] > y0 && b[0][1] < y1)) return;
        if (V[sl]) { swapDetail(f); return; }
        if (requested.has(sl)) return;
        requested.add(sl);
        const el = document.createElement('script');
        el.src = './' + fileOf(bySlug[sl]);
        el.onload = () => { if (root === myRoot) swapDetail(f); };
        document.head.appendChild(el);
      });
    };

    // ✓ yakınlaştırmada aynı ekran boyutunda kalsın
    rescale = () => {
      updateLOD();
      const k = zoomK;
      marks.attr('font-size', 14 / k).attr('stroke-width', 3 / k);
    };
    rescale();
    refreshMerge();
    applyFlags();
    updateSummary();
  }

  // ---------- ülke görünümü ----------
  function go(s) {
    hideTip();
    if (location.hash === '#/ulke/' + s) route(); else location.hash = '/ulke/' + s;
  }

  function route() {
    const s = decodeURIComponent(location.hash.replace(/^#\/?(ulke\/)?/, ''));
    window.scrollTo(0, 0);
    if (s && bySlug[s]) openCountry(s); else showEurope();
  }

  function openCountry(s) {
    if (V[s]) return showCountry(s);
    const token = ++loadToken;
    slug = s;
    setView(true);
    titleEl.textContent = bySlug[s].name + ' Haritası';
    subtitleEl.textContent = 'Harita yükleniyor…';
    const el = document.createElement('script');
    el.src = './' + fileOf(bySlug[s]);
    el.onload = () => { if (token === loadToken) showCountry(s); };
    el.onerror = () => {
      el.remove();
      if (token !== loadToken) return;
      notify(bySlug[s].name + ' haritası yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
      location.hash = '/avrupa';
    };
    document.head.appendChild(el);
  }

  // ---------- etiket yerleşimi ----------
  // polylabel: çokgenin içinde kenarlara en uzak nokta (ızgara bölme yöntemi)
  function ringDist(x, y, rings) {
    let inside = false, minSq = Infinity;
    rings.forEach(r => {
      for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) {
        const a = r[i], b = r[j];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        let px = a[0], py = a[1], dx = b[0] - px, dy = b[1] - py;
        if (dx || dy) {
          const t = ((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy);
          if (t > 1) { px = b[0]; py = b[1]; } else if (t > 0) { px += dx * t; py += dy * t; }
        }
        dx = x - px; dy = y - py;
        const d = dx * dx + dy * dy;
        if (d < minSq) minSq = d;
      }
    });
    return (inside ? 1 : -1) * Math.sqrt(minSq);
  }
  function poleOf(rings, precision) {
    const outer = rings[0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    outer.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    const w = x1 - x0, h = y1 - y0, size = Math.min(w, h);
    const mk = (x, y, hh) => { const d = ringDist(x, y, rings); return { x, y, h: hh, d, max: d + hh * Math.SQRT2 }; };
    if (!size) return { x: x0, y: y0, r: 0 };
    let best = mk(x0 + w / 2, y0 + h / 2, 0);
    const queue = [];
    for (let x = x0; x < x1; x += size) for (let y = y0; y < y1; y += size) queue.push(mk(x + size / 2, y + size / 2, size / 2));
    let guard = 0;
    while (queue.length && guard++ < 4000) {
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[bi].max) bi = i;
      const c = queue.splice(bi, 1)[0];
      if (c.d > best.d) best = c;
      if (c.max - best.d <= precision) continue;
      const hh = c.h / 2;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(o => queue.push(mk(c.x + o[0] * hh, c.y + o[1] * hh, hh)));
    }
    return { x: best.x, y: best.y, r: Math.max(best.d, 0) };
  }
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(t) { measureCtx.font = '700 100px sans-serif'; return measureCtx.measureText(t).width / 100; }  // yazı boyunun katı olarak genişlik
  const inRings = (x, y, rings) => ringDist(x, y, rings) > 0;

  function layoutLabels(features, proj, path, unit) {
    const tinyFs = 0.4 * unit, maxFs = 16 * unit, floorFs = 6 * unit;   // açılışta ~8,5–16px; çakışmada en fazla ~6px'e inilir
    const cands = [];
    features.forEach(f => {
      const text = labelOf(f);
      if (!text || !f.geometry) return;
      // çok parçalı bölgede projekte edilmiş (harita koordinatlı) en büyük parçanın içi seçilir
      const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : [];
      let rings = null, bestArea = -1;
      polys.forEach(pc => {
        const rs = pc.map(r => r.map(c => proj(c)).filter(q => q && isFinite(q[0]) && isFinite(q[1]))).filter(r => r.length > 2);
        if (!rs.length) return;
        let area = 0;
        rs[0].forEach((q, i) => { const n = rs[0][(i + 1) % rs[0].length]; area += q[0] * n[1] - n[0] * q[1]; });
        if (Math.abs(area) > bestArea) { bestArea = Math.abs(area); rings = rs; }
      });
      if (!rings.length) {
        const c = path.centroid(f);
        if (!isNaN(c[0])) cands.push({ text, rings: null, p: { x: c[0], y: c[1], r: 0 } });
        return;
      }
      cands.push({ text, rings, p: poleOf(rings, 0.5) });
    });
    const out = [];
    cands.forEach(c => {
      const words = c.text.split(/\s+/);
      const variants = [[c.text]];
      if (words.length > 1) {
        let bestI = 1, bestD = Infinity;
        for (let i = 1; i < words.length; i++) {
          const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
          if (d < bestD) { bestD = d; bestI = i; }
        }
        variants.push([words.slice(0, bestI).join(' '), words.slice(bestI).join(' ')]);
      }
      // etiket kutusunun köşeleri ve kenar orta noktaları bölgenin içinde kalmalı
      const fits = (lines, fs) => {
        if (!c.rings) return true;
        const w = Math.max(...lines.map(textWidth)) * fs * 0.5, h = lines.length * fs * 1.15 * 0.5;
        for (const dx of [-1, -0.5, 0, 0.5, 1]) for (const dy of [-1, -0.5, 0, 0.5, 1]) {
          if ((dx || dy) && !inRings(c.p.x + dx * w, c.p.y + dy * h, c.rings)) return false;
        }
        return true;
      };
      // her varyant için sığan en büyük boy; en büyüğünü veren seçilir. Sığmazsa en küçük boy kullanılır
      let best = null;
      variants.forEach(lines => {
        let fs = maxFs;
        while (fs > tinyFs && !fits(lines, fs)) fs *= 0.92;   // yazı bölge sınırını aşmasın: sığana kadar küçülür
        fs = Math.max(fs, tinyFs);
        if (!best || fs > best.fs * 1.08) best = { lines, fs };
      });
      out.push({ x: c.p.x, y: c.p.y, fs: best.fs, lines: best.lines });
    });
    // çakışan etiketler gizlenmez ve kaydırılmaz: büyük olan biraz küçültülür (alt sınır ~7px)
    const box = d => { const w = Math.max(...d.lines.map(textWidth)) * d.fs / 2, h = d.lines.length * d.fs * 1.08 / 2; return [d.x - w, d.x + w, d.y - h, d.y + h]; };
    // önce ~6px'e kadar; hâlâ çakışan (çok kalabalık) etiketler çakışma bitene kadar daha da küçülür, yakınlaşınca okunur
    for (const floor of [floorFs, floorFs / 2]) for (let round = 0; round < 80; round++) {
      let changed = false;
      const bx = out.map(box);
      for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
        const a = bx[i], b = bx[j];
        if (!(a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2])) continue;
        // konum değişmez; iki etiket de çakışma kalkana kadar orantılı küçülür
        [out[i], out[j]].forEach(d => { if (d.fs > floor * 1.001) { d.fs = Math.max(floor, d.fs * 0.95); changed = true; } });
      }
      if (!changed) break;
    }
    return out;
  }

  function showCountry(s) {
    loadToken++;
    slug = s;
    setView(true);
    titleEl.textContent = bySlug[s].name + ' Haritası';
    subtitleEl.textContent = '';
    zoomK = 1;
    refreshMerge = () => {};
    addFlags = () => {};
    applyDetail = () => {};
    svg.classed('flags-on', false);
    measure();
    applyBorders();
    svg.classed('no-labels', !showLabels);
    svg.attr('aria-label', bySlug[s].name + ' haritası').selectAll('*').remove();
    root = svg.append('g').attr('class', 'root');
    rescale = () => {};
    resetZoom();

    const topo = V[s];
    const planar = !!topo.planar;   // Türkiye: hazır düzlemsel koordinatlar
    const fc = planar ? { type: 'FeatureCollection', features: topo.features }
      : topojson.feature(topo, topo.objects[Object.keys(topo.objects)[0]]);
    // Rusya çok geniş ve tarih değişim çizgisini aşıyor: konik projeksiyonla daha büyük görünür
    const base = planar ? d3.geoIdentity()
      : s === 'rusya'
        ? d3.geoConicEqualArea().parallels([50, 70]).rotate([-100, 0]).center([0, 62])
        : d3.geoMercator();
    const proj = base.fitExtent([[8, 8], [W - 8, H - 8]], fc);
    curProj = proj;
    const path = d3.geoPath(proj);
    const colors = load(s);

    root.append('g').selectAll('path').data(fc.features)
      .join('path').attr('class', 'region on').attr('d', path)
      .style('fill', d => colors[d.properties.id] || null)
      .on('pointermove', (e, d) => tip(e, nameOf(d)))
      .on('pointerleave', hideTip)
      .on('click', (e, d) => {
        if (tapMoved) return;
        tip(e, nameOf(d));
        const cur = load(s);
        // zaten aynı renkle boyalı bölgeye tekrar basınca boya kalkar; farklı renk seçiliyse yeniden boyanır
        if (cur[d.properties.id] && String(cur[d.properties.id]).toLowerCase() === String(color).toLowerCase()) {
          delete cur[d.properties.id];
          save(s, cur);
          d3.select(e.currentTarget).style('fill', null).classed('painted', false);
          setSelected(d.properties.id, nameOf(d));
          updateSummary();
          return;
        }
        cur[d.properties.id] = color;
        save(s, cur);
        d3.select(e.currentTarget).style('fill', color).classed('painted', true);
        setSelected(d.properties.id, nameOf(d));
        updateSummary();
      });

    // şehir adları: hepsi ilk açılışta görünür. Etiket bölgenin içindeki en uygun noktaya (polylabel)
    // konur ve boyu bölgenin içine sığacak şekilde ölçeklenir; yer değiştirme ya da çizgi yoktur.
    // Yazı harita biriminde çizilir; yakınlaştırmayla birlikte ölçeklenir, zoom sırasında yeniden hesap gerekmez.
    const unit = W / Math.max(svg.node().getBoundingClientRect().width || W, 1);   // 1 ekran pikseli = unit harita birimi
    const labelItems = layoutLabels(fc.features, proj, path, unit);
    const lg = root.append('g').attr('class', 'labels');
    lg.selectAll('text').data(labelItems).join('text').attr('class', 'lbl')
      .attr('font-size', d => d.fs.toFixed(2)).attr('stroke-width', d => (d.fs * 0.17).toFixed(2))
      .each(function (d) {
        const t = d3.select(this), lh = d.fs * 1.08, y0 = d.y - (d.lines.length - 1) * lh / 2;
        d.lines.forEach((ln, i) => t.append('tspan').attr('x', d.x.toFixed(1)).attr('y', (y0 + i * lh).toFixed(1)).text(ln));
      });
    rescale = () => {};
    rescale();
    updateSummary();
  }

  backBtn.addEventListener('click', () => {
    if (location.hash !== '#/avrupa') location.hash = '/avrupa'; else route();
  });
  window.addEventListener('hashchange', route);
  // kutu boyutu belirgin değişince (döndürme, pencere) yeniden ölçüp çiz
  let lastBox = [0, 0], resizeTimer = null;
  const checkBox = () => {
    const r = svg.node().getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return;
    if (Math.abs(r.width - lastBox[0]) > 2 || Math.abs(r.height - lastBox[1]) > 2) { lastBox = [r.width, r.height]; route(); }
  };
  // kartın gerçek boyutu oturunca (yükleme, döndürme, pencere) yeniden ölçüp çiz
  if (window.ResizeObserver) {
    new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(checkBox, 120); }).observe(svg.node());
  } else {
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(checkBox, 250); });
  }
  // geri tuşuyla önbellekten dönüldüğünde (ör. Türkiye sayfasından) güncel renkler görünsün
  window.addEventListener('pageshow', e => { if (e.persisted) route(); });
  // başka cihazdaki değişiklikler buluttan gelince yeniden çiz
  window.addEventListener('harita:uzak-guncelleme', route);

  $('resetBtn').addEventListener('click', () => {
    if (!slug || !paintedOf(slug)) return;
    if (!confirm(bySlug[slug].name + ' haritasındaki tüm boyamalar silinsin mi?')) return;
    save(slug, {});
    svg.selectAll('path.region').style('fill', null);
    setSelected(null);
    updateSummary();
  });

  // boyanmamış bölgeleri rastgele renklerle boya
  $('randomBtn').addEventListener('click', () => {
    if (!slug) return;
    const cur = load(slug);
    svg.selectAll('path.region').each(function (d) {
      if (cur[d.properties.id]) return;
      cur[d.properties.id] = presetColors[Math.floor(Math.random() * presetColors.length)];
      d3.select(this).style('fill', cur[d.properties.id]);
    });
    save(slug, cur);
    updateSummary();
  });

  // ---------- PNG dışa aktarma: ayrı pencere (export.js) bu arayüzü kullanır; ekrandaki görünüme dokunmaz ----------
  const detailLoads = {};
  window.HARITA_API = {
    // dışa aktarma açıldığı andaki görünüm: d3.zoom dönüşümü, viewBox ve kartın piksel ölçüsü, projeksiyon
    getView() {
      const t = d3.zoomTransform(svg.node()), r = svg.node().getBoundingClientRect();
      return { k: t.k, x: t.x, y: t.y, W, H, rw: r.width, rh: r.height, proj: curProj, mode: slug ? 'country' : 'europe', slug, zoomed: isZoomedT(t) };
    },
    get slug() { return slug; },
    V, countries, byId, bySlug, load, paintedOf, unitOf, labelOf, dominantColor, layoutLabels, dropFar, TARGET, fileOf,
    get cityBorders() { return cityBorders; },
    get showLabels() { return showLabels; },
    get flagsOn() { return flagsOn; },
    colorName, flagAngle, flagDims, nonePainted, FLAG_CODE, flagData, ensureFlags: loadFlags, neededFlagCodes: neededCodes,
    sumMain: () => sumMain.textContent,
    // ülkenin ayrıntılı verisini (data/c/*.js) yükler
    loadDetail(sl) {
      if (V[sl]) return Promise.resolve(true);
      if (!detailLoads[sl]) {
        detailLoads[sl] = new Promise(res => {
          const el = document.createElement('script');
          el.src = './' + fileOf(bySlug[sl]);
          el.onload = () => res(!!V[sl]);
          el.onerror = () => res(false);
          document.head.appendChild(el);
        });
      }
      return detailLoads[sl];
    }
  };
  const openExport = (opts) => { if (window.HaritaDisa) window.HaritaDisa.open(opts); else notify('Dışa aktarma henüz yüklenmedi. Sayfayı yenile.'); };
  pngBtn.addEventListener('click', () => openExport());
  $('pngBtn2').addEventListener('click', () => openExport());
  $('viewPngBtn').addEventListener('click', () => openExport({ view: true }));

  if (!V.europe || !V.regions || !countries.length) {
    notify('Harita verisi yüklenemedi. Sayfayı yenile.');
    return;
  }
  try { history.scrollRestoration = 'manual'; } catch (e) { /* yoksay */ }
  route();
  { const r = svg.node().getBoundingClientRect(); lastBox = [r.width, r.height]; }
})();
