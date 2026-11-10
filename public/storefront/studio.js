(() => {
  const studio = document.querySelector('#studio');
  if (!studio) return;
  const stage = studio.querySelector('.studio-stage');
  const compact = matchMedia('(max-width: 1000px)');
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  let pending;

  async function navigate(url, push = true) {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    studio.classList.add('loading-category');
    document.dispatchEvent(new CustomEvent('storefront:loading', { detail: true }));
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Category unavailable');
      const documentNext = new DOMParser().parseFromString(await response.text(), 'text/html');
      const next = documentNext.querySelector('#studio');
      if (!next) {
        location.assign(url);
        return;
      }
      if (controller.signal.aborted) return;

      const key = next.dataset.category;
      const changedCategory = key !== studio.dataset.category;
      const render = next.querySelector('.studio-render');
      studio.dataset.category = key;
      stage.querySelector('.studio-copy').replaceWith(next.querySelector('.studio-copy'));
      stage.querySelector('.studio-render').replaceWith(render);
      stage.querySelector('.studio-back').hidden = !key;
      const announcement = document.querySelector('[data-store-announcement]');
      const nextAnnouncement = documentNext.querySelector('[data-store-announcement]');
      if (announcement.querySelector('p')?.textContent !== nextAnnouncement.querySelector('p')?.textContent ||
          announcement.querySelector('a')?.getAttribute('href') !== nextAnnouncement.querySelector('a')?.getAttribute('href')) {
        announcement.replaceWith(nextAnnouncement);
      }
      studio.querySelector('.studio-content').replaceWith(next.querySelector('.studio-content'));

      document.title = documentNext.title;
      for (const selector of ['link[rel="canonical"]', 'meta[name="description"]', 'meta[name="robots"]']) {
        document.querySelector(selector)?.remove();
        const element = documentNext.querySelector(selector);
        if (element) document.head.append(element);
      }
      document.querySelectorAll('script[type="application/ld+json"]').forEach(element => element.remove());
      documentNext.querySelectorAll('script[type="application/ld+json"]').forEach(element => document.head.append(element));
      if (push) history.pushState({}, '', url);
      document.querySelectorAll('details[open]').forEach(detail => detail.open = false);
      if (changedCategory && compact.matches && motion.matches) {
        (key ? render : stage.querySelector('.studio-objects')).animate(
          [{ transform: 'scale(.92)', opacity: .5 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: 330, easing: 'ease-out' });
      }
      const title = stage.querySelector('h1');
      studio.querySelector('#scene-status').textContent = key ? title.textContent + ' selected.' : 'All eight categories.';
      document.dispatchEvent(new Event('storefront:navigated'));
      const results = new URL(url, location.href).search && studio.querySelector('.studio-content .page');
      if (results) results.scrollIntoView({ block: 'start', behavior: 'instant' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
      const focus = results?.querySelector?.('h1') || title;
      focus.tabIndex = -1;
      focus.focus({ preventScroll: true });
    } catch (error) {
      if (error.name !== 'AbortError') location.assign(url);
    } finally {
      if (pending === controller) {
        studio.classList.remove('loading-category');
        document.dispatchEvent(new CustomEvent('storefront:loading', { detail: false }));
      }
    }
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-studio-link], #studio .pagination a');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.href);
  });
  document.addEventListener('submit', event => {
    if (!event.target.matches('.studio-content .filters')) return;
    event.preventDefault();
    const parameters = new URLSearchParams(new FormData(event.target));
    for (const [key, value] of [...parameters]) if (!value) parameters.delete(key);
    navigate(event.target.action + '?' + parameters);
  });
  window.addEventListener('popstate', () => {
    if (location.pathname === '/shop' || /^\/shop\/category\/[^/]+$/.test(location.pathname)) {
      navigate(location.href, false);
    } else location.reload();
  });
})();

