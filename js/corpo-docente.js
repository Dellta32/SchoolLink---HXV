/* SchoolLink HXV — Corpo docente
 *
 * Autenticação: Supabase Auth
 * Perfis: Supabase Database
 * Publicações: PostgreSQL
 * Turmas: tabela public.turmas
 * Arquivos: Supabase Storage
 *
 * Acesso: somente professores e gestores ativos.
 */

(() => {
  "use strict";

  // =========================================
  // CONFIGURAÇÕES
  // =========================================

  const MAX_FILES = 5;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  // Precisa corresponder ao nome do bucket no Supabase.
  const STORAGE_BUCKET = "schoollink-arquivos";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const supabase = window.schoollinkSupabase;

  let files = [];
  let posts = [];
  let turmasCache = [];

  let editingId = null;
  let currentUser = null;
  let authorizedUid = null;
  let authCheckId = 0;

  // =========================================
  // CATEGORIAS
  // =========================================

  const CATEGORIAS = {
    anuncio: "Anúncio",
    evento: "Evento",
    comunicado: "Comunicado",
    conteudo: "Conteúdo",
    atividade: "Atividade"
  };

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function categoriaParaBanco(value) {
    const normalized = normalizeText(value);

    const categorias = {
      anuncio: "anuncio",
      evento: "evento",
      comunicado: "comunicado",
      conteudo: "conteudo",
      atividade: "atividade"
    };

    return categorias[normalized] || null;
  }

  function categoriaParaTela(value) {
    return CATEGORIAS[value] || value || "Anúncio";
  }

  // =========================================
  // UTILITÁRIOS
  // =========================================

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function dateFmt(value) {
    if (!value) return "";

    const date = new Date(`${value}T12:00:00`);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleDateString("pt-BR");
  }

  function listen(selector, eventName, callback) {
    const element = $(selector);

    if (element) {
      element.addEventListener(eventName, callback);
    }

    return element;
  }

  function setHidden(selector, hidden) {
    const element = $(selector);

    if (element) {
      element.hidden = hidden;
    }
  }

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

  function showMessage(element, message, type = "") {
    if (!element) return;

    element.textContent = message;
    element.className = `message ${type}`;
  }

  function supabaseReady() {
    return Boolean(
      window.schoollinkSupabaseReady &&
      supabase &&
      typeof supabase.from === "function" &&
      supabase.auth
    );
  }

  function normalizeId(value) {
    return String(value ?? "").trim();
  }

  // =========================================
  // STATUS DO SERVIÇO
  // =========================================

  function removeServiceStatus() {
    $("#schoollinkServiceStatus")?.remove();
  }

  function addServiceStatusStyles() {
    if ($("#schoollinkServiceStatusStyles")) return;

    const style = document.createElement("style");

    style.id = "schoollinkServiceStatusStyles";

    style.textContent = `
      #schoollinkServiceStatus {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        margin-top: 18px;
        padding: 12px 16px;
        border: 1px solid rgba(128,128,128,.18);
        border-radius: 12px;
        background: var(--cor-superficie, #fff);
        color: var(--cor-texto, #222);
        font-family: inherit;
        font-size: 13px;
      }

      #schoollinkServiceStatus .service-dot {
        flex: 0 0 9px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 0 3px rgba(34,197,94,.13);
      }

      #schoollinkServiceStatus .service-name {
        font-weight: 700;
      }

      #schoollinkServiceStatus .service-state {
        opacity: .75;
      }

      @media(max-width: 768px) {
        #schoollinkServiceStatus {
          margin-top: 16px;
          padding: 12px;
          font-size: 12px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function updateServiceStatus() {
    const user = currentUser;

    if (
      !user ||
      !authorizedUid ||
      authorizedUid !== user.id ||
      $("#painelDocente")?.hidden
    ) {
      removeServiceStatus();
      return;
    }

    const topo = $("#painelDocente .area-docente__topo");

    if (!topo) return;

    const intro = topo.querySelector(":scope > div");

    if (!intro) return;

    addServiceStatusStyles();

    let status = $("#schoollinkServiceStatus");

    if (!status) {
      status = document.createElement("div");
      status.id = "schoollinkServiceStatus";
      status.setAttribute("role", "status");
      status.setAttribute("aria-label", "Status do Supabase");
    }

    if (status.parentNode !== intro) {
      intro.appendChild(status);
    }

    status.innerHTML = `
      <span class="service-dot" aria-hidden="true"></span>
      <span class="service-name">Supabase:</span>
      <span class="service-state">
        ${supabaseReady() ? "Inicializado" : "Indisponível"}
      </span>
    `;
  }

  // =========================================
  // ACESSO E AUTORIZAÇÃO
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

  function clearAccessDenied() {
    const panel = $("#acessoNegadoDocente");

    if (panel) {
      panel.hidden = true;
    }
  }

  function denyAccess(message) {
    authorizedUid = null;
    currentUser = null;
    posts = [];

    removeServiceStatus();

    setHidden("#painelLoginDocente", true);
    setHidden("#painelDocente", true);
    setHidden("#btnSairDocente", true);

    const panel = createAccessDeniedPanel();

    const messageElement = $("#mensagemAcessoNegado");

    if (messageElement) {
      messageElement.textContent =
        message ||
        "Esta área é exclusiva para professores e gestores ativos.";
    }

    panel.hidden = false;
  }

  function showLogin(message = "") {
    authorizedUid = null;
    currentUser = null;
    posts = [];

    removeServiceStatus();

    setHidden("#painelLoginDocente", false);
    setHidden("#painelDocente", true);
    setHidden("#btnSairDocente", true);

    clearAccessDenied();

    if (message) {
      err("#erroLoginDocente", message);
    }
  }

  async function verifyDocenteAccess(user) {
    const checkId = ++authCheckId;

    authorizedUid = null;
    currentUser = null;

    removeServiceStatus();

    setHidden("#painelLoginDocente", true);
    setHidden("#painelDocente", true);
    setHidden("#btnSairDocente", true);

    clearAccessDenied();

    if (!supabaseReady()) {
      denyAccess(
        "Não foi possível inicializar o Supabase. Confira os arquivos de configuração."
      );

      return;
    }

    try {
      const { data: perfil, error } = await supabase
        .from("perfis")
        .select("id, nome, papel, ativo")
        .eq("id", user.id)
        .maybeSingle();

      if (checkId !== authCheckId) return;

      if (error) {
        console.error(
          "[SchoolLink] Erro ao consultar perfil:",
          error
        );

        denyAccess(
          "Não foi possível verificar suas permissões no banco de dados."
        );

        return;
      }

      if (!perfil) {
        denyAccess(
          "Não encontramos um perfil institucional associado a esta conta. Entre em contato com a gestão escolar."
        );

        return;
      }

      const papelAutorizado = [
        "professor",
        "gestor"
      ].includes(perfil.papel);

      if (!papelAutorizado || perfil.ativo !== true) {
        denyAccess(
          "Esta área é exclusiva para professores e gestores ativos do SchoolLink HXV."
        );

        return;
      }

      currentUser = user;
      authorizedUid = user.id;

      await enter(user, perfil);

    } catch (error) {
      console.error(
        "[SchoolLink] Erro na autorização:",
        error
      );

      if (checkId !== authCheckId) return;

      denyAccess(
        "Ocorreu um erro ao verificar sua autorização."
      );
    }
  }

  async function getAuthorizedUser() {
    if (!supabaseReady()) {
      throw Error("Supabase não está inicializado.");
    }

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      throw Error("Sua sessão expirou. Entre novamente.");
    }

    if (
      !authorizedUid ||
      data.user.id !== authorizedUid
    ) {
      throw Error("Você não possui autorização para esta operação.");
    }

    return data.user;
  }

  // =========================================
  // TURMAS — SUPABASE
  // =========================================

  function getTurmaContainer() {
    return $("#blocoTurmas .area-turmas__opcoes");
  }

  function getTurmaById(id) {
    const turmaId = normalizeId(id);

    return turmasCache.find(
      turma => turma.id === turmaId
    ) || null;
  }

  function getSelectedTurmas() {
    const container = getTurmaContainer();

    if (!container) return [];

    return [
      ...new Set(
        $$('input[type="checkbox"]:checked', container)
          .map(input => normalizeId(input.value))
          .filter(Boolean)
      )
    ];
  }

  function validateTurmas(ids) {
    if (!Array.isArray(ids) || !ids.length) {
      throw Error("Selecione pelo menos uma turma.");
    }

    const invalidas = ids.filter(
      id => !getTurmaById(id)
    );

    if (invalidas.length) {
      throw Error(
        "Uma ou mais turmas selecionadas não foram encontradas. Atualize a página e tente novamente."
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

    const selectedIds = new Set(
      selecionadas.map(normalizeId)
    );

    container.replaceChildren();

    if (!turmasCache.length) {
      const empty = document.createElement("p");

      empty.className = "area-empty";
      empty.textContent =
        "Nenhuma turma ativa foi cadastrada.";

      container.appendChild(empty);

      return;
    }

    turmasCache.forEach(turma => {
      const label = document.createElement("label");

      label.className = "area-turmas__opcao";

      const input = document.createElement("input");

      input.type = "checkbox";
      input.value = turma.id;
      input.checked = selectedIds.has(turma.id);

      const text = document.createElement("span");

      text.textContent =
        turma.nome ||
        turma.codigo ||
        "Turma sem nome";

      label.append(input, text);

      container.appendChild(label);
    });
  }

  async function loadTurmas(selecionadas = []) {
    const { data, error } = await supabase
      .from("turmas")
      .select(`
        id,
        nome,
        codigo,
        curso,
        ano_escolar,
        turma,
        turno
      `)
      .eq("ativa", true)
      .order("codigo", { ascending: true });

    if (error) {
      console.error(
        "[SchoolLink] Erro ao carregar turmas:",
        error
      );

      throw Error(
        "Não foi possível carregar as turmas cadastradas."
      );
    }

    turmasCache = data || [];

    initializeTurmas(selecionadas);
    updateDest();
  }

  function getDest() {
    return (
      $('input[name="destinatario"]:checked')?.value ||
      "todos"
    );
  }

  function updateDest() {
    const destino = getDest();

    const bloco = $("#blocoTurmas");

    if (bloco) {
      bloco.hidden = destino !== "turmas";
    }

    const preview = $("#previewDestino");

    if (!preview) return;

    if (destino === "todos") {
      preview.textContent =
        "Visível para toda a comunidade escolar";

      return;
    }

    if (destino === "turmas") {
      const ids = getSelectedTurmas();

      const nomes = ids.map(id =>
        getTurmaById(id)?.nome || id
      );

      preview.textContent =
        "Visível às turmas: " +
        (nomes.join(", ") || "selecione as turmas");

      return;
    }

    preview.textContent =
      "Destino ainda não configurado no banco de dados.";
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

    if (
      !tipo ||
      !titulo ||
      !descricao ||
      !importancia ||
      !data
    ) {
      return;
    }

    const previewTipo = $("#previewTipo");
    const previewTitulo = $("#previewTitulo");
    const previewDescricao = $("#previewDescricao");
    const previewImportancia = $("#previewImportancia");
    const previewData = $("#previewData");

    if (previewTipo) {
      previewTipo.textContent =
        categoriaParaTela(tipo.value);
    }

    if (previewTitulo) {
      previewTitulo.textContent =
        titulo.value.trim() || "Título da publicação";
    }

    if (previewDescricao) {
      previewDescricao.textContent =
        descricao.value.trim() ||
        "A descrição da publicação aparecerá aqui enquanto você preenche o formulário.";
    }

    if (previewImportancia) {
      const importanciaLabel = {
        normal: "Normal",
        importante: "Importante",
        urgente: "Urgente"
      };

      previewImportancia.textContent =
        importanciaLabel[importancia.value] || "Normal";

      previewImportancia.className =
        "area-tag area-tag--" + importancia.value;
    }

    if (previewData) {
      previewData.hidden = !data.value;

      previewData.textContent = data.value
        ? (
            ["Atividade", "Evento"].includes(
              categoriaParaTela(tipo.value)
            )
              ? "Data: "
              : "Prazo: "
          ) + dateFmt(data.value)
        : "";
    }

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
      const active =
        element.dataset.docSecao === name;

      element.classList.toggle("is-active", active);

      element.setAttribute(
        "aria-selected",
        String(active)
      );
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
    const input = $("#arquivosPublicacao");

    if (!input) return;

    cleanup();

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
        `O arquivo "${bad.name}" excede o limite de 10 MB.`
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

    const list = $("#listaArquivos");
    const preview = $("#previewAnexos");

    if (list) {
      list.innerHTML = files.map(item => `
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
    }

    if (preview) {
      preview.innerHTML = files.map(item => `
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
  }

  function safeFileName(name) {
    return String(name || "arquivo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
  }

  async function uploadFiles(publicacaoId, user) {
    if (!files.length) return [];

    const uploaded = [];

    for (const item of files) {
      await getAuthorizedUser();

      const unique =
        window.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const path =
        `${publicacaoId}/${unique}-${safeFileName(item.name)}`;

      const { error: uploadError } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .upload(path, item.file, {
          cacheControl: "3600",
          upsert: false,
          contentType: item.type || "application/octet-stream"
        });

      if (uploadError) {
        console.error(
          "[SchoolLink] Erro no Storage:",
          uploadError
        );

        throw Error(
          `Não foi possível enviar "${item.name}": ${uploadError.message}`
        );
      }

      const metadata = {
        publicacao_id: publicacaoId,
        nome_original: item.name,
        caminho_storage: path,
        tipo_mime: item.type || null,
        tamanho_bytes: item.size
      };

      const { data, error: metadataError } = await supabase
        .from("arquivos_publicacao")
        .insert(metadata)
        .select()
        .single();

      if (metadataError) {
        await supabase
          .storage
          .from(STORAGE_BUCKET)
          .remove([path]);

        console.error(
          "[SchoolLink] Erro ao salvar metadados:",
          metadataError
        );

        throw Error(
          `O arquivo "${item.name}" foi enviado, mas seus dados não puderam ser registrados.`
        );
      }

      uploaded.push(data);
    }

    return uploaded;
  }

  // =========================================
  // LISTAGEM DE PUBLICAÇÕES
  // =========================================

  function renderPosts() {
    const container = $("#listaPublicacoes");

    if (!container) return;

    const filter =
      $("#filtroTipoDocente")?.value || "todos";

    const filterCategory =
      filter === "todos"
        ? "todos"
        : categoriaParaBanco(filter) || filter;

    const items = posts.filter(post =>
      post.status !== "arquivado" &&
      (
        filterCategory === "todos" ||
        post.categoria === filterCategory
      )
    );

    container.innerHTML = items.map(post => {
      const tipo = categoriaParaTela(post.categoria);

      const turmas = Array.isArray(post.turmas)
        ? post.turmas.map(turma =>
            turma.nome || turma.codigo || turma.id
          )
        : [];

      const destinoLabel =
        post.destino === "turmas"
          ? turmas.join(", ") || "Turmas selecionadas"
          : "Todos";

      return `
        <article class="area-lista__item">

          <span class="area-lista__marcador">
            ${
              post.categoria === "atividade"
                ? "✓"
                : post.categoria === "evento"
                  ? "▦"
                  : "▤"
            }
          </span>

          <div class="area-lista__corpo">

            <h3>${esc(post.titulo)}</h3>

            <p>${esc(post.descricao)}</p>

            <div class="area-lista__meta">

              <span class="area-tag">
                ${esc(tipo)}
              </span>

              <span>
                ${esc(destinoLabel)}
              </span>

              ${
                post.data_evento
                  ? `<span>${esc(dateFmt(post.data_evento))}</span>`
                  : ""
              }

            </div>

            ${
              post.arquivos?.length
                ? `
                  <div class="area-lista__arquivos">
                    ${post.arquivos.map(file => `
                      <span>${esc(file.nome_original)}</span>
                    `).join("")}
                  </div>
                `
                : ""
            }

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
    const user = await getAuthorizedUser();

    const { data: publications, error } = await supabase
      .from("publicacoes")
      .select("*")
      .order("criado_em", { ascending: false });

    if (error) {
      console.error(
        "[SchoolLink] Erro ao consultar publicações:",
        error
      );

      throw Error(
        "Não foi possível carregar as publicações."
      );
    }

    if (
      !currentUser ||
      authorizedUid !== user.id
    ) {
      return;
    }

    const rows = publications || [];
    const ids = rows.map(post => post.id);

    let turmaLinks = [];
    let fileRows = [];

    if (ids.length) {
      const [turmaResult, fileResult] =
        await Promise.all([
          supabase
            .from("publicacao_turmas")
            .select("publicacao_id, turma_id")
            .in("publicacao_id", ids),

          supabase
            .from("arquivos_publicacao")
            .select("*")
            .in("publicacao_id", ids)
        ]);

      if (turmaResult.error) {
        throw Error(
          "Não foi possível carregar as turmas das publicações."
        );
      }

      if (fileResult.error) {
        throw Error(
          "Não foi possível carregar os arquivos das publicações."
        );
      }

      turmaLinks = turmaResult.data || [];
      fileRows = fileResult.data || [];
    }

    const turmaMap = new Map();
    const fileMap = new Map();

    turmaLinks.forEach(link => {
      if (!turmaMap.has(link.publicacao_id)) {
        turmaMap.set(link.publicacao_id, []);
      }

      const turma = getTurmaById(link.turma_id);

      turmaMap.get(link.publicacao_id).push({
        id: link.turma_id,
        nome: turma?.nome || turma?.codigo || link.turma_id,
        codigo: turma?.codigo || ""
      });
    });

    fileRows.forEach(file => {
      if (!fileMap.has(file.publicacao_id)) {
        fileMap.set(file.publicacao_id, []);
      }

      fileMap.get(file.publicacao_id).push(file);
    });

    posts = rows.map(post => ({
      ...post,
      turmas: turmaMap.get(post.id) || [],
      arquivos: fileMap.get(post.id) || []
    }));

    renderPosts();
  }

  // =========================================
  // SALVAR PUBLICAÇÃO
  // =========================================

  async function savePost() {
    const user = await getAuthorizedUser();

    const tipo = $("#tipoPublicacao")?.value || "";
    const categoria = categoriaParaBanco(tipo);

    const destino = getDest();

    const titulo =
      $("#tituloPublicacao")?.value.trim() || "";

    const descricao =
      $("#descricaoPublicacao")?.value.trim() || "";

    const importancia =
      $("#importanciaPublicacao")?.value || "normal";

    const dataEvento =
      $("#dataPublicacao")?.value || null;

    if (!categoria) {
      throw Error("Selecione uma categoria válida.");
    }

    if (!titulo) {
      throw Error("Informe um título.");
    }

    if (!descricao) {
      throw Error("Preencha a descrição.");
    }

    if (
      !["normal", "importante", "urgente"].includes(importancia)
    ) {
      throw Error("Selecione uma importância válida.");
    }

    if (destino === "alunos") {
      throw Error(
        "O destino exclusivo para estudantes ainda não está configurado no banco. Utilize 'Todos' ou 'Turmas' por enquanto."
      );
    }

    if (!["todos", "turmas"].includes(destino)) {
      throw Error("Selecione um destino válido.");
    }

    const turmas = destino === "turmas"
      ? getSelectedTurmas()
      : [];

    if (destino === "turmas") {
      validateTurmas(turmas);
    }

    let disciplina = "Geral";

    if (categoria === "conteudo") {
      disciplina = (
        prompt(
          "Disciplina do conteúdo (ex.: Informática):",
          editingId
            ? posts.find(post => post.id === editingId)?.disciplina || "Informática"
            : "Informática"
        ) || "Informática"
      ).trim();

      if (!disciplina) {
        throw Error("Informe a disciplina do conteúdo.");
      }
    }

    const payload = {
      titulo,
      descricao,
      categoria,
      importancia,
      data_evento: dataEvento,
      disciplina,
      destino,
      status: "ativo",
      atualizado_em: new Date().toISOString()
    };

    let savedPublication;

    if (editingId) {
      const { data, error } = await supabase
        .from("publicacoes")
        .update(payload)
        .eq("id", editingId)
        .select()
        .single();

      if (error) {
        console.error(
          "[SchoolLink] Erro ao atualizar publicação:",
          error
        );

        throw Error(
          "Não foi possível atualizar a publicação: " +
          error.message
        );
      }

      savedPublication = data;

    } else {
      const { data, error } = await supabase
        .from("publicacoes")
        .insert({
          ...payload,
          autor_id: user.id
        })
        .select()
        .single();

      if (error) {
        console.error(
          "[SchoolLink] Erro ao criar publicação:",
          error
        );

        throw Error(
          "Não foi possível criar a publicação: " +
          error.message
        );
      }

      savedPublication = data;
    }

    const publicationId = savedPublication.id;

    // Atualiza os vínculos das turmas.
    const { error: deleteLinksError } = await supabase
      .from("publicacao_turmas")
      .delete()
      .eq("publicacao_id", publicationId);

    if (deleteLinksError) {
      throw Error(
        "A publicação foi salva, mas não foi possível atualizar suas turmas: " +
        deleteLinksError.message
      );
    }

    if (turmas.length) {
      const links = turmas.map(turmaId => ({
        publicacao_id: publicationId,
        turma_id: turmaId
      }));

      const { error: insertLinksError } = await supabase
        .from("publicacao_turmas")
        .insert(links);

      if (insertLinksError) {
        throw Error(
          "A publicação foi salva, mas não foi possível vincular as turmas: " +
          insertLinksError.message
        );
      }
    }

    // Envia os anexos ao Supabase Storage.
    if (files.length) {
      await uploadFiles(publicationId, user);
    }

    editingId = null;

    return savedPublication;
  }

  // =========================================
  // LIMPAR FORMULÁRIO
  // =========================================

  function resetForm() {
    const form = $("#formPublicacao");

    if (form) {
      form.reset();
    }

    if ($("#tipoPublicacao")) {
      $("#tipoPublicacao").value = "Anúncio";
    }

    if ($("#importanciaPublicacao")) {
      $("#importanciaPublicacao").value = "normal";
    }

    setHidden("#blocoTurmas", true);

    if ($("#listaArquivos")) {
      $("#listaArquivos").innerHTML = "";
    }

    if ($("#previewAnexos")) {
      $("#previewAnexos").innerHTML = "";
    }

    if ($("#arquivosPublicacao")) {
      $("#arquivosPublicacao").value = "";
    }

    clearErr("#erroPublicacao");

    editingId = null;

    cleanup();

    initializeTurmas();
    updatePreview();
  }

  // =========================================
  // ENTRAR E SAIR
  // =========================================

  async function enter(user) {
    if (!user || authorizedUid !== user.id) {
      return;
    }

    clearAccessDenied();

    setHidden("#painelLoginDocente", true);
    setHidden("#painelDocente", false);
    setHidden("#btnSairDocente", false);

    updateServiceStatus();

    try {
      await loadTurmas();
      await refreshPosts();
    } catch (error) {
      console.error(
        "[SchoolLink] Erro ao carregar painel:",
        error
      );

      err(
        "#erroPublicacao",
        error.message ||
        "Não foi possível carregar os dados do painel."
      );
    }
  }

  async function exit() {
    authorizedUid = null;
    currentUser = null;
    posts = [];

    authCheckId++;

    removeServiceStatus();

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error(
        "[SchoolLink] Erro ao sair:",
        error
      );

      err(
        "#erroLoginDocente",
        "Não foi possível encerrar a sessão."
      );

      return;
    }

    showLogin();
  }

  // =========================================
  // LOGIN DOCENTE
  // =========================================

  listen("#formLoginDocente", "submit", async event => {
    event.preventDefault();

    clearErr("#erroLoginDocente");

    if (!supabaseReady()) {
      err(
        "#erroLoginDocente",
        window.schoollinkSupabaseError ||
        "Supabase não inicializado. Confira a configuração."
      );

      return;
    }

    const email =
      $("#emailDocente")?.value.trim() || "";

    const password =
      $("#senhaDocente")?.value || "";

    if (!email || !password) {
      err(
        "#erroLoginDocente",
        "Informe seu e-mail e sua senha."
      );

      return;
    }

    const button = $(
      'button[type="submit"]',
      $("#formLoginDocente")
    );

    if (button) {
      button.disabled = true;
      button.textContent = "Entrando...";
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        const invalidCredential = [
          "invalid_credentials",
          "Invalid login credentials"
        ].includes(error.code) ||
        normalizeText(error.message).includes(
          "invalid login credentials"
        );

        throw Error(
          invalidCredential
            ? "E-mail ou senha inválidos."
            : error.message
        );
      }

    } catch (error) {
      err(
        "#erroLoginDocente",
        error.message || "Não foi possível entrar."
      );

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Entrar";
      }
    }
  });

  // =========================================
  // EVENTOS PRINCIPAIS
  // =========================================

  listen("#btnSairDocente", "click", exit);

  $$("[data-doc-secao]").forEach(button => {
    button.addEventListener("click", () => {
      if (!authorizedUid) return;

      showTab(button.dataset.docSecao);
    });
  });

  // Prévia dos campos.
  [
    "tipoPublicacao",
    "tituloPublicacao",
    "descricaoPublicacao",
    "importanciaPublicacao",
    "dataPublicacao"
  ].forEach(id => {
    const element = $("#" + id);

    if (!element) return;

    element.addEventListener("input", updatePreview);
    element.addEventListener("change", updatePreview);
  });

  $$('input[name="destinatario"]').forEach(input => {
    input.addEventListener("change", updateDest);
  });

  // Checkboxes das turmas são criados dinamicamente.
  const turmaContainer = getTurmaContainer();

  if (turmaContainer) {
    turmaContainer.addEventListener("change", event => {
      if (
        event.target.matches('input[type="checkbox"]')
      ) {
        updateDest();
      }
    });
  }

  listen(
    "#arquivosPublicacao",
    "change",
    showFiles
  );

  // Limpeza ao resetar manualmente.
  listen("#formPublicacao", "reset", () => {
    Promise.resolve().then(() => {
      cleanup();

      editingId = null;

      if ($("#listaArquivos")) {
        $("#listaArquivos").innerHTML = "";
      }

      if ($("#previewAnexos")) {
        $("#previewAnexos").innerHTML = "";
      }

      clearErr("#erroPublicacao");

      initializeTurmas();
      updatePreview();
    });
  });

  // =========================================
  // PUBLICAR
  // =========================================

  listen("#formPublicacao", "submit", async event => {
    event.preventDefault();

    clearErr("#erroPublicacao");

    try {
      await getAuthorizedUser();
    } catch (error) {
      err(
        "#erroPublicacao",
        error.message
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
        "Não foi possível salvar a publicação."
      );

    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Publicar";
      }
    }
  });

  // =========================================
  // FILTRO
  // =========================================

  listen(
    "#filtroTipoDocente",
    "change",
    renderPosts
  );

  // =========================================
  // EDITAR E ARQUIVAR
  // =========================================

  listen("#listaPublicacoes", "click", async event => {
    try {
      await getAuthorizedUser();
    } catch {
      return;
    }

    const editButton =
      event.target.closest("[data-edit]");

    const archiveButton =
      event.target.closest("[data-archive]");

    const id = editButton?.dataset.edit;
    const archiveId = archiveButton?.dataset.archive;

    // ---------------------------------------
    // EDITAR
    // ---------------------------------------

    if (id) {
      const post = posts.find(item => item.id === id);

      if (!post) return;

      editingId = id;

      $("#tipoPublicacao").value =
        categoriaParaTela(post.categoria);

      $("#tituloPublicacao").value =
        post.titulo || "";

      $("#descricaoPublicacao").value =
        post.descricao || "";

      $("#importanciaPublicacao").value =
        post.importancia || "normal";

      $("#dataPublicacao").value =
        post.data_evento || "";

      const destino = post.destino || "todos";

      const radio = $(
        `input[name="destinatario"][value="${destino}"]`
      );

      if (radio) {
        radio.checked = true;
      }

      const selectedTurmaIds = (
        post.turmas || []
      ).map(turma => turma.id);

      initializeTurmas(selectedTurmaIds);

      if ($("#blocoTurmas")) {
        $("#blocoTurmas").hidden =
          destino !== "turmas";
      }

      if ($("#listaArquivos")) {
        $("#listaArquivos").innerHTML =
          (post.arquivos || []).map(file => `
            <div class="area-arquivos__item">
              <span>▧</span>

              <div>
                <strong>${esc(file.nome_original)}</strong>
                <small>Arquivo já enviado</small>
              </div>
            </div>
          `).join("");
      }

      if ($("#previewAnexos")) {
        $("#previewAnexos").innerHTML = "";
      }

      updatePreview();

      showTab("publicar");

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

      return;
    }

    // ---------------------------------------
    // ARQUIVAR
    // ---------------------------------------

    if (
      archiveId &&
      confirm("Arquivar esta publicação?")
    ) {
      try {
        const user = await getAuthorizedUser();

        const { error } = await supabase
          .from("publicacoes")
          .update({
            status: "arquivado",
            atualizado_em: new Date().toISOString()
          })
          .eq("id", archiveId);

        if (error) {
          throw error;
        }

        if (
          !currentUser ||
          authorizedUid !== user.id
        ) {
          throw Error("Sua sessão foi encerrada.");
        }

        await refreshPosts();

      } catch (error) {
        console.error(
          "[SchoolLink] Erro ao arquivar:",
          error
        );

        alert(
          "Não foi possível arquivar: " +
          error.message
        );
      }
    }
  });

  // =========================================
  // SESSÃO SUPABASE
  // =========================================

  async function handleSession(session) {
    const checkId = ++authCheckId;

    if (!session?.user) {
      showLogin();
      return;
    }

    if (!supabaseReady()) {
      denyAccess(
        "Não foi possível inicializar o Supabase."
      );

      return;
    }

    // Evita que uma verificação antiga sobrescreva a nova.
    if (checkId !== authCheckId) return;

    await verifyDocenteAccess(session.user);
  }

  // =========================================
  // INICIALIZAÇÃO
  // =========================================

  async function initialize() {
    setHidden("#painelDocente", true);
    setHidden("#btnSairDocente", true);

    removeServiceStatus();
    createAccessDeniedPanel();

    if (!supabaseReady()) {
      showLogin(
        window.schoollinkSupabaseError ||
        "Supabase não inicializado. Confira os arquivos de configuração."
      );

      const note = $(".area-form__nota");

      if (note) {
        note.textContent =
          window.schoollinkSupabaseError ||
          "Configure o Supabase para habilitar o acesso institucional.";
      }

      return;
    }

    // Observa login, renovação e encerramento da sessão.
    supabase.auth.onAuthStateChange((_event, session) => {
      // Deixa o callback de autenticação terminar antes
      // de consultar as tabelas do banco.
      Promise.resolve().then(() => handleSession(session));
    });

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error(
        "[SchoolLink] Erro ao recuperar sessão:",
        error
      );

      showLogin(
        "Não foi possível recuperar sua sessão. Entre novamente."
      );

      return;
    }

    await handleSession(data.session);
  }

  // =========================================
  // ESTADO INICIAL
  // =========================================

  updatePreview();

  initialize();

})();
