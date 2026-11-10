'use strict';

const CART = 'gupta:cart';
const WISHLIST = 'gupta:wishlist';
const PENDING_ADD = 'gupta:pending-add';
const PLACEHOLDER = '/storefront/placeholder.svg';
const heart = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><path d="M20.8 8.6c0 4.7-8.8 9.4-8.8 9.4s-8.8-4.7-8.8-9.4a4.5 4.5 0 0 1 8.8-1 4.5 4.5 0 0 1 8.8 1Z"/></svg>';
const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => String(value).replace(/[&<>"']/g, character => escapes[character]);
const validId = value => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const status = document.querySelector('#store-status');
const view = document.querySelector('[data-view]');
const isCart = view?.dataset.view === 'cart';
let currentProducts = new Map();
let viewRequest = 0;
let viewReady = false;
const inMemory = new Map();
let storageWritable = true;

function saved(key) {
  if (!storageWritable && inMemory.has(key)) return inMemory.get(key);
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return JSON.parse(stored) ?? {};
  } catch {
    // Storage can be disabled or corrupted. Use session memory in that case.
  }
  return inMemory.get(key) ?? {};
}

function write(key, value) {
  inMemory.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    storageWritable = false;
    status.textContent = 'Browser storage is unavailable. Changes apply to this page.';
  }
  updateControls();
}

function cart() {
  return Object.fromEntries(Object.entries(saved(CART)).filter(([id, quantity]) =>
    validId(id) && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 10000000));
}

function wishlist() {
  const ids = saved(WISHLIST);
  return new Set(Array.isArray(ids) ? ids.map(String).filter(validId) : []);
}

function updateControls() {
  const count = Object.values(cart()).reduce((total, quantity) => total + quantity, 0);
  const badge = document.querySelector('[data-cart-count]');
  badge.textContent = count;
  badge.closest('a').setAttribute('aria-label', 'Cart, ' + count + (count === 1 ? ' item' : ' items'));
  const ids = wishlist();
  for (const button of document.querySelectorAll('[data-save]')) {
    const active = ids.has(button.dataset.save);
    button.setAttribute('aria-pressed', active);
    button.setAttribute('aria-label', (active ? 'Remove ' : 'Save ') + button.dataset.name + (active ? ' from wishlist' : ''));
  }
}

async function catalogue(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('The catalogue is temporarily unavailable.');
  return (await response.json()).products;
}

async function resolveProducts(ids) {
  const batches = [];
  for (let index = 0; index < ids.length; index += 100) {
    batches.push('/api/storefront/products?ids=' + ids.slice(index, index + 100).join(','));
  }
  const products = (await Promise.all(batches.map(catalogue))).flat();
  return new Map(products.map(p => [String(p.id), p]));
}

function formatMoney(paise) {
  const amount = BigInt(paise);
  return money.formatToParts(amount / 100n).map(part =>
    part.type === 'fraction' ? String(amount % 100n).padStart(2, '0') : part.value).join('');
}

function picture(p, width, height, loading = 'lazy') {
  const source = p?.image || PLACEHOLDER;
  const alt = source === PLACEHOLDER ? '' : p.name;
  return '<img src="' + escape(source) + '" alt="' + escape(alt) + '" width="' + width +
    '" height="' + height + '" loading="' + loading + '" decoding="async" referrerpolicy="no-referrer" data-product-image>';
}

function imageFallback(img) {
  if (img instanceof HTMLImageElement && img.hasAttribute('data-product-image') &&
      img.getAttribute('src') !== PLACEHOLDER) {
    img.alt = '';
    img.src = PLACEHOLDER;
  }
}

document.addEventListener('error', event => imageFallback(event.target), true);
for (const img of document.images) {
  if (img.complete && !img.naturalWidth) imageFallback(img);
}

function empty(title, message) {
  return '<div class="empty"><h2>' + title + '</h2><p>' + message +
    '</p><a class="button outline" href="/shop/catalogue">Browse materials</a></div>';
}

