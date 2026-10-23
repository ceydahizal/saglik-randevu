/*
 * VERİ YÖNETİMİ – Örnek veri
 * Gerçek bir hastane sistemine bağlanılmadığı için branş, doktor ve boş saat
 * bilgileri burada tanımlanır. Boş/dolu saatler her açılışta aynı sonucu
 * verecek şekilde (deterministik) üretilir; böylece testler tekrarlanabilir.
 */
(function () {
  "use strict";

  // Uygulamanın "bugün" kabul ettiği tarih. Tasarımdaki tarihlerle (30 Ekim,
  // 3 Kasım...) tutarlı kalmak için sabitlendi. Raporda sınırlama olarak yazılır.
  var DEMO_TODAY = "2026-10-27";

  var USER = { firstName: "Elif", lastName: "Kaya" };

  var HOSPITAL = "Merkez Devlet Hastanesi";

  // Saat biçimi tasarımla aynı: "10.30"
  var TIMES = ["09.00", "09.30", "10.00", "10.30", "11.00", "11.30", "13.30", "14.00", "14.30"];

  var BRANCHES = [
    { id: "dahiliye", name: "Dahiliye" },
    { id: "kardiyoloji", name: "Kardiyoloji" },
    { id: "goz", name: "Göz Hastalıkları" },
    { id: "kbb", name: "Kulak Burun Boğaz" },
    { id: "ortopedi", name: "Ortopedi" },
    { id: "cocuk", name: "Çocuk Sağlığı ve Hastalıkları" },
    { id: "dermatoloji", name: "Dermatoloji" }
  ];

  var DOCTORS = [
    { id: "ayse-demir", branchId: "kardiyoloji", name: "Prof. Dr. Ayşe Demir" },
    { id: "murat-kaya", branchId: "kardiyoloji", name: "Doç. Dr. Murat Kaya" },
    { id: "selin-arslan", branchId: "kardiyoloji", name: "Uzm. Dr. Selin Arslan" },
    { id: "can-ozturk", branchId: "kardiyoloji", name: "Uzm. Dr. Can Öztürk" },

    { id: "ahmet-yilmaz", branchId: "dahiliye", name: "Doç. Dr. Ahmet Yılmaz" },
    { id: "zeynep-aydin", branchId: "dahiliye", name: "Uzm. Dr. Zeynep Aydın" },
    { id: "emre-sahin", branchId: "dahiliye", name: "Uzm. Dr. Emre Şahin" },

    { id: "hakan-celik", branchId: "goz", name: "Prof. Dr. Hakan Çelik" },
    { id: "derya-koc", branchId: "goz", name: "Uzm. Dr. Derya Koç" },

    { id: "serkan-yildiz", branchId: "kbb", name: "Doç. Dr. Serkan Yıldız" },
    { id: "burcu-er", branchId: "kbb", name: "Uzm. Dr. Burcu Er" },

    { id: "kemal-aksoy", branchId: "ortopedi", name: "Op. Dr. Kemal Aksoy" },
    { id: "gizem-polat", branchId: "ortopedi", name: "Uzm. Dr. Gizem Polat" },

    { id: "nihan-kurt", branchId: "cocuk", name: "Doç. Dr. Nihan Kurt" },
    { id: "okan-tas", branchId: "cocuk", name: "Uzm. Dr. Okan Taş" },

    { id: "ece-dogan", branchId: "dermatoloji", name: "Uzm. Dr. Ece Doğan" },
    { id: "baris-gunes", branchId: "dermatoloji", name: "Doç. Dr. Barış Güneş" }
  ];

  /*
   * Senaryolarla tutarlı olması gereken özel durumlar:
   *  - Kardiyolojide ilk üç doktorun en yakın boş günü 30 Ekim (S1, G1).
   *  - Prof. Dr. Ayşe Demir'in 30 Ekim'de 09.30, 11.00, 14.30 saatleri dolu.
   *  - Uzm. Dr. Can Öztürk'ün bu hafta hiç boş saati yok, en yakın boş gün 3 Kasım (S2, G3).
   * "all" = o gün bütün saatler dolu.
   */
  var BOOKED_OVERRIDES = {
    "ayse-demir": { "2026-10-28": "all", "2026-10-29": "all", "2026-10-30": ["09.30", "11.00", "14.30"] },
    "murat-kaya": { "2026-10-28": "all", "2026-10-29": "all" },
    "selin-arslan": { "2026-10-28": "all", "2026-10-29": "all" },
    "can-ozturk": { "2026-10-28": "all", "2026-10-29": "all", "2026-10-30": "all", "2026-11-02": "all" }
  };

  // Uygulama ilk açıldığında kullanıcının sahip olduğu randevular
  var SEED_APPOINTMENTS = [
    { id: "r-seed-1", doctorId: "ahmet-yilmaz", date: "2026-10-28", time: "14.00", status: "aktif" },
    { id: "r-seed-2", doctorId: "hakan-celik", date: "2026-09-14", time: "10.00", status: "gidildi" },
    { id: "r-seed-3", doctorId: "zeynep-aydin", date: "2026-08-03", time: "11.30", status: "iptal" }
  ];

  window.SR = window.SR || {};
  window.SR.data = {
    DEMO_TODAY: DEMO_TODAY,
    USER: USER,
    HOSPITAL: HOSPITAL,
    TIMES: TIMES,
    BRANCHES: BRANCHES,
    DOCTORS: DOCTORS,
    BOOKED_OVERRIDES: BOOKED_OVERRIDES,
    SEED_APPOINTMENTS: SEED_APPOINTMENTS
  };
})();
