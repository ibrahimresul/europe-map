// Google ile giris + boyamalari Firebase (Firestore) ile hesaba kaydetme
// Yerel kayit (localStorage) tek kaynak olarak kalir; bu dosya onu hesapla esitler.
//   - giris yapinca: bulut + bu cihazdaki (misafir) boyamalar birlestirilir
//   - her degisiklikte: ilgili ulke buluta yazilir (kisa gecikmeyle)
//   - sekmeye donunce: bulut -> yerel guncellenir (baska cihazdaki degisiklikler)
//   - cikis yapinca: bu cihazdaki boyamalar silinir (bulutta kalir)
(function () {
  'use strict';

  const PREFIX = 'harita-boyama:v1:';
  const UID_KEY = PREFIX + 'hesap-uid';
  const SDK = ['app', 'auth', 'firestore'].map((n) => `vendor/firebase/firebase-${n}-compat.js`);
  const $ = (id) => document.getElementById(id);

  const cfg = window.FIREBASE_CONFIG || {};
  const configured = !!(cfg.apiKey && cfg.projectId && cfg.appId);

  // ---------- hata bildirimi (alert yerine) ----------
  let toastTimer = null;
  window.haritaBildir = function (msg) {
    let el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'alert');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 7000);
  };
  const notify = (m) => window.haritaBildir(m);
  const hataMesaji = (e) => {
    const c = (e && e.code) || '';
    if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'Giriş penceresi kapatıldı. Giriş yapmak için tekrar dene.';
    if (c === 'auth/network-request-failed' || !navigator.onLine) return 'İnternet bağlantısı yok. Bağlantını kontrol edip tekrar dene.';
    if (c === 'auth/unauthorized-domain') return 'Bu site adresi Firebase’de yetkili değil. Firebase konsolunda Authentication > Ayarlar > Yetkili alan adları listesine ekle.';
    if (c === 'auth/popup-blocked') return 'Tarayıcı giriş penceresini engelledi. Açılır pencerelere izin verip tekrar dene.';
    if (c === 'auth/web-storage-unsupported') return 'Tarayıcın çerez/site verisi depolamayı engelliyor. Gizli sekmeyi kapat veya "Siteler arası takibi engelle" ayarını kapatıp tekrar dene.';
    if (c === 'auth/login-incomplete') return 'Giriş tamamlanamadı, lütfen tekrar dene.';
    if (c === 'auth/too-many-requests') return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
    if (c === 'auth/user-disabled') return 'Bu hesap devre dışı bırakılmış.';
    if (c === 'auth/requires-recent-login') return 'Güvenlik nedeniyle silmeden önce yeniden giriş yapman gerekiyor. Çıkış yapıp tekrar giriş yaptıktan sonra dene.';
    if (c === 'auth/user-mismatch' || c === 'auth/wrong-password') return 'Yeniden doğrulama farklı bir hesapla yapıldı. Aynı Google hesabıyla tekrar dene.';
    if (c === 'permission-denied') return 'Kayıt izni reddedildi (Firestore kuralları).';
    return 'İşlem tamamlanamadı' + (c ? ' (' + c + ')' : '') + '. Lütfen tekrar dene.';
  };

  const loginBtn = $('loginBtn');
  const logoutBtn = $('logoutBtn');
  const userBox = $('authUser');
  const nameEl = $('authName');
  const emailEl = $('authEmail');
  const imgEl = $('authImg');
  const imgBig = $('authImgBig');
  const avatarBtn = $('authBtn');
  const menu = $('authMenu');
  const statusEl = $('syncStatus');
  const deleteBtn = $('deleteAccountBtn');
  if (!loginBtn) return;

  let fb = null, auth = null, db = null, user = null;
  const loginLabel = loginBtn.textContent;
  function setLoginBusy(on) {   // bekleme gostergesi: yonlendirme donusu / oturum geri yuklenirken
    loginBtn.disabled = !!on;
    loginBtn.textContent = on ? 'Giriş yapılıyor…' : loginLabel;
  }
  // Instagram/Facebook/WhatsApp vb. uygulama ici tarayicilar Google girisini engeller
  const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|MicroMessenger|; wv\)/i.test(navigator.userAgent || '');
  let sdkPromise = null;
  const pending = new Set();
  let timer = null;
  let busy = Promise.resolve();

  // ---------- yerel kayit yardimcilari ----------
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* yoksay */ } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* yoksay */ } };
  const slugs = () => (window.HARITA_ULKELER || []).map((c) => c.slug);

  function parse(s) {
    try {
      const o = JSON.parse(s || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  const readLocal = (slug) => parse(lsGet(PREFIX + slug));
  function writeLocal(slug, obj) {
    if (Object.keys(obj).length) lsSet(PREFIX + slug, JSON.stringify(obj)); else lsDel(PREFIX + slug);
  }
  const same = (a, b) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  };
  const notifyApp = () => window.dispatchEvent(new CustomEvent('harita:uzak-guncelleme'));

  // ---------- arayuz ----------
  // Durum: geçici metin (Eşitleniyor…, Kaydediliyor…) yoksa "Kaydedildi"; bağlantı yoksa "Çevrimdışı".
  let statusTimer = null, statusText = '';
  function paintStatus() {
    const off = !navigator.onLine;
    const text = off ? 'Çevrimdışı' : statusText;
    statusEl.textContent = text;
    statusEl.dataset.state = off ? 'off' : text === 'Kaydedildi' ? 'ok' : '';
  }
  function setStatus(text, ms) {
    statusText = text || '';
    clearTimeout(statusTimer);
    if (text && ms) statusTimer = setTimeout(() => { statusText = ''; paintStatus(); }, ms);
    paintStatus();
  }
  window.addEventListener('online', () => { paintStatus(); if (user) { flush(); pull(); } });
  window.addEventListener('offline', paintStatus);
  paintStatus();

  function render() {
    loginBtn.hidden = !!user;
    userBox.hidden = !user;
    deleteBtn.hidden = !user;
    window.haritaKullanici = user ? { name: user.displayName || '' } : null;   // dışa aktarma başlığı için
    if (!user) { closeMenu(false); return; }
    nameEl.textContent = user.displayName || user.email || 'Hesap';
    emailEl.textContent = user.displayName && user.email ? user.email : '';
    emailEl.hidden = !emailEl.textContent;
    // Google fotoğrafı Referer gönderilince bazı hesaplarda 403/429 veriyor; ayrıca bazı hesaplarda
    // photoURL yalnızca providerData içinde geliyor. Yüklenemezse baş harfli renkli bir daire gösterilir.
    const photo = user.photoURL || ((user.providerData || []).find(p => p && p.photoURL) || {}).photoURL;
    const label = user.displayName || user.email || '?';
    const initial = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#4d8dff"/><text x="14" y="14" fill="#fff" font-family="sans-serif" font-size="14" font-weight="700" text-anchor="middle" dominant-baseline="central">' +
      label.trim().charAt(0).toUpperCase().replace(/[<>&"]/g, '?') + '</text></svg>';
    const fallback = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(initial);
    [imgEl, imgBig].forEach((el) => {
      el.referrerPolicy = 'no-referrer';
      el.onerror = () => { el.onerror = null; el.src = fallback; };
      el.src = photo && /^https:\/\//.test(photo) ? photo : fallback;
      el.hidden = false;
    });
  }

  // ---------- hesap menüsü (profil fotoğrafına tıklayınca) ----------
  let menuOpen = false;
  const menuItems = () => [...menu.querySelectorAll('.am-item')].filter((b) => !b.hidden && !b.disabled);
  function placeMenu() {
    const r = avatarBtn.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
  }
  function openMenu(focusFirst) {
    if (!user || menuOpen) return;
    menuOpen = true;
    placeMenu();
    menu.hidden = false;
    avatarBtn.setAttribute('aria-expanded', 'true');
    if (focusFirst) { const it = menuItems()[0]; if (it) it.focus(); }
  }
  function closeMenu(restoreFocus) {
    if (!menuOpen) return;
    menuOpen = false;
    menu.hidden = true;
    avatarBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) avatarBtn.focus();
  }
  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuOpen) closeMenu(false); else openMenu(e.detail === 0);   // klavyeyle (Enter/Space) açılınca ilk öğeye odaklan
  });
  document.addEventListener('click', (e) => { if (menuOpen && !userBox.contains(e.target)) closeMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (!menuOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const its = menuItems(); if (!its.length) return;
      e.preventDefault();
      const i = its.indexOf(document.activeElement);
      its[(i + (e.key === 'ArrowDown' ? 1 : -1) + its.length) % its.length].focus();
    }
  });
  menu.addEventListener('focusout', (e) => {   // Tab ile menünün dışına çıkılırsa kapan
    if (menuOpen && e.relatedTarget && !userBox.contains(e.relatedTarget)) closeMenu(false);
  });
  window.addEventListener('hashchange', () => closeMenu(false));
  window.addEventListener('resize', () => { if (menuOpen) placeMenu(); });
  window.addEventListener('scroll', () => { if (menuOpen) placeMenu(); }, { passive: true });

  // ---------- SDK ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Yüklenemedi: ' + src));
      document.head.appendChild(s);
    });
  }
  // Firebase'i baslat. SDK index.html'de onceden yuklendigi icin burasi senkron calisir:
  // giris butonuna basinca signInWithPopup kullanici hareketi icinde (await olmadan) cagrilabilsin.
  function initAuth() {
    if (auth) return true;
    if (!window.firebase) return false;
    fb = window.firebase;
    if (!fb.apps.length) fb.initializeApp(cfg);
    auth = fb.auth();
    db = fb.firestore();
    // compat auth zaten [indexedDB, local, session] sirasini ve popup/redirect cozucusunu kullanir;
    // yine de acikca kalicilik iste, olmazsa session -> bellek (none) sirasina dus.
    const P = fb.auth.Auth.Persistence;
    (async () => {
      for (const p of [P.LOCAL, P.SESSION, P.NONE]) {
        try { await auth.setPersistence(p); return; } catch (e) { console.warn('Kalıcılık ayarlanamadı:', p, e); }
      }
    })();
    auth.onAuthStateChanged(onUser);
    // Yonlendirmeyle girisin sonucu: hata varsa kullaniciya goster
    auth.getRedirectResult().catch((e) => {
      console.error('getRedirectResult hatası:', e);
      setLoginBusy(false);
      notify(e && e.code ? hataMesaji(e) : 'Giriş tamamlanamadı, lütfen tekrar dene.');
    });
    return true;
  }
  function ensureSdk() {
    if (!sdkPromise) {
      sdkPromise = (async () => {
        if (!initAuth()) {
          for (const src of SDK) await loadScript(src);
          initAuth();
        }
      })().catch((e) => { sdkPromise = null; throw e; });
    }
    return sdkPromise;
  }

  // ---------- depolama servisi: Firebase'e yalnizca buradaki fonksiyonlar dokunur ----------
  const docRef = () => db.collection('users').doc(user.uid);
  const store = {
    async read() {
      const snap = await docRef().get();
      return snap.exists ? snap.data() || {} : {};
    },
    // boyama kayitlari: yalnizca verilen ulkeler guncellenir (merge)
    async writeMaps(maps) {
      await docRef().set({ maps, updatedAt: fb.firestore.FieldValue.serverTimestamp() }, { merge: true });
    },
    // profil: createdAt yalnizca daha once yazilmamissa; boyama alanlarina dokunulmaz (merge)
    async writeProfile(u, existing) {
      const ts = fb.firestore.FieldValue.serverTimestamp();
      const data = { email: u.email || null, displayName: u.displayName || null, photoURL: u.photoURL || null, lastLoginAt: ts };
      if (!existing.createdAt) data.createdAt = ts;
      await docRef().set(data, { merge: true });
    },
    async removeAll() {
      await docRef().delete();
    }
  };
  // islemleri sirala: esitleme, yazma ve cekme birbirinin ustune binmesin
  const queue = (fn) => (busy = busy.then(fn, fn));

  // ---------- esitleme ----------
  const mapsOf = (data) => {
    const maps = data.maps || {};
    const out = {};
    slugs().forEach((s) => { if (typeof maps[s] === 'string') out[s] = parse(maps[s]); });
    return out;
  };
  const fetchCloud = async () => mapsOf(await store.read());

  // Oturum basina en fazla bir kez profil yaz (e-posta, ad, foto, lastLoginAt; ilk seferde createdAt)
  let profileUid = null;
  async function saveProfileOnce(data) {
    if (profileUid === user.uid) return;
    await store.writeProfile(user, data);
    profileUid = user.uid;
  }

  // Giriste: bulut + yerel birlesir (cakismada bulut kazanir). Baska hesabin kalintisi atilir.
  async function firstSync() {
    setStatus('Eşitleniyor…');
    const data = await store.read();
    try { await saveProfileOnce(data); } catch (e) { console.error(e); } // profil yazilamazsa boyama esitlemesi yine calissin
    const cloud = mapsOf(data);
    const prev = lsGet(UID_KEY);
    const dropLocal = !!prev && prev !== user.uid;
    const toPush = {};
    let changedLocal = false;
    slugs().forEach((slug) => {
      const local = dropLocal ? {} : readLocal(slug);
      const c = cloud[slug] || {};
      const merged = { ...local, ...c };
      if (!same(merged, readLocal(slug))) { writeLocal(slug, merged); changedLocal = true; }
      if (!same(merged, c)) toPush[slug] = merged;
    });
    lsSet(UID_KEY, user.uid);
    await pushSlugs(Object.keys(toPush));
    if (changedLocal) notifyApp();
    setStatus('Kaydedildi');
  }

  async function pushSlugs(list) {
    if (!user || !list.length) return;
    const maps = {};
    list.forEach((slug) => { const o = readLocal(slug); maps[slug] = Object.keys(o).length ? JSON.stringify(o) : ''; });
    await store.writeMaps(maps);
  }

  function schedulePush(slug) {
    if (!user) { setStatus(''); return; }   // giriş yoksa buluta kayıt yok: "Kaydedildi" yazılmaz
    pending.add(slug);
    setStatus('Kaydediliyor…');
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }
  function flush() {
    clearTimeout(timer);
    if (!pending.size) return queue(() => {});
    const list = [...pending];
    pending.clear();
    return queue(async () => {
      try {
        await pushSlugs(list);
        setStatus('Kaydedildi');
      } catch (e) {
        list.forEach((s) => pending.add(s));
        console.error(e);
        setStatus('Kaydedilemedi, tekrar denenecek');
        if (e && e.code === 'permission-denied') notify(hataMesaji(e));
        timer = setTimeout(flush, 8000);
      }
    });
  }

  // Sekmeye donunce: baska cihazdaki degisiklikleri al (bulut kazanir)
  async function pull() {
    if (!user) return;
    await flush();
    await queue(async () => {
      try {
        const cloud = await fetchCloud();
        let changed = false;
        Object.entries(cloud).forEach(([slug, c]) => {
          if (!same(c, readLocal(slug))) { writeLocal(slug, c); changed = true; }
        });
        if (changed) notifyApp();
      } catch (e) { console.error(e); }
    });
  }

  async function onUser(u) {
    user = u || null;
    setLoginBusy(false);
    try { sessionStorage.removeItem('harita-giris'); } catch (e) { /* yoksay */ }
    render();
    if (!user) return;
    queue(async () => {
      try { await firstSync(); } catch (e) {
        console.error(e);
        setStatus('');
        notify('Hesabındaki harita eşitlenemedi. ' + (e.code === 'permission-denied' ? 'Kayıt izni reddedildi (Firestore kuralları).' : 'İnternet bağlantını kontrol et; boyamaların bu cihazda duruyor.'));
      }
    });
  }

  // ---------- giris / cikis ----------
  loginBtn.addEventListener('click', async () => {
    if (!configured) {
      notify('Google girişi henüz ayarlanmamış. Site şimdilik misafir modunda, boyamaların bu cihazda saklanıyor.');
      return;
    }
    if (inAppBrowser) { notify('Google girişi bu uygulama içi tarayıcıda çalışmaz. Giriş için bu bağlantıyı Safari veya Chrome’da aç.'); return; }
    if (!navigator.onLine) { notify(hataMesaji({ code: 'auth/network-request-failed' })); return; }
    setLoginBusy(true);
    try {
      // SDK onceden hazirsa signInWithPopup dogrudan dokunus olayi icinde cagrilir (Safari popup engeli icin sart)
      if (!initAuth()) await ensureSdk();
      const provider = new fb.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
      } catch (e) {
        const c = e && e.code;
        if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment' || c === 'auth/web-storage-unsupported') {
          try { sessionStorage.setItem('harita-giris', '1'); } catch (x) { /* yoksay */ }
          await auth.signInWithRedirect(provider);   // sayfa terk edilir; sonuc getRedirectResult'ta
          return;
        }
        throw e;
      }
    } catch (e) {
      console.error(e);
      setStatus('');
      notify(auth ? hataMesaji(e) : 'Giriş servisi yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
    }
    setLoginBusy(false);
  });

  const settle = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 4000))]);
  logoutBtn.addEventListener('click', async () => {
    closeMenu(false);
    await settle(flush());
    await settle(busy);
    try { await auth.signOut(); } catch (e) { console.error(e); notify('Çıkış yapılamadı. Lütfen tekrar dene.'); return; }
    // ortak bilgisayarda baskasinin gormemesi icin yerel kopya silinir; bulutta durur.
    // Buluta yazilamayan degisiklik varsa (cevrimdisi vb.) veri kaybolmasin diye yerel kopya korunur.
    if (pending.size) {
      notify('Bazı değişiklikler hesaba kaydedilemedi; boyamaların bu cihazda saklandı.');
    } else {
      slugs().forEach((s) => lsDel(PREFIX + s));
      lsDel(UID_KEY);
    }
    pending.clear();
    profileUid = null;
    setStatus('');
    notifyApp();
  });

  // ---------- hesabi + verileri silme (onay penceresiyle) ----------
  const modal = document.createElement('div');
  modal.id = 'delModal';
  modal.className = 'del-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="del-card" role="alertdialog" aria-modal="true" aria-labelledby="delTitle" aria-describedby="delText">' +
    '<h2 id="delTitle">Hesabını ve verilerini silmek istiyor musun?</h2>' +
    '<p id="delText">Google hesabınla bağlantılı bu sitedeki hesabın ve buluttaki <b>tüm boyama verilerin</b> kalıcı olarak silinecek. Bu işlem geri alınamaz.</p>' +
    '<p class="del-err" id="delErr" role="alert" hidden></p>' +
    '<div class="del-actions"><button type="button" class="am-btn" id="delCancel">Vazgeç</button>' +
    '<button type="button" class="am-btn danger-fill" id="delOk">Evet, sil</button></div></div>';
  document.body.appendChild(modal);
  const delCancel = modal.querySelector('#delCancel'), delOk = modal.querySelector('#delOk'), delErr = modal.querySelector('#delErr');
  let delBusy = false;
  function closeModal() {
    if (delBusy) return;
    modal.hidden = true;
    avatarBtn.focus();
  }
  function openModal() {
    delErr.hidden = true;
    delOk.disabled = delCancel.disabled = false;
    delOk.textContent = 'Evet, sil';
    modal.hidden = false;
    delCancel.focus();
  }
  deleteBtn.addEventListener('click', () => { if (!user) return; closeMenu(false); openModal(); });
  delCancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key === 'Tab') {   // odak pencerenin içinde kalsın
      const f = [delCancel, delOk].filter((b) => !b.disabled);
      if (!f.length) { e.preventDefault(); return; }
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  delOk.addEventListener('click', async () => {
    if (!user || delBusy) return;
    delBusy = true;
    delErr.hidden = true;
    delOk.disabled = delCancel.disabled = true;
    delOk.innerHTML = '<span class="spin" aria-hidden="true"></span> Siliniyor…';
    try {
      await flush();
      await busy;
      const u = auth.currentUser;
      // silme icin yakin zamanda giris gerekir: eskiyse once yeniden dogrula
      const last = Date.parse(u.metadata && u.metadata.lastSignInTime) || 0;
      if (Date.now() - last > 4 * 60 * 1000) await u.reauthenticateWithPopup(new fb.auth.GoogleAuthProvider());
      pending.clear();
      clearTimeout(timer);
      await store.removeAll();
      await u.delete();
      slugs().forEach((s) => lsDel(PREFIX + s));
      lsDel(UID_KEY);
      profileUid = null;
      setStatus('');
      notifyApp();
      delBusy = false;
      modal.hidden = true;
      notify('Hesabın ve verilerin silindi.');
    } catch (e) {
      console.error(e);
      delBusy = false;
      delErr.textContent = 'Hesap silinemedi. ' + hataMesaji(e);
      delErr.hidden = false;
      delOk.disabled = delCancel.disabled = false;
      delOk.textContent = 'Tekrar dene';
      delCancel.focus();
    }
  });

  window.addEventListener('harita:kayit', (e) => schedulePush(e.detail.slug));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  window.addEventListener('pagehide', () => { if (pending.size) flush(); });

  // Sayfa acilirken Firebase'i hemen baslat: yonlendirme donusu/kayitli oturum geri yuklenir.
  // Oturum bekleniyorsa (onceki giris veya yonlendirme donusu) giris dugmesinde bekleme gostergesi gorunur.
  const redirecting = () => { try { return sessionStorage.getItem('harita-giris') === '1'; } catch (e) { return false; } };
  if (configured) {
    if (lsGet(UID_KEY) || redirecting()) setLoginBusy(true);
    ensureSdk().catch((e) => { console.error(e); setLoginBusy(false); });
  }
})();
