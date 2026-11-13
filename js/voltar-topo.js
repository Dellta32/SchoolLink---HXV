
(() => {
  if (document.getElementById("btnVoltarTopo")) return;

  const botao = document.createElement("button");

  botao.id = "btnVoltarTopo";
  botao.type = "button";
  botao.setAttribute("aria-label", "Voltar ao início da página");
  botao.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7"/>
    </svg>
  `;

  document.body.appendChild(botao);

  let rolandoTopo = false;

  function atualizarBotao() {
    if (window.scrollY > 300 && !rolandoTopo) {
      botao.classList.add("is-visible");
    } else {
      botao.classList.remove("is-visible");
    }
  }

  window.addEventListener("scroll", atualizarBotao, {
    passive: true
  });

  botao.addEventListener("click", () => {
    if (rolandoTopo || window.scrollY <= 0) return;

    rolandoTopo = true;
    botao.classList.remove("is-visible");

    const inicio = window.scrollY;
    const duracao = Math.min(1200, Math.max(500, inicio * 0.7));
    let tempoInicial = null;

    function animarSubida(tempoAtual) {
      if (!tempoInicial) tempoInicial = tempoAtual;

      const progresso = Math.min(
        (tempoAtual - tempoInicial) / duracao,
        1
      );

      // Desaceleração suave no final
      const suavizacao = 1 - Math.pow(1 - progresso, 3);

      window.scrollTo(0, inicio * (1 - suavizacao));

      if (progresso < 1) {
        requestAnimationFrame(animarSubida);
      } else {
        window.scrollTo(0, 0);
        rolandoTopo = false;
        atualizarBotao();
      }
    }

    requestAnimationFrame(animarSubida);
  });

  atualizarBotao();
})();
