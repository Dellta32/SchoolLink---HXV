/* SchoolLink HXV — Corpo docente
 * Dados e sessão exclusivamente no Firebase.
 * Arquivos: Supabase Storage via Edge Function.
 * Turmas: IDs padronizados pelo SchoolLinkTurmas.
 * Acesso: somente professor/gestor ativo.
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

  let authorizedUid = null;
  let authCheckId = 0;

  // =========================================
  // CONFIGURAÇÕES E UTILITÁRIOS
  // =========================================

  const ready = () =>
    Boolean(
      window.schoollinkFirebaseReady &&
      window.schoollinkAuth &&
      window.schoollinkDb
    );

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  const dateFmt = value =>
    value
      ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR")
      : "";

  function err(selector, message) {
    const element = $(selector);
    if (!element) return;

    element.textContent = message;
    element.hidden = false;
  }

  function clearErr(selector) {
    const element = $(selector);
    if (!element) return;

    element.textContent = "";
    element.hidden = true;
  }

  function firebaseReady() {
    return ready();
  }

  // =========================================
  // STATUS VISUAL DOS SERVIÇOS
  // =========================================

  function getSupabaseReady() {
    const config = window.SCHOOLLINK_SUPABASE_CONFIG;

    return Boolean(
      window.schoollinkSupabaseReady &&
      config?.url &&
      config?.publishableKey
    );
  }

  function updateServiceStatus() {
    const status = $(".area-status");

    if (!status) return;

    const services = [
      {
        name: "Firebase",
        ready: firebaseReady()
      },
      {
        name: "Supabase",
        ready: getSupabaseReady()
      }
    ];

    status.innerHTML = services.map(service => `
      <span
        class="schoollink-service-status"
        style="
          display:inline-flex;
          align-items:center;
          gap:6px;
          margin-right:14px;
          font-size:13px;
          white-space:nowrap;
        "
        title="${service.name}: ${
          service.ready ? "Inicializado" : "Não inicializado"
        }"
      >
        <span
          aria-hidden="true"
          style="
            display:inline-block;
            width:9px;
            height:9px;
            border-radius:50%;
            background:${service.ready ? "#22c55e" : "#ef4444"};
            box-shadow:0 0 0 3px ${
              service.ready
                ? "rgba(34,197,94,.13)"
                : "rgba(239,68,68,.13)"
            };
          "
        ></span>

        <strong>${service.name}:</strong>

        <span>
          ${service.ready ? "Pronto" : "Indisponível"}
        </span>
      </span>
    `).join("");
  }

  // =========================================
  // SISTEMA DE TURMAS
  // =========================================

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

  function getTurmaContainer() {
    return $("#blocoTurmas .area-turmas__opcoes");
  }

  function getTurmas() {
    const container = getTurmaContainer();

    if (!container) return [];

    return [
      ...new Set(
        $$('input[type="checkbox"]:checked', container)
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
        "As seguintes turmas não foram encontradas no catálogo: " +
        invalidas.join(", ") +
        ". Confira o arquivo turmas.js."
      );
    }
  }

  function initializeTurmas(selecionadas = []) {
    const container = getTurmaContainer();

    if (!container) {
      console.error(
        "[SchoolLink] Container de turmas não encontrado."
      );
      return;
    }

    if (!window.SchoolLinkTurmas) {
      console.error(
        "[SchoolLink] O catálogo turmas.js não foi carregado."
      );

      err(
        "#erroPublicacao",
        "Não foi possível carregar o catálogo de turmas."
      );

      return;
    }

    const ids = selecionadas.map(normalizeTurmaId);

    window.SchoolLinkTurmas.criarCheckboxes(
      container,
      ids
    );
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

  // =========================================
  // PRÉVIA DA PUBLICAÇÃO
  // =========================================

  function updatePreview() {
    const tipo = $("#tipoPublicacao");
    const titulo = $("#tituloPublicacao");
    const descricao = $("#descricaoPublicacao");
    const importancia = $("#importanciaPublicacao");
    const data = $("#dataPublicacao");

    if (!tipo || !titulo || !descricao || !importancia || !data) {
      return;
    }

    $("#previewTipo").textContent = tipo.value;

    $("#previewTitulo").textContent =
      titulo.value.trim() || "Título da publicação";

    $("#previewDescricao").textContent =
      descricao.value.trim() ||
      "A descrição da publicação aparecerá aqui enquanto você preenche o formulário.";

    $("#previewImportancia").textContent = ({
      normal: "Normal",
      importante: "Importante",
      urgente: "Urgente"
    })[importancia.value] || "Normal";

    $("#previewImportancia").className =
      "area-tag area-tag--" + importancia.value;

    $("#previewData").hidden = !data.value;

    $("#previewData").textContent = data.value
      ? (
          ["Atividade", "Evento"].includes(tipo.value)
            ? "Data: "
            : "Prazo: "
        ) + dateFmt(data.value)
      : "";

    updateDest();
  }

  // =========================================
  // NAVEGAÇÃO
  // =========================================

  function showTab(name) {
    $$("[data-doc-painel]").forEach(element => {
      element.classList.toggle(
        "is-visible",
        element.dataset.docPainel === name
      );
    });

    $$("[data-doc-secao]").forEach(element => {
      const active = element.dataset.docSecao === name;

      element.classList.toggle("is-active", active);
      element.setAttribute("aria-selected", String(active));
    });
  }

  // =========================================
  // ARQUIVOS
  // =========================================

  function cleanup() {
    files.forEach(item => {
      if (item.preview) {
        URL.revokeObjectURL(item.preview);
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
      files.map(item => `
        <div class="area-arquivos__item">
          <span>▧</span>

          <div>
            <strong>${esc(item.name)}</strong>

            <small>
              ${(item.size / 1048576).toFixed(2)} MB
            </small>
          </div>
        </div>
      `).join("");

    $("#previewAnexos").innerHTML =
      files.map(item => `
        <div class="area-preview__arquivo">
          ${
            item.preview
              ? `<img src="${item.preview}" alt="Prévia de ${esc(item.name)}">`
              : '<span aria-hidden="true">▤</span>'
          }

          <span>${esc(item.name)}</span>
        </div>
      `).join("");
  }

  // =========================================
  // LISTAGEM DE PUBLICAÇÕES
  // =========================================

  function renderPosts() {
    const filter = $("#filtroTipoDocente")?.value || "todos";

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
                      ? esc(turmas.join(", "))
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
    const user = window.schoollinkAuth.currentUser;

    if (!user || authorizedUid !== user.uid) {
      throw Error("Acesso não autorizado ao painel docente.");
    }

    const snap = await window.schoollinkDb
      .collection("publicacoes")
      .orderBy("criadoEm", "desc")
      .get();

    // Confere novamente após a consulta.
    if (
      !window.schoollinkAuth.currentUser ||
      authorizedUid !== user.uid
    ) {
      return;
    }

    posts = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderPosts();
  }

  // =========================================
  // ACESSO NEGADO E AUTORIZAÇÃO
  // =========================================

  function createAccessDeniedPanel() {
    let panel = $("#acessoNegadoDocente");

    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "acessoNegadoDocente";
    panel.hidden = true;
    panel.setAttribute("role", "alert");

    panel.style.cssText = `
      max-width: 650px;
      margin: 60px auto;
      padding: 35px 25px;
      text-align: center;
      border-radius: 16px;
      background: var(--cor-superficie, #fff);
      color: var(--cor-texto, #222);
      box-shadow: 0 4px 20px rgba(0,0,0,.08);
    `;

    panel.innerHTML = `
      <div style="font-size:48px;margin-bottom:15px;">
        🚫
      </div>

      <h2 style="margin-bottom:12px;">
        Ops! Você não deveria estar aqui!
      </h2>

      <p id="mensagemAcessoNegado">
        Esta área é exclusiva para professores e gestores
        do SchoolLink HXV.
      </p>
    `;

    const login = $("#painelLoginDocente");

    if (login?.parentNode) {
      login.parentNode.insertBefore(panel, login);
    } else {
      document.body.appendChild(panel);
    }

    return panel;
  }

  function denyAccess(message) {
    authorizedUid = null;
    posts = [];

    $("#painelLoginDocente").hidden = true;
    $("#painelDocente").hidden = true;
    $("#btnSairDocente").hidden = true;

    const panel = createAccessDeniedPanel();

    $("#mensagemAcessoNegado").textContent =
      message ||
      "Esta área é exclusiva para professores e gestores do SchoolLink HXV.";

    panel.hidden = false;
  }

  function clearAccessDenied() {
    const panel = $("#acessoNegadoDocente");

    if (panel) {
      panel.hidden = true;
    }
  }

  async function verifyDocenteAccess(user) {
    const currentCheck = ++authCheckId;

    authorizedUid = null;

    $("#painelLoginDocente").hidden = true;
    $("#painelDocente").hidden = true;
    $("#btnSairDocente").hidden = true;

    clearAccessDenied();

    if (!ready()) {
      denyAccess(
        "Não foi possível verificar sua conta porque o Firebase não está inicializado."
      );

      return;
    }

    try {
      const profileSnap = await window.schoollinkDb
        .collection("perfis")
        .doc(user.uid)
        .get();

      // Ignora verificações antigas.
      if (currentCheck !== authCheckId) return;

      if (!profileSnap.exists) {
        denyAccess(
          "Não encontramos um perfil institucional associado a esta conta. Entre em contato com a gestão escolar."
        );

        return;
      }

      const perfil = profileSnap.data();

      const papelAutorizado = [
        "professor",
        "gestor"
      ].includes(perfil.papel);

      if (!papelAutorizado || perfil.ativo !== true) {
        denyAccess(
          "Esta área é exclusiva para professores e gestores ativos do SchoolLink HXV. Sua conta não possui autorização para acessá-la."
        );

        return;
      }

      authorizedUid = user.uid;

      enter(user);

    } catch (error) {
      console.error(
        "[SchoolLink] Erro ao verificar autorização:",
        error
      );

      if (currentCheck !== authCheckId) return;

      denyAccess(
        "Não foi possível verificar sua autorização. Tente novamente ou entre em contato com a gestão escolar."
      );
    }
  }

  // =========================================
  // ENTRAR E SAIR
  // =========================================

  function enter(user) {
    if (!user || authorizedUid !== user.uid) return;

    clearAccessDenied();

    $("#painelLoginDocente").hidden = true;
    $("#painelDocente").hidden = false;
    $("#btnSairDocente").hidden = false;

    updateServiceStatus();

    refreshPosts().catch(error => {
      err(
        "#erroPublicacao",
        "Não foi possível carregar as publicações: " +
        error.message
      );
    });
  }

  async function exit() {
    authorizedUid = null;
    posts = [];

    try {
      await window.schoollinkAuth.signOut();
    } catch (error) {
      console.error("[SchoolLink] Erro ao sair:", error);
    }

    $("#painelLoginDocente").hidden = false;
    $("#painelDocente").hidden = true;
    $("#btnSairDocente").hidden = true;

    clearAccessDenied();
  }

  // =========================================
  // SALVAR PUBLICAÇÃO
  // =========================================

  async function savePost() {
    const tipo = $("#tipoPublicacao").value;
    const destino = getDest();

    const turmas = destino === "turmas"
      ? getTurmas()
      : [];

    const descricao = $("#descricaoPublicacao").value.trim();
    const titulo = $("#tituloPublicacao").value.trim();

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

    if (!user || authorizedUid !== user.uid) {
      throw Error("Você não tem autorização para publicar.");
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
        !getSupabaseReady()
      )
    ) {
      throw Error(
        "Supabase não está configurado corretamente."
      );
    }

    // ENDPOINT DA EDGE FUNCTION

    const supabaseBaseUrl = config?.url
      ? config.url.replace(/\/+$/, "")
      : "";

    const uploadEndpoint =
      `${supabaseBaseUrl}/functions/v1/super-action`;

    // ENVIO DOS ARQUIVOS

    for (const item of files) {
      // Confere a autorização antes de cada upload.
      if (
        !window.schoollinkAuth.currentUser ||
        authorizedUid !== user.uid
      ) {
        throw Error("Sua sessão não possui autorização para enviar arquivos.");
      }

      const token = await user.getIdToken();

      const formData = new FormData();
      formData.append("file", item.file);

      const response = await fetch(
        uploadEndpoint,
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${token}`,
            apikey: config.publishableKey
          },

          body: formData
        }
      );

      const result = await response.json().catch(() => ({}));

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

    // DISCIPLINA

    const disciplina = tipo === "Conteúdo"
      ? (
          prompt(
            "Disciplina do conteúdo (ex.: Informática):",
            old?.disciplina || "Informática"
          ) || "Informática"
        ).trim()
      : "Geral";

    // CONFERE A AUTORIZAÇÃO ANTES DE SALVAR.

    if (
      !window.schoollinkAuth.currentUser ||
      authorizedUid !== user.uid
    ) {
      throw Error("Sua sessão perdeu a autorização para publicar.");
    }

    // MONTAGEM DA PUBLICAÇÃO

    const post = {
      tipo,
      titulo,
      descricao,

      importancia: $("#importanciaPublicacao").value,

      data: $("#dataPublicacao").value || "",

      destino,

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

  // =========================================
  // LIMPAR FORMULÁRIO
  // =========================================

  function resetForm() {
    const form = $("#formPublicacao");

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

    initializeTurmas();
    updatePreview();
  }

  // =========================================
  // LOGIN DOCENTE
  // =========================================

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

  // =========================================
  // EVENTOS PRINCIPAIS
  // =========================================

  $("#btnSairDocente").addEventListener("click", exit);

  $$("[data-doc-secao]").forEach(button => {
    button.addEventListener("click", () => {
      if (!authorizedUid) return;

      showTab(button.dataset.docSecao);
    });
  });

  // PRÉVIA

  [
    "tipoPublicacao",
    "tituloPublicacao",
    "descricaoPublicacao",
    "importanciaPublicacao",
    "dataPublicacao"
  ].forEach(id => {
    $("#" + id).addEventListener("input", updatePreview);
    $("#" + id).addEventListener("change", updatePreview);
  });

  $$('input[name="destinatario"]').forEach(input => {
    input.addEventListener("change", updateDest);
  });

  // Listener delegado para checkboxes das turmas.

  const turmaContainer = getTurmaContainer();

  if (turmaContainer) {
    turmaContainer.addEventListener("change", event => {
      if (event.target.matches('input[type="checkbox"]')) {
        updateDest();
      }
    });
  }

  $("#arquivosPublicacao").addEventListener("change", showFiles);

  // RESET MANUAL DO FORMULÁRIO

  $("#formPublicacao").addEventListener("reset", () => {
    Promise.resolve().then(() => {
      cleanup();

      editingId = null;

      $("#listaArquivos").innerHTML = "";
      $("#previewAnexos").innerHTML = "";

      clearErr("#erroPublicacao");

      initializeTurmas();
      updatePreview();
    });
  });

  // =========================================
  // PUBLICAR
  // =========================================

  $("#formPublicacao").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      clearErr("#erroPublicacao");

      const user = window.schoollinkAuth.currentUser;

      if (
        !ready() ||
        !user ||
        authorizedUid !== user.uid
      ) {
        err(
          "#erroPublicacao",
          "Entre com uma conta autorizada do Firebase antes de publicar."
        );

        return;
      }

      const submitButton = $(
        'button[type="submit"]',
        $("#formPublicacao")
      );

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Publicando...";
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

      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Publicar";
        }
      }
    }
  );

  // =========================================
  // FILTRO
  // =========================================

  $("#filtroTipoDocente").addEventListener(
    "change",
    renderPosts
  );

  // =========================================
  // EDITAR E ARQUIVAR
  // =========================================

  $("#listaPublicacoes").addEventListener(
    "click",
    async event => {
      const user = window.schoollinkAuth.currentUser;

      if (!user || authorizedUid !== user.uid) {
        return;
      }

      const editButton = event.target.closest("[data-edit]");
      const archiveButton = event.target.closest("[data-archive]");

      const id = editButton?.dataset.edit;
      const archive = archiveButton?.dataset.archive;

      // EDITAR

      if (id) {
        const post = posts.find(item => item.id === id);

        if (!post) return;

        editingId = id;

        $("#tipoPublicacao").value = post.tipo || "Anúncio";
        $("#tituloPublicacao").value = post.titulo || "";
        $("#descricaoPublicacao").value = post.descricao || "";

        $("#importanciaPublicacao").value =
          post.importancia || "normal";

        $("#dataPublicacao").value = post.data || "";

        const destino = post.destino || "todos";

        const radio = $(
          `input[name="destinatario"][value="${destino}"]`
        );

        if (radio) {
          radio.checked = true;
        }

        const turmasPost = Array.isArray(post.turmas)
          ? post.turmas.map(normalizeTurmaId)
          : [];

        initializeTurmas(turmasPost);

        const antigas = turmasPost.filter(id => !getTurma(id));

        if (antigas.length) {
          err(
            "#erroPublicacao",
            "Esta publicação contém IDs antigos de turmas (" +
            antigas.join(", ") +
            "). Selecione as turmas correspondentes no novo catálogo antes de salvar."
          );
        } else {
          clearErr("#erroPublicacao");
        }

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

        $("#blocoTurmas").hidden = destino !== "turmas";

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
          if (
            !window.schoollinkAuth.currentUser ||
            authorizedUid !== user.uid
          ) {
            throw Error("Você não tem autorização para arquivar.");
          }

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

  // =========================================
  // RECUPERAÇÃO DE SESSÃO E AUTORIZAÇÃO
  // =========================================

  // Impede a exibição do painel antes da verificação.

  $("#painelDocente").hidden = true;
  $("#btnSairDocente").hidden = true;

  createAccessDeniedPanel();

  window.schoollinkAuth?.onAuthStateChanged(user => {
    // Invalida verificações anteriores.
    authCheckId++;

    authorizedUid = null;
    posts = [];

    if (!user) {
      clearAccessDenied();

      $("#painelLoginDocente").hidden = false;
      $("#painelDocente").hidden = true;
      $("#btnSairDocente").hidden = true;

      return;
    }

    verifyDocenteAccess(user);
  });

  // =========================================
  // ESTADO INICIAL
  // =========================================

  initializeTurmas();

  updateServiceStatus();

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
