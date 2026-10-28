# 🗺️ Türkiye Şehirlerini Boyama Oyunu

Türkiye'nin 81 ilini gerçek coğrafi sınırlarıyla gösteren, tamamen tarayıcı üzerinde çalışan interaktif bir boyama oyunu. Kurulum ya da sunucu gerektirmez — dosyayı aç, boyamaya başla.

<img width="1918" height="867" alt="Ekran görüntüsü 2026-07-18 233038" src="https://github.com/user-attachments/assets/d0f9f322-aae5-489b-85c1-75cb9f86884f" />
<img width="1918" height="857" alt="Ekran görüntüsü 2026-07-18 233054" src="https://github.com/user-attachments/assets/56d86795-625a-4192-93e6-6bf503d587be" />
<img width="1918" height="861" alt="Ekran görüntüsü 2026-07-18 233157" src="https://github.com/user-attachments/assets/7a78dc96-1938-44da-b90f-93e25216cf35" />
<img width="2000" height="890" alt="turkiye-haritam" src="https://github.com/user-attachments/assets/d0a9bd3c-535b-41c5-8284-8ce82bd390cd" />



## ✨ Özellikler

- **81 il, gerçek sınırlar** — Coğrafi GeoJSON verisinden üretilmiş SVG harita
- **Serbest boyama** — 12 hazır renk + özel renk paleti (herhangi bir rengi seçebilirsin)
- **Seçili il çerçevesi** — Tıkladığın il ince beyaz bir çerçeveyle belirginleşir
- **Geri alma** — `Ctrl+Z` / `Cmd+Z` ile son işlemi geri al (boyama, silme, sıfırlama, rastgele boyama dahil)
- **4 tema** — Gece Mavisi, Aydınlık, Okyanus, Gün Batımı
- **Rastgele boyama** — Tüm haritayı tek tıkla renklendir
- **PNG olarak indir** — Boyadığın haritanın ekran görüntüsünü tek tıkla kaydet
- **Sıfırlama** — Haritayı baştan başlat
- **Duyarlı tasarım** — Masaüstü ve mobilde çalışır

## 🚀 Kullanım

Kurulum gerekmez, saf HTML/CSS/JS ile yazılmıştır.

```bash
git clone https://github.com/ibrahimresul/turkiye-map.git
cd turkiye-map
```

Ardından `index.html` dosyasını herhangi bir tarayıcıda aç. İstersen basit bir yerel sunucu ile de çalıştırabilirsin:

```bash
python3 -m http.server 8000
# tarayıcıda http://localhost:8000 adresini aç
```

## 🎮 Nasıl Oynanır

1. Sağ panelden bir renk seç (hazır renklerden biri veya "Özel Renk" ile paletten istediğin rengi al)
2. Haritada boyamak istediğin ile tıkla
3. Yanlış yaptıysan `Ctrl+Z` ile geri al
4. Beğendiğin bir temaya geç
5. İşin bitince "Haritayı İndir" ile PNG olarak kaydet

## 📁 Proje Yapısı

```
turkiye-illeri-boyama-oyunu/
├── index.html    # Sayfa yapısı ve SVG harita
├── style.css     # Görünüm, temalar, animasyonlar
├── script.js     # Oyun mantığı
└── README.md
```

## 🛠️ Teknolojiler

- Vanilla HTML5, CSS3 (CSS değişkenleri ile tema sistemi), JavaScript (ES6+)
