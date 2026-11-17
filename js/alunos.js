
/* SchoolLink HXV — Área do aluno
 * Supabase Auth + PostgreSQL + Storage.
 * Tarefas pessoais: localStorage por UID.
 */

(() => {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const EMAIL_DOMAIN = "@estudante.rn.gov.br";
  const EMAIL_REGEX = /^[0-9]{12}@estudante\.rn\.gov\.br$/i;
  const TASKS_PREFIX = "schoollink_tarefas_";
  const STORAGE_BUCKET = "schoollink-arquivos";
  const SIGNED_URL_SECONDS = 3600;

  const supabase = window.schoollinkSupabase;

  let posts = [];
  let currentStudent = null;
  let tasks = [];
  let activeSection = "visao-geral";
  let suppressAuthObserver = false;
  let authSubscription = null;

  // --------------------------------------------------
  // UTILITÁRIOS
  // --------------------------------------------------

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeTasks() {
    if (!currentStudent?.uid) return;

    try {
      localStorage.setItem(
        TASKS_PREFIX + currentStudent.uid,
        JSON.stringify(tasks)
      );
    } catch (error) {
      console.error("[SchoolLink] Erro ao salvar tarefas:", error);
    }
  }

  function loadTasks(uid) {
    tasks = read(TASKS_PREFIX + uid, []);

    if (!Array.isArray(tasks)) {
      tasks = [];
    }
  }

  function fmtDate(value) {
    if (!value) return "Sem data";

    const d = new Date(value + "T12:00:00");

    if (Number.isNaN(d.getTime())) {
      return "Data indisponível";
    }

    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function validInstitutionalEmail(email) {
    return EMAIL_REGEX.test(
      String(email || "").trim().toLowerCase()
    );
  }

  function extrairMatricula(email) {
    const normalized = String(email || "").trim().toLowerCase();

    if (!validInstitutionalEmail(normalized)) {
      throw new Error(
        "Utilize seu e-mail institucional com matrícula de 12 dígitos."
      );
    }

    return normalized.slice(0, -EMAIL_DOMAIN.length);
  }

  function showError(id, message) {
    const element = $("#" + id);
    if (!element) return;

    element.textContent = message;
    element.hidden = false;
  }

  function clearError(id) {
    const element = $("#" + id);
    if (!element) return;

    element.textContent = "";
    element.hidden = true;
  }

  function showLogin() {
    $("#formLoginAluno").hidden = false;
    $("#formCadastroAluno").hidden = true;

    clearError("erroLoginAluno");
    clearError("erroCadastroAluno");
  }

  function showRegister() {
    $("#formLoginAluno").hidden = true;
    $("#formCadastroAluno").hidden = false;

    clearError("erroLoginAluno");
    clearError("erroCadastroAluno");
  }

  function supabaseReady() {
    return Boolean(
      supabase &&
      supabase.auth &&
      supabase.from &&
      supabase.storage
    );
  }

  function supabaseError(error) {
    const message = String(
      error?.message || error?.error_description || ""
    );

    const normalized = message.toLowerCase();

    if (
      normalized.includes("already registered") ||
      normalized.includes("already been registered") ||
      normalized.includes("user already")
    ) {
      return "Este e-mail já possui uma conta.";
    }

    if (
      normalized.includes("invalid login credentials") ||
      normalized.includes("invalid credentials")
    ) {
      return "E-mail ou senha incorretos.";
    }

    if (
      normalized.includes("email not confirmed")
    ) {
      return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.";
    }

    if (
      normalized.includes("password should be at least") ||
      normalized.includes("weak password")
    ) {
      return "A senha precisa ter pelo menos 8 caracteres.";
    }

    if (
      normalized.includes("rate limit") ||
      normalized.includes("too many requests")
    ) {
      return "Muitas tentativas. Aguarde um pouco e tente novamente.";
    }

    if (
      normalized.includes("network") ||
      normalized.includes("fetch")
    ) {
      return "Falha na conexão. Verifique sua internet.";
    }

    if (
      normalized.includes("duplicate key") ||
      normalized.includes("matriculas_matricula_key")
    ) {
      return "Esta matrícula já está cadastrada no SchoolLink.";
    }

    if (
      normalized.includes("turma selecionada") ||
      normalized.includes("turma")
    ) {
      return "Não foi possível cadastrar o vínculo com a turma selecionada. Confira se ela continua ativa.";
    }

    return message || "Ocorreu um erro. Tente novamente.";
  }

  function setButtonLoading(button, loading, text) {
    if (!button) return;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = text;
    } else {
      button.disabled = false;
      button.textContent =
        button.dataset.originalText || text;
      delete button.dataset.originalText;
    }
  }

  // --------------------------------------------------
  // TURMAS — SUPABASE
  // --------------------------------------------------

  let turmasCache = [];

  function getTurma(id) {
    return turmasCache.find(
      turma => turma.id === id
    ) || null;
  }

  function nomeTurma(turma) {
    if (!turma) return "Turma não identificada";

    if (turma.nome) {
      return turma.nome;
    }

    return [
      turma.ano_escolar
        ? `${turma.ano_escolar}º ano`
        : "",
      turma.turma || "",
      turma.curso || ""
    ].filter(Boolean).join(" — ");
  }

  async function carregarTurmasCadastro() {
    const select = $("#turmaCadastroAluno");

    if (!select) return;

    select.innerHTML =
      '<option value="">Carregando turmas...</option>';

    if (!supabaseReady()) {
      select.innerHTML =
        '<option value="">Serviço indisponível</option>';

      console.error(
        "[SchoolLink] Supabase não foi inicializado."
      );

      return;
    }

    try {
      const { data, error } = await supabase
        .from("turmas")
        .select("id,nome,codigo,curso,ano_escolar,turma,turno")
        .eq("ativa", true)
        .order("ano_escolar", { ascending: true })
        .order("nome", { ascending: true });

      if (error) throw error;

      turmasCache = data || [];

      select.innerHTML =
        '<option value="" selected disabled>Selecione sua turma</option>';

      if (!turmasCache.length) {
        select.innerHTML =
          '<option value="">Nenhuma turma disponível</option>';
        return;
      }

      turmasCache.forEach(turma => {
        const option = document.createElement("option");

        option.value = turma.id;
        option.textContent = nomeTurma(turma);

        select.appendChild(option);
      });

      console.log(
        "[SchoolLink] Turmas carregadas do Supabase:",
        turmasCache.length
      );

    } catch (error) {
      console.error(
        "[SchoolLink] Erro ao carregar turmas:",
        error
      );

      select.innerHTML =
        '<option value="">Erro ao carregar turmas</option>';
    }
  }

  // --------------------------------------------------
  // PERFIL E MATRÍCULA DO ALUNO
  // --------------------------------------------------

  async function carregarPerfilAluno(user) {
    const { data: perfil, error: perfilError } = await supabase
      .from("perfis")
      .select("id,nome,papel,ativo")
      .eq("id", user.id)
      .maybeSingle();

    if (perfilError) throw perfilError;

    if (!perfil || perfil.papel !== "aluno" || !perfil.ativo) {
      throw new Error(
        "Perfil de estudante não encontrado ou desativado. Entre em contato com a gestão."
      );
    }

    const { data: matricula, error: matriculaError } = await supabase
      .from("matriculas")
      .select("id,matricula,turma_id,ativa")
      .eq("aluno_id", user.id)
      .eq("ativa", true)
      .maybeSingle();

    if (matriculaError) throw matriculaError;

    if (!matricula) {
      throw new Error(
        "Não encontramos uma matrícula ativa para esta conta."
      );
    }

    const { data: turma, error: turmaError } = await supabase
      .from("turmas")
      .select("id,nome,codigo,curso,ano_escolar,turma,turno")
      .eq("id", matricula.turma_id)
      .maybeSingle();

    if (turmaError) throw turmaError;

    if (!turma) {
      throw new Error(
        "A turma vinculada à sua matrícula não foi encontrada."
      );
    }

    return {
      uid: user.id,
      nome: perfil.nome || "Estudante",
      matricula: matricula.matricula,
      turmaId: matricula.turma_id,
      turma: nomeTurma(turma)
    };
  }

  // --------------------------------------------------
  // PUBLICAÇÕES — POSTGRESQL
  // --------------------------------------------------

  const CATEGORY_LABELS = {
    anuncio: "Anúncio",
    evento: "Evento",
    comunicado: "Comunicado",
    conteudo: "Conteúdo",
    atividade: "Atividade"
  };

  function categoriaLabel(categoria) {
    return CATEGORY_LABELS[categoria] || categoria || "Publicação";
  }

  function allowedForStudent(post, current) {
    if (post.destino === "todos") {
      return true;
    }

    if (post.destino !== "turmas") {
      return false;
    }

    return (
      Array.isArray(post.turmas) &&
      post.turmas.includes(current?.turmaId)
    );
  }

  function isPostVisible(post, current) {
    return (
      post.status === "ativo" &&
      allowedForStudent(post, current)
    );
  }

  function visiblePosts() {
    return posts.filter(post =>
      isPostVisible(post, currentStudent)
    );
  }

  async function carregarAnexos(publicacaoIds) {
    if (!publicacaoIds.length) return [];

    const { data, error } = await supabase
      .from("arquivos_publicacao")
      .select(
        "id,publicacao_id,nome_original,caminho_storage,tipo_mime,tamanho_bytes"
      )
      .in("publicacao_id", publicacaoIds);

    if (error) throw error;

    const arquivos = data || [];

    return Promise.all(
      arquivos.map(async arquivo => {
        let url = "";

        try {
          const { data: signed, error: signedError } =
            await supabase.storage
              .from(STORAGE_BUCKET)
              .createSignedUrl(
                arquivo.caminho_storage,
                SIGNED_URL_SECONDS
              );

          if (signedError) throw signedError;

          url = signed?.signedUrl || "";

        } catch (error) {
          console.error(
            "[SchoolLink] Não foi possível gerar URL do anexo:",
            arquivo.nome_original,
            error
          );
        }

        return {
          id: arquivo.id,
          publicacaoId: arquivo.publicacao_id,
          nome: arquivo.nome_original || "Arquivo",
          tipo: arquivo.tipo_mime || "",
          tamanho: arquivo.tamanho_bytes || 0,
          caminho: arquivo.caminho_storage,
          url
        };
      })
    );
  }

  async function loadPosts() {
    console.log(
      "[SchoolLink] Carregando publicações do Supabase..."
    );

    const { data: publicacoes, error } = await supabase
      .from("publicacoes")
      .select(
        "id,titulo,descricao,categoria,importancia,destino,status,criado_em,data_evento,disciplina"
      )
      .eq("status", "ativo")
      .order("criado_em", { ascending: false });

    if (error) throw error;

    const rows = publicacoes || [];
    const ids = rows.map(post => post.id);

    if (!ids.length) {
      posts = [];
      console.log("[SchoolLink] Nenhuma publicação visível.");
      return;
    }

    const [
      { data: vinculos, error: vinculosError },
      anexos
    ] = await Promise.all([
      supabase
        .from("publicacao_turmas")
        .select("publicacao_id,turma_id")
        .in("publicacao_id", ids),

      carregarAnexos(ids)
    ]);

    if (vinculosError) throw vinculosError;

    const turmasPorPost = new Map();
    const anexosPorPost = new Map();

    (vinculos || []).forEach(vinculo => {
      if (!turmasPorPost.has(vinculo.publicacao_id)) {
        turmasPorPost.set(vinculo.publicacao_id, []);
      }

      turmasPorPost
        .get(vinculo.publicacao_id)
        .push(vinculo.turma_id);
    });

    anexos.forEach(arquivo => {
      if (!anexosPorPost.has(arquivo.publicacaoId)) {
        anexosPorPost.set(arquivo.publicacaoId, []);
      }

      anexosPorPost
        .get(arquivo.publicacaoId)
        .push(arquivo);
    });

    posts = rows.map(row => ({
      id: row.id,
      titulo: row.titulo || "",
      descricao: row.descricao || "",
      tipo: categoriaLabel(row.categoria),
      categoria: row.categoria,
      importancia: row.importancia || "normal",
      destino: row.destino,
      status: row.status,
      data: row.data_evento || "",
      disciplina: row.disciplina || "",
      turmas: turmasPorPost.get(row.id) || [],
      arquivos: anexosPorPost.get(row.id) || [],
      criado: row.criado_em
        ? new Date(row.criado_em).getTime()
        : 0
    }));

    posts.sort((a, b) => b.criado - a.criado);

    console.log(
      "[SchoolLink] Publicações carregadas:",
      posts.length
    );
  }

  // --------------------------------------------------
  // ÍCONES
  // --------------------------------------------------

  function postIcon(type) {
    const icons = {
      "Atividade": "✓",
      "Conteúdo": "▤",
      "Comunicado": "!",
      "Evento": "▦",
      "Anúncio": "•"
    };

    return icons[type] || "•";
  }

  // --------------------------------------------------
  // ANEXOS
  // --------------------------------------------------

  function renderAttachments(arquivos) {
    if (!Array.isArray(arquivos) || !arquivos.length) {
      return "";
    }

    return `
      <div class="area-anexos">
        ${arquivos.map(arquivo => {
          const nome = escapeHtml(
            arquivo.nome || "Arquivo"
          );

          const tipo = String(
            arquivo.tipo || ""
          ).toLowerCase().trim();

          const url = String(
            arquivo.url || ""
          ).trim();

          if (!/^https?:\/\//i.test(url)) {
            return `
              <div class="area-anexo area-anexo--arquivo">
                <span class="area-anexo__nome">
                  ${nome} — arquivo indisponível
                </span>
              </div>
            `;
          }

          const safeUrl = escapeHtml(url);

          const extensao = (
            arquivo.nome || ""
          ).split(".").pop().toLowerCase();

          const isImage =
            tipo.startsWith("image/") ||
            [
              "png", "jpg", "jpeg", "webp",
              "gif", "svg", "avif", "bmp"
            ].includes(extensao);

          if (isImage) {
            return `
              <div class="area-anexo area-anexo--imagem">
                <button
                  type="button"
                  class="area-anexo__visualizar"
                  data-image-url="${safeUrl}"
                  data-image-name="${nome}"
                  aria-label="Expandir imagem ${nome}"
                >
                  <img
                    src="${safeUrl}"
                    alt="${nome}"
                    loading="lazy"
                    onerror="this.classList.add('imagem-com-erro')"
                  >
                </button>

                <span class="area-anexo__nome">
                  ${nome}
                </span>
              </div>
            `;
          }

          const isPdf =
            tipo === "application/pdf" ||
            extensao === "pdf";

          const isPptx =
            tipo.includes("presentation") ||
            extensao === "pptx";

          const formato = isPdf
            ? "PDF"
            : isPptx
              ? "PPTX"
              : "ARQUIVO";

          return `
            <div class="area-anexo area-anexo--arquivo">
              <a
                class="area-anexo__abrir"
                href="${safeUrl}"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir arquivo ${nome}"
              >
                <span class="area-anexo__icone">
                  ${formato}
                </span>

                <span class="area-anexo__nome">
                  ${nome}
                </span>

                <span aria-hidden="true">↗</span>
              </a>

              <button
                type="button"
                class="area-anexo__download"
                data-download-url="${safeUrl}"
                data-download-name="${nome}"
                aria-label="Baixar ${nome}"
                title="Baixar arquivo"
              >
                <span aria-hidden="true">↓</span>
                <span>Baixar</span>
              </button>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // --------------------------------------------------
  // VISUALIZADOR DE IMAGENS
  // --------------------------------------------------

  function setupAttachmentViewer() {
    if ($("#areaImagemExpandida")) return;

    const viewer = document.createElement("div");

    viewer.id = "areaImagemExpandida";
    viewer.className = "area-imagem-expandida";
    viewer.hidden = true;

    viewer.innerHTML = `
      <div class="area-imagem-expandida__painel">

        <button
          type="button"
          class="area-imagem-expandida__fechar"
          data-fechar-imagem
          aria-label="Fechar imagem"
        >
          ×
        </button>

        <img
          class="area-imagem-expandida__imagem"
          src=""
          alt=""
        >

        <div class="area-imagem-expandida__rodape">

          <span class="area-imagem-expandida__nome"></span>

          <button
            type="button"
            class="area-anexo__download"
            data-download-expanded
          >
            <span aria-hidden="true">↓</span>
            <span>Baixar imagem</span>
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(viewer);
  }

  function openExpandedImage(url, nome) {
    const viewer = $("#areaImagemExpandida");

    if (!viewer) return;

    const image = $(".area-imagem-expandida__imagem", viewer);
    const title = $(".area-imagem-expandida__nome", viewer);
    const download = $("[data-download-expanded]", viewer);

    image.src = url;
    image.alt = nome;

    title.textContent = nome;

    download.dataset.downloadUrl = url;
    download.dataset.downloadName = nome;

    viewer.hidden = false;

    document.body.classList.add("area-imagem-aberta");
  }

  function closeExpandedImage() {
    const viewer = $("#areaImagemExpandida");

    if (!viewer) return;

    viewer.hidden = true;

    const image = $(".area-imagem-expandida__imagem", viewer);

    image.src = "";
    image.alt = "";

    document.body.classList.remove("area-imagem-aberta");
  }

  // --------------------------------------------------
  // DOWNLOAD DOS ANEXOS
  // --------------------------------------------------

  async function downloadAttachment(url, nome, button) {
    if (!url || !/^https?:\/\//i.test(url)) {
      alert("Não foi possível localizar o arquivo.");
      return;
    }

    const originalContent = button.innerHTML;

    button.disabled = true;
    button.innerHTML = "Baixando...";

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          "Não foi possível acessar o arquivo."
        );
      }

      const blob = await response.blob();

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = nome || "arquivo";

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);

    } catch (error) {
      console.error(
        "[SchoolLink] Erro ao baixar anexo:",
        error
      );

      alert(
        "Não foi possível baixar este arquivo. Atualize a página e tente novamente."
      );

    } finally {
      button.disabled = false;
      button.innerHTML = originalContent;
    }
  }

  document.addEventListener("click", async e => {
    const imageButton = e.target.closest(
      "[data-image-url]"
    );

    if (imageButton) {
      openExpandedImage(
        imageButton.dataset.imageUrl,
        imageButton.dataset.imageName || "Imagem"
      );

      return;
    }

    const downloadButton = e.target.closest(
      "[data-download-url], [data-download-expanded]"
    );

    if (downloadButton) {
      e.preventDefault();
      e.stopPropagation();

      await downloadAttachment(
        downloadButton.dataset.downloadUrl,
        downloadButton.dataset.downloadName || "arquivo",
        downloadButton
      );

      return;
    }

    if (e.target.closest("[data-fechar-imagem]")) {
      closeExpandedImage();
      return;
    }

    if (e.target.id === "areaImagemExpandida") {
      closeExpandedImage();
    }
  });

  document.addEventListener("keydown", e => {
    if (
      e.key === "Escape" &&
      !$("#areaImagemExpandida")?.hidden
    ) {
      closeExpandedImage();
    }
  });

  // --------------------------------------------------
  // CARTÕES DE PUBLICAÇÃO
  // --------------------------------------------------

  function postCard(post) {
    let due = "";

    if (post.data) {
      due = `
        <span>
          Prazo/data: ${escapeHtml(fmtDate(post.data))}
        </span>
      `;
    }

    return `
      <article class="area-lista__item">

        <span class="area-lista__marcador">
          ${postIcon(post.tipo)}
        </span>

        <div class="area-lista__corpo">

          <h3>${escapeHtml(post.titulo)}</h3>

          <p>${escapeHtml(post.descricao)}</p>

          ${renderAttachments(post.arquivos)}

          <div class="area-lista__meta">

            <span class="area-tag ${
              post.tipo === "Atividade"
                ? "area-tag--atividade"
                : ""
            }">
              ${escapeHtml(post.tipo)}
            </span>

            <span>
              ${escapeHtml(post.disciplina || "Geral")}
            </span>

            ${due}

          </div>

        </div>

      </article>
    `;
  }

  // --------------------------------------------------
  // RENDERIZAÇÃO
  // --------------------------------------------------

  function renderHome() {
    const visible = visiblePosts();

    const activities = visible
      .filter(p => p.tipo === "Atividade")
      .sort((a, b) =>
        (a.data || "9999").localeCompare(b.data || "9999")
      );

    const notices = visible
      .filter(p =>
        ["Comunicado", "Anúncio", "Evento"].includes(p.tipo)
      )
      .sort((a, b) => b.criado - a.criado);

    $("#totalPendentes").textContent =
      tasks.filter(t => !t.done).length + activities.length;

    $("#totalProximas").textContent =
      activities.filter(p =>
        !p.data ||
        p.data >= new Date().toISOString().slice(0, 10)
      ).length;

    $("#totalComunicados").textContent = notices.length;

    $("#listaProximas").innerHTML =
      activities.slice(0, 4).map(postCard).join("") ||
      `<p class="area-empty">Nenhuma atividade cadastrada.</p>`;

    $("#listaRecentes").innerHTML =
      notices.slice(0, 4).map(postCard).join("") ||
      `<p class="area-empty">Nenhum comunicado cadastrado.</p>`;
  }

  function renderTasks() {
    const personal = tasks.map(t => `
      <div class="area-lista__item area-tarefa-form__item ${
        t.done ? "area-tarefa-form__item--feito" : ""
      }">

        <input
          type="checkbox"
          data-task="${escapeHtml(t.id)}"
          ${t.done ? "checked" : ""}
          aria-label="Concluir ${escapeHtml(t.title)}"
        >

        <div class="area-lista__corpo">
          <h3>${escapeHtml(t.title)}</h3>
          <p>${
            t.due
              ? "Prazo: " + escapeHtml(fmtDate(t.due))
              : "Lembrete pessoal"
          }</p>
        </div>

        <button
          class="area-mini-button area-mini-button--danger"
          data-remove-task="${escapeHtml(t.id)}"
          type="button"
        >
          Excluir
        </button>

      </div>
    `).join("");

    const school = visiblePosts()
      .filter(p => p.tipo === "Atividade")
      .map(postCard)
      .join("");

    $("#listaTarefas").innerHTML =
      personal + school ||
      `<p class="area-empty">
        Você ainda não tem tarefas. Adicione um lembrete acima.
      </p>`;
  }

  function renderCalendar() {
    const items = visiblePosts()
      .filter(p => p.data)
      .sort((a, b) => a.data.localeCompare(b.data));

    $("#listaCalendario").innerHTML =
      items.map(postCard).join("") ||
      `<p class="area-empty">Nenhuma data publicada.</p>`;
  }

  function renderContents() {
    const items = visiblePosts()
      .filter(p => p.tipo === "Conteúdo");

    const disciplines = [
      ...new Set(items.map(p => p.disciplina || "Geral"))
    ].sort();

    const select = $("#filtroDisciplina");
    const previous = select.value;

    select.innerHTML =
      `<option value="todas">Todas as disciplinas</option>` +
      disciplines.map(d => `
        <option value="${escapeHtml(d)}">${escapeHtml(d)}</option>
      `).join("");

    if (disciplines.includes(previous)) {
      select.value = previous;
    }

    const chosen = select.value;

    const filtered = items.filter(p =>
      chosen === "todas" ||
      (p.disciplina || "Geral") === chosen
    );

    $("#listaConteudos").innerHTML =
      filtered.map(p => `
        <article class="area-conteudo">

          <div class="area-conteudo__topo">

            <span class="area-conteudo__icone">▤</span>

            <div>
              <h3>${escapeHtml(p.titulo)}</h3>
              <p>${escapeHtml(p.disciplina || "Geral")}</p>
            </div>

          </div>

          <p>${escapeHtml(p.descricao)}</p>

          ${renderAttachments(p.arquivos)}

          <div class="area-conteudo__rodape">
            <span>Publicado no SchoolLink</span>
            <span class="area-tag">Material</span>
          </div>

        </article>
      `).join("") ||
      `<p class="area-empty">Não há conteúdos para esse filtro.</p>`;
  }

  function renderNotices() {
    $("#listaComunicados").innerHTML =
      visiblePosts()
        .filter(p =>
          ["Comunicado", "Anúncio", "Evento"].includes(p.tipo)
        )
        .sort((a, b) => b.criado - a.criado)
        .map(postCard)
        .join("") ||
      `<p class="area-empty">Nenhum comunicado publicado.</p>`;
  }

  function renderAll() {
    renderHome();
    renderTasks();
    renderCalendar();
    renderContents();
    renderNotices();
  }

  // --------------------------------------------------
  // NAVEGAÇÃO
  // --------------------------------------------------

  function showSection(name) {
    activeSection = name;

    $$("[data-painel]").forEach(el => {
      el.classList.toggle(
        "is-visible",
        el.dataset.painel === name
      );
    });

    $$("[data-secao]").forEach(btn => {
      const active = btn.dataset.secao === name;

      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });

    if (name === "conteudos") {
      renderContents();
    }
  }

  // --------------------------------------------------
  // ENTRAR NA ÁREA DO ALUNO
  // --------------------------------------------------

  function enter(current) {
    currentStudent = current;

    loadTasks(current.uid);

    $("#painelLogin").hidden = true;
    $("#painelAluno").hidden = false;
    $("#btnSair").hidden = false;

    $("#nomeAluno").textContent =
      current.nome || "estudante";

    $("#turmaAluno").textContent =
      `${current.turma || "Turma não identificada"} · materiais e comunicados da escola`;

    $("#dataHoje").textContent =
      new Date().toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short"
      });

    showSection("visao-geral");
    renderAll();
  }

  // --------------------------------------------------
  // RECUPERAR SESSÃO / VALIDAR PERFIL
  // --------------------------------------------------

  async function handleSession(user) {
    if (!user || suppressAuthObserver) return;

    try {
      console.log(
        "[SchoolLink] Validando sessão do aluno:",
        user.id
      );

      if (!validInstitutionalEmail(user.email || "")) {
        throw new Error(
          "Esta conta não utiliza um e-mail institucional válido."
        );
      }

      if (!user.email_confirmed_at) {
        await supabase.auth.signOut();
        showError(
          "erroLoginAluno",
          "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada."
        );
        return;
      }

      const profile = await carregarPerfilAluno(user);

      currentStudent = profile;

      await loadPosts();

      enter(profile);

    } catch (error) {
      console.error(
        "[SchoolLink] Erro ao recuperar sessão:",
        error
      );

      currentStudent = null;
      posts = [];

      $("#painelAluno").hidden = true;
      $("#painelLogin").hidden = false;
      $("#btnSair").hidden = true;

      showLogin();

      showError(
        "erroLoginAluno",
        supabaseError(error)
      );

      await supabase.auth.signOut().catch(() => {});
    }
  }

  // --------------------------------------------------
  // SAIR DA CONTA
  // --------------------------------------------------

  async function exit() {
    currentStudent = null;
    tasks = [];
    posts = [];

    closeExpandedImage();

    $("#painelLogin").hidden = false;
    $("#painelAluno").hidden = true;
    $("#btnSair").hidden = true;

    showLogin();

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

    } catch (error) {
      console.error(
        "[SchoolLink] Erro ao sair:",
        error
      );

      showError(
        "erroLoginAluno",
        "Não foi possível encerrar a sessão. Tente novamente."
      );
    }
  }

  // --------------------------------------------------
  // ABRIR E FECHAR CADASTRO
  // --------------------------------------------------

  $("#abrirCadastroAluno").addEventListener(
    "click",
    showRegister
  );

  $("#voltarLoginAluno").addEventListener(
    "click",
    showLogin
  );

  // --------------------------------------------------
  // CADASTRO DE ESTUDANTE — SUPABASE AUTH
  // --------------------------------------------------

  $("#formCadastroAluno").addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      clearError("erroCadastroAluno");

      if (!supabaseReady()) {
        showError(
          "erroCadastroAluno",
          "O Supabase não está configurado corretamente."
        );
        return;
      }

      const nome =
        $("#nomeCadastroAluno").value.trim();

      const turmaId =
        $("#turmaCadastroAluno").value.trim();

      const email =
        $("#emailCadastroAluno").value.trim().toLowerCase();

      const senha =
        $("#senhaCadastroAluno").value;

      const confirmacao =
        $("#confirmarSenhaAluno").value;

      if (!nome) {
        showError(
          "erroCadastroAluno",
          "Informe seu nome completo."
        );
        return;
      }

      if (!validInstitutionalEmail(email)) {
        showError(
          "erroCadastroAluno",
          "Utilize seu e-mail institucional com matrícula de 12 dígitos, terminado em @estudante.rn.gov.br."
        );
        return;
      }

      if (senha.length < 8) {
        showError(
          "erroCadastroAluno",
          "A senha precisa ter pelo menos 8 caracteres."
        );
        return;
      }

      if (senha !== confirmacao) {
        showError(
          "erroCadastroAluno",
          "As senhas não coincidem."
        );
        return;
      }

      const turma = getTurma(turmaId);

      if (!turma) {
        showError(
          "erroCadastroAluno",
          "Selecione uma turma válida e ativa."
        );
        return;
      }

      const button = e.submitter;

      setButtonLoading(
        button,
        true,
        "Criando conta..."
      );

      suppressAuthObserver = true;

      try {
        const matricula = extrairMatricula(email);

        console.log(
          "[SchoolLink] Iniciando cadastro do aluno."
        );

        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            data: {
              schoollink_tipo_cadastro: "aluno",
              nome,
              turma_id: turmaId
            },
            emailRedirectTo: window.location.href.split("?")[0]
          }
        });

        if (error) throw error;

        if (!data.user) {
          throw new Error(
            "O Supabase não retornou os dados da conta criada."
          );
        }

        /*
         * Com confirmação de e-mail habilitada,
         * o Supabase não deve criar uma sessão ativa
         * até o usuário confirmar o endereço.
         */

        if (data.session) {
          await supabase.auth.signOut();
        }

        $("#formCadastroAluno").reset();

        showLogin();

        $("#emailAluno").value = email;
        $("#senhaAluno").value = "";

        showError(
          "erroLoginAluno",
          `Cadastro iniciado! A matrícula ${matricula} foi associada à turma ${nomeTurma(turma)}. Enviamos um link de confirmação para seu e-mail institucional. Confirme o endereço antes de entrar.`
        );

        console.log(
          "[SchoolLink] Cadastro enviado ao Supabase Auth:",
          data.user.id
        );

      } catch (error) {
        console.error(
          "[SchoolLink] Erro no cadastro:",
          error
        );

        showError(
          "erroCadastroAluno",
          supabaseError(error)
        );

      } finally {
        suppressAuthObserver = false;

        setButtonLoading(
          button,
          false,
          "Criar minha conta"
        );
      }
    }
  );

  // --------------------------------------------------
  // LOGIN DO ESTUDANTE
  // --------------------------------------------------

  $("#formLoginAluno").addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      clearError("erroLoginAluno");

      if (!supabaseReady()) {
        showError(
          "erroLoginAluno",
          "O Supabase não está configurado corretamente."
        );
        return;
      }

      const email =
        $("#emailAluno").value.trim().toLowerCase();

      const senha =
        $("#senhaAluno").value;

      if (!validInstitutionalEmail(email)) {
        showError(
          "erroLoginAluno",
          "Utilize seu e-mail institucional com matrícula de 12 dígitos."
        );
        return;
      }

      const button = e.submitter;

      setButtonLoading(
        button,
        true,
        "Entrando..."
      );

      suppressAuthObserver = true;

      try {
        const { data, error } = await supabase.auth
          .signInWithPassword({
            email,
            password: senha
          });

        if (error) throw error;

        const user = data.user;

        if (!user?.email_confirmed_at) {
          await supabase.auth.signOut();

          showError(
            "erroLoginAluno",
            "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada."
          );

          return;
        }

        const profile = await carregarPerfilAluno(user);

        currentStudent = profile;

        await loadPosts();

        enter(profile);

        console.log(
          "[SchoolLink] Login realizado:",
          user.id
        );

      } catch (error) {
        console.error(
          "[SchoolLink] Erro no login:",
          error
        );

        showError(
          "erroLoginAluno",
          supabaseError(error)
        );

        currentStudent = null;
        posts = [];

        await supabase.auth.signOut().catch(() => {});

      } finally {
        suppressAuthObserver = false;

        setButtonLoading(
          button,
          false,
          "Entrar"
        );
      }
    }
  );

  // --------------------------------------------------
  // OBSERVADOR DE SESSÃO DO SUPABASE
  // --------------------------------------------------

  function setupAuthObserver() {
    const { data, error } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (suppressAuthObserver) return;

        if (session?.user) {
          /*
           * Executa fora do callback síncrono do Auth
           * para evitar bloqueio da fila interna do Supabase.
           */
          Promise.resolve().then(() => {
            handleSession(session.user);
          });
        } else if (event === "SIGNED_OUT") {
          currentStudent = null;
          tasks = [];
          posts = [];

          $("#painelAluno").hidden = true;
          $("#painelLogin").hidden = false;
          $("#btnSair").hidden = true;
        }
      }
    );

    if (error) {
      console.error(
        "[SchoolLink] Erro no observador de sessão:",
        error
      );
    }

    authSubscription = data?.subscription || null;
  }

  async function restoreSession() {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (data.session?.user) {
        await handleSession(data.session.user);
      }

    } catch (error) {
      console.error(
        "[SchoolLink] Erro ao restaurar sessão:",
        error
      );

      showError(
        "erroLoginAluno",
        supabaseError(error)
      );
    }
  }

  // --------------------------------------------------
  // BOTÃO SAIR
  // --------------------------------------------------

  $("#btnSair").addEventListener("click", exit);

  // --------------------------------------------------
  // NAVEGAÇÃO DO PAINEL
  // --------------------------------------------------

  $$("[data-secao]").forEach(btn => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.secao);
    });
  });

  $$("[data-ir]").forEach(btn => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.ir);
    });
  });

  // --------------------------------------------------
  // TAREFAS PESSOAIS
  // --------------------------------------------------

  $("#formNovaTarefa").addEventListener("submit", e => {
    e.preventDefault();

    if (!currentStudent) return;

    const title =
      $("#tituloTarefa").value.trim();

    if (!title) return;

    tasks.push({
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(),
      title,
      due: $("#prazoTarefa").value,
      done: false
    });

    writeTasks();

    $("#formNovaTarefa").reset();

    renderAll();
  });

  // CONCLUIR TAREFA

  $("#listaTarefas").addEventListener(
    "change",
    e => {
      const id = e.target.dataset.task;

      if (!id || !currentStudent) return;

      tasks = tasks.map(t =>
        t.id === id
          ? { ...t, done: e.target.checked }
          : t
      );

      writeTasks();
      renderAll();
    }
  );

  // EXCLUIR TAREFA

  $("#listaTarefas").addEventListener(
    "click",
    e => {
      const id = e.target.dataset.removeTask;

      if (!id || !currentStudent) return;

      tasks = tasks.filter(t => t.id !== id);

      writeTasks();
      renderAll();
    }
  );

  // FILTRO DE DISCIPLINAS

  $("#filtroDisciplina").addEventListener(
    "change",
    renderContents
  );

  // --------------------------------------------------
  // INICIALIZAÇÃO
  // --------------------------------------------------

  async function init() {
    setupAttachmentViewer();

    if (!supabaseReady()) {
      console.error(
        "[SchoolLink] Supabase não inicializado. Confira supabase-config.js e supabase-init.js."
      );

      showError(
        "erroLoginAluno",
        "Não foi possível conectar ao serviço de autenticação."
      );

      return;
    }

    setupAuthObserver();

    await Promise.all([
      carregarTurmasCadastro(),
      restoreSession()
    ]);

    renderAll();

    console.log(
      "[SchoolLink] Área do aluno inicializada com Supabase."
    );
  }

  init();

})();
