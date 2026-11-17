
(() => {
  "use strict";

  const SUPABASE_URL =
    "https://rlgdylavuiljbctnvscd.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_itHql7RT_VWV_OHn9RjGLw_Jd4KVqDa";

  const FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/schoollink-cadastro`;

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

  const supabase = window.schoollinkSupabase;

  let currentUser = null;

  function showSection(section) {
    sections.forEach(id => {
      const element = $(id);
      if (element) {
        element.classList.toggle("hidden", id !== section);
      }
    });
  }

  function showMessage(element, message, type = "") {
    element.textContent = message;
    element.className = `message ${type}`;
  }

  function denyAccess(message) {
    $("accessMessage").textContent = message;
    showSection("accessDenied");
  }

  // ======================================
  // AUTENTICAÇÃO E SESSÃO
  // ======================================

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
      throw new Error("Sua sessão expirou. Entre novamente.");
    }

    return data.session.access_token;
  }

  // ======================================
  // COMUNICAÇÃO COM A EDGE FUNCTION
  // ======================================

  async function callFunction(payload) {
    const token = await getAccessToken();

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
        result.error || "Não foi possível concluir a operação."
      );
    }

    return result;
  }

  // ======================================
  // VERIFICAÇÃO DO GESTOR
  // ======================================

  async function verifyManager(user) {
    const { data, error } = await supabase
      .from("perfis")
      .select("id, nome, papel, ativo")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[SchoolLink] Erro ao consultar perfil:", error);
      throw new Error("Não foi possível verificar suas permissões.");
    }

    return (
      data &&
      data.ativo === true &&
      data.papel === "gestor"
    );
  }

  async function initializePage() {
    try {
      if (!supabase || !window.schoollinkSupabaseReady) {
        throw new Error("Supabase não foi inicializado.");
      }

      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        denyAccess(
          "Entre primeiro na sua conta de gestão do SchoolLink."
        );
        return;
      }

      currentUser = data.user;

      const authorized = await verifyManager(currentUser);

      if (!authorized) {
        denyAccess("Sua conta não possui permissão de gestor.");
        return;
      }

      showSection("adminSection");

    } catch (error) {
      console.error("[SchoolLink Cadastro]", error);
      denyAccess(error.message);
    }
  }

  // ======================================
  // ALTERNÂNCIA DAS ABAS
  // ======================================

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
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
  // CADASTRO DE PROFESSOR OU GESTOR
  // ======================================

  function registerAccount({
    formId,
    nameId,
    emailId,
    passwordId,
    confirmId,
    messageId,
    buttonText,
    papel,
    roleLabel
  }) {
    const form = $(formId);
    const message = $(messageId);

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const button = event.submitter;

      if (!currentUser) {
        showMessage(message, "Sessão não encontrada.", "error");
        return;
      }

      const nome = $(nameId).value.trim();
      const email = $(emailId).value.trim();
      const senha = $(passwordId).value;
      const confirmacao = $(confirmId).value;

      showMessage(message, "");

      if (!nome || !email || !senha || !confirmacao) {
        showMessage(
          message,
          "Preencha todos os campos.",
          "error"
        );
        return;
      }

      if (senha.length < 10 || senha.length > 128) {
        showMessage(
          message,
          "A senha inicial deve ter entre 10 e 128 caracteres.",
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
        const result = await callFunction({
          nome,
          email,
          senha,
          papel
        });

        showMessage(
          message,
          result.message ||
            `${roleLabel} cadastrado com sucesso.`,
          "success"
        );

        form.reset();

      } catch (error) {
        console.error("[SchoolLink Cadastro]", error);

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
    papel: "professor",
    roleLabel: "Professor"
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
    papel: "gestor",
    roleLabel: "Gestor"
  });

  // ======================================
  // ALTERAÇÃO DA SENHA DA CONTA ATUAL
  // ======================================

  $("changePasswordForm").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const button = event.submitter;

      const atual = $("currentPassword").value;
      const nova = $("newPassword").value;
      const confirmacao = $("confirmNewPassword").value;

      showMessage($("passwordMessage"), "");

      if (!atual || !nova || !confirmacao) {
        showMessage(
          $("passwordMessage"),
          "Preencha todos os campos.",
          "error"
        );
        return;
      }

      if (nova !== confirmacao) {
        showMessage(
          $("passwordMessage"),
          "As novas senhas não coincidem.",
          "error"
        );
        return;
      }

      if (nova.length < 10 || nova.length > 128) {
        showMessage(
          $("passwordMessage"),
          "A nova senha precisa ter entre 10 e 128 caracteres.",
          "error"
        );
        return;
      }

      button.disabled = true;
      button.textContent = "Alterando...";

      try {
        // Confirma a senha atual reautenticando a conta.
        const { error: loginError } =
          await supabase.auth.signInWithPassword({
            email: currentUser.email,
            password: atual
          });

        if (loginError) {
          throw new Error("A senha atual está incorreta.");
        }

        const { error: updateError } =
          await supabase.auth.updateUser({
            password: nova
          });

        if (updateError) {
          throw updateError;
        }

        $("changePasswordForm").reset();

        showMessage(
          $("passwordMessage"),
          "Senha da sua conta alterada com sucesso.",
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
    try {
      await supabase.auth.signOut();
      window.location.href = "index.html";
    } catch (error) {
      console.error("[SchoolLink] Erro ao sair:", error);
    }
  });

  $("backButton").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // ======================================
  // INICIALIZAÇÃO
  // ======================================

  if (!supabase || !window.schoollinkSupabaseReady) {
    denyAccess(
      "Não foi possível inicializar o Supabase. Verifique os arquivos de configuração."
    );
    return;
  }

  initializePage();

})();