function renderSaved() {
  if (!viewReady) return;
  const quantities = cart();
  const ids = isCart ? Object.keys(quantities) : [...wishlist()];
  view.setAttribute('aria-busy', 'false');
  if (!ids.length) {
    view.innerHTML = isCart ? empty('Your cart is empty', 'Add materials from a product page.') :
      empty('Your wishlist is empty', 'Use the heart button to save a material.');
    updateControls();
    return;
  }
  let subtotal = 0n;
  let needsReview = false;
  const lines = ids.map(id => {
    const p = currentProducts.get(id);
    const name = escape(p?.name || 'Unavailable item');
    const available = p && p.stock > 0;
    const qty = quantities[id];
    const valid = isCart && available && qty <= p.stock;
    const total = valid ? BigInt(p.price) * BigInt(qty) : 0n;
    subtotal += total;
    if (isCart && !valid) needsReview = true;
    const availability = !p ? 'No longer in the catalogue' : !available ? 'Out of stock' :
      isCart && qty > p.stock ? 'Only ' + p.stock + ' in stock. Update the quantity.' : 'In stock';
    const link = p ? '<a class="cart-item-name" href="' + p.url + '">' + name + '</a>' : '<strong>' + name + '</strong>';
    const action = isCart ? 'data-remove="' + id + '"' : 'data-save="' + id + '" data-name="' + name + '"';
    const quantity = isCart && available ? '<label class="cart-quantity">Quantity<span class="sr-only"> for ' + name +
      '</span><input type="number" min="1" max="' + p.stock + '" step="1" value="' + qty +
      '" data-quantity="' + id + '" aria-invalid="' + (qty > p.stock) + '"></label>' : '';
    return '<li class="cart-line">' + picture(p, 88, 77) +
      '<div>' + link + (p ? '<p>' + formatMoney(p.price) + ' each</p>' : '') +
      '<p>' + availability + '</p><button type="button" class="remove" ' + action +
      ' aria-label="Remove ' + name + '">Remove</button></div>' + quantity +
      (valid ? '<span class="line-price">' + formatMoney(total) + '</span>' : '') + '</li>';
  }).join('');
  view.innerHTML = '<ul class="cart-lines">' + lines + '</ul>' + (isCart ?
    (needsReview ? '<p class="cart-note">Items that need review are excluded from the subtotal.</p>' : '') +
    '<div class="subtotal"><span>Subtotal</span><strong>' + formatMoney(subtotal) + '</strong></div>' +
    (view.dataset.demoCheckout === '1' && !needsReview ?
      '<div class="cart-checkout"><a class="button" href="/shop/checkout">Continue to checkout</a></div>' : '') : '');
  updateControls();
}

async function refreshSaved() {
  if (!view) return;
  const request = ++viewRequest;
  const ids = isCart ? Object.keys(cart()) : [...wishlist()];
  try {
    const products = await resolveProducts(ids);
    if (request !== viewRequest) return;
    currentProducts = products;
    viewReady = true;
    renderSaved();
  } catch {
    if (request !== viewRequest) return;
    viewReady = false;
    view.setAttribute('aria-busy', 'false');
    view.innerHTML = '<div class="empty"><h2>Catalogue unavailable</h2><p>Your saved items are still in this browser.</p><button type="button" class="button outline" data-retry>Try again</button></div>';
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-save], [data-remove], [data-retry]');
  if (!button) return;
  if (button.hasAttribute('data-retry')) {
    refreshSaved();
    return;
  }
  if (button.dataset.remove) {
    const items = cart();
    delete items[button.dataset.remove];
    write(CART, items);
    status.textContent = 'Item removed from cart.';
  } else {
    const ids = wishlist();
    const id = button.dataset.save;
    if (ids.has(id)) {
      ids.delete(id);
      status.textContent = 'Item removed from wishlist.';
    } else {
      ids.add(id);
      status.textContent = 'Item saved to wishlist.';
    }
    write(WISHLIST, [...ids]);
  }
  if (view?.contains(button)) {
    renderSaved();
    (view.querySelector('.remove, a') || view).focus();
  }
});

