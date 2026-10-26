/* SchoolLink HXV — Área do aluno
 * Demonstração front-end. Não substitui autenticação nem regras de segurança do Firebase.
 */
(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const AUTH_ENDPOINT = window.SCHOOLLINK_STUDENT_LOGIN_ENDPOINT || "";
  const TASKS = "schoollink_tarefas_demo";

  let posts = [];
  let currentStudent = null;
  function futureDate(days) { const d = new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
  function read(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function escapeHtml(value="") { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function fmtDate(value) { if (!value) return "Sem data"; const d = new Date(value+"T12:00:00"); return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}); }
  function student() { return currentStudent; }
  let tasks = read(TASKS, []);
  let activeSection = "visao-geral";

  function allowedForStudent(post, current) {
    if (post.destino === "todos" || post.destino === "alunos") return true;
    return Array.isArray(post.turmas) && post.turmas.includes(current?.turma);
  }
  function isPostVisible(post, current) {
    return post.status !== "arquivado" && allowedForStudent(post,current);
  }
  function postIcon(type) { return ({Atividade:"✓",Conteúdo:"▤",Comunicado:"!",Evento:"▦",Anúncio:"•"})[type] || "•"; }
  function postCard(post) {
    const due = post.data ? `<span>Prazo/data: ${escapeHtml(fmtDate(post.data))}</span>` : "";
    return `<article class="area-lista__item"><span class="area-lista__marcador">${postIcon(post.tipo)}</span><div class="area-lista__corpo"><h3>${escapeHtml(post.titulo)}</h3><p>${escapeHtml(post.descricao)}</p><div class="area-lista__meta"><span class="area-tag ${post.tipo==="Atividade"?"area-tag--atividade":""}">${escapeHtml(post.tipo)}</span><span>${escapeHtml(post.disciplina || "Geral")}</span>${due}</div></div></article>`;
  }
  function visiblePosts() { const current = student(); return posts.filter(p => isPostVisible(p,current)); }
  function renderHome() {
    const visible = visiblePosts();
    const activities = visible.filter(p => p.tipo === "Atividade").sort((a,b) => (a.data||"9999").localeCompare(b.data||"9999"));
    const notices = visible.filter(p => ["Comunicado","Anúncio","Evento"].includes(p.tipo)).sort((a,b) => b.criado-a.criado);
    $("#totalPendentes").textContent = tasks.filter(t=>!t.done).length + activities.length;
    $("#totalProximas").textContent = activities.filter(p=>!p.data || p.data >= new Date().toISOString().slice(0,10)).length;
    $("#totalComunicados").textContent = notices.length;
    $("#listaProximas").innerHTML = activities.slice(0,4).map(postCard).join("") || `<p class="area-empty">Nenhuma atividade cadastrada.</p>`;
    $("#listaRecentes").innerHTML = notices.slice(0,4).map(postCard).join("") || `<p class="area-empty">Nenhum comunicado cadastrado.</p>`;
  }
  function renderTasks() {
    const personal = tasks.map(t => `<div class="area-lista__item area-tarefa-form__item ${t.done?"area-tarefa-form__item--feito":""}"><input type="checkbox" data-task="${escapeHtml(t.id)}" ${t.done?"checked":""} aria-label="Concluir ${escapeHtml(t.title)}"><div class="area-lista__corpo"><h3>${escapeHtml(t.title)}</h3><p>${t.due ? "Prazo: "+escapeHtml(fmtDate(t.due)) : "Lembrete pessoal"} </p></div><button class="area-mini-button area-mini-button--danger" data-remove-task="${escapeHtml(t.id)}" type="button">Excluir</button></div>`).join("");
    const school = visiblePosts().filter(p=>p.tipo==="Atividade").map(postCard).join("");
    $("#listaTarefas").innerHTML = personal + school || `<p class="area-empty">Você ainda não tem tarefas. Adicione um lembrete acima.</p>`;
  }
  function renderCalendar() {
    const items = visiblePosts().filter(p=>p.data).sort((a,b)=>a.data.localeCompare(b.data));
    $("#listaCalendario").innerHTML = items.map(postCard).join("") || `<p class="area-empty">Nenhuma data publicada.</p>`;
  }
  function renderContents() {
    const items = visiblePosts().filter(p=>p.tipo==="Conteúdo");
    const disciplines = [...new Set(items.map(p=>p.disciplina||"Geral"))].sort();
    const select = $("#filtroDisciplina");
    const previous = select.value;
    select.innerHTML = `<option value="todas">Todas as disciplinas</option>` + disciplines.map(d=>`<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
    if (disciplines.includes(previous)) select.value = previous;
    const chosen = select.value;
    const filtered = items.filter(p=>chosen==="todas" || (p.disciplina||"Geral")===chosen);
    $("#listaConteudos").innerHTML = filtered.map(p=>`<article class="area-conteudo"><div class="area-conteudo__topo"><span class="area-conteudo__icone">▤</span><div><h3>${escapeHtml(p.titulo)}</h3><p>${escapeHtml(p.disciplina||"Geral")}</p></div></div><p>${escapeHtml(p.descricao)}</p><div class="area-conteudo__rodape"><span>Publicado no SchoolLink</span><span class="area-tag">Material</span></div></article>`).join("") || `<p class="area-empty">Não há conteúdos para esse filtro.</p>`;
  }
  function renderNotices() {
    $("#listaComunicados").innerHTML = visiblePosts().filter(p=>["Comunicado","Anúncio","Evento"].includes(p.tipo)).sort((a,b)=>b.criado-a.criado).map(postCard).join("") || `<p class="area-empty">Nenhum comunicado publicado.</p>`;
  }
  function renderAll() { renderHome(); renderTasks(); renderCalendar(); renderContents(); renderNotices(); }
  function showSection(name) {
    activeSection = name;
    $$("[data-painel]").forEach(el=>el.classList.toggle("is-visible",el.dataset.painel===name));
    $$("[data-secao]").forEach(btn=>{const active=btn.dataset.secao===name;btn.classList.toggle("is-active",active);btn.setAttribute("aria-selected",String(active));});
    if (name==="conteudos") renderContents();
  }
  function enter(current) {
    $("#painelLogin").hidden = true;
    $("#painelAluno").hidden = false;
    $("#btnSair").hidden = false;
    $("#nomeAluno").textContent = current.nome || "estudante";
    $("#turmaAluno").textContent = `${current.turma ? "Turma "+current.turma : "Área do estudante"} · materiais e comunicados da escola`;
    $("#dataHoje").textContent = new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});
    renderAll();
  }
  function exit() {
    currentStudent = null;
    if (window.schoollinkAuth) window.schoollinkAuth.signOut().catch(()=>{});
    $("#painelLogin").hidden = false; $("#painelAluno").hidden = true; $("#btnSair").hidden = true;
  }

  $("#formLoginAluno").addEventListener("submit", async e => {
    e.preventDefault();
    const matricula = $("#matriculaAluno").value.trim();
    const codigo = $("#codigoAluno").value.trim();
    const err = $("#erroLoginAluno"); err.hidden = true;
    if (!window.schoollinkFirebaseReady) { err.textContent = window.schoollinkFirebaseError || "Configure o Firebase antes de entrar."; err.hidden = false; return; }
    if (!AUTH_ENDPOINT) { err.textContent = "A autenticação por matrícula e código precisa do endpoint seguro (Cloud Function) definido em SCHOOLLINK_STUDENT_LOGIN_ENDPOINT. Nenhuma credencial é salva neste navegador."; err.hidden = false; return; }
    try {
      const response = await fetch(AUTH_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matricula, codigo }) });
      const result = await response.json();
      if (!response.ok || !result.customToken || !result.nome || !result.turma) throw new Error(result.message || "Matrícula ou código inválido.");
      const credential = await window.schoollinkAuth.signInWithCustomToken(result.customToken);
      currentStudent = { nome: result.nome, turma: result.turma, uid: credential.user.uid };
      await loadPosts(); enter(currentStudent);
    } catch (ex) { err.textContent = ex.message || "Não foi possível autenticar. Tente novamente."; err.hidden = false; }
  });
  async function loadPosts() {
    const snap = await window.schoollinkDb.collection("publicacoes").where("status", "==", "ativo").get();
    posts = snap.docs.map(d => ({ id: d.id, ...d.data(), criado: d.data().criadoEm?.toMillis?.() || 0 })).sort((a,b)=>b.criado-a.criado);
  }
  window.schoollinkAuth?.onAuthStateChanged(async user => {
    if (!user) return;
    try {
      const doc = await window.schoollinkDb.collection("perfis").doc(user.uid).get();
      if (doc.exists && doc.data().papel === "aluno") {
        currentStudent = { uid: user.uid, nome: doc.data().nome || "Estudante", turma: doc.data().turma || "" };
        await loadPosts(); enter(currentStudent);
      }
    } catch (ex) { console.error("Falha ao carregar perfil/publicações", ex); }
  });
  $("#btnSair").addEventListener("click", exit);
  $$("[data-secao]").forEach(btn=>btn.addEventListener("click",()=>showSection(btn.dataset.secao)));
  $$("[data-ir]").forEach(btn=>btn.addEventListener("click",()=>showSection(btn.dataset.ir)));
  $("#formNovaTarefa").addEventListener("submit",e=>{
    e.preventDefault();
    tasks.push({id:Date.now().toString(),title:$("#tituloTarefa").value.trim(),due:$("#prazoTarefa").value,done:false});
    write(TASKS,tasks); $("#formNovaTarefa").reset(); renderAll();
  });
  $("#listaTarefas").addEventListener("change",e=>{
    const id=e.target.dataset.task; if(!id) return;
    tasks=tasks.map(t=>t.id===id?{...t,done:e.target.checked}:t); write(TASKS,tasks); renderAll();
  });
  $("#listaTarefas").addEventListener("click",e=>{
    const id=e.target.dataset.removeTask; if(!id) return;
    tasks=tasks.filter(t=>t.id!==id); write(TASKS,tasks); renderAll();
  });
  $("#filtroDisciplina").addEventListener("change",renderContents);

  renderAll();
})();
