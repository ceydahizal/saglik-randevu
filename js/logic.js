/*
 * UYGULAMA MANTIĞI
 * Randevu iş akışının kuralları burada uygulanır:
 *  - boş/dolu saat hesabı ve en yakın boş gün
 *  - aynı gün aynı branştan ikinci randevu yasağı (F-07)
 *  - aynı saatte iki randevu yasağı
 *  - onay sırasında saatin dolması (çakışma, F-08) ve alternatif saatler
 *  - iptal ve geri alma (F-04)
 * Arayüz bu kuralları kendi içinde tekrar etmez; sonuçları API katmanı üzerinden alır.
 */
(function () {
  "use strict";

  var D = window.SR.data;
  var storage = window.SR.storage;

  var MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz",
    "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  var SEARCH_AHEAD_DAYS = 45;
  var WINDOW_SIZE = 5;

  var conflictMode = false;

  /* ---------- Tarih yardımcıları (saat dilimi hatasına karşı UTC ile) ---------- */

  function toDate(iso) {
    var p = iso.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function toIso(date) {
    return date.toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    var d = toDate(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return toIso(d);
  }
  function weekday(iso) { return toDate(iso).getUTCDay(); }
  function isWorkday(iso) { var w = weekday(iso); return w >= 1 && w <= 5; }
  function dayName(iso) { return DAYS[weekday(iso)]; }
  function formatDate(iso) { // "30 Ekim 2026"
    var d = toDate(iso);
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }
  function formatDateLong(iso) { return formatDate(iso) + " " + dayName(iso); } // "30 Ekim 2026 Cuma"
  function formatDayMonth(iso) { var d = toDate(iso); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; }
  function toMinutes(time) { var p = time.split("."); return +p[0] * 60 + +p[1]; }
  function today() { return D.DEMO_TODAY; }
  function endOfThisWeek() { // bu haftanın cuması
    var w = weekday(today());
    return addDays(today(), Math.max(0, 5 - w));
  }

  /* ---------- Arama için metin normalizasyonu ---------- */

  function normalize(text) {
    return text.toLocaleLowerCase("tr-TR")
      .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/i̇/g, "i")
      .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/â/g, "a")
      .replace(/\s+/g, " ").trim();
  }

  /* ---------- Varlıklar ---------- */

  function getBranch(id) { return D.BRANCHES.find(function (b) { return b.id === id; }) || null; }
  function getDoctor(id) { return D.DOCTORS.find(function (d) { return d.id === id; }) || null; }
  function doctorsOf(branchId) { return D.DOCTORS.filter(function (d) { return d.branchId === branchId; }); }

  /* ---------- Boş / dolu saat ---------- */

  function hash(str) { // FNV-1a: her açılışta aynı sonucu verir
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function isBookedByOthers(doctorId, date, time, state) {
    var extra = state.extraBooked.some(function (s) {
      return s.doctorId === doctorId && s.date === date && s.time === time;
    });
    if (extra) return true;
    var ov = D.BOOKED_OVERRIDES[doctorId] && D.BOOKED_OVERRIDES[doctorId][date];
    if (ov === "all") return true;
    if (Array.isArray(ov)) return ov.indexOf(time) !== -1;
    return hash(doctorId + "|" + date + "|" + time) % 10 < 3; // yaklaşık %30 dolu
  }

  function isTakenByUser(doctorId, date, time, state) {
    return state.appointments.some(function (a) {
      return a.status === "aktif" && a.doctorId === doctorId && a.date === date && a.time === time;
    });
  }

  function slotsFor(doctorId, date, state) {
    state = state || storage.read();
    return D.TIMES.map(function (time) {
      var free = !isBookedByOthers(doctorId, date, time, state) && !isTakenByUser(doctorId, date, time, state);
      return { time: time, free: free };
    });
  }

  function dayHasFreeSlot(doctorId, date, state) {
    return slotsFor(doctorId, date, state).some(function (s) { return s.free; });
  }

  function earliestAvailable(doctorId, state) {
    state = state || storage.read();
    for (var i = 1; i <= SEARCH_AHEAD_DAYS; i++) {
      var day = addDays(today(), i);
      if (isWorkday(day) && dayHasFreeSlot(doctorId, day, state)) return day;
    }
    return null;
  }

  // Tarih ekranında gösterilecek 5 iş günü: en yakın boş günden başlar
  function dayWindow(doctorId, startDate) {
    var state = storage.read();
    var start = startDate || earliestAvailable(doctorId, state);
    if (!start) return [];
    var days = [];
    var cursor = start;
    while (days.length < WINDOW_SIZE) {
      if (isWorkday(cursor)) {
        days.push({ date: cursor, hasFree: dayHasFreeSlot(doctorId, cursor, state) });
      }
      cursor = addDays(cursor, 1);
    }
    return days;
  }

  function availabilitySummary(doctorId) {
    var earliest = earliestAvailable(doctorId);
    return {
      earliestDate: earliest,
      hasSlotThisWeek: !!earliest && earliest <= endOfThisWeek()
    };
  }

  function nearestFreeTimes(doctorId, date, time, count) {
    var target = toMinutes(time);
    return slotsFor(doctorId, date)
      .filter(function (s) { return s.free && s.time !== time; })
      .sort(function (a, b) { return Math.abs(toMinutes(a.time) - target) - Math.abs(toMinutes(b.time) - target); })
      .slice(0, count)
      .map(function (s) { return s.time; })
      .sort(function (a, b) { return toMinutes(a) - toMinutes(b); });
  }

  /* ---------- Arama (F-01) ---------- */

  function search(query) {
    var q = normalize(query);
    if (!q) return { branches: [], doctors: [] };
    var branches = D.BRANCHES.filter(function (b) { return normalize(b.name).indexOf(q) !== -1; });
    var doctors = D.DOCTORS.filter(function (d) {
      var plain = normalize(d.name.replace(/^(Prof\.|Doç\.|Uzm\.|Op\.)\s*Dr\.\s*/, ""));
      return plain.indexOf(q) !== -1 || normalize(d.name).indexOf(q) !== -1;
    }).map(function (d) {
      return Object.assign({}, d, { branchName: getBranch(d.branchId).name });
    });
    return { branches: branches, doctors: doctors };
  }

  /* ---------- Randevular ---------- */

  function enrich(a) {
    var doctor = getDoctor(a.doctorId);
    var branch = doctor ? getBranch(doctor.branchId) : null;
    return Object.assign({}, a, {
      doctorName: doctor ? doctor.name : "",
      branchId: branch ? branch.id : "",
      branchName: branch ? branch.name : "",
      hospital: D.HOSPITAL,
      isUpcoming: a.status === "aktif" && a.date >= today()
    });
  }

  function byDateTime(a, b) {
    return a.date === b.date ? toMinutes(a.time) - toMinutes(b.time) : (a.date < b.date ? -1 : 1);
  }

  function upcomingAppointments() {
    return storage.read().appointments
      .filter(function (a) { return a.status === "aktif" && a.date >= today(); })
      .map(enrich).sort(byDateTime);
  }

  function pastAppointments() {
    return storage.read().appointments
      .filter(function (a) { return a.status !== "aktif" || a.date < today(); })
      .map(enrich).sort(byDateTime).reverse();
  }

  function getAppointment(id) {
    var a = storage.read().appointments.find(function (x) { return x.id === id; });
    return a ? enrich(a) : null;
  }

  function createAppointment(doctorId, date, time) {
    var state = storage.read();
    var doctor = getDoctor(doctorId);
    if (!doctor) return { ok: false, code: "INVALID_REQUEST" };
    if (!isWorkday(date) || date <= today() || D.TIMES.indexOf(time) === -1) return { ok: false, code: "INVALID_REQUEST" };

    var active = state.appointments.filter(function (a) { return a.status === "aktif"; }).map(enrich);

    var sameTime = active.find(function (a) { return a.date === date && a.time === time; });
    if (sameTime) return { ok: false, code: "TIME_CONFLICT", existing: sameTime };

    var sameBranchDay = active.find(function (a) { return a.date === date && a.branchId === doctor.branchId; });
    if (sameBranchDay) return { ok: false, code: "SAME_BRANCH_SAME_DAY", existing: sameBranchDay };

    // Çakışma simülasyonu (F-08): test sırasında saat, onaydan hemen önce başkası tarafından alınır
    if (conflictMode) {
      conflictMode = false;
      try { window.sessionStorage.removeItem("saglik-randevu.cakisma"); } catch (e) { /* yok say */ }
      state.extraBooked.push({ doctorId: doctorId, date: date, time: time });
      storage.write(state);
    }

    if (isBookedByOthers(doctorId, date, time, state) || isTakenByUser(doctorId, date, time, state)) {
      return { ok: false, code: "SLOT_TAKEN", alternatives: nearestFreeTimes(doctorId, date, time, 3) };
    }

    var appointment = {
      id: "r-" + Date.now().toString(36),
      doctorId: doctorId, date: date, time: time,
      status: "aktif", createdAt: new Date().toISOString()
    };
    state.appointments.push(appointment);
    storage.write(state);
    return { ok: true, appointment: enrich(appointment) };
  }

  function cancelAppointment(id) {
    var state = storage.read();
    var a = state.appointments.find(function (x) { return x.id === id; });
    if (!a || a.status !== "aktif") return { ok: false, code: "NOT_FOUND" };
    a.status = "iptal";
    storage.write(state);
    return { ok: true, appointment: enrich(a) };
  }

  function restoreAppointment(id) {
    var state = storage.read();
    var a = state.appointments.find(function (x) { return x.id === id; });
    if (!a || a.status !== "iptal") return { ok: false, code: "NOT_FOUND" };
    if (isBookedByOthers(a.doctorId, a.date, a.time, state)) return { ok: false, code: "SLOT_TAKEN" };
    a.status = "aktif";
    storage.write(state);
    return { ok: true, appointment: enrich(a) };
  }

  window.SR.logic = {
    // tarih
    today: today, formatDate: formatDate, formatDateLong: formatDateLong,
    formatDayMonth: formatDayMonth, dayName: dayName, toMinutes: toMinutes,
    // varlıklar
    branches: function () { return D.BRANCHES.slice(); },
    getBranch: getBranch, getDoctor: getDoctor, doctorsOf: doctorsOf,
    hospital: function () { return D.HOSPITAL; },
    user: function () { return D.USER; },
    // müsaitlik
    slotsFor: slotsFor, dayWindow: dayWindow, availabilitySummary: availabilitySummary,
    earliestAvailable: earliestAvailable,
    // arama
    search: search,
    // randevular
    upcomingAppointments: upcomingAppointments, pastAppointments: pastAppointments,
    getAppointment: getAppointment, createAppointment: createAppointment,
    cancelAppointment: cancelAppointment, restoreAppointment: restoreAppointment,
    // gizlilik bilgilendirmesi (G-01)
    isPrivacyNoticeSeen: function () { return !!storage.read().privacyNoticeSeen; },
    markPrivacyNoticeSeen: function () {
      var s = storage.read();
      s.privacyNoticeSeen = true;
      storage.write(s);
      return { ok: true };
    },
    // test yardımcıları
    setConflictMode: function (on) { conflictMode = !!on; },
    isConflictMode: function () { return conflictMode; }
  };
})();