document.addEventListener('change', event => {
  const input = event.target.closest('[data-quantity]');
  if (!input) return;
  const id = input.dataset.quantity;
  const quantity = input.valueAsNumber;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > currentProducts.get(id)?.stock) {
    input.setCustomValidity('Enter a quantity within the available stock.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  write(CART, { ...cart(), [id]: quantity });
  renderSaved();
  view.querySelector('[data-quantity="' + id + '"]')?.focus();
  status.textContent = 'Cart quantity updated.';
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-add]');
  if (!form) return;
  event.preventDefault();
  const button = event.submitter || form.querySelector('button[type="submit"]');
  if (!button || button.disabled) return;
  const feedback = form.querySelector('[data-add-message]') || document.querySelector('#add-message');
  const id = form.dataset.add;
  const quantity = form.elements.quantity?.valueAsNumber ?? 1;
  const loader = document.createElement('span');
  loader.className = 'art-loader cart-loader';
  loader.setAttribute('aria-hidden', 'true');
  button.prepend(loader);
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  feedback.classList.remove('cart-added');
  feedback.textContent = 'Checking stock…';
  try {
    const session = await fetch('/shop/auth/session', { cache: 'no-store' });
    if (!session.ok) throw new Error('Could not check your sign-in. Try again.');
    if (!(await session.json()).signed_in) {
      const next = location.pathname + location.search;
      try { sessionStorage.setItem(PENDING_ADD, JSON.stringify({ next, id, quantity, time: Date.now() })); } catch {}
      location.assign('/shop/sign-up?' + new URLSearchParams({ next }));
      return;
    }
    const product = (await resolveProducts([id])).get(id);
    const items = cart();
    const total = (items[id] || 0) + quantity;
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || total > product.stock) {
      feedback.textContent = product?.stock > 0 ? 'Only ' + product.stock + ' in stock, including items already in your cart.' :
          'This material is currently unavailable.';
      return;
    }
    write(CART, { ...items, [id]: total });
    feedback.textContent = 'Added to your cart.';
    feedback.classList.add('cart-added');
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    loader.remove();
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});

try {
  const pending = JSON.parse(sessionStorage.getItem(PENDING_ADD));
  if (pending && Date.now() - pending.time < 600000 && validId(pending.id)) {
    const target = new URL(pending.next, location.origin);
    if (target.origin === location.origin && target.pathname.startsWith('/shop')) {
      if (location.pathname === '/shop/account') location.replace(target.href);
      else if (target.href === location.href) {
        sessionStorage.removeItem(PENDING_ADD);
        const form = document.querySelector('[data-add="' + pending.id + '"]');
        if (form?.elements.quantity) form.elements.quantity.value = pending.quantity;
        form?.requestSubmit();
      }
    }
  } else sessionStorage.removeItem(PENDING_ADD);
} catch { /* Returning to the page still lets the customer retry the add. */ }

