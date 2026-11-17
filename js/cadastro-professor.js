
(() => {
  "use strict";

  const SUPABASE_URL =
    "https://rlgdylavuiljbctnvscd.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_itHql7RT_VWV_OHn9RjGLw_Jd4KVqDa";

  const FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/schoollink-cadastro-professor`;

  const $ = id => document.getElementById(id);

  const sections = [
    "loading",
    "accessDenied",
    "securitySection",
    "adminSection"
  ];

  let currentUser = null;
  let securityUnlocked = false;

  function showSection(section) {
    sections.forEach(id => {
      $(id).classList.toggle("hidden", id !== section);
    });
  }

  function showMessage(element, message, type = "") {
    element.textContent = message;
    element.className = `message ${type}`;
  }

  async function getFirebaseToken() {
    if (!currentUser) {
      throw new Error("Você não está autenticado.");
    }

    return currentUser.getIdToken();
  }

  async function callFunction(payload) {
    const token = await getFirebaseToken();

    const response = await fetch(FUNCTION_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`
      },

      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.erro || "Não foi possível concluir a operação."
      );
    }

    return result;
  }

  function denyAccess(message) {
    $("accessMessage").textContent = message;
    showSection("accessDenied");
  }

  async function verifyManager(user) {
    const profile = await window.schoollinkDb
      .collection("perfis")
      .doc(user.uid)
      .get();

    if (!profile.exists) {
      return false;
    }

    const data = profile.data();

    return (
      data.ativo === true &&
      data.papel === "gestor"
    );
  }

  async function initializePage(user) {
    try {
      if (!window.schoollinkFirebaseReady) {
        throw new Error(
          window.schoollinkFirebaseError ||
          "Firebase não foi inicializado."
        );
      }

      if (!user) {
        denyAccess(
          "Entre primeiro na sua conta de gestão do SchoolLink."
        );
        return;
      }

      currentUser = user;

      const authorized = await verifyManager(user);

      if (!authorized) {
        denyAccess(
          "Sua conta não possui permissão de gestor."
        );
        return;
      }

      showSection("securitySection");

    } catch (error) {
      console.error("[SchoolLink Cadastro]", error);
      denyAccess(error.message);
    }
  }

  // Validação da senha de segurança
  $("securityForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = event.submitter;
    const password = $("securityPassword").value;

    showMessage($("securityMessage"), "");

    button.disabled = true;
    button.textContent = "Verificando...";

    try {
      await callFunction({
        acao: "validar_senha",
        senhaSeguranca: password
      });

      securityUnlocked = true;

      $("securityPassword").value = "";

      showSection("adminSection");

    } catch (error) {
      showMessage(
        $("securityMessage"),
        error.message,
        "error"
      );

    } finally {
      button.disabled = false;
      button.textContent = "Desbloquear acesso";
    }
  });

  // Alternância das abas
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (!securityUnlocked) return;

      document.querySelectorAll(".tab").forEach(item => {
        item.classList.toggle("active", item === tab);
      });

      $("registerTab").classList.toggle(
        "hidden",
        tab.dataset.tab !== "register"
      );

      $("passwordTab").classList.toggle(
        "hidden",
        tab.dataset.tab !== "password"
      );
    });
  });

  // Cadastro de professor
  $("registerForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!securityUnlocked) return;

    const button = event.submitter;

    const nome = $("teacherName").value.trim();
    const email = $("teacherEmail").value.trim();
    const senha = $("teacherPassword").value;
    const confirmacao = $("teacherPasswordConfirm").value;

    showMessage($("registerMessage"), "");

    if (senha !== confirmacao) {
      showMessage(
        $("registerMessage"),
        "As senhas não coincidem.",
        "error"
      );
      return;
    }

    button.disabled = true;
    button.textContent = "Cadastrando...";

    try {
      const result = await callFunction({
        acao: "cadastrar_professor",
        nome,
        email,
        senhaInicial: senha,
        senhaSeguranca: await getSecurityPassword()
      });

      showMessage(
        $("registerMessage"),
        result.mensagem,
        "success"
      );

      $("registerForm").reset();

    } catch (error) {
      showMessage(
        $("registerMessage"),
        error.message,
        "error"
      );

    } finally {
      button.disabled = false;
      button.textContent = "Cadastrar professor";
    }
  });

  // A senha não fica armazenada no navegador.
  // Ela é solicitada novamente antes de cada cadastro.
  async function getSecurityPassword() {
    const password = prompt(
      "Confirme a senha de segurança para cadastrar este professor:"
    );

    if (!password) {
      throw new Error("Cadastro cancelado.");
    }

    return password;
  }

  // Alteração da senha de segurança
  $("changePasswordForm").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (!securityUnlocked) return;

      const button = event.submitter;

      const atual = $("currentPassword").value;
      const nova = $("newPassword").value;
      const confirmacao = $("confirmNewPassword").value;

      showMessage($("passwordMessage"), "");

      if (nova !== confirmacao) {
        showMessage(
          $("passwordMessage"),
          "As novas senhas não coincidem.",
          "error"
        );
        return;
      }

      if (nova.length < 12) {
        showMessage(
          $("passwordMessage"),
          "A nova senha precisa ter pelo menos 12 caracteres.",
          "error"
        );
        return;
      }

      button.disabled = true;
      button.textContent = "Alterando...";

      try {
        await callFunction({
          acao: "alterar_senha",
          senhaAtual: atual,
          novaSenha: nova
        });

        $("changePasswordForm").reset();

        showMessage(
          $("passwordMessage"),
          "Senha de segurança alterada com sucesso.",
          "success"
        );

      } catch (error) {
        showMessage(
          $("passwordMessage"),
          error.message,
          "error"
        );

      } finally {
        button.disabled = false;
        button.textContent = "Alterar senha";
      }
    }
  );

  // Sair
  $("logoutButton").addEventListener("click", async () => {
    securityUnlocked = false;

    try {
      await window.schoollinkAuth.signOut();
      window.location.href = "index.html";
    } catch (error) {
      console.error(error);
    }
  });

  $("backButton").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // Inicialização
  if (
    !window.schoollinkFirebaseReady ||
    !window.schoollinkAuth ||
    !window.schoollinkDb
  ) {
    denyAccess(
      "Não foi possível inicializar o Firebase. Verifique os arquivos de configuração."
    );
    return;
  }

  window.schoollinkAuth.onAuthStateChanged(initializePage);

})();
