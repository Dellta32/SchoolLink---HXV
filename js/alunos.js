
/* SchoolLink HXV — Área do aluno
 * Firebase Authentication + Firestore
 * Supabase Storage: imagens e arquivos das publicações.
 * Tarefas pessoais: localStorage por UID.
 */
(() => {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const EMAIL_DOMAIN = "@estudante.rn.gov.br";
  const TASKS_PREFIX = "schoollink_tarefas_";

  let posts = [];
  let currentStudent = null;
  let tasks = [];
  let activeSection = "visao-geral";
  let suppressAuthObserver = false;

  // SEGURANÇA E UTILITÁRIOS

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

    localStorage.setItem(
      TASKS_PREFIX + currentStudent.uid,
      JSON.stringify(tasks)
    );
  }

  function loadTasks(uid) {
    tasks = read(TASKS_PREFIX + uid, []);
  }

  function fmtDate(value) {
    if (!value) return "Sem data";

    const d = new Date(value + "T12:00:00");

    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function validInstitutionalEmail(email) {
    return email.toLowerCase().endsWith(EMAIL_DOMAIN);
  }

  // SISTEMA DE TURMAS

  function getTurma(id) {
    return window.SchoolLinkTurmas?.obter(id) || null;
  }

  function getTurmaId(profile) {
    const id = String(
      profile?.turmaId || profile?.turma || ""
    ).trim().toUpperCase();

    return getTurma(id) ? id : "";
  }

  // CARREGAMENTO DAS TURMAS NO CADASTRO

  function carregarTurmasCadastro() {
    const select = $("#turmaCadastroAluno");

    if (!select) {
      console.error(
        "[SchoolLink] Campo #turmaCadastroAluno não encontrado."
      );
      return;
    }

    if (!window.SchoolLinkTurmas) {
      console.error(
        "[SchoolLink] Catálogo SchoolLinkTurmas não foi carregado."
      );

      select.innerHTML =
        '<option value="">Erro ao carregar turmas</option>';

      return;
    }

    window.SchoolLinkTurmas.preencherSelect(
      select,
      "Selecione sua turma"
    );

    console.log(
      "[SchoolLink] Turmas carregadas:",
      window.SchoolLinkTurmas.listar()
    );
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

  function firebaseError(error) {
    const messages = {
      "auth/email-already-in-use":
        "Este e-mail já possui uma conta.",

      "auth/invalid-email":
        "O endereço de e-mail é inválido.",

      "auth/weak-password":
        "A senha é muito fraca. Utilize pelo menos 8 caracteres.",

      "auth/user-not-found":
        "Não encontramos uma conta com esse e-mail.",

      "auth/wrong-password":
        "E-mail ou senha incorretos.",

      "auth/invalid-credential":
        "E-mail ou senha incorretos.",

      "auth/too-many-requests":
        "Muitas tentativas. Aguarde um pouco e tente novamente.",

      "auth/network-request-failed":
        "Falha na conexão. Verifique sua internet.",

      "auth/operation-not-allowed":
        "O login por e-mail e senha não está ativado no Firebase.",

      "permission-denied":
        "O Firebase bloqueou o acesso. Verifique as regras do Firestore.",

      "failed-precondition":
        "Uma consulta precisa de um índice no Firestore. Verifique o erro no console."
    };

    return messages[error.code] ||
      error.message ||
      "Ocorreu um erro. Tente novamente.";
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

  function firebaseReady() {
    return Boolean(
      window.schoollinkFirebaseReady &&
      window.schoollinkAuth &&
      window.schoollinkDb
    );
  }

  // PUBLICAÇÕES

  function allowedForStudent(post, current) {
    if (
      post.destino === "todos" ||
      post.destino === "alunos"
    ) {
      return true;
    }

    const turmaId = getTurmaId(current || {});

    if (!turmaId) return false;

    return (
      post.destino === "turmas" &&
      Array.isArray(post.turmas) &&
      post.turmas
        .map(id => String(id).trim().toUpperCase())
        .includes(turmaId)
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

  /*
   * Carrega publicações gerais, para alunos
   * e direcionadas especificamente à turma.
   */

  async function loadPosts() {
    console.log("[SchoolLink] Iniciando loadPosts.");

    const publicacoes = window.schoollinkDb
      .collection("publicacoes");

    const consultas = [
      {
        nome: "Publicações para todos",
        consulta: publicacoes
          .where("status", "==", "ativo")
          .where("destino", "==", "todos")
      },
      {
        nome: "Publicações para alunos",
        consulta: publicacoes
          .where("status", "==", "ativo")
          .where("destino", "==", "alunos")
      }
    ];

    const turmaId = getTurmaId(currentStudent || {});

    if (turmaId) {
      consultas.push({
        nome: "Publicações da turma",
        consulta: publicacoes
          .where("status", "==", "ativo")
          .where("destino", "==", "turmas")
          .where("turmas", "array-contains", turmaId)
      });
    }

    const user = window.schoollinkAuth.currentUser;

    if (user) {
      await user.getIdToken(true);

      const token = await user.getIdTokenResult();

      console.log(
        "[SchoolLink] E-mail verificado no token:",
        token.claims.email_verified
      );
    }

    const unicas = new Map();

    for (const item of consultas) {
      try {
        console.log(
          "[SchoolLink] Testando consulta:",
          item.nome
        );

        const snap = await item.consulta.get();

        console.log(
          "[SchoolLink] Consulta autorizada:",
          item.nome,
          "Documentos:",
          snap.size
        );

        snap.docs.forEach(doc => {
          const data = doc.data();

          unicas.set(doc.id, {
            id: doc.id,
            ...data,
            criado: data.criadoEm?.toMillis?.() || 0
          });
        });

      } catch (error) {
        console.error(
          "[SchoolLink] Consulta bloqueada:",
          item.nome,
          {
            codigo: error.code,
            mensagem: error.message
          }
        );

        throw error;
      }
    }

    posts = [...unicas.values()]
      .sort((a, b) => b.criado - a.criado);

    console.log(
      "[SchoolLink] Publicações carregadas:",
      posts.length
    );
  }

  // ÍCONES DAS PUBLICAÇÕES

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

  // ANEXOS DAS PUBLICAÇÕES

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
          ).toLowerCase();

          const url = String(
            arquivo.url || ""
          ).trim();

          // Aceita somente URLs HTTP ou HTTPS.
          if (!/^https?:\/\//i.test(url)) {
            console.warn(
              "[SchoolLink] Anexo sem URL válida:",
              arquivo.nome
            );
            return "";
          }

          const safeUrl = escapeHtml(url);

          // IMAGENS

          if (tipo.startsWith("image/")) {
            return `
              <div class="area-anexo area-anexo--imagem">

                <a
                  href="${safeUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Abrir imagem ${nome}"
                >
                  <img
                    src="${safeUrl}"
                    alt="${nome}"
                    loading="lazy"
                  >
                </a>

                <span>${nome}</span>

              </div>
            `;
          }

          // PDF E OUTROS ARQUIVOS

          const isPdf =
            tipo === "application/pdf" ||
            nome.toLowerCase().endsWith(".pdf");

          const isPptx =
            tipo.includes("presentation") ||
            nome.toLowerCase().endsWith(".pptx");

          const formato = isPdf
            ? "PDF"
            : isPptx
              ? "PPTX"
              : "ARQUIVO";

          return `
            <a
              class="area-anexo area-anexo--arquivo"
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
          `;
        }).join("")}
      </div>
    `;
  }

  // CARTÃO DE PUBLICAÇÃO

  function postCard(post) {
    let due = "";

    if (post.data) {
      due =
        "<span>Prazo/data: " +
        escapeHtml(fmtDate(post.data)) +
        "</span>";
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
            }">${escapeHtml(post.tipo)}</span>

            <span>${escapeHtml(post.disciplina || "Geral")}</span>

            ${due}

          </div>

        </div>

      </article>
    `;
  }

  // RENDERIZAÇÃO

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
        >Excluir</button>

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

  // NAVEGAÇÃO

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

  // ENTRAR NA ÁREA DO ALUNO

  function enter(current) {
    currentStudent = current;

    loadTasks(current.uid);

    $("#painelLogin").hidden = true;
    $("#painelAluno").hidden = false;
    $("#btnSair").hidden = false;

    $("#nomeAluno").textContent =
      current.nome || "estudante";

    $("#turmaAluno").textContent =
      `${current.turma
        ? "Turma " + current.turma
        : "Área do estudante"
      } · materiais e comunicados da escola`;

    $("#dataHoje").textContent =
      new Date().toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short"
      });

    showSection("visao-geral");
    renderAll();
  }

  // SAIR DA CONTA

  async function exit() {
    currentStudent = null;
    tasks = [];
    posts = [];

    $("#painelLogin").hidden = false;
    $("#painelAluno").hidden = true;
    $("#btnSair").hidden = true;

    showLogin();

    try {
      await window.schoollinkAuth.signOut();
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  }

  // ABRIR E FECHAR CADASTRO

  $("#abrirCadastroAluno").addEventListener(
    "click",
    showRegister
  );

  $("#voltarLoginAluno").addEventListener(
    "click",
    showLogin
  );

  // CADASTRO DE ESTUDANTE

  $("#formCadastroAluno").addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      clearError("erroCadastroAluno");

      if (!firebaseReady()) {
        showError(
          "erroCadastroAluno",
          window.schoollinkFirebaseError ||
            "O Firebase não está configurado corretamente."
        );
        return;
      }

      const nome =
        $("#nomeCadastroAluno").value.trim();

      const turma =
        $("#turmaCadastroAluno").value.trim().toUpperCase();

      const email =
        $("#emailCadastroAluno").value.trim().toLowerCase();

      const senha =
        $("#senhaCadastroAluno").value;

      const confirmacao =
        $("#confirmarSenhaAluno").value;

      if (!validInstitutionalEmail(email)) {
        showError(
          "erroCadastroAluno",
          "Utilize seu e-mail institucional terminado em @estudante.rn.gov.br."
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

      if (!getTurma(turma)) {
        showError(
          "erroCadastroAluno",
          "Selecione uma turma válida."
        );
        return;
      }

      const button = e.submitter;

      button.disabled = true;
      button.textContent = "Criando conta...";

      suppressAuthObserver = true;

      try {
        const credential = await window.schoollinkAuth
          .createUserWithEmailAndPassword(email, senha);

        const user = credential.user;

        await user.updateProfile({
          displayName: nome
        });

        await window.schoollinkDb
          .collection("perfis")
          .doc(user.uid)
          .set({
            uid: user.uid,
            nome,
            turmaId: turma,
            turma,
            email,
            papel: "aluno",
            criadoEm:
              firebase.firestore.FieldValue.serverTimestamp()
          });

        await user.sendEmailVerification();

        await window.schoollinkAuth.signOut();

        showLogin();

        $("#emailAluno").value = email;
        $("#senhaAluno").value = "";

        showError(
          "erroLoginAluno",
          "Conta criada! Enviamos um link de verificação para seu e-mail institucional. Confirme o endereço antes de entrar."
        );

        $("#formCadastroAluno").reset();

      } catch (error) {
        console.error("[SchoolLink] Erro no cadastro:", error);

        showError(
          "erroCadastroAluno",
          firebaseError(error)
        );

        if (window.schoollinkAuth.currentUser) {
          await window.schoollinkAuth.signOut().catch(() => {});
        }

      } finally {
        suppressAuthObserver = false;
        button.disabled = false;
        button.textContent = "Criar minha conta";
      }
    }
  );

  // LOGIN DO ESTUDANTE

  $("#formLoginAluno").addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      clearError("erroLoginAluno");

      if (!firebaseReady()) {
        showError(
          "erroLoginAluno",
          window.schoollinkFirebaseError ||
            "Configure o Firebase antes de entrar."
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
          "Utilize seu e-mail institucional @estudante.rn.gov.br."
        );
        return;
      }

      const button = e.submitter;

      button.disabled = true;
      button.textContent = "Entrando...";

      suppressAuthObserver = true;

      try {
        const credential = await window.schoollinkAuth
          .signInWithEmailAndPassword(email, senha);

        const user = credential.user;

        if (!user.emailVerified) {
          await user.sendEmailVerification();
          await window.schoollinkAuth.signOut();

          showError(
            "erroLoginAluno",
            "Seu e-mail ainda não foi verificado. Enviamos um novo link de confirmação. Verifique sua caixa de entrada."
          );

          return;
        }

        console.log("[SchoolLink] Consultando perfil do aluno...");

        const profile = await window.schoollinkDb
          .collection("perfis")
          .doc(user.uid)
          .get();

        console.log(
          "[SchoolLink] Perfil:",
          profile.exists,
          profile.exists ? profile.data() : null
        );

        if (
          !profile.exists ||
          profile.data().papel !== "aluno"
        ) {
          throw new Error(
            "Perfil de estudante não encontrado. Entre em contato com a gestão."
          );
        }

        const data = profile.data();

        currentStudent = {
          uid: user.uid,
          nome: data.nome || user.displayName || "Estudante",
          turmaId: getTurmaId(data),
          turma: getTurmaId(data)
        };

        console.log("[SchoolLink] Iniciando carregamento das publicações...");

        await loadPosts();

        enter(currentStudent);

      } catch (error) {
        console.error("[SchoolLink] Erro no login:", {
          codigo: error.code,
          mensagem: error.message,
          erro: error
        });

        showError(
          "erroLoginAluno",
          firebaseError(error)
        );

      } finally {
        suppressAuthObserver = false;
        button.disabled = false;
        button.textContent = "Entrar";
      }
    }
  );

  // RECUPERAÇÃO DE SESSÃO

  window.schoollinkAuth?.onAuthStateChanged(
    async user => {
      if (suppressAuthObserver) return;

      if (!user) return;

      console.log("[SchoolLink] Sessão detectada:", user.uid);

      try {
        if (!user.emailVerified) {
          console.log("[SchoolLink] E-mail ainda não verificado.");
          await window.schoollinkAuth.signOut();
          return;
        }

        if (!validInstitutionalEmail(user.email || "")) {
          console.log("[SchoolLink] E-mail fora do domínio institucional.");
          await window.schoollinkAuth.signOut();
          return;
        }

        console.log("[SchoolLink] Consultando perfil da sessão...");

        const profile = await window.schoollinkDb
          .collection("perfis")
          .doc(user.uid)
          .get();

        console.log(
          "[SchoolLink] Resultado do perfil:",
          profile.exists,
          profile.exists ? profile.data() : null
        );

        if (
          !profile.exists ||
          profile.data().papel !== "aluno"
        ) {
          console.log("[SchoolLink] Perfil inexistente ou não é aluno.");
          await window.schoollinkAuth.signOut();
          return;
        }

        const data = profile.data();

        currentStudent = {
          uid: user.uid,
          nome: data.nome || user.displayName || "Estudante",
          turmaId: getTurmaId(data),
          turma: getTurmaId(data)
        };

        console.log("[SchoolLink] Iniciando consulta das publicações...");

        await loadPosts();

        console.log("[SchoolLink] Entrando na área do aluno.");

        enter(currentStudent);

      } catch (error) {
        console.error("[SchoolLink] ERRO NA RECUPERAÇÃO:", {
          codigo: error.code,
          mensagem: error.message,
          erro: error
        });

        $("#painelAluno").hidden = true;
        $("#painelLogin").hidden = false;

        showError(
          "erroLoginAluno",
          `${error.code || "Erro"}: ${error.message}`
        );
      }
    }
  );

  // BOTÃO SAIR

  $("#btnSair").addEventListener("click", exit);

  // NAVEGAÇÃO DO PAINEL

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

  // TAREFAS PESSOAIS

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

  // ESTADO INICIAL

  carregarTurmasCadastro();
  renderAll();

})();
