
/* SchoolLink HXV — Corpo docente
 * Dados e sessão exclusivamente no Firebase.
 * Arquivos: Supabase Storage via Edge Function.
 * Turmas: IDs padronizados pelo SchoolLinkTurmas.
 */
(() => {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const MAX_FILES = 5;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  let files = [];
  let editingId = null;
  let posts = [];

  // CONFIGURAÇÕES E UTILITÁRIOS

  const ready = () =>
    Boolean(
      window.schoollinkFirebaseReady &&
      window.schoollinkAuth &&
      window.schoollinkDb
    );

  const esc = v =>
    String(v ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const dateFmt = v =>
    v
      ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR")
      : "";

  function err(id, msg) {
    const el = $(id);
    if (!el) return;

    el.textContent = msg;
    el.hidden = false;
  }

  function clearErr(id) {
    const el = $(id);
    if (!el) return;

    el.textContent = "";
    el.hidden = true;
  }

  function firebaseReady() {
    return ready();
  }

  // SISTEMA DE TURMAS

  function normalizeTurmaId(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function getTurma(id) {
    const turmaId = normalizeTurmaId(id);

    if (!turmaId) return null;

    return window.SchoolLinkTurmas?.obter(turmaId) || null;
  }

  function getDest() {
    return $('input[name="destinatario"]:checked')?.value || "todos";
  }

  function getTurmas() {
    return [
      ...new Set(
        $$('#blocoTurmas input[type="checkbox"]:checked')
          .map(input => normalizeTurmaId(input.value))
          .filter(Boolean)
      )
    ];
  }

  function validateTurmas(turmas) {
    if (!Array.isArray(turmas) || !turmas.length) {
      throw Error("Selecione pelo menos uma turma.");
    }

    const invalidas = turmas.filter(id => !getTurma(id));

    if (invalidas.length) {
      throw Error(
        "As seguintes turmas não foram encontradas no cadastro: " +
        invalidas.join(", ") +
        ". Confira o arquivo turmas.js."
      );
    }
  }

  function updateDest() {
    const destino = getDest();
    const bloco = $("#blocoTurmas");

    if (bloco) {
      bloco.hidden = destino !== "turmas";
    }

    const turmas = getTurmas();

    const preview = $("#previewDestino");

    if (!preview) return;

    preview.textContent =
      destino === "todos"
        ? "Visível para toda a comunidade escolar"
        : destino === "alunos"
          ? "Visível para estudantes"
          : "Visível às turmas: " +
            (turmas.join(", ") || "selecione as turmas");
  }

  // PRÉVIA DA PUBLICAÇÃO

  function updatePreview() {
    $("#previewTipo").textContent =
      $("#tipoPublicacao").value;

    $("#previewTitulo").textContent =
      $("#tituloPublicacao").value.trim() ||
      "Título da publicação";

    $("#previewDescricao").textContent =
      $("#descricaoPublicacao").value.trim() ||
      "A descrição da publicação aparecerá aqui enquanto você preenche o formulário.";

    const importancia = $("#importanciaPublicacao").value;

    $("#previewImportancia").textContent = ({
      normal: "Normal",
      importante: "Importante",
      urgente: "Urgente"
    })[importancia] || "Normal";

    $("#previewImportancia").className =
      "area-tag area-tag--" + importancia;

    const data = $("#dataPublicacao").value;

    $("#previewData").hidden = !data;

    $("#previewData").textContent = data
      ? (
          ["Atividade", "Evento"].includes(
            $("#tipoPublicacao").value
          )
            ? "Data: "
            : "Prazo: "
        ) + dateFmt(data)
      : "";

    updateDest();
  }

  // NAVEGAÇÃO

  function showTab(name) {
    $$("[data-doc-painel]").forEach(el => {
      el.classList.toggle(
        "is-visible",
        el.dataset.docPainel === name
      );
    });

    $$("[data-doc-secao]").forEach(el => {
      const active = el.dataset.docSecao === name;

      el.classList.toggle("is-active", active);

      el.setAttribute(
        "aria-selected",
        String(active)
      );
    });
  }

  // ARQUIVOS

  function cleanup() {
    files.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });

    files = [];
  }

  function showFiles() {
    cleanup();

    const input = $("#arquivosPublicacao");
    const selected = [...input.files];

    if (selected.length > MAX_FILES) {
      err(
        "#erroPublicacao",
        `Selecione no máximo ${MAX_FILES} arquivos.`
      );

      input.value = "";
      return;
    }

    const bad = selected.find(
      file => file.size > MAX_FILE_SIZE
    );

    if (bad) {
      err(
        "#erroPublicacao",
        `O arquivo "${bad.name}" excede 10 MB.`
      );

      input.value = "";
      return;
    }

    clearErr("#erroPublicacao");

    files = selected.map(file => ({
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      preview: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null
    }));

    $("#listaArquivos").innerHTML =
      files.map(file => `
        <div class="area-arquivos__item">
          <span>▧</span>

          <div>
            <strong>${esc(file.name)}</strong>
            <small>
              ${(file.size / 1048576).toFixed(2)} MB
            </small>
          </div>
        </div>
      `).join("");

    $("#previewAnexos").innerHTML =
      files.map(file => `
        <div class="area-preview__arquivo">
          ${
            file.preview
              ? `<img src="${file.preview}" alt="Prévia de ${esc(file.name)}">`
              : '<span aria-hidden="true">▤</span>'
          }

          <span>${esc(file.name)}</span>
        </div>
      `).join("");
  }

  // LISTAGEM DE PUBLICAÇÕES

  function renderPosts() {
    const filter = $("#filtroTipoDocente").value;

    const items = posts.filter(post =>
      post.status !== "arquivado" &&
      (
        filter === "todos" ||
        post.tipo === filter
      )
    );

    $("#listaPublicacoes").innerHTML =
      items.map(post => {
        const turmas = Array.isArray(post.turmas)
          ? post.turmas.map(normalizeTurmaId)
          : [];

        return `
          <article class="area-lista__item">

            <span class="area-lista__marcador">
              ${
                post.tipo === "Atividade"
                  ? "✓"
                  : post.tipo === "Evento"
                    ? "▦"
                    : "▤"
              }
            </span>

            <div class="area-lista__corpo">

              <h3>${esc(post.titulo)}</h3>

              <p>${esc(post.descricao)}</p>

              <div class="area-lista__meta">

                <span class="area-tag">
                  ${esc(post.tipo)}
                </span>

                <span>
                  ${
                    post.destino === "turmas"
                      ? turmas.join(", ")
                      : post.destino === "alunos"
                        ? "Estudantes"
                        : "Todos"
                  }
                </span>

                ${
                  post.data
                    ? `<span>${esc(dateFmt(post.data))}</span>`
                    : ""
                }

              </div>

              <div class="area-publicacao__item-acoes">

                <button
                  type="button"
                  class="area-mini-button"
                  data-edit="${esc(post.id)}"
                >
                  Editar
                </button>

                <button
                  type="button"
                  class="area-mini-button area-mini-button--danger"
                  data-archive="${esc(post.id)}"
                >
                  Arquivar
                </button>

              </div>

            </div>
          </article>
        `;
      }).join("") ||
      '<p class="area-empty">Nenhuma publicação encontrada.</p>';
  }

  async function refreshPosts() {
    const snap = await window.schoollinkDb
      .collection("publicacoes")
      .orderBy("criadoEm", "desc")
      .get();

    posts = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderPosts();
  }

  // ENTRAR E SAIR

  function enter(user) {
    $("#painelLoginDocente").hidden = true;
    $("#painelDocente").hidden = false;
    $("#btnSairDocente").hidden = false;

    const status = $(".area-status");

    if (status) {
      status.innerHTML =
        "<span></span> Conectado ao Firebase";
    }

    refreshPosts().catch(error => {
      err(
        "#erroPublicacao",
        "Não foi possível carregar as publicações: " +
        error.message
      );
    });
  }

  async function exit() {
    try {
      await window.schoollinkAuth.signOut();
    } catch (error) {
      console.error("[SchoolLink] Erro ao sair:", error);
    }

    $("#painelLoginDocente").hidden = false;
    $("#painelDocente").hidden = true;
    $("#btnSairDocente").hidden = true;
  }

  // SALVAR PUBLICAÇÃO

  async function savePost() {
    const tipo = $("#tipoPublicacao").value;
    const destino = getDest();

    const turmas = destino === "turmas"
      ? getTurmas()
      : [];

    const descricao =
      $("#descricaoPublicacao").value.trim();

    const titulo =
      $("#tituloPublicacao").value.trim();

    if (!titulo) {
      throw Error("Informe um título.");
    }

    if (!descricao) {
      throw Error("Preencha a descrição.");
    }

    if (destino === "turmas") {
      validateTurmas(turmas);
    }

    const user = window.schoollinkAuth.currentUser;

    if (!user) {
      throw Error("Você precisa estar conectado.");
    }

    const old = editingId
      ? posts.find(post => post.id === editingId)
      : null;

    const anexos = [...(old?.arquivos || [])];

    // CONFIGURAÇÃO DO SUPABASE

    const config = window.SCHOOLLINK_SUPABASE_CONFIG;

    if (
      files.length &&
      (
        !window.schoollinkSupabaseReady ||
        !config?.url ||
        !config?.publishableKey
      )
    ) {
      throw Error(
        "Supabase não está configurado corretamente."
      );
    }

    // ENVIO DOS ARQUIVOS

    for (const item of files) {
      const token = await user.getIdToken();

      const formData = new FormData();

      formData.append("file", item.file);

      const response = await fetch(
        `${config.url}/functions/v1/schoollink-arquivo`,
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${token}`,
            apikey: config.publishableKey
          },

          body: formData
        }
      );

      const result = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || !result.success) {
        throw Error(
          result.error ||
          `Falha ao enviar ${item.name}.`
        );
      }

      anexos.push({
        nome: result.nome,
        tipo: result.tipo,
        tamanho: result.tamanho,
        caminho: result.caminho,
        url: result.url
      });
    }

    // MONTAGEM DA PUBLICAÇÃO

    const disciplina = tipo === "Conteúdo"
      ? (
          prompt(
            "Disciplina do conteúdo (ex.: Informática):",
            old?.disciplina || "Informática"
          ) || "Geral"
        ).trim()
      : "Geral";

    const post = {
      tipo,
      titulo,
      descricao,

      importancia:
        $("#importanciaPublicacao").value,

      data:
        $("#dataPublicacao").value || "",

      destino,

      // IDs padronizados: 1AINFO, 2AINFO, 3AINFO etc.
      turmas,

      disciplina,

      arquivos: anexos,

      status: "ativo",

      criadoEm: old?.criadoEm ||
        firebase.firestore.FieldValue.serverTimestamp(),

      atualizadoEm:
        firebase.firestore.FieldValue.serverTimestamp(),

      autorUid: user.uid,

      autorEmail: user.email || ""
    };

    if (editingId) {
      await window.schoollinkDb
        .collection("publicacoes")
        .doc(editingId)
        .update(post);

    } else {
      await window.schoollinkDb
        .collection("publicacoes")
        .add(post);
    }

    editingId = null;
  }

  // LIMPAR FORMULÁRIO

  function resetForm() {
    const form = $("#formPublicacao");

    // O reset não deve chamar resetForm novamente.
    form.reset();

    $("#tipoPublicacao").value = "Anúncio";
    $("#importanciaPublicacao").value = "normal";

    $("#blocoTurmas").hidden = true;

    $("#listaArquivos").innerHTML = "";
    $("#previewAnexos").innerHTML = "";

    $("#arquivosPublicacao").value = "";

    clearErr("#erroPublicacao");

    editingId = null;

    cleanup();

    updatePreview();
  }

  // LOGIN DOCENTE

  $("#formLoginDocente").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      clearErr("#erroLoginDocente");

      if (!firebaseReady()) {
        err(
          "#erroLoginDocente",
          window.schoollinkFirebaseError ||
          "Firebase não inicializado. Confira firebase-config.js e sua conexão."
        );

        return;
      }

      try {
        await window.schoollinkAuth
          .signInWithEmailAndPassword(
            $("#emailDocente").value.trim(),
            $("#senhaDocente").value
          );

      } catch (error) {
        err(
          "#erroLoginDocente",
          error.code === "auth/invalid-credential"
            ? "E-mail ou senha inválidos."
            : error.message || "Não foi possível entrar."
        );
      }
    }
  );

  // EVENTOS PRINCIPAIS

  $("#btnSairDocente").addEventListener(
    "click",
    exit
  );

  $$("[data-doc-secao]").forEach(button => {
    button.addEventListener("click", () => {
      showTab(button.dataset.docSecao);
    });
  });

  // ATUALIZAR PRÉVIA

  [
    "tipoPublicacao",
    "tituloPublicacao",
    "descricaoPublicacao",
    "importanciaPublicacao",
    "dataPublicacao"
  ].forEach(id => {
    $("#" + id).addEventListener(
      "input",
      updatePreview
    );
  });

  $$('input[name="destinatario"]').forEach(input => {
    input.addEventListener("change", updateDest);
  });

  $$("#blocoTurmas input[type='checkbox']").forEach(input => {
    input.addEventListener("change", updateDest);
  });

  $("#arquivosPublicacao").addEventListener(
    "change",
    showFiles
  );

  // IMPORTANTE:
  // Não adicionar listener de reset chamando resetForm.
  // Isso provocaria um ciclo infinito.

  // PUBLICAR

  $("#formPublicacao").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      clearErr("#erroPublicacao");

      if (
        !ready() ||
        !window.schoollinkAuth.currentUser
      ) {
        err(
          "#erroPublicacao",
          "Entre com uma conta autorizada do Firebase antes de publicar."
        );

        return;
      }

      try {
        await savePost();

        resetForm();

        await refreshPosts();

        showTab("gerenciar");

      } catch (error) {
        console.error(
          "[SchoolLink] Erro ao publicar:",
          error
        );

        err(
          "#erroPublicacao",
          error.message ||
          "Não foi possível salvar. Verifique Firebase e permissões."
        );
      }
    }
  );

  // FILTRO

  $("#filtroTipoDocente").addEventListener(
    "change",
    renderPosts
  );

  // EDITAR E ARQUIVAR

  $("#listaPublicacoes").addEventListener(
    "click",
    async event => {
      const id = event.target.dataset.edit;
      const archive = event.target.dataset.archive;

      // EDITAR

      if (id) {
        const post = posts.find(item => item.id === id);

        if (!post) return;

        editingId = id;

        $("#tipoPublicacao").value = post.tipo;
        $("#tituloPublicacao").value = post.titulo;
        $("#descricaoPublicacao").value = post.descricao;

        $("#importanciaPublicacao").value =
          post.importancia || "normal";

        $("#dataPublicacao").value =
          post.data || "";

        const radio = $(
          `input[name="destinatario"][value="${post.destino || "todos"}"]`
        );

        if (radio) {
          radio.checked = true;
        }

        const turmasPost = Array.isArray(post.turmas)
          ? post.turmas.map(normalizeTurmaId)
          : [];

        $$("#blocoTurmas input[type='checkbox']").forEach(input => {
          input.checked = turmasPost.includes(
            normalizeTurmaId(input.value)
          );
        });

        $("#listaArquivos").innerHTML =
          (post.arquivos || []).map(file => `
            <div class="area-arquivos__item">
              <span>▧</span>

              <div>
                <strong>${esc(file.nome)}</strong>
                <small>Arquivo já enviado</small>
              </div>
            </div>
          `).join("");

        $("#previewAnexos").innerHTML = "";

        updatePreview();

        showTab("publicar");

        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      }

      // ARQUIVAR

      if (archive && confirm("Arquivar esta publicação?")) {
        try {
          await window.schoollinkDb
            .collection("publicacoes")
            .doc(archive)
            .update({
              status: "arquivado",

              atualizadoEm:
                firebase.firestore.FieldValue.serverTimestamp()
            });

          await refreshPosts();

        } catch (error) {
          alert(
            "Não foi possível arquivar: " +
            error.message
          );
        }
      }
    }
  );

  // RECUPERAÇÃO DE SESSÃO

  window.schoollinkAuth?.onAuthStateChanged(user => {
    if (user) {
      enter(user);

    } else {
      $("#painelLoginDocente").hidden = false;
      $("#painelDocente").hidden = true;
      $("#btnSairDocente").hidden = true;
    }
  });

  // ESTADO INICIAL

  if (!ready()) {
    const note = $(".area-form__nota");

    if (note) {
      note.textContent =
        window.schoollinkFirebaseError ||
        "Configure o Firebase para habilitar o acesso institucional.";
    }
  }

  updatePreview();

})();
