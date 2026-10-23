/*
 * SONUÇ / İLETİ KATMANI
 * Kullanıcıya gösterilen tüm hata, uyarı ve bilgi metinleri ile tarih/saat
 * biçimleri burada tutulur. Hata mesajları sorunu sade dille anlatır ve bir
 * sonraki adımı söyler; teknik kod göstermez (H-01, rehber Bölüm 7).
 */
(function () {
  "use strict";

  var MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz",
    "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

  function toDate(iso) {
    var p = iso.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function dayName(iso) { return DAYS[toDate(iso).getUTCDay()]; }
  function date(iso) { var d = toDate(iso); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function dateLong(iso) { return date(iso) + " " + dayName(iso); }            // 30 Ekim 2026 Cuma
  function dayMonth(iso) { var d = toDate(iso); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()]; } // 30 Ekim
  function dateTime(iso, time) { return dateLong(iso) + ", " + time; }          // 30 Ekim 2026 Cuma, 10.30

  function errorMessage(error, ctx) {
    ctx = ctx || {};
    var e = error || {};
    var ex = e.existing;
    switch (e.code) {
      case "SLOT_TAKEN":
        return {
          title: "Bu saat artık boş değil",
          text: "Bu sizin hatanız değil: siz onaylarken başka biri " + (ctx.time || "bu") +
            " saatini aldı. Randevunuz oluşturulmadı."
        };
      case "SAME_BRANCH_SAME_DAY":
        return {
          title: "Aynı gün aynı branştan ikinci randevu alınamaz",
          text: dateLong(ex.date) + " günü " + ex.branchName + " için zaten randevunuz var (" +
            ex.time + ", " + ex.doctorName + "). Başka bir gün seçebilirsiniz."
        };
      case "TIME_CONFLICT":
        return {
          title: "Bu saatte başka bir randevunuz var",
          text: dateTime(ex.date, ex.time) + " için " + ex.branchName +
            " randevunuz bulunuyor. Lütfen başka bir saat seçin."
        };
      case "NOT_FOUND":
        return {
          title: "Kayıt bulunamadı",
          text: "Aradığınız bilgi silinmiş ya da değişmiş olabilir. Ana sayfadan devam edebilirsiniz."
        };
      case "INVALID_REQUEST":
        return {
          title: "Seçiminiz eksik görünüyor",
          text: "Lütfen tarih ve saati yeniden seçip tekrar deneyin."
        };
      default:
        return {
          title: "İşlem tamamlanamadı",
          text: "Beklenmeyen bir sorun oluştu ve işleminiz kaydedilmedi. Lütfen tekrar deneyin."
        };
    }
  }

  window.SR.messages = {
    format: { dayName: dayName, date: date, dateLong: dateLong, dayMonth: dayMonth, dateTime: dateTime },
    errorMessage: errorMessage,
    text: {
      privacyTitle: "Verileriniz hakkında",
      privacyBody: "Bu uygulama yalnızca randevu bilgilerinizi (branş, doktor, tarih ve saat) bu cihazda saklar. Tanı, tahlil ya da kimlik bilgisi tutmaz.",
      noUpcoming: "Yaklaşan randevunuz yok.",
      noPast: "Geçmiş randevunuz yok.",
      searchEmpty: function (q) { return "“" + q + "” için sonuç bulunamadı. Yazımı kontrol edin ya da aşağıdaki listeden seçin."; },
      chooseTimeHint: "Devam etmek için bir saat seçin.",
      confirmNote: "Onayladıktan sonra Randevularım bölümünden iptal edebilirsiniz.",
      createdNote: "Randevunuz Randevularım bölümüne eklendi.",
      cancelNote: "İptalden sonra kısa süre geri alabilirsiniz.",
      cancelled: "Randevunuz iptal edildi.",
      restored: "Randevunuz geri alındı.",
      restoreFailed: "Randevu geri alınamadı: bu saat başka biri tarafından alınmış.",
      calendarDone: "Takvim dosyası indirildi. Dosyayı açarak randevuyu takviminize ekleyebilirsiniz.",
      timeUpdated: function (t) { return "Saat " + t + " olarak güncellendi. Bilgileri kontrol edip onaylayınız."; },
      loading: "Yükleniyor…"
    }
  };
})();
