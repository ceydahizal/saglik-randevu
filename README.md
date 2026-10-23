# Sağlık Randevu – BM 433 İnsan-Bilgisayar Etkileşimi projesi

Genel kullanıcıların hastane randevusunu hızlı, hatasız ve randevunun alındığından emin
olarak oluşturup takip edebileceği, mobil öncelikli bir web uygulaması.

## Çalıştırma

- **Bilgisayarda:** Klasördeki `index.html` dosyasına çift tıkla. Kurulum gerekmez.
- **Telefonda:** GitHub Pages'te yayınlanan adresi aç (aşağıya bak).

## Test yöneticisi için adres parametreleri

| Parametre | Ne yapar | Ne zaman |
| --- | --- | --- |
| `?sifirla=1` | Kayıtlı randevuları silip başlangıç verilerine döner | Aynı cihazda her katılımcıdan önce |
| `?cakisma=1` | Bir sonraki **Onayla**'da seçilen saat başkası tarafından alınmış gibi davranır | Çakışma görevi (G4) öncesinde |

Örnek: `https://<kullanıcı-adın>.github.io/saglik-randevu/?sifirla=1&cakisma=1`
Parametreler işlendikten sonra adres çubuğundan kendiliğinden silinir.

## Referans mimari ile eşleşme

| Katman (rehber Bölüm 5) | Dosya | Sorumluluk |
| --- | --- | --- |
| Kullanıcı arayüzü | `js/ui.js`, `css/style.css`, `index.html` | Ekranlar, gezinme, durumlar; iş kuralı içermez |
| İstek / API katmanı | `js/api.js` | İsteği doğrular, gecikmeyi simüle eder, tek biçimde sonuç döner |
| Uygulama mantığı | `js/logic.js` | Boş/dolu saat, en yakın gün, F-07 kuralı, çakışma, iptal ve geri alma |
| Veri yönetimi | `js/data.js`, `js/storage.js` | Örnek veri ve tarayıcıda kalıcı saklama (localStorage) |
| Sonuç ve geri bildirim | `js/messages.js` | Hata/bilgi metinleri ve tarih biçimleri |
| Başlangıç | `js/app.js` | Test parametrelerini işler, uygulamayı başlatır |

## Gereksinimlerin karşılandığı yerler

| Gereksinim | Uygulamadaki karşılığı |
| --- | --- |
| F-01 Arama | 02'de yazarken branş ve doktor önerileri; sonuç yoksa açıklama ve tüm branş listesi |
| F-02 Saat seçimi | Dolu saatler pasif ve “Dolu” yazılı; tamamen dolu günler de pasif |
| F-03 Onay | 05'te özet, 06'da başarı ekranı; randevu sayfa yenilense de kalır |
| F-04 İptal | Onay penceresi (“Randevuyu koru” / “Evet, iptal et”) ve 5 saniyelik “Geri al” |
| F-05 Hatırlatıcı | “Takvime ekle” 1 gün önce hatırlatmalı `.ics` takvim dosyası indirir |
| F-06 Geçmiş | Randevularım → Geçmiş sekmesi (Gidildi / İptal edildi) |
| F-07 Aynı gün aynı branş | Onayda engellenir, mevcut randevu gösterilir |
| F-08 Çakışma | `?cakisma=1` ile simüle edilir; aynı günün en yakın 3 boş saati önerilir |
| H-01 Hata mesajları | Tüm mesajlar `js/messages.js` içinde; teknik kod gösterilmez |
| E-01 / E-02 Erişilebilirlik | WCAG AA kontrast, en az 44 px dokunma alanı, klavye ve ekran okuyucu desteği, %200 yakınlaştırmada yatay taşma yok |
| P-01 Performans | 0,5 sn'yi aşan işlemlerde yüklenme göstergesi |
| G-01 Gizlilik | İlk açılışta hangi verinin neden tutulduğu açıklanır; tanı/tahlil tutulmaz |

## Bilinen sınırlamalar

- Gerçek bir hastane sistemine bağlı değildir; doktor ve boş saat bilgileri örnek veridir.
- Uygulamanın “bugün” kabul ettiği tarih **27 Ekim 2026** olarak sabitlenmiştir; tasarım ve test görevlerindeki tarihlerle tutarlılık için.
- Randevular tarayıcıda saklanır; cihazlar arasında paylaşılmaz.
- Giriş yapmış tek bir kullanıcı varsayılır; test katılımcılarının kafası karışmasın diye ana ekranda isim yerine “Hoş geldiniz” yazar.
- Sunucu yoktur; ağ gecikmesi ve çakışma durumu API katmanında simüle edilir.
