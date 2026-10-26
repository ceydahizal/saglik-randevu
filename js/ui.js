/*
 * KULLANICI ARAYÜZÜ
 * Ekranlar, gezinme, giriş alanları, durum göstergeleri ve geri bildirimler.
 * Arayüz yalnızca API katmanıyla (SR.api) ve ileti katmanıyla (SR.messages)
 * konuşur; iş kurallarını kendi içinde tekrar etmez.
 *
 * Ekranlar (Figma'daki numaralarla):
 *  #/                 01 Ana ekran
 *  #/brans            02 Branş seçimi
 *  #/doktor/:brans    03 Doktor seçimi
 *  #/uygun-yok/:dr    04-B Boş sonuç
 *  #/tarih/:dr        04 Tarih ve saat
 *  #/onay             05 Onay (çakışmada 05-B)
 *  #/basarili/:id     06 Başarılı
 *  #/randevular       07 Randevularım (iptal sonrası 07-C bildirimi)
 *  #/randevu/:id      08 Randevu detayı (iptal penceresi 08-B)
 */
(function () {
  "use strict";

  var api = window.SR.api;
  var M = window.SR.messages;
  var F = M.format;
  var T = M.text;

  // F-04: "Geri al" ilk sürümde 5 saniye görünüyordu. Uygulama testinde U1 bu süreye
  // yetişemedi; süre sınırı kaldırıldı. Bildirim, kullanıcı Randevularım ekranından
  // ayrılana kadar görünür (ISO 9241-110 kontrol edilebilirlik, WCAG 2.2.1).
  var LOADING_MS = 500;   // P-01: bu süreyi aşan işlemlerde yüklenme göstergesi

  var app, live;
  var renderToken = 0;
  var state = {
    selection: null,     // { doctorId, doctorName, branchId, branchName, hospital, date, time }
    query: "",
    undo: null,          // { id, timer }
    restored: null,      // v3.1: geri getirilen randevu (görünür onay için)
    flash: null,         // bir sonraki ekranda gösterilecek bilgi
    modalReturnFocus: null
  };

  /* ---------- yardımcılar ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function announce(msg) {
    live.textContent = "";
    setTimeout(function () { live.textContent = msg; }, 50);
  }

  function go(hash, replace) {
    if (replace) location.replace(hash); else location.hash = hash;
  }

  var ICON = {
    back: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevron: '<svg class="chevron" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false"><path d="M12 25l8 8 16-17" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    alert: '<span class="alert-icon" aria-hidden="true">!</span>'
  };

  function header(opts) {
    return '<header class="top">' +
      (opts.back ? '<button class="back" type="button" data-go="' + esc(opts.back) + '" aria-label="Geri">' + ICON.back + '</button>' : "") +
      '<h1 tabindex="-1">' + esc(opts.title) + '</h1>' +
      '</header>' +
      (opts.step ? '<p class="step">' + esc(opts.step) + '</p>' : "");
  }

  function screen(inner, bottom) {
    return '<main class="screen' + (bottom ? " has-bottom" : "") + '">' + inner + '</main>' +
      (bottom ? '<footer class="bottom-bar">' + bottom + '</footer>' : "");
  }

  function banner(kind, title, text, actions) {
    return '<section class="banner banner-' + kind + '" role="' + (kind === "error" ? "alert" : "status") + '">' +
      (kind === "error" ? ICON.alert : "") +
      '<div><h2 class="banner-title">' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
      (actions ? '<div class="banner-actions">' + actions + '</div>' : "") + '</div></section>';
  }

  function apptCard(a, opts) {
    opts = opts || {};
    var status = "";
    if (a.status === "iptal") status = '<span class="tag">İptal edildi</span>';
    else if (opts.past) status = '<span class="tag">Gidildi</span>';
    // v3: yaşlı katılımcılar kartın dokunulabilir olduğunu anlamadı (U2, U3); eylem yazıyla belirtiliyor
    var action = a.isUpcoming ? "Görüntüle veya iptal et" : "Ayrıntıları görüntüle";
    return '<button type="button" class="card card-link" data-go="#/randevu/' + esc(a.id) + '">' +
      '<span class="card-body">' +
      '<span class="card-title">' + esc(a.branchName) + status + '</span>' +
      '<span class="card-line">' + esc(a.doctorName) + '</span>' +
      '<span class="card-line strong">' + esc(F.dateTime(a.date, a.time)) + '</span>' +
      '<span class="card-line muted">' + esc(a.hospital) + '</span>' +
      '<span class="card-action">' + action + '</span>' +
      '</span>' + ICON.chevron + '</button>';
  }

  function summaryList(s) {
    return '<dl class="summary">' +
      '<div><dt>Branş</dt><dd>' + esc(s.branchName) + '</dd></div>' +
      '<div><dt>Doktor</dt><dd>' + esc(s.doctorName) + '</dd></div>' +
      '<div><dt>Hastane</dt><dd>' + esc(s.hospital) + '</dd></div>' +
      '<div><dt>Tarih</dt><dd>' + esc(F.dateLong(s.date)) + '</dd></div>' +
      '<div><dt>Saat</dt><dd>' + esc(s.time) + '</dd></div>' +
      '</dl>';
  }

  /* ---------- çizim ve yüklenme ---------- */

  function paint(html, focusSelector) {
    app.innerHTML = html;
    var target = focusSelector && app.querySelector(focusSelector);
    (target || app.querySelector("h1")).focus({ preventScroll: false });
  }

  // P-01: yanıt 500 ms'yi aşarsa yüklenme göstergesi
  function load(promise, token) {
    var timer = setTimeout(function () {
      if (token === renderToken) {
        app.innerHTML = '<main class="screen"><p class="loading" role="status"><span class="spinner" aria-hidden="true"></span>' + T.loading + '</p></main>';
      }
    }, LOADING_MS);
    return promise.then(function (res) {
      clearTimeout(timer);
      if (token !== renderToken) return new Promise(function () {}); // eski ekran: yok say
      return res;
    });
  }

  function fatal(error) {
    var m = M.errorMessage(error);
    paint(screen(header({ back: "#/", title: "Bir sorun oluştu" }) +
      banner("error", m.title, m.text, '<button type="button" class="btn btn-secondary" data-go="#/">Ana sayfaya dön</button>')));
  }

  /* ---------- 01 Ana ekran ---------- */

  function home(token) {
    Promise.all([load(api.getProfile(), token), load(api.listAppointments(), token)]).then(function (r) {
      var profile = r[0].data, list = r[1];
      if (!list.ok) return fatal(list.error);
      // v2 (prototip testi sonrası): "Randevu al" ekranın altında fark edilmediği için
      // (K3 göremedi, K1 duraksadı) iki ana işlem selamlamanın hemen altına alındı.
      // v3 (uygulama testi sonrası): U2 iptal edeceği randevuyu ana ekranda aradı;
      // artık en yakın 3 randevu gösteriliyor.
      var upcoming = list.data.upcoming;
      var shown = upcoming.slice(0, 3);
      var html =
        '<header class="top"><h1 tabindex="-1" class="greeting">Hoş geldiniz</h1></header>' +
        '<button type="button" class="btn btn-primary btn-hero" data-go="#/brans">Randevu al</button>' +
        '<button type="button" class="btn btn-secondary" data-go="#/randevular">Randevularım</button>' +
        '<h2 class="section-label">Yaklaşan randevularınız</h2>' +
        (shown.length ? '<div class="stack stack-tight">' + shown.map(function (a) { return apptCard(a); }).join("") + '</div>'
          : '<p class="card card-empty">' + T.noUpcoming + '</p>') +
        (upcoming.length > 3 ? '<button type="button" class="btn btn-secondary" data-go="#/randevular">Tüm randevularım (' + upcoming.length + ')</button>' : "") +
        (profile.privacyNoticeSeen ? "" :
          '<section class="banner banner-info" aria-labelledby="gizlilik-baslik"><div>' +
          '<h2 class="banner-title" id="gizlilik-baslik">' + T.privacyTitle + '</h2><p>' + T.privacyBody + '</p>' +
          '<div class="banner-actions"><button type="button" class="btn btn-secondary btn-small" data-action="dismiss-privacy">Anladım</button></div>' +
          '</div></section>');
      paint(screen(html));
    });
  }

  /* ---------- 02 Branş seçimi ---------- */

  function branchRows(branches) {
    return '<ul class="list">' + branches.map(function (b) {
      return '<li><button type="button" class="row" data-go="#/doktor/' + esc(b.id) + '"><span>' + esc(b.name) + '</span>' + ICON.chevron + '</button></li>';
    }).join("") + '</ul>';
  }

  function doctorSearchRows(doctors) {
    return '<ul class="list">' + doctors.map(function (d) {
      return '<li><button type="button" class="row" data-action="choose-doctor" data-id="' + esc(d.id) + '"><span>' +
        esc(d.name) + '<span class="row-sub">' + esc(d.branchName) + '</span></span>' + ICON.chevron + '</button></li>';
    }).join("") + '</ul>';
  }

  var allBranches = []; // arama boşken gösterilen liste (API'den gelir)

  function branchResults(query) {
    var box = app.querySelector("#sonuclar");
    if (!box) return;
    if (!query.trim()) {
      box.innerHTML = '<h2 class="section-label">Sık aranan branşlar</h2>' + branchRows(allBranches);
      return;
    }
    api.search(query).then(function (res) {
      if (!res.ok || !app.querySelector("#sonuclar")) return;
      var b = res.data.branches, d = res.data.doctors;
      var html = "";
      if (!b.length && !d.length) {
        html = '<p class="empty" role="status">' + esc(T.searchEmpty(query.trim())) + '</p>' +
          '<h2 class="section-label">Tüm branşlar</h2>' + branchRows(allBranches);
      } else {
        if (b.length) html += '<h2 class="section-label">Branşlar</h2>' + branchRows(b);
        if (d.length) html += '<h2 class="section-label">Doktorlar</h2>' + doctorSearchRows(d);
        announce((b.length + d.length) + " sonuç bulundu");
      }
      box.innerHTML = html;
    });
  }

  function branchScreen(token) {
    load(api.listBranches(), token).then(function (res) {
      if (!res.ok) return fatal(res.error);
      allBranches = res.data.branches;
      drawBranchScreen();
    });
  }

  function drawBranchScreen() {
    paint(screen(
      header({ back: "#/", title: "Branş Seçiniz", step: "Adım 1/4" }) +
      '<label for="ara" class="visually-hidden">Branş veya doktor ara</label>' +
      '<input id="ara" class="input" type="search" placeholder="Branş veya doktor ara" autocomplete="off" enterkeyhint="search" value="' + esc(state.query) + '">' +
      '<div id="sonuclar"></div>'
    ));
    var input = app.querySelector("#ara");
    input.addEventListener("input", function () { state.query = input.value; branchResults(input.value); });
    branchResults(state.query);
  }

  /* ---------- 03 Doktor seçimi ---------- */

  function doctorScreen(token, branchId) {
    load(api.listDoctors(branchId), token).then(function (res) {
      if (!res.ok) return fatal(res.error);
      var data = res.data;
      doctorScreen.cache = {};
      data.doctors.forEach(function (d) { doctorScreen.cache[d.id] = d.availability; });
      var withSlots = data.doctors.filter(function (d) { return d.availability.earliestDate; });
      var html = header({ back: "#/brans", title: "Doktor Seçiniz", step: "Adım 2/4" }) +
        '<p class="context">Branş: ' + esc(data.branch.name) + ' - ' + esc(data.hospital) + '</p>';
      if (withSlots.length) {
        html += '<button type="button" class="card card-link card-shortcut" data-action="earliest" data-branch="' + esc(branchId) + '">' +
          '<span class="card-body"><span class="card-title">Fark etmez, en yakın tarihi göster</span>' +
          '<span class="card-line muted">En erken boş günü olan doktor seçilir</span></span>' + ICON.chevron + '</button>';
      }
      html += '<h2 class="section-label">Doktorlar</h2><ul class="list">' + data.doctors.map(function (d) {
        var a = d.availability;
        var sub = a.earliestDate ? "En yakın boş gün: " + F.dateLong(a.earliestDate) : "Yakın tarihte boş saat yok";
        return '<li><button type="button" class="row row-tall" data-action="choose-doctor" data-id="' + esc(d.id) + '"' +
          (a.earliestDate ? "" : " disabled") + '><span>' + esc(d.name) + '<span class="row-sub">' + esc(sub) + '</span></span>' +
          ICON.chevron + '</button></li>';
      }).join("") + '</ul>';
      paint(screen(html));
    });
  }

  function chooseDoctor(doctorId) {
    var cached = doctorScreen.cache && doctorScreen.cache[doctorId];
    if (cached) { // 03'te zaten yüklenen bilgi: ikinci bir bekleme olmasın
      return go(cached.hasSlotThisWeek ? "#/tarih/" + doctorId : "#/uygun-yok/" + doctorId);
    }
    api.getAvailability(doctorId).then(function (res) {
      if (!res.ok) return fatal(res.error);
      go(res.data.summary.hasSlotThisWeek ? "#/tarih/" + doctorId : "#/uygun-yok/" + doctorId);
    });
  }

  function chooseEarliest(branchId) {
    api.listDoctors(branchId).then(function (res) {
      if (!res.ok) return fatal(res.error);
      var best = res.data.doctors.filter(function (d) { return d.availability.earliestDate; })
        .sort(function (a, b) { return a.availability.earliestDate < b.availability.earliestDate ? -1 : 1; })[0];
      if (best) go("#/tarih/" + best.id);
    });
  }

  /* ---------- 04-B Boş sonuç ---------- */

  function noSlotScreen(token, doctorId) {
    load(api.getAvailability(doctorId), token).then(function (res) {
      if (!res.ok) return fatal(res.error);
      var d = res.data, earliest = d.summary.earliestDate;
      var html = header({ back: "#/doktor/" + d.branch.id, title: "Tarih ve Saat Seçiniz", step: "Adım 3/4" }) +
        '<p class="context">' + esc(d.branch.name) + ' - ' + esc(d.doctor.name) + '</p>';
      if (!earliest) {
        html += banner("info", "Yakın tarihte boş saat bulunmuyor",
          d.doctor.name + " için önümüzdeki haftalarda boş saat yok. Aynı branştan başka bir doktor seçebilirsiniz.");
        return paint(screen(html, '<button type="button" class="btn btn-primary" data-go="#/doktor/' + esc(d.branch.id) + '">Başka doktor seç</button>'));
      }
      html += banner("info", "Bu hafta boş saat bulunmuyor",
          d.doctor.name + " için en yakın boş gün " + F.dateLong(earliest) + ". Ne yapmak istediğinizi seçin:");
      // v3: U3 alttaki seçenekleri fark etmedi ("Ne yapacağım şimdi?"); seçenekler mesajın hemen altında
      html += '<div class="actions">' +
        '<button type="button" class="btn btn-primary" data-go="#/tarih/' + esc(doctorId) + '?gun=' + esc(earliest) + '">' +
        esc(F.dayMonth(earliest) + " " + F.dayName(earliest)) + ' gününe bak</button>' +
        '<button type="button" class="btn btn-secondary" data-go="#/doktor/' + esc(d.branch.id) + '">Başka doktor seç</button>' +
        '</div>';
      paint(screen(html));
    });
  }

  /* ---------- 04 Tarih ve saat ---------- */

  function dateScreen(token, doctorId, startDate) {
    load(api.getAvailability(doctorId, startDate), token).then(function (res) {
      if (!res.ok) return fatal(res.error);
      var data = res.data;
      if (!data.days.length) return fatal({ code: "NOT_FOUND" });
      var sel = state.selection && state.selection.doctorId === doctorId ? state.selection : null;
      var local = {
        date: sel && data.days.some(function (d) { return d.date === sel.date; }) ? sel.date
          : (startDate || (data.days.find(function (d) { return d.hasFree; }) || data.days[0]).date),
        time: sel ? sel.time : null
      };
      if (sel && sel.date !== local.date) local.time = null;

      function draw(focusSel) {
        var day = data.days.find(function (d) { return d.date === local.date; });
        var html = header({ back: "#/doktor/" + data.branch.id, title: "Tarih ve Saat Seçiniz", step: "Adım 3/4" }) +
          '<p class="context">' + esc(data.branch.name) + ' - ' + esc(data.doctor.name) + '</p>' +
          '<h2 class="section-label" id="gun-baslik">Gün seçiniz</h2>' +
          '<div class="grid" role="group" aria-labelledby="gun-baslik">' + data.days.map(function (d) {
            var on = d.date === local.date;
            return '<button type="button" class="choice choice-day' + (on ? " is-on" : "") + (d.hasFree ? "" : " is-full") + '"' +
              ' data-action="pick-day" data-date="' + d.date + '" aria-pressed="' + on + '"' + (d.hasFree ? "" : " disabled") + '>' +
              '<span class="choice-top">' + esc(F.dayName(d.date)) + '</span>' +
              '<span class="choice-main">' + esc(F.date(d.date)) + '</span>' +
              (d.hasFree ? "" : '<span class="choice-top">Dolu</span>') + '</button>';
          }).join("") + '</div>' +
          '<h2 class="section-label" id="saat-baslik">Saat seçiniz</h2>' +
          '<div class="grid" role="group" aria-labelledby="saat-baslik">' + day.slots.map(function (s) {
            var on = s.time === local.time;
            return '<button type="button" class="choice' + (on ? " is-on" : "") + (s.free ? "" : " is-full") + '"' +
              ' data-action="pick-time" data-time="' + s.time + '" aria-pressed="' + on + '"' + (s.free ? "" : " disabled") + '>' +
              esc(s.time) + (s.free ? "" : " Dolu") + '</button>';
          }).join("") + '</div>';
        var bottom = (local.time ? "" : '<p class="hint" id="devam-ipucu">' + T.chooseTimeHint + '</p>') +
          '<button type="button" class="btn btn-primary" data-action="continue"' +
          (local.time ? "" : ' disabled aria-describedby="devam-ipucu"') + '>Devam Et</button>';
        paint(screen(html, bottom), focusSel);
      }

      dateScreen.handlers = {
        pickDay: function (date) { local.date = date; local.time = null; draw('[data-date="' + date + '"]'); },
        pickTime: function (time) { local.time = time; draw('[data-time="' + time + '"]'); announce(time + " seçildi"); },
        next: function () {
          state.selection = {
            doctorId: doctorId, doctorName: data.doctor.name,
            branchId: data.branch.id, branchName: data.branch.name,
            hospital: data.hospital, date: local.date, time: local.time
          };
          go("#/onay");
        }
      };
      draw();
    });
  }

  /* ---------- 05 Onay / 05-B Çakışma ---------- */

  function confirmScreen(problem) {
    var s = state.selection;
    if (!s || !s.time) return go("#/brans", true);
    var back = "#/tarih/" + s.doctorId + "?gun=" + s.date;
    var html = header({ back: back, title: "Randevuyu Onaylayınız", step: "Adım 4/4" });
    // v3.1: U4 "Randevu al diyorum, Onayla mı diyeyim?" diye sordu; buton ne olacağını söylüyor
    var bottom = '<button type="button" class="btn btn-primary" data-action="confirm">Randevuyu onayla</button>';

    if (problem && problem.code === "SLOT_TAKEN") {
      var m = M.errorMessage(problem, { time: s.time });
      html += banner("error", m.title, m.text);
      if (problem.alternatives && problem.alternatives.length) {
        html += '<h2 class="section-label" id="alt-baslik">Aynı gün boş olan en yakın saatler</h2>' +
          '<div class="grid" role="group" aria-labelledby="alt-baslik">' + problem.alternatives.map(function (t) {
            return '<button type="button" class="choice" data-action="pick-alternative" data-time="' + t + '">' + t + '</button>';
          }).join("") + '</div>';
      } else {
        html += '<p class="note">Bu gün için başka boş saat kalmadı.</p>';
      }
      html += '<p class="context">' + esc(s.branchName + " - " + s.doctorName + ", " + F.dateLong(s.date)) + '</p>' +
        '<div class="actions"><button type="button" class="btn btn-secondary" data-go="' + esc(back) + '">Başka gün seç</button></div>';
      return paint(screen(html), ".banner");
    }

    if (problem) {
      var e = M.errorMessage(problem);
      var actions = problem.code === "SAME_BRANCH_SAME_DAY" || problem.code === "TIME_CONFLICT"
        ? '<button type="button" class="btn btn-secondary btn-small" data-go="' + esc(back) + '">Başka gün seç</button>' +
          '<button type="button" class="btn btn-secondary btn-small" data-go="#/randevular">Randevularım</button>'
        : "";
      html += banner("error", e.title, e.text, actions);
    } else {
      html += '<p class="lead">' + (state.flash || "Bilgileri kontrol edip onaylayınız") + '</p>';
      state.flash = null;
    }
    html += summaryList(s) + '<p class="note">' + T.confirmNote + '</p>';
    paint(screen(html, bottom), problem ? ".banner" : null);
  }

  function confirm(btn) {
    var s = state.selection;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Onaylanıyor…';
    api.createAppointment({ doctorId: s.doctorId, date: s.date, time: s.time }).then(function (res) {
      if (res.ok) {
        state.selection = null;
        state.query = "";
        go("#/basarili/" + res.data.appointment.id, true);
      } else {
        confirmScreen(res.error);
      }
    });
  }

  /* ---------- 06 Başarılı ---------- */

  function successScreen(token, id) {
    load(api.getAppointment(id), token).then(function (res) {
      if (!res.ok) return fatal(res.error);
      var a = res.data;
      var html = '<div class="success-mark">' + ICON.check + '</div>' +
        '<header class="top top-center"><h1 tabindex="-1">Randevunuz oluşturuldu</h1></header>' +
        summaryList(a) + '<p class="note center" id="takvim-durum" role="status">' + T.createdNote + '</p>';
      var bottom = '<button type="button" class="btn btn-secondary" data-action="calendar" data-id="' + esc(a.id) + '">Takvime ekle</button>' +
        '<button type="button" class="btn btn-primary" data-go="#/">Ana sayfaya dön</button>';
      paint(screen(html, bottom));
      announce("Randevunuz oluşturuldu. " + a.branchName + ", " + F.dateTime(a.date, a.time));
    });
  }

  /* ---------- 07 Randevularım ---------- */

  function listScreen(token, tab) {
    load(api.listAppointments(), token).then(function (res) {
      if (!res.ok) return fatal(res.error);
      var past = tab === "gecmis";
      var items = past ? res.data.past : res.data.upcoming;
      // v3: "Geri al" bildirimi ekranın altında fark edilmedi (U3); listenin üstünde gösteriliyor.
      // v3.1: U4 iptalden sonra "yeniden mi randevu alayım?" dedi; soyut "Geri al" yerine
      // sonucu söyleyen "Randevuyu geri getir" kullanılıyor.
      var undoBanner = state.undo
        ? '<section class="banner banner-done" role="status"><div><h2 class="banner-title">' + T.cancelled + '</h2>' +
          '<p>Fikrinizi değiştirdiyseniz yeniden randevu almanıza gerek yok, aynı randevuyu geri getirebilirsiniz.</p>' +
          '<div class="banner-actions"><button type="button" class="btn btn-primary btn-small" data-action="undo">Randevuyu geri getir</button></div></div></section>'
        : "";
      // v3.1: U5 geri aldıktan sonra "Geri aldı mı?" diye emin olamadı; sonuç ekranda da yazıyor.
      var r = state.restored;
      var restoredBanner = r
        ? '<section class="banner banner-done" role="status"><span class="alert-icon alert-ok" aria-hidden="true">✓</span><div>' +
          '<h2 class="banner-title">' + T.restored + '</h2>' +
          '<p>' + esc(r.branchName) + ', ' + esc(F.dateTime(r.date, r.time)) + ' randevunuz yeniden aşağıdaki listede.</p></div></section>'
        : "";
      var html = header({ back: "#/", title: "Randevularım" }) + undoBanner + restoredBanner +
        '<div class="tabs" role="tablist" aria-label="Randevu listesi">' +
        '<button type="button" role="tab" class="tab' + (past ? "" : " is-on") + '" aria-selected="' + !past + '" data-action="tab" data-tab="yaklasan">Yaklaşan</button>' +
        '<button type="button" role="tab" class="tab' + (past ? " is-on" : "") + '" aria-selected="' + past + '" data-action="tab" data-tab="gecmis">Geçmiş</button>' +
        '</div><div class="stack">' +
        (items.length ? items.map(function (a) { return apptCard(a, { past: past }); }).join("")
          : '<p class="card card-empty">' + (past ? T.noPast : T.noUpcoming) + '</p>') +
        '</div>';
      paint(screen(html, '<button type="button" class="btn btn-primary" data-go="#/brans">Randevu al</button>'));
    });
  }

  /* ---------- 08 Randevu detayı / 08-B İptal penceresi ---------- */

  function detailScreen(token, id) {
    load(api.getAppointment(id), token).then(function (res) {
      if (!res.ok) return fatal(res.error);
      var a = res.data;
      var isActive = a.isUpcoming;
      var html = header({ back: "#/randevular" + (isActive ? "" : "?sekme=gecmis"), title: "Randevu Detayı" }) +
        (a.status === "iptal" ? '<p class="context"><span class="tag">İptal edildi</span></p>' : "") +
        summaryList(a);
      // v3: U3 alttaki "Randevuyu iptal et"i fark etmedi; eylemler özetin hemen altında
      html += '<div class="actions">' + (isActive
        ? '<button type="button" class="btn btn-outline" data-action="ask-cancel" data-id="' + esc(a.id) + '">Randevuyu iptal et</button>' +
          '<button type="button" class="btn btn-secondary" data-action="calendar" data-id="' + esc(a.id) + '">Takvime ekle</button>'
        : '<button type="button" class="btn btn-primary" data-go="#/brans">Yeni randevu al</button>') +
        '</div><p class="note" id="takvim-durum" role="status"></p>';
      paint(screen(html));
      detailScreen.current = a;
    });
  }

  function openCancelDialog(trigger) {
    var a = detailScreen.current;
    state.modalReturnFocus = trigger;
    var wrap = document.createElement("div");
    wrap.className = "modal-layer";
    wrap.innerHTML =
      '<div class="modal-backdrop" data-action="keep"></div>' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-baslik" aria-describedby="modal-detay">' +
      '<h2 id="modal-baslik">Randevuyu iptal etmek istiyor musunuz?</h2>' +
      '<p id="modal-detay" class="modal-detail">' + esc(a.branchName) + '<br>' + esc(a.doctorName) + '<br>' + esc(F.dateTime(a.date, a.time)) + '</p>' +
      '<p class="note">' + T.cancelNote + '</p>' +
      '<button type="button" class="btn btn-primary" data-action="keep">Randevuyu koru</button>' +
      '<button type="button" class="btn btn-outline" data-action="confirm-cancel" data-id="' + esc(a.id) + '">Evet, iptal et</button>' +
      '</div>';
    app.appendChild(wrap);
    app.querySelectorAll("main, .bottom-bar").forEach(function (el) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); });
    wrap.querySelector('[data-action="keep"].btn').focus();
  }

  function closeDialog() {
    var layer = app.querySelector(".modal-layer");
    if (!layer) return;
    layer.remove();
    app.querySelectorAll("main, .bottom-bar").forEach(function (el) { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); });
    if (state.modalReturnFocus && document.body.contains(state.modalReturnFocus)) state.modalReturnFocus.focus();
    state.modalReturnFocus = null;
  }

  function confirmCancel(btn) {
    var id = btn.getAttribute("data-id");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>İptal ediliyor…';
    api.cancelAppointment(id).then(function (res) {
      if (!res.ok) { closeDialog(); return fatal(res.error); }
      state.undo = { id: id };
      state.restored = null;
      go("#/randevular", true);
      announce(T.cancelled + " Fikrinizi değiştirdiyseniz Randevuyu geri getir düğmesini kullanabilirsiniz.");
    });
  }

  function undoCancel() {
    if (!state.undo) return;
    var id = state.undo.id;
    state.undo = null;
    api.restoreAppointment(id).then(function (res) {
      if (res.ok) state.restored = res.data.appointment;
      announce(res.ok ? T.restored : T.restoreFailed);
      route();
    });
  }

  /* ---------- Takvime ekle (F-05) ---------- */

  function icsText(s) { return String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, function (c) { return "\\" + c; }); }

  function downloadCalendar(id) {
    api.getAppointment(id).then(function (res) {
      if (!res.ok) return;
      var a = res.data;
      var d = a.date.replace(/-/g, "");
      var start = a.time.replace(".", "") + "00";
      var tp = a.time.split(".");
      var endMin = +tp[0] * 60 + +tp[1] + 30;
      var end = String(Math.floor(endMin / 60)).padStart(2, "0") + String(endMin % 60).padStart(2, "0") + "00";
      var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      var ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Saglik Randevu//BM433//TR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT", "UID:" + a.id + "@saglik-randevu", "DTSTAMP:" + stamp,
        "DTSTART:" + d + "T" + start, "DTEND:" + d + "T" + end,
        "SUMMARY:" + icsText(a.branchName + " randevusu - " + a.doctorName),
        "LOCATION:" + icsText(a.hospital),
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText("Yarın " + a.time + " randevunuz var"), "TRIGGER:-P1D", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR"
      ].join("\r\n");
      var url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      var link = document.createElement("a");
      link.href = url;
      link.download = "randevu-" + a.date + ".ics";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      var out = app.querySelector("#takvim-durum");
      if (out) out.textContent = T.calendarDone;
    });
  }

  /* ---------- yönlendirme ---------- */

  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/";
    var qi = h.indexOf("?");
    var path = qi >= 0 ? h.slice(0, qi) : h;
    var query = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : "");
    return { parts: path.split("/").filter(Boolean), query: query };
  }

  function route() {
    closeDialog();
    var token = ++renderToken;
    var r = parseHash(), p = r.parts;
    if (state.undo && p[0] !== "randevular") state.undo = null; // ekrandan çıkınca geri alma kapanır
    if (state.restored && p[0] !== "randevular") state.restored = null;
    switch (p[0]) {
      case undefined: return home(token);
      case "brans": return branchScreen(token);
      case "doktor": return doctorScreen(token, p[1]);
      case "uygun-yok": return noSlotScreen(token, p[1]);
      case "tarih": return dateScreen(token, p[1], r.query.get("gun"));
      case "onay": return confirmScreen();
      case "basarili": return successScreen(token, p[1]);
      case "randevular": return listScreen(token, r.query.get("sekme"));
      case "randevu": return detailScreen(token, p[1]);
      default: return go("#/", true);
    }
  }

  /* ---------- olaylar ---------- */

  function onClick(e) {
    var el = e.target.closest("[data-go], [data-action]");
    if (!el || el.disabled) return;
    var go_ = el.getAttribute("data-go");
    if (go_) return go(go_);
    var act = el.getAttribute("data-action");
    var h = dateScreen.handlers || {};
    switch (act) {
      case "dismiss-privacy": api.dismissPrivacyNotice().then(route); break;
      case "choose-doctor": chooseDoctor(el.getAttribute("data-id")); break;
      case "earliest": chooseEarliest(el.getAttribute("data-branch")); break;
      case "pick-day": h.pickDay && h.pickDay(el.getAttribute("data-date")); break;
      case "pick-time": h.pickTime && h.pickTime(el.getAttribute("data-time")); break;
      case "continue": h.next && h.next(); break;
      case "confirm": confirm(el); break;
      case "pick-alternative":
        state.selection.time = el.getAttribute("data-time");
        state.flash = T.timeUpdated(state.selection.time);
        confirmScreen();
        announce(state.selection.time + " seçildi");
        break;
      case "calendar": downloadCalendar(el.getAttribute("data-id")); break;
      case "ask-cancel": openCancelDialog(el); break;
      case "keep": closeDialog(); break;
      case "confirm-cancel": confirmCancel(el); break;
      case "undo": undoCancel(); break;
      case "tab": go("#/randevular" + (el.getAttribute("data-tab") === "gecmis" ? "?sekme=gecmis" : ""), true); break;
    }
  }

  function onKey(e) {
    var modal = app.querySelector(".modal");
    if (!modal) return;
    if (e.key === "Escape") { e.preventDefault(); closeDialog(); return; }
    if (e.key === "Tab") { // odak pencerenin içinde kalsın
      var f = modal.querySelectorAll("button:not([disabled])");
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  window.SR.ui = {
    start: function () {
      app = document.getElementById("app");
      live = document.getElementById("durum");
      app.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      window.addEventListener("hashchange", route);
      route();
    }
  };
})();
