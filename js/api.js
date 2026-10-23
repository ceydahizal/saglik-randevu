/*
 * İSTEK / API KATMANI
 * Arayüzden gelen istekleri alır, biçimini doğrular ve uygulama mantığına iletir.
 * Gerçek bir sunucu olmadığı için ağ gecikmesi burada simüle edilir; böylece
 * yüklenme durumları (P-01) gerçek bir uygulamadaki gibi görünür.
 * Her çağrı aynı biçimde sonuç döner:
 *   { ok: true, data: ... }  ya da  { ok: false, error: { code: "...", ... } }
 */
(function () {
  "use strict";

  var logic = window.SR.logic;
  var READ_DELAY = 250;   // ms – listeleme
  var WRITE_DELAY = 900;  // ms – randevu oluşturma/iptal (yüklenme göstergesi görünür)

  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME = /^\d{2}\.\d{2}$/;

  function respond(fn, delay) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        try {
          var result = fn();
          if (result && result.ok === false) {
            resolve({ ok: false, error: Object.assign({}, result, { ok: undefined }) });
          } else {
            resolve({ ok: true, data: result && result.ok === true ? result : result });
          }
        } catch (e) {
          if (window.console) console.error(e);
          resolve({ ok: false, error: { code: "SYSTEM_ERROR" } });
        }
      }, delay);
    });
  }

  function invalid() { return { ok: false, code: "INVALID_REQUEST" }; }

  window.SR.api = {
    search: function (query) {
      if (typeof query !== "string" || query.length > 60) return respond(invalid, 0);
      return respond(function () { return logic.search(query); }, 0);
    },

    listBranches: function () {
      return respond(function () { return { branches: logic.branches() }; }, 0);
    },

    listDoctors: function (branchId) {
      return respond(function () {
        var branch = logic.getBranch(branchId);
        if (!branch) return { ok: false, code: "NOT_FOUND" };
        return {
          branch: branch,
          hospital: logic.hospital(),
          doctors: logic.doctorsOf(branchId).map(function (d) {
            return Object.assign({}, d, { availability: logic.availabilitySummary(d.id) });
          })
        };
      }, READ_DELAY);
    },

    getAvailability: function (doctorId, startDate) {
      if (startDate && !ISO_DATE.test(startDate)) return respond(invalid, 0);
      return respond(function () {
        var doctor = logic.getDoctor(doctorId);
        if (!doctor) return { ok: false, code: "NOT_FOUND" };
        var days = logic.dayWindow(doctorId, startDate);
        return {
          doctor: doctor,
          branch: logic.getBranch(doctor.branchId),
          hospital: logic.hospital(),
          summary: logic.availabilitySummary(doctorId),
          days: days.map(function (d) {
            return { date: d.date, hasFree: d.hasFree, slots: logic.slotsFor(doctorId, d.date) };
          })
        };
      }, READ_DELAY);
    },

    createAppointment: function (req) {
      if (!req || !req.doctorId || !ISO_DATE.test(req.date || "") || !TIME.test(req.time || "")) {
        return respond(invalid, 0);
      }
      return respond(function () { return logic.createAppointment(req.doctorId, req.date, req.time); }, WRITE_DELAY);
    },

    listAppointments: function () {
      return respond(function () {
        return { upcoming: logic.upcomingAppointments(), past: logic.pastAppointments() };
      }, READ_DELAY);
    },

    getAppointment: function (id) {
      return respond(function () {
        var a = logic.getAppointment(id);
        return a || { ok: false, code: "NOT_FOUND" };
      }, READ_DELAY);
    },

    cancelAppointment: function (id) {
      return respond(function () { return logic.cancelAppointment(id); }, WRITE_DELAY);
    },

    restoreAppointment: function (id) {
      return respond(function () { return logic.restoreAppointment(id); }, READ_DELAY);
    },

    getProfile: function () {
      return respond(function () {
        return { user: logic.user(), privacyNoticeSeen: logic.isPrivacyNoticeSeen() };
      }, 0);
    },

    dismissPrivacyNotice: function () {
      return respond(function () { return logic.markPrivacyNoticeSeen(); }, 0);
    }
  };
})();
