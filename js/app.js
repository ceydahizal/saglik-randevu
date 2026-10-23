/*
 * BAŞLANGIÇ
 * Test yöneticisi için iki adres parametresi:
 *   ?sifirla=1  → kayıtlı randevuları silip örnek verilere döner (her katılımcıdan önce)
 *   ?cakisma=1  → bir sonraki "Onayla"da seçilen saat başkası tarafından alınmış gibi davranır (G4, F-08)
 * Parametreler işlendikten sonra adres çubuğundan kaldırılır.
 */
(function () {
  "use strict";

  var FLAG = "saglik-randevu.cakisma";
  var params = new URLSearchParams(location.search);

  if (params.get("sifirla") === "1") window.SR.storage.reset();

  try {
    if (params.get("cakisma") === "1") window.sessionStorage.setItem(FLAG, "1");
    window.SR.logic.setConflictMode(window.sessionStorage.getItem(FLAG) === "1");
  } catch (e) {
    window.SR.logic.setConflictMode(params.get("cakisma") === "1");
  }

  if (params.has("sifirla") || params.has("cakisma")) {
    history.replaceState(null, "", location.pathname + location.hash);
  }

  window.SR.ui.start();
})();
