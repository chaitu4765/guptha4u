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
  await go('/shop');
  expect(await page.locator('.studio-object').count() === 8, 'Eight categories expected');
  const scene = page.locator('.studio-scene');
  await scene.evaluate(element => { window.initialScene = element; });
  const brushes = page.locator('.studio-object[data-key=brushes]');
  await page.locator('.studio-lifts.is-ready').waitFor();
  const scaleOf = key => new DOMMatrix(getComputedStyle(document.querySelector(`[data-lift="${key}"]`)).transform).a;
  await brushes.hover();
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-lift=brushes]')).transform).a > 1.05);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-key=brushes]'), '::after').opacity === '1');
  const brushScale = await page.evaluate(scaleOf, 'brushes');
  expect(brushScale > 1.05 && await page.evaluate(scaleOf, 'canvas') === 1, 'Only the hovered foreground should scale');
  expect(await scene.evaluate(element => getComputedStyle(element).transform) === 'none', 'Hover moved the studio');
  expect(await page.locator('[data-key=canvas]').evaluate(element => getComputedStyle(element, '::after').opacity) === '0',
    'Hover illuminated a neighboring item');
  await page.locator('.studio-object[data-key=canvas]').hover();
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-lift=brushes]')).transform).a === 1);
  await brushes.hover();
  await brushes.click();
  await page.waitForURL('**/category/brushes');
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.studio-scene')).transform).a > 2);
  expect(await scene.evaluate(element => window.initialScene === element), 'Scene was replaced during zoom');
  await page.locator('.studio-back').click();
  await page.waitForURL('**/shop');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.studio-scene')).transform === 'none');
  expect(await scene.evaluate(element => window.initialScene === element), 'Scene was replaced on return');
  await page.goBack();
  await page.waitForURL('**/category/brushes');
  await page.goForward();
  await page.waitForURL('**/shop');

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
  await page.locator('#add-message').getByText('Added to your cart.', {exact:true}).waitFor();
  await go('/shop/cart');
  await image(page.locator('.cart-line img'), 'paints.webp');
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
  await page.getByText('Only 1 in stock. Update the quantity.').waitFor();
  await page.locator('.subtotal strong').filter({hasText:'₹0.00'}).waitFor();
  await page.locator('[data-quantity]').fill('1');
  await page.locator('[data-quantity]').press('Tab');
  await page.locator('.subtotal strong').filter({hasText:'₹124.50'}).waitFor();
  await admin('products/archive', {id});
  await page.reload();
  await page.getByText('No longer in the catalogue').waitFor();
  await page.getByRole('button', {name:'Remove Unavailable item',exact:true}).click();
  await page.getByRole('heading', {name:'Your cart is empty'}).waitFor();
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
  await page.locator('.mobile-nav summary').first().click();
  await page.locator('.mobile-nav .nav-dropdown summary').filter({hasText:'Brushes & Painting Tools'}).click();
  await page.locator('.mobile-nav').getByRole('link', {name:'Brushes',exact:true}).click();
  await page.waitForURL('**/category/brushes?subcategory=Brushes');
  await page.getByText('2 materials', {exact:true}).waitFor();

  await page.locator('.studio-render img').waitFor();
  expect(!issues.length, 'Browser errors: ' + issues.join(' | '));
  return 'PASS: storefront browser workflows, hover, zoom and return, category history, announcements, savings, search, image identity, cart, Privilege enrollment, checkout, admin activity and responsive layouts.';
}