const demoForm = document.querySelector('[data-demo-form]');
if (demoForm) {
  const isCheckout = demoForm.dataset.demoForm === 'checkout';
  const endpoint = '/api/storefront/demo/' + demoForm.dataset.demoForm;
  const error = demoForm.querySelector('[role="alert"]');
  const layout = document.querySelector('.commerce-layout');
  const result = document.querySelector('[data-demo-result]');
  const summary = document.querySelector('[data-order-summary]');
  const reviewButton = isCheckout ? demoForm.querySelector('button[type="submit"]') : null;
  let reviewed;
  let purchase;
  let busy = false;
  let cartVersion = 0;

  async function send(data) {
    let reply;
    try {
      reply = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch {
      throw new Error('Could not reach checkout. Try again.');
    }
    const body = await reply.json();
    if (!reply.ok) throw new Error(body.error || 'Checkout is temporarily unavailable.');
    return body;
  }

  function totals(quote) {
    const rows = [['Materials subtotal', quote.subtotal]];
    if (quote.savings) rows.push(['Privilege savings', -quote.savings]);
    rows.push([quote.fulfillment === 'pickup' ? 'Store pickup' : 'Delivery', quote.delivery],
      ['Tax', quote.tax], ['Total', quote.total]);
    return '<dl class="order-totals">' + rows.map(([label, amount]) =>
      '<div><dt>' + label + '</dt><dd>' + (amount < 0 ? '−' : '') +
      formatMoney(Math.abs(amount)) + '</dd></div>').join('') + '</dl>';
  }

  function orderLines(lines) {
    return '<ul class="order-lines">' + lines.map(p => '<li>' + picture(p, 48, 48, 'eager') +
      '<div><span>' + escape(p.name) + '</span><small>Qty ' + p.quantity + '</small></div>' +
      '<strong>' + formatMoney(p.total) + '</strong></li>').join('') + '</ul>';
  }

  async function showCart() {
    const version = ++cartVersion;
    const items = cart();
    const ids = Object.keys(items);
    reviewButton.disabled = true;
    try {
      const products = await resolveProducts(ids);
      if (version !== cartVersion) return;
      const valid = ids.length && ids.length <= 100 && ids.every(id => products.get(id)?.stock >= items[id]);
      if (!valid) {
        summary.innerHTML = '<p>' + (ids.length ? 'Some items need review.' : 'Your cart is empty.') +
          '</p><a class="button outline" href="' + (ids.length ? '/shop/cart' : '/shop/catalogue') +
          '">' + (ids.length ? 'Review your cart' : 'Browse materials') + '</a>';
        return;
      }
      const lines = ids.map(id => ({ ...products.get(id), quantity: items[id],
        total: BigInt(products.get(id).price) * BigInt(items[id]) }));
      const subtotal = lines.reduce((sum, p) => sum + p.total, 0n);
      summary.innerHTML = orderLines(lines) + '<dl class="order-totals"><div><dt>Materials subtotal</dt><dd>' +
        formatMoney(subtotal) + '</dd></div></dl><p>Review your order to see delivery, tax and any Privilege savings.</p>';
      reviewButton.disabled = busy;
    } catch {
      if (version === cartVersion) summary.innerHTML = '<p>Cart unavailable. Refresh to try again.</p>';
    } finally {
      if (version === cartVersion) summary.setAttribute('aria-busy', 'false');
    }
  }

  function updateFulfillment() {
    const pickup = demoForm.elements.fulfillment.value === 'pickup';
    const delivery = demoForm.querySelector('[data-delivery]');
    delivery.hidden = pickup;
    for (const input of delivery.querySelectorAll('input')) input.disabled = pickup;
    const payment = demoForm.elements.payment;
    for (const option of payment.options) {
      option.hidden = option.disabled = option.value === (pickup ? 'cod' : 'pickup');
    }
    if (payment.selectedOptions[0]?.disabled) payment.value = 'upi';
  }

  function showResult(markup) {
    layout.hidden = true;
    result.innerHTML = markup;
    result.hidden = false;
    const title = result.querySelector('h2');
    title.tabIndex = -1;
    title.focus();
    result.dispatchEvent(new CustomEvent('storefront:commerce', { bubbles: true }));
  }

  function receipt(order) {
    showResult('<p class="commerce-label">' + (order.paid ? 'Demo payment complete' : 'Demo order received') +
      '</p><h2>' + (isCheckout ? 'Order confirmed' : 'Your Privilege card is ready') + '</h2>' +
      '<p>Reference <strong>' + escape(order.reference) + '</strong></p>' +
      '<dl class="order-totals"><div><dt>' + (order.paid ? 'Simulated payment' : escape(order.payment)) +
      '</dt><dd>' + formatMoney(order.total) + '</dd></div></dl>' +
      (order.card ? '<div class="card-issued"><p>' + (isCheckout ? 'You earned a free Privilege card.' :
        'Save this card number.') + '</p><strong>' + escape(order.card) +
        '</strong><p>Use it with the same email or mobile number at demo checkout.</p></div>' : '') +
      '<div class="commerce-actions"><a class="button" href="/shop/catalogue">Continue shopping</a>' +
      (order.whatsapp ? '<a class="button outline" target="_blank" rel="noopener noreferrer" href="' +
        escape(order.whatsapp) + '">Send order via WhatsApp</a>' : '') + '</div>');
  }

  function showReview(quote) {
    const delivery = quote.fulfillment === 'delivery';
    const details = [reviewed.name, delivery ?
      [reviewed.address, reviewed.city, reviewed.region, reviewed.pin].join(', ') : 'Store pickup'];
    showResult('<p class="commerce-label">Order review</p><h2>Review your order</h2><p>' +
      details.map(escape).join(' · ') + '</p>' + orderLines(quote.lines) + totals(quote) +
      (quote.earns_card ? '<p class="commerce-reward">This order qualifies for a free Privilege card.</p>' : '') +
      '<p class="commerce-error" role="alert"></p><div class="commerce-actions">' +
      '<button class="button" data-place-order>' + (['upi', 'card'].includes(quote.payment) ?
        'Simulate payment' : 'Place demo order') + '</button>' +
      '<button class="button outline" data-edit-order>Edit details</button></div>');
  }

  demoForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const button = event.submitter || demoForm.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(demoForm));
    if (!isCheckout && button.value === 'buy' && !values.name.trim()) {
      error.textContent = 'Enter your name for the card purchase.';
      demoForm.elements.name.focus();
      return;
    }
    const draft = !isCheckout && button.value === 'apply' ? window.open('about:blank', '_blank') : null;
    if (draft) draft.opener = null;
    busy = button.disabled = true;
    error.textContent = '';
    try {
      if (isCheckout) {
        const items = cart();
        const { quote, review } = await send({ ...values, items, action: 'review' });
        reviewed = { ...values, items, review, action: 'order', request_key: crypto.randomUUID() };
        showReview(quote);
      } else if (button.value === 'buy') {
        if (purchase?.contact !== values.contact || purchase?.name !== values.name) {
          purchase = { ...values, action: 'buy', request_key: crypto.randomUUID() };
        }
        receipt(await send(purchase));
      } else {
        const reply = await send({ ...values, action: 'apply' });
        showResult('<p class="commerce-label">Gupta Privilege</p><h2>Request received</h2>' +
          '<p>Review your request in WhatsApp, then tap Send.</p>' +
          '<a class="button" target="_blank" rel="noopener noreferrer" href="' + escape(reply.whatsapp) + '">Open WhatsApp draft</a>');
        if (draft && !draft.closed) draft.location.replace(reply.whatsapp);
      }
    } catch (failure) {
      if (draft && !draft.closed) draft.close();
      error.textContent = failure.message;
    } finally {
      busy = button.disabled = false;
    }
  });

  result.addEventListener('click', async event => {
    const button = event.target.closest('[data-place-order], [data-edit-order]');
    if (!button || busy) return;
    if (button.hasAttribute('data-edit-order')) {
      result.hidden = true;
      layout.hidden = false;
      reviewButton.focus();
      void showCart();
      return;
    }
    busy = button.disabled = true;
    const alert = result.querySelector('[role="alert"]');
    alert.textContent = '';
    try {
      const order = await send(reviewed);
      const remaining = cart();
      for (const [id, quantity] of Object.entries(reviewed.items)) {
        if (remaining[id] === quantity) delete remaining[id];
        else if (remaining[id] > quantity) remaining[id] -= quantity;
      }
      write(CART, remaining);
      receipt(order);
    } catch (failure) {
      alert.textContent = failure.message;
    } finally {
      busy = button.disabled = false;
    }
  });

  if (isCheckout) {
    demoForm.addEventListener('change', event => {
      if (event.target.name === 'fulfillment') updateFulfillment();
    });
    updateFulfillment();
    void showCart();
    window.addEventListener('storage', () => { if (result.hidden) void showCart(); });
  }
}

