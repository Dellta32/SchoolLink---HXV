
/* =========================================
   SCHOOLLINK HXV — CATÁLOGO DE TURMAS
   Identificadores compartilhados pelo sistema
========================================= */

(function (global) {
  "use strict";

  const cursos = [
    { codigo: "INFO", nome: "Informática" },
    { codigo: "ADM", nome: "Administração" }
  ];

  const series = [1, 2, 3];
  const letras = ["A", "B", "C"];

  const turmas = cursos.flatMap(curso =>
    series.flatMap(serie =>
      letras.map(letra => {
        const id = `${serie}${letra}${curso.codigo}`;

        return {
          id,
          curso: curso.codigo,
          nomeCurso: curso.nome,
          serie,
          letra,
          nome: `${serie}º ${letra} — ${curso.nome}`
        };
      })
    )
  );

  const catalogo = {
    listar() {
      return [...turmas];
    },

    obter(id) {
      return turmas.find(turma => turma.id === id) || null;
    },

    preencherSelect(elemento, placeholder = "Selecione sua turma") {
      if (!elemento) return;

      elemento.innerHTML = "";

      const opcaoInicial = document.createElement("option");
      opcaoInicial.value = "";
      opcaoInicial.textContent = placeholder;
      opcaoInicial.disabled = true;
      opcaoInicial.selected = true;

      elemento.appendChild(opcaoInicial);

      cursos.forEach(curso => {
        const grupo = document.createElement("optgroup");
        grupo.label = curso.nome;

        turmas
          .filter(turma => turma.curso === curso.codigo)
          .forEach(turma => {
            const opcao = document.createElement("option");
            opcao.value = turma.id;
            opcao.textContent = turma.nome;
            grupo.appendChild(opcao);
          });

        elemento.appendChild(grupo);
      });
    },

    criarCheckboxes(elemento, selecionadas = []) {
      if (!elemento) return;

      elemento.innerHTML = "";

      cursos.forEach(curso => {
        const grupo = document.createElement("div");
        grupo.className = "grupo-turmas";

        const titulo = document.createElement("strong");
        titulo.textContent = curso.nome;
        grupo.appendChild(titulo);

        turmas
          .filter(turma => turma.curso === curso.codigo)
          .forEach(turma => {
            const label = document.createElement("label");
            label.className = "area-check";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = turma.id;
            checkbox.checked = selecionadas.includes(turma.id);

            label.append(checkbox, document.createTextNode(` ${turma.nome}`));
            grupo.appendChild(label);
          });

        elemento.appendChild(grupo);
      });
    }
  };

  global.SchoolLinkTurmas = catalogo;

})(window);
