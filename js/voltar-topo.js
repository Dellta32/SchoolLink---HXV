
/* SchoolLink HXV — Botão voltar ao topo */

(() => {
  "use strict";

  if (document.getElementById("btnVoltarTopo")) return;

  const botao = document.createElement("button");

  botao.id = "btnVoltarTopo";
  botao.type = "button";
  botao.setAttribute("aria-label", "Voltar ao início da página");
  botao.setAttribute("title", "Voltar ao topo");

  botao.innerHTML = `
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5"></path>
      <path d="M5 12l7-7 7 7"></path>
    </svg>
  `;

  document.body.appendChild(botao);

  function atualizarBotao() {
    botao.classList.toggle(
      "is-visible",
      window.scrollY > 300
    );
  }

  botao.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  window.addEventListener(
    "scroll",
    atualizarBotao,
    { passive: true }
  );

  atualizarBotao();
})();