const search = document.querySelector('#search');
const list = document.querySelector('#suggestions');
const searchStatus = document.querySelector('#search-status');
let searchTimer;
let controller;
let suggestions = [];
let active = -1;
const recentSearches = new Map();
search.setAttribute('role', 'combobox');
search.setAttribute('aria-autocomplete', 'list');
search.setAttribute('aria-controls', list.id);
search.setAttribute('aria-expanded', 'false');

function closeSuggestions() {
  clearTimeout(searchTimer);
  controller?.abort();
  list.hidden = true;
  list.replaceChildren();
  suggestions = [];
  active = -1;
  search.setAttribute('aria-expanded', 'false');
  search.removeAttribute('aria-activedescendant');
}

function showSuggestions(message) {
  list.innerHTML = suggestions.length ? suggestions.map((product, index) =>
    '<li id="suggestion-' + index + '" role="option" aria-selected="false">' +
    '<a href="' + product.url + '" tabindex="-1">' + picture(product, 48, 43, 'eager') +
    '<span>' + escape(product.name) + '</span></a></li>').join('') :
    '<li role="presentation">' + message + '</li>';
  list.hidden = false;
  search.setAttribute('aria-expanded', 'true');
  searchStatus.textContent = suggestions.length ? suggestions.length + ' product suggestions available.' : message;
}

