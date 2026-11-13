
/* SchoolLink HXV — Inicialização do Supabase
 * Supabase Storage: imagens e arquivos das publicações.
 * Firebase continua responsável pela autenticação e pelos dados.
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

  // Inicializa o cliente Supabase
  window.schoollinkSupabase = sdk.createClient(
    config.url,
    config.publishableKey
  );

  window.schoollinkSupabaseReady = true;
  window.schoollinkSupabaseError = null;

  // INDICADOR DE STATUS
  async function verificarSupabase() {
    const criarIndicador = () => {
      let container = document.querySelector(
        "#schoollinkServiceIndicators"
      );

      if (!container) {
        container = document.createElement("div");
        container.id = "schoollinkServiceIndicators";

        container.style.cssText = `
          position: fixed;
          bottom: 15px;
          left: 15px;
          z-index: 99999;
          display: flex;
          flex-direction: row;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        `;

        document.body.appendChild(container);
      }

      let indicador = document.querySelector(
        "#schoollinkSupabaseStatus"
      );

      if (!indicador) {
        indicador = document.createElement("div");
        indicador.id = "schoollinkSupabaseStatus";

        indicador.style.cssText = `
          padding: 10px 14px;
          border-radius: 10px;
          background: #333;
          color: white;
          font: 13px Arial, sans-serif;
          white-space: nowrap;
        `;

        container.appendChild(indicador);
      }

      return indicador;
    };

    const indicador = document.body
      ? criarIndicador()
      : await new Promise(resolve => {
          document.addEventListener(
            "DOMContentLoaded",
            () => resolve(criarIndicador()),
            { once: true }
          );
        });

    indicador.textContent = "Verificando Supabase...";
    indicador.style.background = "#333";

    try {
      const resposta = await fetch(
        config.url + "/auth/v1/health",
        {
          method: "GET",
          headers: {
            apikey: config.publishableKey
          }
        }
      );

      if (resposta.ok) {
        indicador.textContent = "Supabase: conexão OK";
        indicador.style.background = "#167a45";
      } else {
        indicador.textContent =
          "Supabase: resposta " + resposta.status;

        indicador.style.background = "#a34b20";
      }

    } catch (erro) {
      console.error(
        "[SchoolLink] Erro na conexão Supabase:",
        erro
      );

      indicador.textContent =
        "Supabase: falha na conexão";

      indicador.style.background = "#a52a2a";
    }
  }

  verificarSupabase();

})();
