// Firebase web uygulaması ayarları (Firebase konsolu > Proje ayarları > Uygulamalarınız > SDK kurulumu > Config).
// Bunlar gizli anahtar DEĞİLDİR; güvenlik Firestore kurallarıyla (firestore.rules) sağlanır.
// Boş bırakılırsa site eskisi gibi çalışır (yalnızca tarayıcıda kayıt); "Google ile giriş yap" uyarı verir.
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyACAILF50o_gIHEobuXSW-NZMiqFUGkkuQ',
  authDomain: 'mapdraw-d2348.firebaseapp.com',
  projectId: 'mapdraw-d2348',
  storageBucket: 'mapdraw-d2348.firebasestorage.app',
  messagingSenderId: '460170452092',
  appId: '1:460170452092:web:52457382698f4045087df9'
};

// Site Firebase Hosting'den (proje.web.app / proje.firebaseapp.com) açılıyorsa authDomain = kendi alan adı:
// /__/auth/handler aynı alan adında sunulur, iOS Safari'nin üçüncü taraf depolama engeli (ITP) devreye girmez.
// Başka bir alan adında (örn. github.io) kayıtlı authDomain kullanılır.
(function () {
  var h = location.hostname;
  if (/^mapdraw-d2348\.(web\.app|firebaseapp\.com)$/.test(h)) window.FIREBASE_CONFIG.authDomain = h;
})();
