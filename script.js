// Turkiye Illeri Boyama Oyunu - Mantik
(function () {
  const colorPicker = document.getElementById('colorPicker');
  const colorHex = document.getElementById('colorHex');
  const selectedName = document.getElementById('selectedName');
  const selectedInfo = document.getElementById('selectedInfo');
  const paintedCountEl = document.getElementById('paintedCount');
  const tooltip = document.getElementById('tooltip');
  const swatchesEl = document.getElementById('swatches');
  const eraseBtn = document.getElementById('eraseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const randomBtn = document.getElementById('randomBtn');
  const themesEl = document.getElementById('themes');
  const screenshotBtn = document.getElementById('screenshotBtn');
  const labelsBtn = document.getElementById('labelsBtn');
  const mapSvg = document.getElementById('turkeyMap');

  const paths = Array.from(document.querySelectorAll('path.il'));
  let selectedPath = null;

  // ---- Geri Al (Undo) gecmisi ----
  // Her giris bir islemi temsil eder: [{path, prevFill}, ...]
  const undoStack = [];
  const MAX_HISTORY = 200;

  function recordChange(changes) {
    undoStack.push(changes);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }

  function undo() {
    if (undoStack.length === 0) return;
    const changes = undoStack.pop();
    changes.forEach(({ path, prevFill }) => {
      path.style.fill = prevFill;
    });
    if (selectedPath && changes.some(c => c.path === selectedPath)) {
      selectProvince(selectedPath);
    }
    updatePaintedCount();
  }

  const presetColors = [
    '#1032ff', '#ff1010', '#0eff0e', '#fff609', '#c209ff', '#ff09f1',
    '#00c6ff', '#ff7800', '#119300', '#90ff00', '#00ffa8', '#c8c8c8'
  ];

  // ---- Temalar ----
  const themes = [
    { id: 'gece', label: 'Karanlık', dot: '#424242' },
    { id: 'aydinlik', label: 'Aydınlık', dot: '#d8d8d8' },
    { id: 'okyanus', label: 'Okyanus', dot: '#00c2d1' },
    { id: 'gunbatimi', label: 'Gun Batimı', dot: '#ff7a59' }
  ];

  themes.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-btn' + (document.documentElement.dataset.theme === t.id ? ' active' : '');
    btn.dataset.theme = t.id;
    btn.innerHTML = `<span class="theme-dot" style="background:${t.dot}"></span>${t.label}`;
    btn.addEventListener('click', () => {
      document.documentElement.setAttribute('data-theme', t.id);
      try { localStorage.setItem('harita-tema', t.id); } catch (e) { /* yoksay */ }
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    themesEl.appendChild(btn);
  });

  // 12 hazir renk
  presetColors.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = c;
    sw.dataset.color = c;
    sw.title = c;
    sw.addEventListener('click', () => {
      setActiveColor(c);
      markActiveSwatch(sw);
    });
    swatchesEl.appendChild(sw);
  });

  // Ozel renk - tiklaninca native renk paletini acar
  const customSwatch = document.createElement('div');
  customSwatch.className = 'swatch custom-swatch';
  customSwatch.title = 'Ozel renk sec';
  customSwatch.innerHTML = '<span>+</span>';
  customSwatch.addEventListener('click', () => {
    colorPicker.click();
  });
  swatchesEl.appendChild(customSwatch);

  colorPicker.addEventListener('input', (e) => {
    const c = e.target.value;
    setActiveColor(c);
    customSwatch.style.background = c;
    customSwatch.innerHTML = '';
    markActiveSwatch(customSwatch);
  });

  function markActiveSwatch(activeEl) {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    activeEl.classList.add('active');
  }

  function setActiveColor(hex) {
    colorPicker.value = hex;
    if (colorHex) colorHex.textContent = hex.toUpperCase();
  }

  // ---- Kayit (Avrupa sayfasiyla ayni anahtar) ----
  const STORE_KEY = 'harita-boyama:v1:turkiye';
  function saveState() {
    const o = {};
    paths.forEach(p => { if (p.style.fill) o[p.dataset.number] = rgbToHex(p.style.fill); });
    const json = Object.keys(o).length ? JSON.stringify(o) : null;
    try {
      if (json === localStorage.getItem(STORE_KEY)) return; // degisiklik yok
      if (json) localStorage.setItem(STORE_KEY, json);
      else localStorage.removeItem(STORE_KEY);
    } catch (e) {
      if (window.haritaBildir) window.haritaBildir('Boyama bu cihaza kaydedilemedi (tarayıcı depolaması kapalı olabilir).');
      return;
    }
    // cloud.js: hesaba yaz (giris yapilmissa)
    window.dispatchEvent(new CustomEvent('harita:kayit', { detail: { slug: 'turkiye' } }));
  }
  function loadState() {
    paths.forEach(p => { p.style.fill = ''; });
    try {
      const o = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      paths.forEach(p => { if (o && o[p.dataset.number]) p.style.fill = o[p.dataset.number]; });
    } catch (e) { /* yoksay */ }
  }

  function updatePaintedCount() {
    const painted = paths.filter(p => p.style.fill && p.style.fill !== '').length;
    paintedCountEl.textContent = painted;
    saveState();
  }

  function rgbToHex(rgb) {
    if (!rgb) return '-';
    if (rgb.startsWith('#')) return rgb;
    const m = rgb.match(/\d+/g);
    if (!m) return rgb;
    return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }

  function selectProvince(path) {
    if (selectedPath && selectedPath !== path) {
      selectedPath.classList.remove('selected');
    }
    selectedPath = path;
    path.classList.add('selected');
    selectedName.textContent = path.dataset.name;
    selectedInfo.textContent = 'Mevcut renk: ' + (path.style.fill ? rgbToHex(path.style.fill) : 'boyanmamis');
  }

  paths.forEach(path => {
    path.addEventListener('click', () => {
      const prevFill = path.style.fill || '';
      const newFill = colorPicker.value;
      if (prevFill === newFill) return;
      path.style.fill = newFill;
      recordChange([{ path, prevFill }]);
      selectProvince(path);
      updatePaintedCount();
    });

    path.addEventListener('mousemove', (e) => {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY + 14) + 'px';
      tooltip.textContent = path.dataset.name;
    });

    path.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });

  eraseBtn.addEventListener('click', () => {
    if (selectedPath) {
      const prevFill = selectedPath.style.fill || '';
      if (prevFill === '') return;
      selectedPath.style.fill = '';
      recordChange([{ path: selectedPath, prevFill }]);
      selectProvince(selectedPath);
      updatePaintedCount();
    }
  });

  resetBtn.addEventListener('click', () => {
    const changes = paths
      .filter(p => (p.style.fill || '') !== '')
      .map(p => ({ path: p, prevFill: p.style.fill }));
    if (changes.length === 0) return;
    paths.forEach(p => p.style.fill = '');
    recordChange(changes);
    if (selectedPath) selectedPath.classList.remove('selected');
    selectedPath = null;
    selectedName.textContent = '-';
    selectedInfo.textContent = '';
    updatePaintedCount();
  });

  randomBtn.addEventListener('click', () => {
    const changes = paths.map(p => ({ path: p, prevFill: p.style.fill || '' }));
    paths.forEach(p => {
      const c = presetColors[Math.floor(Math.random() * presetColors.length)];
      p.style.fill = c;
    });
    recordChange(changes);
    updatePaintedCount();
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const isUndoCombo = (e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey;
    if (isUndoCombo) {
      e.preventDefault();
      undo();
    }
  });

  function downloadMapAsPng() {
    const clone = mapSvg.cloneNode(true);
    const originalPaths = mapSvg.querySelectorAll('path.il');
    const clonePaths = clone.querySelectorAll('path.il');

    originalPaths.forEach((p, i) => {
      const cs = getComputedStyle(p);
      clonePaths[i].setAttribute('fill', cs.fill);
      clonePaths[i].setAttribute('stroke', cs.stroke);
      clonePaths[i].setAttribute('stroke-width', cs.strokeWidth);
      clonePaths[i].removeAttribute('class');
    });

    const vb = mapSvg.viewBox.baseVal;
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#171d2b';
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', vb.x);
    bgRect.setAttribute('y', vb.y);
    bgRect.setAttribute('width', vb.width);
    bgRect.setAttribute('height', vb.height);
    bgRect.setAttribute('fill', bgColor);
    clone.insertBefore(bgRect, clone.firstChild);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Bazi tarayicilarda SVG'nin dogru boyutta cizilebilmesi icin
    // acik genislik/yukseklik gerekiyor, aksi halde gorsel bos/siyah cikabilir
    clone.setAttribute('width', vb.width);
    clone.setAttribute('height', vb.height);

    const labelsVisible = mapSvg.classList.contains('show-labels');
    const cloneLabelsGroup = clone.querySelector('#labelsGroup');
    if (cloneLabelsGroup) {
      if (labelsVisible) {
        const originalLabels = mapSvg.querySelectorAll('.il-label');
        const cloneLabels = clone.querySelectorAll('.il-label');
        originalLabels.forEach((t, i) => {
          const cs = getComputedStyle(t);
          cloneLabels[i].setAttribute('fill', cs.fill);
          cloneLabels[i].setAttribute('stroke', cs.stroke);
          cloneLabels[i].setAttribute('stroke-width', cs.strokeWidth);
          cloneLabels[i].setAttribute('font-size', cs.fontSize);
          cloneLabels[i].setAttribute('font-weight', cs.fontWeight);
          cloneLabels[i].setAttribute('font-family', cs.fontFamily);
          cloneLabels[i].setAttribute('text-anchor', 'middle');
          cloneLabels[i].setAttribute('dominant-baseline', 'middle');
          cloneLabels[i].setAttribute('paint-order', 'stroke fill');
          cloneLabels[i].removeAttribute('class');
        });
      } else {
        cloneLabelsGroup.remove();
      }
    }

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = function () {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = vb.width * scale;
      canvas.height = vb.height * scale;
      const ctx = canvas.getContext('2d');
      // Guvenlik icin canvas'i once arka plan rengiyle doldur,
      // sonra harita gorselini uzerine ciz
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        const link = document.createElement('a');
        link.download = 'turkiye-haritam.png';
        link.href = URL.createObjectURL(blob);
        link.click();
      });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      alert('Harita indirilirken bir sorun olustu. Lutfen tekrar deneyin.');
    };
    img.src = url;
  }

  labelsBtn.addEventListener('click', () => {
    const showing = mapSvg.classList.toggle('show-labels');
    labelsBtn.textContent = showing ? 'Şehir İsimlerini Gizle' : 'Şehir İsimlerini Göster';
  });

  screenshotBtn.addEventListener('click', downloadMapAsPng);

  // baska cihazdaki degisiklikler buluttan gelince yeniden ciz; geri tusuyla donuldugunde guncel olsun
  function refreshFromStore() { undoStack.length = 0; loadState(); updatePaintedCount(); }
  window.addEventListener('harita:uzak-guncelleme', refreshFromStore);
  window.addEventListener('pageshow', (e) => { if (e.persisted) refreshFromStore(); });

  setActiveColor(colorPicker.value);
  loadState();
  updatePaintedCount();
})();
