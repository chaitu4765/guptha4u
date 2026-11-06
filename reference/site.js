// er4u site interactions — progressive enhancement, respects reduced motion
(function(){
  document.documentElement.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // sticky header shadow
  var header = document.querySelector('header.site');
  var onScroll = function(){ if(header) header.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();

  // back-to-top
  var top = document.createElement('button');
  top.id = 'toTop'; top.setAttribute('aria-label','Back to top'); top.innerHTML = '\u2191';
  document.body.appendChild(top);
  top.addEventListener('click', function(){ window.scrollTo({top:0, behavior: reduce ? 'auto' : 'smooth'}); });
  window.addEventListener('scroll', function(){ top.classList.toggle('show', window.scrollY > 640); }, {passive:true});

  // scroll reveal
  var candidates = document.querySelectorAll('.card,.plan,.answer,.tablewrap,main section h2,main section .lead,.stats .row>div,details,.log article,.form,.receipt,.badge,.split>*,.iemoji,.devgrid .card,img.cover');
  var i = 0;
  candidates.forEach(function(el){ el.classList.add('reveal'); el.style.transitionDelay = ((i++ % 6) * 70) + 'ms'; });
  if(reduce || !('IntersectionObserver' in window)){
    candidates.forEach(function(el){ el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, {rootMargin:'0px 0px -8% 0px', threshold:.08});
    candidates.forEach(function(el){ io.observe(el); });
  }

  // animated stat counters (e.g. "20,000+", "300+", "30 Lacs+", "4.6/5", "3 days")
  var stats = document.querySelectorAll('.stats b');
  function animate(el){
    var raw = el.textContent.trim();
    var m = raw.match(/^([₹]?)([\d,]+(?:\.\d+)?)(.*)$/);
    if(!m) return;
    var prefix = m[1], target = parseFloat(m[2].replace(/,/g,'')), suffix = m[3];
    var dec = (m[2].indexOf('.') > -1) ? 1 : 0;
    var t0 = null, dur = 1300;
    function fmt(n){
      n = dec ? n.toFixed(1) : Math.round(n).toString();
      return dec ? n : n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    function step(ts){
      if(!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      p = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = prefix + fmt(target * p) + suffix;
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if(reduce || !('IntersectionObserver' in window)){ /* leave as-is */ }
  else {
    var io2 = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ animate(e.target); io2.unobserve(e.target); } });
    }, {threshold:.6});
    stats.forEach(function(el){ io2.observe(el); });
  }

  // the header is 68-129px tall depending on width, so measure it and let the
  // sticky section bar and the anchor offsets follow it instead of guessing
  (function () {
    var hdr = document.querySelector('header.site');
    if (!hdr) return;
    var bar = document.querySelector('.tabnav-bar, .subnav');
    var sync = function () {
      var h = Math.round(hdr.getBoundingClientRect().height);
      var bh = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
      var root = document.documentElement.style;
      root.setProperty('--hdr-h', h + 'px');
      root.setProperty('--anchor-off', (h + bh + 16) + 'px');
    };
    sync();
    window.addEventListener('resize', sync, {passive: true});
    window.addEventListener('load', sync);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(sync);
      ro.observe(hdr);
      if (bar) ro.observe(bar);
    }
  })();

  // main nav — mark the page you're on
  (function () {
    var here = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var links = document.querySelectorAll('header.site nav a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute('href') || '').split('#')[0].split('?')[0].split('/').pop().toLowerCase();
      if (href && href === here) links[i].setAttribute('aria-current', 'page');
    }
  })();

  // section tab bar (addons .tabnav / .subnav) — highlight the section in view
  var tabnav = document.querySelector('.tabnav') || document.querySelector('.subnav');
  if (tabnav) {
    var tabLinks = [].slice.call(tabnav.querySelectorAll('a[href^="#"]'));
    var tabTargets = tabLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    var syncTabs = function () {
      // a section counts as current once its heading has passed the sticky header line
      var y = window.scrollY + 145, idx = 0;
      tabTargets.forEach(function (t, i) {
        if (t && (t.getBoundingClientRect().top + window.scrollY) <= y) idx = i;
      });
      // at the very bottom of the page, always land on the last section
      if ((window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 4)) idx = tabLinks.length - 1;
      tabLinks.forEach(function (a, i) { a.classList.toggle('active', i === idx); });
    };
    window.addEventListener('scroll', syncTabs, {passive: true});
    window.addEventListener('resize', syncTabs, {passive: true});
    syncTabs();
  }

  // Same as OLD landing page: JS → seo_api_enquiry.php → Pabbly → receive_lead → CRM
  // (old did this via PHP landing_submit.php; new site does it with JavaScript only)
  var CRM_API = 'https://tbitechnologies.com/crm/seo_api_enquiry.php';
  var leadForm = document.getElementById('crm-lead-form');
  if (leadForm) {
    var btn = leadForm.querySelector('button[type="submit"]');
    var msg = leadForm.querySelector('.form-msg');
    var btnLabel = btn ? btn.textContent : '';
    var phoneInput = leadForm.querySelector('#phone');
    var iti = null;
    var isSubmitting = false;

    // Same concept as old landing-page: intl-tel-input (flag + dial code dropdown)
    if (phoneInput && window.intlTelInput) {
      iti = window.intlTelInput(phoneInput, {
        initialCountry: 'in',
        preferredCountries: ['in', 'ae', 'us', 'gb', 'sg'],
        separateDialCode: true,
        utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@17.0.19/build/js/utils.js'
      });
    }

    function showMsg(text, isError) {
      if (!msg) return;
      msg.style.display = 'block';
      msg.style.color = isError ? '#b42318' : 'var(--muted)';
      msg.textContent = text;
    }

    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (isSubmitting) return;
      if (!leadForm.checkValidity()) {
        leadForm.reportValidity();
        return;
      }

      var company = (leadForm.company.value || '').trim();
      var name = (leadForm.name.value || '').trim();
      var email = (leadForm.email.value || '').trim();
      var phone = (phoneInput.value || '').trim().replace(/\D/g, '');
      var countryData = { name: 'India', iso2: 'in', dialCode: '91' };

      if (iti) {
        countryData = iti.getSelectedCountryData() || countryData;
        if (window.intlTelInputUtils && phoneInput.value.trim() !== '' && !iti.isValidNumber()) {
          showMsg('Please enter a valid mobile number for the selected country.', true);
          return;
        }
        phone = (phoneInput.value || '').trim().replace(/\D/g, '');
      } else if (phone.length < 7) {
        showMsg('Please enter a valid mobile number.', true);
        return;
      }

      if (!phone) {
        showMsg('Please enter a valid mobile number.', true);
        return;
      }

      // Marketing consent (optional opt-in; absent on forms that don't show it)
      var consentEl = leadForm.querySelector('input[name="consent_marketing"]');
      var consentGiven = !!(consentEl && consentEl.checked);

      // Same fields old landing posted to seo_api_enquiry.php / Pabbly
      var payload = {
        cperson: name,
        cname: company,
        mobno: phone,
        emailid: email,
        cityname: '',
        state_id: '',
        countryData: JSON.stringify(countryData),
        planname: 'ER4U Premium',
        source: leadForm.getAttribute('data-source') || 'Er4u Website',
        // Consent record — kept auditable: what they agreed to, and when
        consent_marketing: consentEl ? (consentGiven ? 'Yes' : 'No') : '',
        consent_text: consentGiven ? (consentEl.getAttribute('data-consent-text') || '') : '',
        consent_at: consentGiven ? new Date().toISOString() : '',
        consent_source_url: consentEl ? window.location.href : ''
      };

      isSubmitting = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting…';
      }
      showMsg('Sending your details…', false);

      fetch(CRM_API, {
        method: 'POST',
        mode: 'cors',
        // text/plain = no CORS preflight (OPTIONS). Live seo_api was blocking
        // application/json preflight (missing Allow-Methods / Allow-Headers).
        // Body is still JSON; seo_api_enquiry.php reads php://input the same way.
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function (body) {
          // The existing enquiry API confirms acceptance with the literal "1".
          // HTTP 200 alone (including blank/error responses) is not a successful enquiry.
          if (String(body).trim() !== '1') throw new Error('Enquiry not confirmed');
          var thankyou = leadForm.getAttribute('data-thankyou') || 'thank-you.html';
          try {
            // No customer details: only a short-lived, one-use success marker.
            sessionStorage.setItem('er4u.confirmedEnquiry', JSON.stringify({
              confirmedAt: Date.now(),
              source: leadForm.getAttribute('data-source') || 'Er4u Website'
            }));
          } catch (storageError) {
            // Storage restrictions must never prevent a successful submission redirect.
          }
          window.location.href = thankyou;
        })
        .catch(function () {
          showMsg('Something went wrong. Please try again or call +91-6232128073.', true);
          isSubmitting = false;
          if (btn) {
            btn.disabled = false;
            btn.textContent = btnLabel;
          }
        });
    });
  }
})();
