# 🗺️ Harita Boyama – Avrupa

Avrupa'daki 50 ülkeyi ve her ülkenin şehir/bölgelerini gerçek sınırlarıyla gösteren, tarayıcıda çalışan interaktif bir boyama oyunu. Avrupa haritasından bir ülke seç, şehirlerini istediğin renge boya, sonucu PNG olarak paylaş.

<img width="1530" height="761" alt="image" src="https://github.com/user-attachments/assets/6f043409-f26e-4658-a1e6-e854f1c6ce60" />
<img width="1510" height="677" alt="image" src="https://github.com/user-attachments/assets/d8f3e6b6-8aa5-40d9-9f7c-d8fa7410a012" />
<img width="1534" height="694" alt="image" src="https://github.com/user-attachments/assets/dcb159c9-dff5-4424-b3d9-5a6550d7810e" />
<img width="1534" height="690" alt="image" src="https://github.com/user-attachments/assets/dca36b06-6147-4199-954a-4774396facd5" />


## ✨ Özellikler

- **50 ülke, gerçek sınırlar**: Natural Earth verisinden üretilmiş Avrupa haritası ve her ülkenin il/bölge haritası (Türkiye'de 81 il)
- **Serbest boyama**: Hazır renkler ve özel renk seçici. Aynı renkle tekrar tıklayınca boya kalkar
- **Avrupa genel görünümü**: Boyadığın ülkeler ana haritada da renkli görünür; istersen ülkeler bayraklarıyla gösterilir
- **Yakınlaştırma ve kaydırma**: Fare tekerleği, dokunmatik hareketler ya da +/− düğmeleriyle
- **Şehir isimleri ve sınırları**: İsimler bölgenin içine sığacak şekilde yerleşir; isimler ve şehir sınırları tek tıkla gizlenebilir
- **Küçük başkentler büyütülür**: Paris gibi haritada kaybolan başkentler hafifçe büyütülerek gösterilir
- **Rastgele boyama, seçili şehri silme, haritayı sıfırlama**
- **4 tema**: Karanlık, Aydınlık, Okyanus, Gün Batımı
- **PNG dışa aktarma**: Instagram Story, kare/dikey gönderi, yatay sunum gibi hazır boyutlar; başlık, alt yazı, renk açıklaması, arka plan ve sınır kalınlığı ayarları
- **Google ile giriş**: Boyamaların Firebase (Firestore) ile hesabına kaydedilir ve cihazlar arasında eşitlenir. Giriş yapmadan da oynanır; boyamalar tarayıcıda saklanır
- **Duyarlı tasarım**: Masaüstü ve mobilde çalışır

## 🚀 Kullanım

Kurulum ya da derleme gerekmez; saf HTML/CSS/JS ile yazılmıştır.

```bash
git clone https://github.com/ibrahimresul/europe-map.git
cd europe-map
python3 -m http.server 8000
# tarayıcıda http://localhost:8000 adresini aç
```

`index.html` dosyasını doğrudan tarayıcıda açmak da çalışır, ancak Google ile giriş için sayfanın bir sunucu üzerinden (`http://localhost` ya da yayınlanmış adres) açılması gerekir.

Türkiye haritasına doğrudan gitmek için: `index.html#/ulke/turkiye` (ya da `turkiye.html`).

## 🎮 Nasıl Oynanır

1. Avrupa haritasında boyamak istediğin ülkeye tıkla
2. Bir renk seç
3. Haritada boyamak istediğin şehre tıkla (aynı renkle tekrar tıklarsan boya kalkar)
4. Beğendiğin bir temaya geç
5. İşin bitince "Haritayı İndir (PNG)" ile kaydet

## 🔥 Firebase ile yayınlama (isteğe bağlı)

Giriş ve bulut kaydı Firebase kullanır. Kendi projenle çalıştırmak için:

1. [Firebase konsolunda](https://console.firebase.google.com) bir proje oluştur; **Authentication → Google** ve **Firestore**'u etkinleştir
2. `firebase-config.js` içindeki ayarları kendi projeninkilerle değiştir
3. `.firebaserc` içindeki proje kimliğini güncelle
4. Yayınla:

```bash
npm install -g firebase-tools
firebase login
firebase deploy   # hosting + firestore.rules
```

> Firebase web ayarları (`apiKey` vb.) gizli değildir; erişim `firestore.rules` ile sınırlandırılır. Her kullanıcı yalnızca kendi verisini okuyup yazabilir.

## 📁 Proje Yapısı

```
europe-map/
├── index.html            # Sayfa yapısı
├── style.css             # Görünüm ve temalar
├── europe.js             # Avrupa ve ülke haritaları, boyama mantığı
├── export.js             # PNG dışa aktarma penceresi
├── cloud.js              # Google ile giriş ve Firestore eşitleme
├── firebase-config.js    # Firebase proje ayarları
├── firestore.rules       # Firestore güvenlik kuralları
├── turkiye.html          # Türkiye haritasına yönlendirme
├── data/                 # Üretilmiş harita verileri (TopoJSON)
│   ├── europe.js, europe-regions.js, countries.js, merge-map.js
│   └── c/<ülke>.js       # Her ülkenin bölge haritası
├── flags/                # Ülke bayrakları (SVG)
├── fonts/                # Dışa aktarmada kullanılan yazı tipleri
├── vendor/               # d3, topojson-client, Firebase SDK
└── tools/                # Harita verisini üreten Node.js betikleri
```

## 🧰 Harita verisini yeniden üretmek

`data/` klasörü hazır gelir; yalnızca sınırları değiştirmek istersen gerekir.

1. [Natural Earth](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/) üzerinden `ne_10m_admin_0_countries` ve `ne_10m_admin_1_states_provinces` verilerini GeoJSON olarak `tools/raw/` klasörüne koy
2. Çalıştır:

```bash
cd tools
npm install
npm run build-data
node merge-small-regions.cjs   # küçük bölgeleri komşularıyla birleştirir
```

## 🛠️ Teknolojiler

- HTML5, CSS3 (CSS değişkenleriyle tema sistemi), JavaScript (ES6+)
- [D3.js](https://d3js.org) ve [TopoJSON](https://github.com/topojson/topojson): harita çizimi
- [Firebase](https://firebase.google.com): Google ile giriş, Firestore, Hosting
- [mapshaper](https://github.com/mbloch/mapshaper): veri hazırlama

## 📄 Lisanslar ve kaynaklar

- Harita verisi: [Natural Earth](https://www.naturalearthdata.com)
- Bayraklar: [flag-icons](https://github.com/lipis/flag-icons) (MIT), bkz. `flags/LICENSE.txt`
- Yazı tipleri: Inter, Playfair Display, Caveat, Anton (SIL Open Font License 1.1), bkz. `fonts/LICENSE.txt`
