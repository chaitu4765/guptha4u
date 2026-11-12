async page => {
  const base = new URL(page.url()).origin;
  const issues = [];
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  page.on('pageerror', error => issues.push(error.message));
  page.on('response', response => { if (response.status() >= 400) issues.push(response.status() + ' ' + response.url()); });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') issues.push(request.url());
  });
  const go = path => page.goto(base + path);
  async function image(locator, filename) {
    await locator.waitFor();
    expect(await locator.getAttribute('src') === '/storefront/media/' + filename, 'Image identity mismatch');
  }
  async function admin(path, data) {
    const response = await page.request.post(base + '/api/' + path, {data});
    expect(response.ok(), 'Admin fixture failed: ' + path);
  }

  await page.setViewportSize({width:1536, height:960});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await go('/shop');
  expect(await page.locator('.studio-object').count() === 8, 'Eight categories expected');
  const scene = page.locator('.studio-scene');
  await scene.evaluate(element => { window.initialScene = element; });
  const brushes = page.locator('.studio-object[data-key=brushes]');
  await page.locator('.studio-lifts.is-ready').waitFor().catch(async () => {
    const layers = await page.locator('.studio-lifts img').evaluateAll(images => images.map(img => ({
      src: img.getAttribute('src'), complete: img.complete, width: img.naturalWidth,
    })));
    throw new Error('Art studio layers did not initialize: ' + JSON.stringify({layers, issues}));
  });
  const scaleOf = key => new DOMMatrix(getComputedStyle(document.querySelector(`[data-lift="${key}"]`)).transform).a;
  await brushes.hover();
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-lift=brushes]')).transform).a > 1.05);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-key=brushes]'), '::after').opacity === '1');
  const brushScale = await page.evaluate(scaleOf, 'brushes');
  expect(brushScale > 1.05 && await page.evaluate(scaleOf, 'canvas') === 1, 'Only the hovered foreground should scale');
  expect(await brushes.evaluate(element => {
    const glow = getComputedStyle(element, '::after');
    const stage = element.closest('.studio-stage').getBoundingClientRect();
    const floor = element.getBoundingClientRect().top - stage.top + parseFloat(glow.top) + parseFloat(glow.height);
    return glow.borderTopWidth === '0px' && Math.abs(floor / stage.height - 629 / 724) < .005;
  }), 'Brush glow did not follow the pedestal floor');
  expect(await scene.evaluate(element => getComputedStyle(element).transform) === 'none', 'Hover moved the studio');
  expect(await page.locator('[data-key=canvas]').evaluate(element => getComputedStyle(element, '::after').opacity) === '0',
    'Hover illuminated a neighboring item');
  await page.locator('.studio-object[data-key=canvas]').hover();
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-lift=brushes]')).transform).a === 1);
  await brushes.hover();
  await page.evaluate(() => {
    const fetch = window.fetch;
    window.fetch = async (url, options) => {
      if (new URL(url, location.href).pathname === '/shop/category/brushes') {
        window.fetch = fetch;
        await new Promise(resolve => { window.finishCategory = resolve; });
      }
      return fetch(url, options);
    };
  });
  try {
    await brushes.click();
    await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.studio-scene')).transform).a > 1.6);
    await page.locator('.studio-content .product-skeleton').waitFor();
    expect(!await page.locator('[data-studio-loading]').isVisible(), 'The page loader covered the hero zoom');
  } finally {
    await page.evaluate(() => window.finishCategory?.());
  }
  await page.waitForURL('**/category/brushes');
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.studio-scene')).transform).a > 2);
  expect(await scene.evaluate(element => window.initialScene === element), 'Scene was replaced during zoom');
  await page.locator('.studio-back').click();
  await page.waitForURL('**/shop');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.studio-scene')).transform === 'none');
  expect(await scene.evaluate(element => window.initialScene === element), 'Scene was replaced on return');
  await page.goBack();
  await page.waitForURL('**/category/brushes');
  await page.locator('#studio[data-category="brushes"]').waitFor();
  await page.goForward();
  await page.waitForURL('**/shop');
  await page.locator('#studio[data-category=""]').waitFor();

  const navigation = page.getByRole('navigation', {name:'Shop categories'});
  const paints = navigation.getByRole('button', {name:'Paints & Mediums', exact:true});
  await paints.press('ArrowDown');
  const inks = navigation.getByRole('link', {name:'Acrylic Inks', exact:true});
  await inks.waitFor();
  const inkRoute = new URL(await inks.getAttribute('href'), base);
  expect(inkRoute.searchParams.get('subcategory') === 'Acrylic Colours' &&
    inkRoute.searchParams.get('type') === 'Acrylic Inks', 'Nested menu lost the exact product branch');
  await page.keyboard.press('Escape');
  const accessories = navigation.getByRole('button', {name:'Accessories', exact:true});
  await accessories.hover();
  await navigation.getByRole('link', {name:'Palettes', exact:true}).click();
  await page.waitForURL('**/category/accessories?subcategory=Palettes');
  expect(await page.locator('.product-card').count() === 2, 'Subcategory did not select ERP rows');
  const search = page.getByRole('combobox', {name:'Search materials'});
  await search.fill('qa studio palete');
  await image(page.getByRole('option', {name:'QA Studio Palette'}).first().locator('img'), 'paints.webp');
  await search.fill('QA-PALETTE');
  await image(page.getByRole('option', {name:'QA Studio Palette'}).locator('img'), 'paints.webp');
  await search.press('ArrowDown');
  await search.press('Enter');
  await page.getByRole('heading', {name:'QA Studio Palette', exact:true, level:1}).waitFor();
  const path = new URL(page.url()).pathname;
  await image(page.locator('.detail-art img'), 'paints.webp');
  await page.locator('.detail-discount').getByText('Save ₹76.55 (38%)', {exact:true}).waitFor();
  await page.getByRole('button', {name:'Save QA Studio Palette', exact:true}).first().click();
  await page.locator('[data-add] input').fill('2');
  await page.locator('[data-add]').filter({has:page.locator('input[name="quantity"]')})
    .getByRole('button', {name:'Add to cart'}).click();
  await page.waitForURL('**/shop/sign-up?next=*');
  await page.getByLabel('Full name').fill('Browser Demo Shopper');
  await page.getByLabel('Email address').fill('browser-demo@example.test');
  await page.getByLabel('Password', {exact:true}).fill('isolated-browser-shopper-password');
  await page.getByRole('button', {name:'Create demo account'}).click();
  await page.waitForURL('**' + path);
  await page.locator('#add-message').getByText('Added to your cart.', {exact:true}).waitFor();
  await go('/shop/cart');
  await image(page.locator('.cart-line img'), 'paints.webp');
  await page.getByRole('heading', {name:'Order summary'}).waitFor();
  await page.locator('.subtotal strong').filter({hasText:'₹246.90'}).waitFor();
  await page.locator('[data-quantity]').fill('3');
  await page.locator('[data-quantity]').press('Tab');
  await page.reload();
  await page.locator('.subtotal strong').filter({hasText:'₹370.35'}).waitFor();
  await go('/shop/wishlist');
  await page.reload();
  await image(page.locator('.cart-line img'), 'paints.webp');

  await admin('login', {email:'storefront-test@example.test', password:'isolated-fixture-password'});
  await go('/#settings');
  await page.getByLabel('Message', {exact:true}).fill('Save 20% on ₹2,500 <b>today</b>');
  await page.getByLabel('Show announcement').check();
  await page.getByRole('button', {name:'Save announcement'}).click();
  await page.getByText('Announcement saved', {exact:true}).waitFor();
  await go('/shop');
  const headline = page.locator('.headline-track p:not([aria-hidden])');
  expect(await headline.textContent() === 'Save 20% on ₹2,500 <b>today</b>', 'Announcement must preserve the plain text');
  expect((await headline.locator('.offer-number').allTextContents()).join(', ') === '20%, ₹2,500', 'Announcement amounts should be highlighted');
  expect((await page.locator('.membership-strip .offer-number').allTextContents()).join(', ') === '₹2,500, ₹200', 'Privilege amounts should be highlighted');
  expect(await page.getByRole('button', {name:'Pause announcement'}).count() === 0, 'Announcement still has a pause button');
  await page.locator('.headline-window').focus();
  expect(await page.locator('.headline-track').evaluate(el => getComputedStyle(el).animationName) === 'none',
    'Keyboard focus should make the headline readable');
  const id = Number(path.split('-').at(-1));
  await admin('products', {id,name:'QA Studio Palette',sku:'QA-PALETTE',category:'Accessories',
    price:124.50,cost:7.61,mrp:200,description:'Disposable test fixture.',published:false,
    image:'/storefront/media/brushes.webp',image_verified:true,
    image_source:'https://example.test/fixture',image_license:'Original test artwork'});
  for (const destination of ['/shop/catalogue?q=QA-PALETTE', path, '/shop/wishlist','/shop/cart']) {
    await go(destination);
    await image(page.locator('.product-card img, .detail-art img, .cart-line img').first(), 'brushes.webp');
  }
  await admin('stock', {product_id:id,quantity:1,reason:'Temporary stock test'});
  await page.reload();
  await page.getByText('Update quantity to 1 or fewer.', {exact:true}).waitFor();
  await page.locator('.subtotal strong').filter({hasText:'₹0.00'}).waitFor();
  await page.locator('[data-quantity]').fill('1');
  await page.locator('[data-quantity]').press('Tab');
  await page.locator('.subtotal strong').filter({hasText:'₹124.50'}).waitFor();
  await admin('products/archive', {id});
  await page.reload();
  await page.getByText('No longer in the catalogue').waitFor();
  await page.getByRole('button', {name:'Remove Unavailable item',exact:true}).click();
  await page.getByRole('heading', {name:'Your cart is empty'}).waitFor();
  await page.getByRole('link', {name:'Browse art supplies'}).waitFor();
  await page.getByRole('link', {name:'Shop stationery'}).waitFor();
  await go('/shop/wishlist');
  await page.getByRole('button', {name:'Remove Unavailable item from wishlist'}).click();
  await page.getByRole('heading', {name:'Your wishlist is empty'}).waitFor();

  await go('/shop/privilege');
  await page.context().route('https://wa.me/**', route => route.fulfill({body:'Test WhatsApp draft'}));
  await page.getByLabel('Email or mobile number').fill('preview-membership@example.test');
  await page.getByRole('button', {name:'Send my details'}).click();
  await page.getByRole('heading', {name:'Request received'}).waitFor();
  await go('/shop/privilege');
  await page.getByLabel('Full name').fill('Demo Shopper');
  await page.getByLabel('Email or mobile number').fill('preview-membership@example.test');
  await page.getByRole('button', {name:'Buy for ₹200.00'}).click();
  await page.getByRole('heading', {name:'Your Privilege card is ready'}).waitFor();
  const card = await page.locator('.card-issued strong').textContent();
  await go('/shop/catalogue?q=DEMO-ART-001');
  await page.locator('.product-card').first().getByRole('button', {name:'Add to cart'}).click();
  await page.locator('[data-add-message]').getByText('Added to your cart.').waitFor();
  await go('/shop/cart');
  await page.getByRole('link', {name:'Continue to checkout'}).click();
  await page.getByLabel('Full name').fill('Demo Shopper');
  await page.getByLabel('Email or mobile number').fill('preview-membership@example.test');
  await page.getByRole('radio', {name:'Store pickup'}).check();
  await page.getByLabel('Privilege card').fill(card);
  await page.getByRole('button', {name:'Review order'}).click();
  await page.getByRole('heading', {name:'Review your order'}).waitFor();
  await page.getByRole('button', {name:'Simulate payment'}).click();
  await page.getByRole('heading', {name:'Order confirmed'}).waitFor();
  const draft = new URL(await page.getByRole('link', {name:'Send order via WhatsApp'}).getAttribute('href'));
  expect(draft.hostname === 'wa.me' && draft.pathname === '/917981456043' &&
    draft.searchParams.get('text').includes('Customer: Demo Shopper'), 'Missing WhatsApp order draft');
  await go('/shop/cart');
  await page.getByRole('heading', {name:'Your cart is empty'}).waitFor();
  await go('/#privilege');
  await page.getByRole('heading', {name:'Demo Privilege requests'}).waitFor();
  await page.getByRole('heading', {name:'Demo checkout orders'}).waitFor();

  const stationery = '/shop/stationery';
  await go('/shop');
  for (const [department, path, hook] of [
    ['stationery', stationery, 'From brushstrokes to pen strokes.'], ['art', '/shop', 'From ink on paper to colour on canvas.'],
  ]) {
    await page.evaluate(() => {
      const loader = document.querySelector('[data-studio-loading]');
      const canvases = [...loader.querySelectorAll('.department-morph canvas')];
      let initial;
      sessionStorage.removeItem('test:department-morph');
      function sample() {
        if (!loader.hidden && loader.dataset.loadingMode === 'switch' &&
            canvases.every(canvas => canvas.getContext('2d').getImageData(96, 96, 1, 1).data[3] > 0)) {
          const frames = canvases.map(canvas => canvas.toDataURL());
          initial ??= frames;
          if (frames.every((frame, index) => frame !== initial[index])) {
            sessionStorage.setItem('test:department-morph', loader.querySelector('.department-hook').textContent);
            return;
          }
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await page.locator(`[data-department-switch="${department}"]`).click();
    await page.waitForURL('**' + path, {waitUntil:'domcontentloaded'}).catch(() => {
      throw new Error('Department switch to ' + path + ' stopped at ' + page.url() + ': ' + issues.join(' | '));
    });
    expect(await page.evaluate(text => sessionStorage.getItem('test:department-morph') === text, hook),
      'Department icons did not morph toward ' + department);
    expect(!await page.locator('[data-studio-loading]').isVisible(), 'Loader remained on the destination');
  }
  await go(stationery);
  expect(await page.locator('#search').evaluate(input => input.getBoundingClientRect().width > 120), 'Stationery search stayed collapsed');
  expect((await page.locator('.headline-track p:not([aria-hidden])').textContent()) === 'Save 20% on ₹2,500 <b>today</b>',
    'Stationery did not show the shared announcement');
  expect((await page.locator('.membership-strip .offer-number').allTextContents()).join(', ') === '₹2,500, ₹200',
    'Stationery did not show the shared Privilege amounts');
  const brandLogo = page.locator('.site-header .wordmark-logo');
  expect(await brandLogo.evaluate(async img => { await img.decode(); return img.naturalWidth > 0; }), 'Gupta logo failed to load');
  const pendant = page.locator('.stationery-pendant');
  const premium = page.locator('[data-stationery-object="premium-pens"]');
  const heritage = page.locator('[data-stationery-object="grandfathers-collection"]');
  expect(await page.locator('.stationery-pendant.is-lit').count() === 0, 'Lamp appeared before hover');
  for (const display of [premium, heritage]) {
    await display.hover();
    const key = await display.getAttribute('data-stationery-object');
    const x = Number(await display.getAttribute('data-lamp-x'));
    await page.waitForFunction(x => Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('.stationery-pendant')).transform).e - x) < 1, x);
    expect(await pendant.evaluate(el => el.classList.contains('is-lit')), 'Lamp failed to appear on ' + key);
    expect(await page.locator(`.stationery-lift.is-active[data-lift="${key}"]`).count() === 1 &&
      await page.locator('.stationery-lift.is-active').count() === 1, 'Hover illuminated the wrong pedestal');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.stationery-pendant-travel')).transform === 'none');
  }
  await page.locator('[data-stationery-object="school-geometry"]').hover();
  await page.locator('.stationery-pendant.is-lit').waitFor({state:'detached'});
  const logos = page.locator('.stationery-brand-logos img');
  expect(await logos.count() === 6, 'Premium brand logos missing');
  await logos.first().scrollIntoViewIfNeeded();
  expect(await logos.evaluateAll(images => Promise.all(images.map(img => img.decode())).then(() => true)), 'Brand logo failed to load');
  const featured = page.locator('.stationery-home-premium .stationery-product-link').first();
  const productPath = await featured.getAttribute('href');
  await featured.click();
  await page.waitForURL('**' + productPath);
  await page.locator('[data-stationery-product-back]').click();
  await page.waitForURL('**' + stationery, {waitUntil:'domcontentloaded'}).catch(() => {
    throw new Error('Product back link stopped at ' + page.url() + ': ' + issues.join(' | '));
  });

  const stationeryNav = page.getByRole('navigation', {name:'Stationery categories'});
  await stationeryNav.getByRole('button', {name:'Office Tools', exact:true}).hover();
  await stationeryNav.getByRole('link', {name:'Staplers', exact:true}).click();
  await page.waitForURL('**/office-tools?type=Staplers#stationery-products');
  expect(await page.locator('.stationery-product').count() === 1, 'Stationery submenu lost its type filter');
  expect(await page.locator('a.button').filter({hasText:'All stationery'}).count() === 1, 'Stationery back link needs a button style');

  for (const [collection, count] of [['premium-pens', 5], ['grandfathers-collection', 5]]) {
    await page.mouse.move(0, 0);
    await go(stationery + '/' + collection);
    const shelf = page.locator('.pen-shelf');
    await shelf.waitFor();
    expect(await page.locator('.pen-rail-item[data-lifted="true"]').count() === 0, 'Pen rail hid pens before inspection');
    const railItem = page.locator('.pen-rail-item[data-active="true"]');
    await railItem.hover();
    await page.waitForFunction(() => [...document.querySelectorAll('.pen-rail-lamp')]
      .filter(lamp => getComputedStyle(lamp).opacity === '1').length === 1);
    await page.locator('.pen-gallery h1').hover();
    await page.waitForFunction(() => [...document.querySelectorAll('.pen-rail-lamp')]
      .every(lamp => getComputedStyle(lamp).opacity === '0'));
    expect(await shelf.locator('.pen-shelf-item').count() === count, 'Pen shelf lost catalogue products');
    const item = shelf.locator('.pen-shelf-item').first();
    const penName = await item.locator('h3').textContent();
    const pen = item.getByRole('button', {name:`View ${penName}`, exact:true});
    await pen.click();
    const inspector = page.getByRole('dialog', {name:penName, exact:true});
    await inspector.waitFor();
    expect(await inspector.locator('.discount-badge').getAttribute('data-discount-band') !== null, 'Missing shared discount band');
    if (collection === 'premium-pens') {
      await inspector.getByRole('button', {name:`Save ${penName}`, exact:true}).click();
      await inspector.getByRole('spinbutton', {name:'Quantity', exact:true}).fill('2');
      await inspector.getByRole('button', {name:'Add to cart', exact:true}).click();
      await inspector.getByText('Added to your cart.', {exact:true}).waitFor();
    }
    await inspector.getByRole('button', {name:'← Back to pens', exact:true}).click();
    await inspector.waitFor({state:'detached'});
    await page.waitForFunction(() => document.activeElement?.classList.contains('pen-shelf-preview'));
  }
  await go('/shop/cart');
  const penLine = page.locator('.cart-line').filter({hasText:'Lamy Dialog Palladium'});
  expect(await penLine.locator('[data-quantity]').inputValue() === '2', 'Stationery cart lost selected quantity');
  await go('/shop/wishlist');
  await page.locator('.cart-line').filter({hasText:'Lamy Dialog Palladium'}).waitFor();
  await page.locator('footer').getByRole('link', {name:'Stationery', exact:true}).waitFor();

  await page.emulateMedia({reducedMotion:'reduce'});
  for (const [width,height] of [[1024,768],[820,1180],[390,844],[320,780]]) {
    await page.setViewportSize({width,height});
    await go('/shop');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow at ' + width);
    expect(await page.locator('.studio-scene').evaluate(element => parseFloat(getComputedStyle(element).transitionDuration)) < .001,
      'Reduced motion retained the camera transition');
    const broken = await page.locator('img').evaluateAll(async images => {
      const visible = images.filter(img => img.getClientRects().length && getComputedStyle(img).visibility === 'visible' &&
        img.getBoundingClientRect().top < innerHeight);
      await Promise.all(visible.map(img => img.decode().catch(() => {})));
      return visible.some(img => !img.naturalWidth);
    });
    expect(!broken, 'Broken image');
  }
  await navigation.getByRole('button', {name:'Brushes & Painting Tools', exact:true}).click();
  await navigation.getByRole('link', {name:'Brushes',exact:true}).click();
  await page.waitForURL('**/category/brushes?subcategory=Brushes');
  await page.getByText('2 materials', {exact:true}).waitFor();

  await page.locator('.studio-render img').waitFor();
  expect(!issues.length, 'Browser errors: ' + issues.join(' | '));
  return 'PASS: storefront browser workflows including stationery lamp, pen shelves, shared navigation, cart, wishlist and responsive layouts.';
}
