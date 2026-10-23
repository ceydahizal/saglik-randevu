/*
 * VERİ YÖNETİMİ – Kalıcı saklama
 * Kullanıcının randevuları tarayıcının localStorage alanında tutulur.
 * localStorage kullanılamıyorsa (ör. bazı gizli sekmeler) veriler oturum
 * boyunca bellekte tutulur; uygulama çalışmaya devam eder.
 * Arayüz bu dosyaya doğrudan erişmez; yalnızca uygulama mantığı (logic.js) kullanır.
 */
(function () {
  "use strict";

  var KEY = "saglik-randevu.v1";
  var memory = null;
  var persistent = true;

  function seed() {
    return {
      appointments: window.SR.data.SEED_APPOINTMENTS.map(function (a) {
        return Object.assign({ createdAt: "seed" }, a);
      }),
      extraBooked: [], // başka "kullanıcıların" aldığı saatler (çakışma simülasyonu)
      privacyNoticeSeen: false
    };
  }

  function read() {
    if (memory) return memory;
    try {
      var raw = window.localStorage.getItem(KEY);
      memory = raw ? JSON.parse(raw) : seed();
    } catch (e) {
      persistent = false;
      memory = seed();
    }
    return memory;
  }

  function write(state) {
    memory = state;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      persistent = false;
    }
  }

  function reset() {
    memory = null;
    try { window.localStorage.removeItem(KEY); } catch (e) { /* yok say */ }
    write(seed());
  }

  window.SR.storage = {
    read: read,
    write: write,
    reset: reset,
    isPersistent: function () { return persistent; }
  };
})();
