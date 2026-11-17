
/* SchoolLink HXV — Inicialização central do Supabase
 *
 * Supabase:
 * - Authentication
 * - Database
 * - Storage
 *
 * Todas as páginas devem utilizar o mesmo cliente.
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
    config.publishableKey.startsWith("sb_publishable_");

  if (!configured) {
    window.schoollinkSupabaseReady = false;
    window.schoollinkSupabaseError =
      "Configuração pública do Supabase inválida.";
    return;
  }

  if (!sdk || typeof sdk.createClient !== "function") {
    window.schoollinkSupabaseReady = false;
    window.schoollinkSupabaseError =
      "Biblioteca Supabase não carregada.";
    return;
  }

  try {
    // Evita criar clientes duplicados.
    if (!window.schoollinkSupabase) {
      window.schoollinkSupabase = sdk.createClient(
        config.url,
        config.publishableKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }

    window.schoollinkSupabaseReady = true;
    window.schoollinkSupabaseError = null;

    console.info("[SchoolLink] Supabase inicializado.");
  } catch (error) {
    window.schoollinkSupabaseReady = false;
    window.schoollinkSupabaseError =
      error?.message || "Falha ao inicializar o Supabase.";

    console.error("[SchoolLink] Erro:", error);
  }
})();
