/* Inicialização Firebase compat: Authentication, Firestore e Storage. */
(() => {
  const cfg = window.SCHOOLLINK_FIREBASE_CONFIG;
  const valid = cfg && cfg.apiKey && !cfg.apiKey.startsWith("COLE_") && cfg.projectId && !cfg.projectId.startsWith("SEU_");
  if (!valid) {
    window.schoollinkFirebaseReady = false;
    window.schoollinkFirebaseError = "Configure firebase-config.js com os dados do projeto Firebase.";
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  window.schoollinkFirebaseReady = true;
  window.schoollinkAuth = firebase.auth();
  window.schoollinkDb = firebase.firestore();
  window.schoollinkStorage = firebase.storage();
})();
