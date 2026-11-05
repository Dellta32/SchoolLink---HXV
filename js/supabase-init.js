/* Inicialização do cliente Supabase no navegador.
   Esta etapa apenas conecta o cliente. Uploads privados só serão habilitados
   depois da Edge Function validar o token do Firebase. */
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

  if (!configured || !sdk || typeof sdk.createClient !== "function") {
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
})();