search.addEventListener('input', () => {
  closeSuggestions();
  const query = search.value.trim();
  if (query.length < 2) return;
  const key = query.toLowerCase();
  const cached = recentSearches.get(key);
  if (cached && Date.now() - cached.time < 12000) {
    suggestions = cached.products;
    showSuggestions('No matching materials.');
    return;
  }
  searchStatus.textContent = 'Searching for materials.';
  searchTimer = setTimeout(async () => {
    controller = new AbortController();
    const signal = controller.signal;
    try {
      const response = await fetch('/api/storefront/search?brief=1&q=' + encodeURIComponent(query),
        { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Search is temporarily unavailable.');
      const result = await response.json();
      if (signal.aborted) return;
      suggestions = result.products;
      if (recentSearches.size >= 24) recentSearches.delete(recentSearches.keys().next().value);
      recentSearches.set(key, { time: Date.now(), products: suggestions });
      showSuggestions('No matching materials.');
    } catch {
      if (!signal.aborted) showSuggestions('Suggestions unavailable. Press Enter to search.');
    }
  }, 65);
});

search.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeSuggestions();
    return;
  }
  if (!suggestions.length) return;
  if (event.key === 'Enter' && active >= 0) {
    event.preventDefault();
    location.assign(suggestions[active].url);
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  active = event.key === 'ArrowDown' ? (active + 1) % suggestions.length :
    (active <= 0 ? suggestions.length - 1 : active - 1);
  const options = [...list.querySelectorAll('[role="option"]')];
  options.forEach((option, index) => option.setAttribute('aria-selected', index === active));
  search.setAttribute('aria-activedescendant', options[active].id);
  options[active].scrollIntoView({ block: 'nearest' });
});

search.form.addEventListener('focusout', event => {
  if (!search.form.contains(event.relatedTarget)) closeSuggestions();
});

const mobileMenu = document.querySelector('.mobile-nav');

const topLink = document.querySelector('[data-back-top]');
function updateTopLink() {
  if (topLink) topLink.hidden = scrollY < 420 && document.activeElement !== topLink;
}
topLink?.addEventListener('click', event => {
  event.preventDefault();
  if (document.dispatchEvent(new Event('storefront:top', { cancelable: true }))) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
});
topLink?.addEventListener('blur', updateTopLink);
window.addEventListener('scroll', updateTopLink, { passive: true });
updateTopLink();

const stageLoader = document.querySelector('[data-studio-loading]');
let showLoading;
function setPageLoading(active) {
  if (!stageLoader) return;
  clearTimeout(showLoading);
  if (active) showLoading = setTimeout(() => { stageLoader.hidden = false; }, 120);
  else stageLoader.hidden = true;
}
document.addEventListener('storefront:loading', event => setPageLoading(event.detail));
window.addEventListener('pageshow', () => setPageLoading(false));
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="/shop"]');
  if (!link || link.pathname === location.pathname || link.target || event.button ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  queueMicrotask(() => { if (!event.defaultPrevented) setPageLoading(true); });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const dropdown = document.activeElement.closest('.nav-dropdown[open]');
  if (dropdown) {
    dropdown.open = false;
    dropdown.querySelector('summary').focus();
  }
});
document.addEventListener('click', event => {
  document.querySelectorAll('.nav-dropdown[open]').forEach(dropdown => {
    if (!dropdown.contains(event.target)) dropdown.open = false;
  });
});
mobileMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileMenu.open) {
    mobileMenu.open = false;
    mobileMenu.querySelector('summary').focus();
  }
});

document.addEventListener('storefront:navigated', updateControls);

updateControls();
window.addEventListener('pageshow', () => {
  updateControls();
  refreshSaved();
});
window.addEventListener('storage', () => {
  updateControls();
  refreshSaved();
});
