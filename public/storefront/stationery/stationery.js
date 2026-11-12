(() => {
  const root = '/shop/stationery';
  const back = document.querySelector('[data-stationery-product-back]');
  if (back && document.referrer && history.length > 1) {
    const previous = new URL(document.referrer);
    const previousView = previous.pathname === '/shop/cart' ? 'cart' : previous.pathname === '/shop/wishlist' ? 'wishlist' :
      (previous.pathname === root || previous.pathname.startsWith(root + '/')) &&
        !previous.pathname.startsWith(root + '/product/') ? 'stationery' : '';
    if (previous.origin === location.origin && previousView) {
      back.href = previous.href;
      back.textContent = `← Back to ${previousView}`;
      back.addEventListener('click', event => {
        if (event.button || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        history.back();
      });
    }
  }
  const hero = document.querySelector('[data-stationery-hero]');
  if (!hero) return;
  const desktop = matchMedia('(min-width: 901px)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  let pending;

  function updateLift() {
    const active = hero.dataset.group ? null : (fine.matches ? hero.querySelector('.stationery-object:hover') : null) ||
      hero.querySelector('.stationery-object:focus-visible');
    for (const layer of hero.querySelectorAll('[data-lift]')) {
      layer.classList.toggle('is-active', active?.dataset.stationeryObject === layer.dataset.lift);
    }
    const lamp = hero.querySelector('.stationery-pendant');
    const x = active?.dataset.lampX;
    if (x) {
      if (!lamp.classList.contains('is-lit')) {
        lamp.style.transition = 'none';
        lamp.style.setProperty('--lamp-x', `${x}px`);
        lamp.getBoundingClientRect();
        lamp.style.removeProperty('transition');
      } else lamp.style.setProperty('--lamp-x', `${x}px`);
    }
    lamp.classList.toggle('is-lit', Boolean(x));
  }

  for (const event of ['pointerover', 'pointerout', 'focusin', 'focusout']) {
    hero.addEventListener(event, () => requestAnimationFrame(updateLift));
  }

  async function openScene(url, key, push) {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const target = [...hero.querySelectorAll('[data-stationery-object]')]
      .find(link => link.dataset.stationeryObject === key);
    const copy = hero.querySelector('.stationery-copy');
    copy.classList.add('is-changing');
    if (target) {
      hero.dataset.side = target.dataset.side;
      hero.style.setProperty('--camera-pan', target.dataset.pan);
    }
    hero.dataset.group = key;
    updateLift();
    const skeleton = setTimeout(() => showProductSkeleton(document.querySelector('#stationery-products')), 140);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Stationery collection unavailable');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const next = page.querySelector('[data-stationery-hero]');
      const items = page.querySelector('#stationery-products');
      if (!next || !items) throw new Error('Stationery page unavailable');
      if (controller.signal.aborted) return;
      const replacement = next.querySelector('.stationery-copy');
      replacement.classList.add('is-changing');
      copy.replaceWith(replacement);
      hero.querySelector('.stationery-selected').replaceWith(next.querySelector('.stationery-selected'));
      document.querySelector('#stationery-products').replaceWith(items);
      const announcement = document.querySelector('[data-store-announcement]');
      const nextAnnouncement = page.querySelector('[data-store-announcement]');
      if (nextAnnouncement && announcement.innerHTML !== nextAnnouncement.innerHTML) {
        announcement.replaceWith(nextAnnouncement);
      }
      document.title = page.title;
      document.querySelector('link[rel="canonical"]').href = page.querySelector('link[rel="canonical"]').href;
      if (push) history.pushState({}, '', url);
      if (!key) {
        delete hero.dataset.side;
        hero.style.removeProperty('--camera-pan');
      }
      if (motion.matches) requestAnimationFrame(() => requestAnimationFrame(() => replacement.classList.remove('is-changing')));
      else replacement.classList.remove('is-changing');
      const heading = replacement.querySelector('h1');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      document.dispatchEvent(new Event('storefront:navigated'));
      updateLift();
    } catch (error) {
      if (error.name !== 'AbortError') location.assign(url);
    } finally {
      clearTimeout(skeleton);
    }
  }

  hero.addEventListener('click', event => {
    const link = event.target.closest('[data-stationery-object], [data-stationery-back]');
    if (!link || link.hasAttribute('data-full-navigation') || !desktop.matches || event.button !== 0 || event.altKey || event.ctrlKey ||
        event.metaKey || event.shiftKey) return;
    event.preventDefault();
    openScene(link.href, link.dataset.stationeryObject || '', true);
  });
  window.addEventListener('popstate', () => {
    const key = location.pathname.slice(root.length).replace(/^\//, '');
    if (location.pathname === root || [...hero.querySelectorAll('[data-stationery-object]')]
        .some(link => link.pathname === location.pathname)) {
      openScene(location.href, key, false);
    } else location.reload();
  });
})();
