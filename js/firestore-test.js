(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const authStatus = $("authStatus"), result = $("result"), loginForm = $("loginForm"), runButton = $("runTest");
  const show = (el, message, kind="") => { el.textContent = message; el.className = "status" + (kind ? " " + kind : ""); };
  if (!window.schoollinkFirebaseReady || !window.schoollinkAuth || !window.schoollinkDb) {
    show(authStatus, window.schoollinkFirebaseError || "Firebase não foi inicializado. Confira a configuração e os SDKs.", "bad");
    show(result, "Teste não iniciado.", "bad");
    return;
  }
  window.schoollinkAuth.onAuthStateChanged(user => {
    if (user) {
      show(authStatus, "Autenticado: " + (user.email || user.uid) + ". UID: " + user.uid, "ok");
      loginForm.hidden = true;
      runButton.disabled = false;
      show(result, "Pronto para testar gravação e leitura.");
    } else {
      show(authStatus, "Nenhuma sessão ativa. Entre com a conta de teste do Authentication.", "bad");
      loginForm.hidden = false;
      runButton.disabled = true;
    }
  });
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await window.schoollinkAuth.signInWithEmailAndPassword($("email").value.trim(), $("password").value);
    } catch (error) {
      show(result, "Falha no login: " + (error.code || error.message), "bad");
    }
  });
  runButton.addEventListener("click", async () => {
    const user = window.schoollinkAuth.currentUser;
    if (!user) { show(result, "Sessão encerrada. Entre novamente.", "bad"); return; }
    runButton.disabled = true;
    show(result, "Gravando documento de teste…");
    const ref = window.schoollinkDb.collection("testes").doc(user.uid);
    try {
      await ref.set({
        mensagem: "Teste de conexão do SchoolLink HXV",
        uid: user.uid,
        email: user.email || "",
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new Error("A gravação terminou, mas o documento não foi encontrado na leitura.");
      const data = snapshot.data();
      show(result, "SUCESSO! O Firestore gravou e leu o documento. Mensagem: " + data.mensagem + ". Documento: testes/" + user.uid, "ok");
    } catch (error) {
      show(result, "Falha no teste: " + (error.code || error.message) + ". Verifique se as regras foram publicadas e se a conta está autenticada.", "bad");
    } finally {
      runButton.disabled = false;
    }
  });
})();
