/* Comportamentos globais compartilhados por todas as páginas SchoolLink. */
(() => {
  const menuButton = document.querySelector('.menu-toggle');
  const primaryNav = document.querySelector('#primary-nav');

  if (menuButton && primaryNav) {
    menuButton.addEventListener('click', () => {
      const isOpen = primaryNav.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
    });

    primaryNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        primaryNav.classList.remove('is-open');
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', 'Abrir menu');
      });
    });
  }

  // Se o atalho mobile aponta para a página atual, impede recarregar e sobe ao topo.
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.mobile-nav a[data-page]').forEach(link => {
    const targetFile = (link.dataset.page || '').toLowerCase();
    const isCurrentPage = targetFile === currentFile;

    if (isCurrentPage) {
      link.setAttribute('aria-current', 'page');
      link.addEventListener('click', event => {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  });
})();
