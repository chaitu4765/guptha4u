(() => {
  try {
    const arrival = sessionStorage.getItem('gupta:department-arrival');
    sessionStorage.removeItem('gupta:department-arrival');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (arrival === document.body.dataset.department) {
      document.body.classList.add('department-arrival');
      setTimeout(() => document.body.classList.remove('department-arrival'), 550);
      return;
    }
    if (sessionStorage.getItem('gupta:opened')) return;
    sessionStorage.setItem('gupta:opened', '1');
  } catch { return; }
  const loader = document.querySelector('[data-studio-loading]');
  loader.dataset.loadingMode = 'opening';
  loader.classList.add('is-painting');
  loader.hidden = false;
  setTimeout(() => {
    if (loader.dataset.loadingMode === 'opening') loader.hidden = true;
  }, 5200);
})();
