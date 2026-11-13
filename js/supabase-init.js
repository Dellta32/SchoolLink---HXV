
/* SchoolLink HXV — Inicialização do Supabase
 * Supabase Storage: imagens e arquivos das publicações.
 * Firebase: autenticação e dados.
 * O status visual é controlado exclusivamente pelo corpo-docente.js.
 */
(() => {
  "use strict";

  const config = window.SCHOOLLINK_SUPABASE_CONFIG;
  const sdk = window.supabase;

  const configured =
    config &&
    typeof config.url === "string" &&
    config.url.startsWith("https://") &&
    !config.url.includes("/rest/v1/") &&
    typeof config.publishableKey === "string" &&
    config.publishableKey.length > 20;

  if (
    !configured ||
    !sdk ||
    typeof sdk.createClient !== "function"
  ) {
    window.schoollinkSupabaseReady = false;
    window.schoollinkSupabaseError =
      "Preencha supabase-config.js com a Project URL e a Publishable key e confira a conexão.";

    return;
  }

  window.schoollinkSupabase = sdk.createClient(
    config.url,
    config.publishableKey
  );

  window.schoollinkSupabaseReady = true;
  window.schoollinkSupabaseError = null;

  // Remove indicadores antigos duplicados.
  document.querySelectorAll(
    "#schoollinkSupabaseStatus, #schoollinkServiceIndicators"
  ).forEach(element => element.remove());

  // Remove o contêiner antigo de indicadores duplicados.
document.querySelectorAll(
  ".area-docente__status-servicos"
).forEach(element => {
  element.remove();
});

})();

