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
   
   // Teste visual da conexão Supabase
(async () => {
    const indicador = document.createElement("div");

    indicador.textContent = "Verificando Supabase...";
    indicador.style.cssText = `
        position: fixed;
        bottom: 15px;
        left: 15px;
        z-index: 99999;
        padding: 12px 16px;
        border-radius: 10px;
        background: #333;
        color: white;
        font: 14px Arial;
    `;

const adicionarIndicador = () => {
  document.body.appendChild(indicador);
};

if (document.body) {
  adicionarIndicador();
} else {
  document.addEventListener("DOMContentLoaded", adicionarIndicador);
}

    try {
        const resposta = await fetch(
            window.SCHOOLLINK_SUPABASE_CONFIG.url + "/auth/v1/health",
            {
                headers: {
                    apikey: window.SCHOOLLINK_SUPABASE_CONFIG.publishableKey
                }
            }
        );

        if (resposta.ok) {
            indicador.textContent = "Supabase: conexão OK";
            indicador.style.background = "#167a45";
        } else {
            indicador.textContent = "Supabase: resposta " + resposta.status;
            indicador.style.background = "#a34b20";
        }
    } catch (erro) {
        indicador.textContent = "Supabase: falha na conexão";
        indicador.style.background = "#a52a2a";
    }
})();
})();
