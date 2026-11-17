
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

  const tabs = {
    register: $("registerTab"),
    manager: $("managerTab"),
    password: $("passwordTab")
  };

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

  // ======================================
  // VALIDAÇÃO DA SENHA DE SEGURANÇA
  // ======================================

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

  // ======================================
  // ALTERNÂNCIA DAS ABAS
  // ======================================

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (!securityUnlocked) return;

      const selectedTab = tab.dataset.tab;

      if (!tabs[selectedTab]) return;

      document.querySelectorAll(".tab").forEach(item => {
        item.classList.toggle("active", item === tab);
      });

      Object.entries(tabs).forEach(([name, section]) => {
        section.classList.toggle(
          "hidden",
          name !== selectedTab
        );
      });
    });
  });

  // ======================================
  // SOLICITAR SENHA DE SEGURANÇA
  // ======================================

  async function getSecurityPassword(roleLabel) {
    const password = prompt(
      `Confirme a senha de segurança para cadastrar ${roleLabel}:`
    );

    if (!password) {
      throw new Error("Cadastro cancelado.");
    }

    return password;
  }

  // ======================================
  // CADASTRO DE PROFESSOR OU GESTOR
  // ======================================

  async function registerAccount({
    formId,
    nameId,
    emailId,
    passwordId,
    confirmId,
    messageId,
    buttonText,
    action,
    roleLabel
  }) {
    const form = $(formId);
    const message = $(messageId);

    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!securityUnlocked) return;

      const button = event.submitter;

      const nome = $(nameId).value.trim();
      const email = $(emailId).value.trim();
      const senha = $(passwordId).value;
      const confirmacao = $(confirmId).value;

      showMessage(message, "");

      if (!nome || !email || !senha) {
        showMessage(
          message,
          "Preencha todos os campos.",
          "error"
        );
        return;
      }

      if (senha.length < 8 || senha.length > 128) {
        showMessage(
          message,
          "A senha inicial deve ter entre 8 e 128 caracteres.",
          "error"
        );
        return;
      }

      if (senha !== confirmacao) {
        showMessage(
          message,
          "As senhas não coincidem.",
          "error"
        );
        return;
      }

      button.disabled = true;
      button.textContent = "Cadastrando...";

      try {
        const senhaSeguranca =
          await getSecurityPassword(roleLabel);

        const result = await callFunction({
          acao: action,
          nome,
          email,
          senhaInicial: senha,
          senhaSeguranca
        });

        showMessage(
          message,
          result.mensagem ||
            `${roleLabel} cadastrado com sucesso.`,
          "success"
        );

        form.reset();

      } catch (error) {
        showMessage(
          message,
          error.message,
          "error"
        );

      } finally {
        button.disabled = false;
        button.textContent = buttonText;
      }
    });
  }

  // Cadastro de professor
  registerAccount({
    formId: "registerForm",
    nameId: "teacherName",
    emailId: "teacherEmail",
    passwordId: "teacherPassword",
    confirmId: "teacherPasswordConfirm",
    messageId: "registerMessage",
    buttonText: "Cadastrar professor",
    action: "cadastrar_professor",
    roleLabel: "este professor"
  });

  // Cadastro de gestor
  registerAccount({
    formId: "managerForm",
    nameId: "managerName",
    emailId: "managerEmail",
    passwordId: "managerPassword",
    confirmId: "managerPasswordConfirm",
    messageId: "managerMessage",
    buttonText: "Cadastrar gestor",
    action: "cadastrar_gestor",
    roleLabel: "este gestor"
  });

  // ======================================
  // ALTERAÇÃO DA SENHA DE SEGURANÇA
  // ======================================

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

      if (nova.length < 12 || nova.length > 128) {
        showMessage(
          $("passwordMessage"),
          "A nova senha precisa ter entre 12 e 128 caracteres.",
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

  // ======================================
  // SAIR
  // ======================================

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

  // ======================================
  // INICIALIZAÇÃO
  // ======================================

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
