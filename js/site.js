/* ==========================================================================
   Residia - главная страница. Vanilla JS, без зависимостей.
   - UTM / fbclid -> sessionStorage -> заявка -> Make -> Notion
   - Meta Pixel грузится ТОЛЬКО после согласия на cookie
   - Форма заявки, окно «Написать», анимации по скроллу
   - Отзывы: карточки в движении (лента едет сама, пауза, стрелки, свайп)
   - window.Residia - общие функции для js/docs.js (раздел «Документы»)
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    webhook: 'https://hook.eu1.make.com/58m3066jyr2wr7pm5g6ql6zvb2utponu',
    pixelId: '984774087451139',
    // Заявки уходят в CRM и пиксель грузится только на боевом домене.
    // На localhost / в превью всё работает, но заявка лишь выводится в консоль.
    prodHosts: ['residia.pl', 'www.residia.pl'],
    phone: '48571528293',
    consentKey: 'rz_consent',
    attrKey: 'rz_attr',
    leadKey: 'rz_lead_sent'
  };

  var IS_PROD = CONFIG.prodHosts.indexOf(location.hostname) !== -1;
  var LANG = (document.documentElement.lang || 'ru').slice(0, 2).toLowerCase();
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var root = document.documentElement;

  var I18N = {
    ru: {
      menuOpen: 'Открыть меню',
      menuClose: 'Закрыть меню',
      done: function (name, via) { return name + ', спасибо! Скоро свяжемся с вами ' + via + '. Если хотите быстрее - напишите сами:'; },
      via: { WhatsApp: 'в WhatsApp', Telegram: 'в Telegram', Viber: 'в Viber', 'Звонок': 'по телефону' },
      waAfter: function (name) { return 'Здравствуйте! Меня зовут ' + name + ', я только что оставил(а) заявку на сайте.'; }
    },
    en: {
      menuOpen: 'Open menu',
      menuClose: 'Close menu',
      done: function (name, via) { return name + ', thank you! We’ll get in touch ' + via + ' soon. Want it faster? Message us yourself:'; },
      via: { WhatsApp: 'on WhatsApp', Telegram: 'on Telegram', Viber: 'on Viber', 'Звонок': 'by phone' },
      waAfter: function (name) { return 'Hello! My name is ' + name + ', I have just sent a request on your website.'; }
    }
  };
  var T = I18N[LANG] || I18N.ru;

  // Подписи для CRM - всегда по-русски, с какой бы версии сайта ни пришла заявка
  var SERVICE = {
    work: { service: 'Karta Pobytu', label: 'Карта побыту по работе' },
    cukr: { service: 'Карта CUKR', label: 'Карта CUKR' },
    family: { service: 'Воссоединение семьи', label: 'Воссоединение семьи' },
    waiting: { service: 'Ускорение дела (ponaglenie)', label: 'Уже подан(а), ускорить дело' },
    other: { service: 'Другое', label: 'Другое' }
  };

  /* ---------- helpers ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function log() { if (window.console && console.info) console.info.apply(console, ['[Residia]'].concat([].slice.call(arguments))); }
  function store(type) {
    try { var s = window[type]; var k = '__rz'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; }
  }
  var LS = store('localStorage');
  var SS = store('sessionStorage');
  function safe(fn, name) { try { fn(); } catch (e) { if (window.console) console.error('[Residia] ' + name, e); } }
  function smooth() { return reduceMotion.matches ? 'auto' : 'smooth'; }

  /* ---------- Скролл-цикл (один rAF на всех) ---------- */
  var scrollHandlers = [];
  var ticking = false;
  function onScroll(fn) { scrollHandlers.push(fn); }
  function runScroll() { ticking = false; for (var i = 0; i < scrollHandlers.length; i++) scrollHandlers[i](); }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(runScroll); } }, { passive: true });
  window.addEventListener('resize', function () { if (!ticking) { ticking = true; requestAnimationFrame(runScroll); } }, { passive: true });

  /* ---------- UTM / fbclid ---------- */
  var Attr = (function () {
    var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
    var data = {};
    try { data = JSON.parse((SS && SS.getItem(CONFIG.attrKey)) || '{}') || {}; } catch (e) { data = {}; }
    var params = new URLSearchParams(location.search);
    var fresh = {};
    KEYS.forEach(function (k) { var v = params.get(k); if (v) fresh[k] = v.slice(0, 300); });
    if (Object.keys(fresh).length) {
      fresh.landing_page = location.href.slice(0, 1000);
      fresh.referrer = (document.referrer || '').slice(0, 500);
      data = fresh;
    } else if (!data.landing_page) {
      data.landing_page = location.href.slice(0, 1000);
      data.referrer = (document.referrer || '').slice(0, 500);
    }
    try { if (SS) SS.setItem(CONFIG.attrKey, JSON.stringify(data)); } catch (e) { /* ignore */ }
    return { get: function () { var o = {}; for (var k in data) o[k] = data[k]; return o; } };
  })();

  /* ---------- Согласие на cookie + Meta Pixel ---------- */
  var Consent = {
    get: function () { return LS ? LS.getItem(CONFIG.consentKey) : null; },
    set: function (v) { if (!LS) return; LS.setItem(CONFIG.consentKey, v); LS.setItem(CONFIG.consentKey + '_at', new Date().toISOString()); }
  };

  var Pixel = {
    loaded: false,
    load: function () {
      if (this.loaded) return;
      this.loaded = true;
      if (!IS_PROD) { log('Пиксель: режим превью, скрипт Meta не загружается'); return; }
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('consent', 'grant');
      // Пиксель шлёт только события, названные в коде ниже. Без этой строки он сам собирает тексты
      // нажатых кнопок - а кнопки анализатора и есть ответы человека (в том числе про отказы и судимости).
      window.fbq('set', 'autoConfig', false, CONFIG.pixelId);
      window.fbq('init', CONFIG.pixelId);
      window.fbq('track', 'PageView');
    },
    track: function (name, params, opts) {
      if (Consent.get() !== 'granted') return;
      var standard = ['PageView', 'ViewContent', 'Lead', 'Contact', 'Schedule', 'SubmitApplication'];
      if (!IS_PROD || typeof window.fbq !== 'function') { log('Пиксель (превью):', name, params || {}, opts || ''); return; }
      var method = standard.indexOf(name) !== -1 ? 'track' : 'trackCustom';
      if (opts) window.fbq(method, name, params || {}, opts); else window.fbq(method, name, params || {});
    }
  };

  function initConsent() {
    var banner = $('[data-cookie]');
    var state = Consent.get();
    if (state === 'granted') Pixel.load();
    if (!banner) return;
    function show() { banner.hidden = false; root.classList.add('cookie-open'); }
    function hide() { banner.hidden = true; root.classList.remove('cookie-open'); }
    if (!state) setTimeout(show, 700);
    $('[data-cookie-accept]', banner).addEventListener('click', function () { Consent.set('granted'); hide(); Pixel.load(); });
    $('[data-cookie-decline]', banner).addEventListener('click', function () {
      Consent.set('denied'); hide();
      if (typeof window.fbq === 'function') window.fbq('consent', 'revoke');
    });
    $$('[data-cookie-settings]').forEach(function (b) { b.addEventListener('click', show); });
  }

  /* ---------- Шапка, прогресс чтения, меню ---------- */
  function initHeader() {
    var header = $('[data-header]');
    var bar = $('[data-read-progress]');
    if (!header) return;
    onScroll(function () {
      var y = window.scrollY || window.pageYOffset;
      header.classList.toggle('is-scrolled', y > 8);
      if (bar) {
        var max = root.scrollHeight - window.innerHeight;
        var p = max > 0 ? Math.min(1, Math.max(0.03, y / max)) : 0.03;
        bar.style.setProperty('--read', p.toFixed(4));
      }
    });
  }

  function initMenu() {
    var btn = $('[data-burger]');
    var menu = $('[data-mobile-menu]');
    if (!btn || !menu) return;
    function isOpen() { return btn.getAttribute('aria-expanded') === 'true'; }
    function open() {
      menu.hidden = false;
      void menu.offsetWidth;
      menu.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', T.menuClose);
      root.classList.add('menu-open');
    }
    function close(returnFocus) {
      if (!isOpen()) return;
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', T.menuOpen);
      root.classList.remove('menu-open');
      setTimeout(function () { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 320);
      if (returnFocus) btn.focus();
    }
    btn.addEventListener('click', function () { isOpen() ? close() : open(); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(true); });
    var mq = window.matchMedia('(min-width: 1024px)');
    var onMq = function (e) { if (e.matches) close(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  function initScrollSpy() {
    var links = $$('.nav a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) { l.classList.remove('is-active'); l.removeAttribute('aria-current'); });
        var a = byId[en.target.id];
        if (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Появление блоков, счётчики ---------- */
  function initReveal() {
    var els = $$('[data-reveal], .step');
    if (!('IntersectionObserver' in window)) {
      root.classList.add('no-io');
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var counters = new Map();
    els.forEach(function (el) {
      if (!el.hasAttribute('data-reveal')) return;
      var p = el.parentElement;
      var i = counters.get(p) || 0;
      counters.set(p, i + 1);
      el.style.setProperty('--rd', (Math.min(i, 6) * 0.07).toFixed(2) + 's');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    els.forEach(function (el) { io.observe(el); });
  }

  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length || reduceMotion.matches || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target;
        var target = parseInt(el.getAttribute('data-count'), 10) || 0;
        var suffix = el.getAttribute('data-suffix') || '';
        var t0 = performance.now();
        var dur = 1400;
        el.textContent = '0' + suffix;
        (function tick(now) {
          var p = Math.min(1, (now - t0) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Таймлайн шагов: линия заполняется по скроллу ---------- */
  function initSteps() {
    var wrap = $('[data-steps]');
    if (!wrap) return;
    var track = $('.steps__track', wrap);
    var steps = $$('.step', wrap);
    var active = !('IntersectionObserver' in window);
    function update() {
      if (!active) return;
      var r = track.getBoundingClientRect();
      if (!r.height) return;
      var anchor = window.innerHeight * 0.58;
      var p = Math.min(1, Math.max(0, (anchor - r.top) / r.height));
      wrap.style.setProperty('--p', p.toFixed(4));
      var fillY = r.top + r.height * p;
      var last = -1;
      steps.forEach(function (st, i) {
        var n = st.firstElementChild.getBoundingClientRect();
        var done = n.top + n.height / 2 <= fillY + 1;
        st.classList.toggle('is-done', done);
        if (done) last = i;
      });
      steps.forEach(function (st, i) { st.classList.toggle('is-current', p > 0 && p < 1 && i === last + 1); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        active = entries[0].isIntersecting;
        if (active) update();
      }, { rootMargin: '20% 0px 20% 0px' }).observe(wrap);
    }
    onScroll(update);
    update();
  }

  function initWaits() {
    var fig = $('[data-waits]');
    if (!fig) return;
    if (!('IntersectionObserver' in window)) { fig.classList.add('is-in'); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { fig.classList.add('is-in'); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(fig);
  }

  /* ---------- Наклон и подсветка карточек пакетов (только мышь) ---------- */
  function initTilt() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || reduceMotion.matches) return;
    $$('[data-tilt]').forEach(function (card) {
      var raf = 0;
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          card.style.setProperty('--ry', (x * 5).toFixed(2) + 'deg');
          card.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg');
          card.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
          card.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
        });
      });
      card.addEventListener('pointerleave', function () {
        cancelAnimationFrame(raf);
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------- Окно «Написать Вадиму» ---------- */
  var Chat = { close: function () {} };  // close(instant, noRestoreFocus)
  function initChat() {
    var dlg = $('[data-chat]');
    if (!dlg || typeof dlg.showModal !== 'function') {
      // Старые браузеры: сразу открываем WhatsApp
      $$('[data-open-chat]').forEach(function (b) {
        b.addEventListener('click', function () { window.open('https://wa.me/' + CONFIG.phone, '_blank', 'noopener'); });
      });
      return;
    }
    var lastFocus = null;
    var restoreFocus = true;
    function open() {
      lastFocus = document.activeElement;
      dlg.classList.remove('is-closing');
      dlg.showModal();
      root.classList.add('chat-open');
      Pixel.track('ChatOpen', {});
    }
    function close(instant, noRestore) {
      if (!dlg.open) return;
      restoreFocus = !noRestore;
      if (instant || reduceMotion.matches) { dlg.classList.remove('is-closing'); dlg.close(); return; }
      if (dlg.classList.contains('is-closing')) return;
      dlg.classList.add('is-closing');
      var finished = false;
      function done() { if (finished) return; finished = true; dlg.classList.remove('is-closing'); dlg.close(); }
      dlg.addEventListener('animationend', done, { once: true });
      setTimeout(done, 380);
    }
    Chat.close = close;
    dlg.addEventListener('close', function () {
      root.classList.remove('chat-open');
      if (restoreFocus && lastFocus && lastFocus.focus && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
      restoreFocus = true;
    });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) { close(); return; }
      var closer = e.target.closest('[data-close-chat]');
      if (closer && closer.getAttribute('href') !== '#form') { close(); return; }
      var channel = e.target.closest('.channel');
      if (channel) setTimeout(function () { close(true); }, 250);
    });
    $$('[data-open-chat]').forEach(function (b) { b.addEventListener('click', open); });
  }

  /* ---------- Плавающие кнопки: прячем, когда форма на экране ---------- */
  function initFloating() {
    var formSection = $('[data-form-section]');
    if (!formSection || !('IntersectionObserver' in window)) return;
    var footBottom = $('.site-footer__bottom');
    if (footBottom) {
      new IntersectionObserver(function (entries) {
        root.classList.toggle('footer-in', entries[0].isIntersecting);
      }).observe(footBottom);
    }
    new IntersectionObserver(function (entries) {
      var visible = entries[0].isIntersecting;
      root.classList.toggle('hide-sticky', visible);
      root.classList.toggle('hide-fab', visible);
    }, { threshold: 0.12 }).observe(formSection);
  }

  /* ---------- Пиксель: просмотр пакетов, клики по мессенджерам ---------- */
  function initTracking() {
    var packages = $('[data-view-content]');
    if (packages && 'IntersectionObserver' in window) {
      // ViewContent - только если пакеты реально смотрели (1,5 с на экране), а не пролистали мимо
      var dwell = 0;
      var io = new IntersectionObserver(function (entries) {
        clearTimeout(dwell);
        if (!entries[0].isIntersecting) return;
        dwell = setTimeout(function () {
          Pixel.track('ViewContent', { content_name: 'Пакеты: Подача 500 zł / Под ключ 1500 zł', content_category: 'karta_pobytu' });
          io.disconnect();
        }, 1500);
      }, { threshold: 0.35 });
      io.observe(packages);
    }
    document.addEventListener('click', function (e) {
      var ch = e.target.closest('[data-channel]');
      if (ch) Pixel.track('Contact', { content_name: ch.getAttribute('data-channel') });
      var cta = e.target.closest('[data-cta]');
      if (cta) Pixel.track('CTA', { place: cta.getAttribute('data-cta') });
      var rv = e.target.closest('[data-track]');
      if (rv) Pixel.track('ReviewsClick', { action: rv.getAttribute('data-track') });
    });
  }

  /* ---------- Форма заявки ---------- */
  function normalizePhone(raw) {
    var s = String(raw || '').replace(/[\s\-().]/g, '');
    if (s.indexOf('00') === 0) s = '+' + s.slice(2);
    if (/^\d{9}$/.test(s)) s = '+48' + s;
    if (/^48\d{9}$/.test(s)) s = '+' + s;
    return /^\+\d{9,15}$/.test(s) ? s : '';
  }

  var Quiz = { preselect: function () {}, focus: function () {} };
  function initLeadForm() {
    var form = $('[data-lead-form]');
    if (!form) return;
    var btnSubmit = $('[data-form-submit]', form);
    var doneBox = $('[data-quiz-done]', form);
    var errBox = $('[data-quiz-error]', form);
    var started = false;
    var sending = false;
    var interest = '';
    var plan = '';
    var fromPage = '';

    function field(name) { return form.elements[name]; }
    function isGroup(el) { return typeof RadioNodeList !== 'undefined' && el instanceof RadioNodeList; }
    function val(name) {
      var el = field(name);
      if (!el) return '';
      if (isGroup(el)) return el.value || '';
      if (el.type === 'checkbox') return el.checked;
      if (el.type === 'radio') return el.checked ? el.value : '';
      return String(el.value || '').trim();
    }
    function setErr(key, on) {
      var m = $('[data-error="' + key + '"]', form);
      if (m) m.hidden = !on;
      var el = field(key);
      if (!el || isGroup(el) || !el.setAttribute) return;
      if (el.type === 'checkbox') el.closest('.consent').classList.toggle('is-invalid', on);
      else el.setAttribute('aria-invalid', on ? 'true' : 'false');
    }
    function syncChecked(name) {
      $$('input[name="' + name + '"]', form).forEach(function (r) {
        var lab = r.closest('.option');
        if (lab) lab.classList.toggle('is-checked', r.checked);
      });
    }
    function markStarted(fieldName) {
      if (started) return;
      started = true;
      Pixel.track('FormStart', { field: fieldName });
    }
    function validate() {
      var nameOk = val('name').length >= 2;
      var phoneOk = !!normalizePhone(val('phone'));
      var serviceOk = !!val('service');
      var consentOk = !!val('consent');
      setErr('name', !nameOk);
      setErr('phone', !phoneOk);
      setErr('service', !serviceOk);
      setErr('consent', !consentOk);
      var firstBad = !nameOk ? field('name') : !phoneOk ? field('phone') : !serviceOk ? $('input[name="service"]', form) : !consentOk ? field('consent') : null;
      if (firstBad) firstBad.focus();
      return nameOk && phoneOk && serviceOk && consentOk;
    }
    function buildPayload() {
      var key = val('service');
      var attr = Attr.get();
      var service = (SERVICE[key] || SERVICE.other).service;
      if (interest && key === 'other') service = interest;
      if (plan && key === 'work') service = 'Karta Pobytu - ' + plan;
      var eventId = 'lead_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      var messenger = val('messenger') || 'WhatsApp';
      var note = val('comment').slice(0, 600);
      var lines = [
        'Заявка с главной страницы (форма)',
        'Нужно: ' + ((SERVICE[key] && SERVICE[key].label) || key),
        interest ? 'Интересовался услугой: ' + interest : '',
        plan ? 'Выбрал пакет: ' + plan : '',
        fromPage ? 'Перешёл со страницы: ' + fromPage : '',
        note ? 'Комментарий клиента: ' + note : '',
        'Удобнее связаться: ' + messenger,
        'Язык страницы: ' + LANG.toUpperCase()
      ].filter(Boolean);
      return {
        name: val('name').slice(0, 60),
        phone: normalizePhone(val('phone')),
        telegram: '',
        service: service,
        source: 'main_page_form',
        comment: lines.join('\n'),
        submitted_at: new Date().toISOString(),
        messenger: messenger,
        situation: key,
        interest: interest,
        plan: plan,
        from_page: fromPage,
        client_comment: note,
        utm_source: attr.utm_source || '',
        utm_medium: attr.utm_medium || '',
        utm_campaign: attr.utm_campaign || '',
        utm_content: attr.utm_content || '',
        utm_term: attr.utm_term || '',
        fbclid: attr.fbclid || '',
        landing_page: attr.landing_page || location.href,
        referrer: attr.referrer || '',
        page_url: location.href.slice(0, 1000),
        page_lang: LANG,
        event_id: eventId
      };
    }
    function send(payload) {
      if (!IS_PROD) {
        log('Превью: заявка НЕ отправлена в Make (отправка работает только на residia.pl). Данные:', payload);
        return new Promise(function (resolve) { setTimeout(resolve, 700); });
      }
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : 0;
      return fetch(CONFIG.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res;
      }, function (err) { clearTimeout(timer); throw err; });
    }
    function showResult(box) {
      function swap() {
        form.classList.remove('is-error');
        errBox.hidden = true;
        form.classList.add(box === doneBox ? 'is-done' : 'is-error');
        box.hidden = false;
      }
      if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(swap);
      else swap();
      setTimeout(function () {
        box.focus({ preventScroll: true });
        var r = form.getBoundingClientRect();
        if (r.top < 0 || r.top > window.innerHeight * 0.6) form.scrollIntoView({ behavior: smooth(), block: 'start' });
      }, 60);
    }
    function submit() {
      if (sending) return;
      if (!validate()) return;
      if (val('company')) { showResult(doneBox); return; }
      sending = true;
      form.classList.add('is-sending');
      btnSubmit.setAttribute('aria-busy', 'true');
      var payload = buildPayload();
      send(payload).then(function () {
        try { if (SS) SS.setItem(CONFIG.leadKey, payload.event_id); } catch (e) { /* ignore */ }
        Pixel.track('Lead', { content_name: payload.service, content_category: 'website_form' }, { eventID: payload.event_id });
        var first = payload.name.split(' ')[0];
        var via = T.via[payload.messenger] || T.via.WhatsApp;
        var txt = $('[data-done-text]', doneBox);
        if (txt) txt.textContent = T.done(first, via);
        var wa = $('a[data-channel="whatsapp"]', doneBox);
        if (wa) wa.href = 'https://wa.me/' + CONFIG.phone + '?text=' + encodeURIComponent(T.waAfter(first));
        showResult(doneBox);
      }, function (err) {
        log('Ошибка отправки заявки', err);
        showResult(errBox);
      }).then(function () {
        sending = false;
        form.classList.remove('is-sending');
        btnSubmit.removeAttribute('aria-busy');
      });
    }

    form.addEventListener('change', function (e) {
      var t = e.target;
      if (t.type === 'radio') {
        syncChecked(t.name);
        setErr(t.name, false);
        if (t.name === 'service') markStarted('service');
      }
      if (t.name === 'consent' && t.checked) setErr('consent', false);
    });
    form.addEventListener('input', function (e) {
      var t = e.target;
      if (t.name === 'name' || t.name === 'phone' || t.name === 'comment') markStarted(t.name);
      if ((t.name === 'name' || t.name === 'phone') && t.getAttribute('aria-invalid') === 'true') {
        var ok = t.name === 'name' ? val('name').length >= 2 : !!normalizePhone(val('phone'));
        if (ok) setErr(t.name, false);
      }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    var retry = $('[data-quiz-retry]', form);
    if (retry) retry.addEventListener('click', function () {
      errBox.hidden = true;
      form.classList.remove('is-error');
      submit();
    });

    Quiz.preselect = function (key, service, planName) {
      if (form.classList.contains('is-done')) return;
      var r = $('input[name="service"][value="' + key + '"]', form);
      if (r) { r.checked = true; syncChecked('service'); setErr('service', false); }
      interest = service || '';
      plan = planName || '';
    };
    Quiz.focus = function () {
      if (form.classList.contains('is-done')) { doneBox.focus({ preventScroll: true }); return; }
      // На телефоне не открываем клавиатуру сами - только на ПК
      if (window.matchMedia('(pointer: fine)').matches) field('name').focus({ preventScroll: true });
    };
    syncChecked('messenger');

    // Переход из раздела «Документы»: index.html?need=work&from=karta-pobytu-praca#form
    // need - что выбрать в форме, topic - название услуги для «Другое», from - с какой страницы пришёл
    try {
      var qp = new URLSearchParams(location.search);
      var need = qp.get('need');
      if (need && SERVICE[need]) Quiz.preselect(need, (qp.get('topic') || '').slice(0, 80), '');
      fromPage = (qp.get('from') || '').replace(/[^a-z0-9\-\/]/gi, '').slice(0, 80);
    } catch (e) { /* ignore */ }
  }

  /* ---------- Переход к форме из любых кнопок ---------- */
  function initFormLinks() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href="#form"]');
      if (!a) return;
      var sit = a.getAttribute('data-situation');
      var planName = a.getAttribute('data-plan');
      if (sit) Quiz.preselect(sit, a.getAttribute('data-service') || '', '');
      else if (planName) Quiz.preselect('work', '', planName);
      var quiz = document.getElementById('quiz');
      if (!quiz) return;
      e.preventDefault();
      if (a.closest('dialog')) Chat.close(true, true);
      quiz.scrollIntoView({ behavior: smooth(), block: 'start' });
      Quiz.focus();
      if (history.replaceState) history.replaceState(null, '', '#form');
    });
  }

  /* ---------- Отзывы: карточки в движении ---------- */
  // Широкий экран - лента плавно едет (Web Animations, только transform): её можно тянуть мышью,
  // крутить колесом вбок, двигать стрелками; наведение и фокус ставят на паузу.
  // Телефон - обычная прокрутка свайпом, лента сама переходит к следующей карточке.
  // «Уменьшить движение» в системе - ничего не едет само, только ручная прокрутка.
  function initReviews() {
    var box = $('[data-reviews]');
    if (!box) return;
    var rail = $('[data-rv-rail]', box);
    var track = $('[data-rv-track]', box);
    var cards = track ? $$('.rv-card', track) : [];
    if (!rail || cards.length < 2) return;
    var toggleBtn = $('[data-rv-toggle]', box);
    var SPEED = Number(box.getAttribute('data-rv-speed')) || 38;      // пикселей в секунду
    var STEP_MS = Number(box.getAttribute('data-rv-step')) || 5500;   // пауза между карточками на телефоне
    var HOLD_MS = Number(box.getAttribute('data-rv-hold')) || 9000;   // не трогаем ленту после действия человека
    var wideMq = window.matchMedia('(min-width: 768px)');
    var canAnimate = typeof track.animate === 'function';

    // Копии карточек для бесконечной ленты: скрыты от скринридеров и от клавиатуры
    var clones = cards.map(function (c) {
      var k = c.cloneNode(true);
      k.setAttribute('aria-hidden', 'true');
      k.setAttribute('data-clone', '');
      $$('button, a', k).forEach(function (b) { b.setAttribute('tabindex', '-1'); });
      track.appendChild(k);
      return k;
    });
    var all = cards.concat(clones);

    var mode = '';        // 'drift' - едет сама, 'scroll' - обычная прокрутка
    var finite = false;   // без копий и без автодвижения
    var anim = null, driftW = 0, driftDur = 0, tween = 0;
    var stepTimer = 0, resumeTimer = 0, settleTimer = 0, resizeTimer = 0;
    var st = { userPaused: false, hover: false, focus: false, inView: false, open: 0, holdUntil: 0, dragging: false };
    var tracked = false;

    function setW() { return clones[0].offsetLeft - cards[0].offsetLeft; }
    function stepW() { return cards[1].offsetLeft - cards[0].offsetLeft; }
    function canRun() {
      return st.inView && !st.userPaused && !st.hover && !st.focus && !st.dragging && st.open === 0 &&
        Date.now() >= st.holdUntil && !document.hidden;
    }
    function interacted(via) {
      if (tracked) return;
      tracked = true;
      Pixel.track('ReviewsInteract', { via: via });
    }
    function sync() {
      var run = canRun();
      if (anim) {
        if (run && !tween) { if (anim.playState !== 'running') anim.play(); }
        else if (anim.playState === 'running') anim.pause();
      }
      box.classList.toggle('is-running', run && !finite);
    }
    function hold(ms) {
      ms = ms || HOLD_MS;
      st.holdUntil = Date.now() + ms;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(sync, ms + 40);
      sync();
    }

    /* --- режим «едет сама» --- */
    function setTime(t) {
      if (!anim || !driftDur) return;
      anim.currentTime = ((t % driftDur) + driftDur) % driftDur;
    }
    function startDrift() {
      var frac = anim && driftDur ? ((anim.currentTime || 0) % driftDur) / driftDur : 0;
      if (anim) anim.cancel();
      driftW = setW();
      driftDur = driftW / SPEED * 1000;
      anim = track.animate(
        [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(' + (-driftW) + 'px,0,0)' }],
        { duration: driftDur, iterations: Infinity, easing: 'linear' }
      );
      anim.pause();
      setTime(frac * driftDur);
      sync();
    }
    function driftBy(px) {
      // плавный сдвиг ленты на px (вперёд - положительное число)
      var from = anim.currentTime || 0;
      var delta = px / driftW * driftDur;
      var t0 = performance.now();
      cancelAnimationFrame(tween);
      anim.pause();
      (function frame(ts) {
        var k = Math.min(1, (ts - t0) / 420);
        setTime(from + delta * (1 - Math.pow(1 - k, 3)));
        if (k < 1) tween = requestAnimationFrame(frame); else { tween = 0; sync(); }
      })(t0);
    }

    /* --- режим обычной прокрутки --- */
    function normalize() {
      if (mode !== 'scroll' || finite) return;
      var w = setW();
      if (w > 0 && rail.scrollLeft >= w - 1) rail.scrollLeft -= w;
    }
    function go(dir) {
      var s = stepW();
      if (!(s > 0)) return;
      var left;
      if (finite) {
        var max = rail.scrollWidth - rail.clientWidth;
        left = Math.max(0, Math.min(max, (Math.round(rail.scrollLeft / s) + dir) * s));
      } else {
        normalize();
        if (dir < 0 && rail.scrollLeft < s / 2) rail.scrollLeft += setW();   // с первой карточки назад - к последней
        left = (Math.round(rail.scrollLeft / s) + dir) * s;
      }
      rail.scrollTo({ left: left, behavior: smooth() });
    }
    function startScroll() {
      clearInterval(stepTimer);
      stepTimer = finite ? 0 : setInterval(function () { if (mode === 'scroll' && canRun()) go(1); }, STEP_MS);
      sync();
    }

    function setMode() {
      finite = reduceMotion.matches;
      var want = (!finite && canAnimate && wideMq.matches) ? 'drift' : 'scroll';
      box.classList.toggle('rv--finite', finite);
      if (anim) { anim.cancel(); anim = null; }
      cancelAnimationFrame(tween); tween = 0;
      clearInterval(stepTimer); stepTimer = 0;
      if (want !== mode) rail.scrollLeft = 0;
      mode = want;
      rail.classList.toggle('is-drift', mode === 'drift');
      box.setAttribute('data-rv-mode', finite ? 'manual' : mode);
      if (mode === 'drift') startDrift(); else startScroll();
    }

    /* --- «Читать полностью» --- */
    function checkClamp() {
      all.forEach(function (c) {
        var t = $('.rv-card__text', c), b = $('[data-rv-more]', c);
        if (!t || !b || c.classList.contains('is-open')) return;
        b.hidden = !(t.scrollHeight > t.clientHeight + 2);
      });
    }
    track.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rv-more]');
      if (!b) return;
      var i = all.indexOf(b.closest('.rv-card')) % cards.length;
      var open = !cards[i].classList.contains('is-open');
      [cards[i], clones[i]].forEach(function (c) {
        var btn = $('[data-rv-more]', c);
        c.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = btn.getAttribute(open ? 'data-less' : 'data-more');
      });
      st.open += open ? 1 : -1;
      interacted('expand');
      if (open) sync(); else hold(3000);
    });

    /* --- управление --- */
    function nudge(dir, via) {
      interacted(via);
      if (mode === 'drift') { driftBy(dir * stepW()); hold(4000); }
      else { go(dir); hold(); }
    }
    var prevBtn = $('[data-rv-prev]', box), nextBtn = $('[data-rv-next]', box);
    if (prevBtn) prevBtn.addEventListener('click', function () { nudge(-1, 'arrow'); });
    if (nextBtn) nextBtn.addEventListener('click', function () { nudge(1, 'arrow'); });
    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      st.userPaused = !st.userPaused;
      toggleBtn.setAttribute('aria-pressed', st.userPaused ? 'true' : 'false');
      toggleBtn.setAttribute('aria-label', toggleBtn.getAttribute(st.userPaused ? 'data-label-play' : 'data-label-pause'));
      interacted('pause');
      sync();
    });
    rail.addEventListener('keydown', function (e) {
      if (e.target !== rail || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      if (mode === 'drift') { e.preventDefault(); nudge(e.key === 'ArrowRight' ? 1 : -1, 'keyboard'); }
      else hold();
    });

    // мышь: наведение - пауза; перетаскивание ленты
    rail.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { st.hover = true; sync(); } });
    rail.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { st.hover = false; sync(); } });
    var drag = null, dragged = false;
    rail.addEventListener('pointerdown', function (e) {
      if (mode !== 'drift') { interacted('swipe'); hold(); return; }
      if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, a')) return;
      cancelAnimationFrame(tween); tween = 0;
      drag = { id: e.pointerId, x: e.clientX, t: anim.currentTime || 0, moved: false };
      st.dragging = true;
      sync();
    });
    rail.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) {
        drag.moved = true;
        rail.classList.add('is-dragging');
        try { rail.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        try { window.getSelection().removeAllRanges(); } catch (err2) { /* ignore */ }
        interacted('drag');
      }
      if (drag.moved) setTime(drag.t - dx / driftW * driftDur);
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      dragged = drag.moved;
      drag = null;
      st.dragging = false;
      rail.classList.remove('is-dragging');
      if (dragged) { hold(2500); setTimeout(function () { dragged = false; }, 0); } else sync();
    }
    rail.addEventListener('pointerup', endDrag);
    rail.addEventListener('pointercancel', endDrag);
    rail.addEventListener('click', function (e) { if (dragged) { e.preventDefault(); e.stopPropagation(); } }, true);
    rail.addEventListener('wheel', function (e) {
      if (mode !== 'drift') { hold(); return; }
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // вертикальная прокрутка страницы - не мешаем
      e.preventDefault();
      cancelAnimationFrame(tween); tween = 0;
      setTime((anim.currentTime || 0) + e.deltaX / driftW * driftDur);
      interacted('wheel');
      hold(2500);
    }, { passive: false });
    rail.addEventListener('scroll', function () {
      if (mode !== 'scroll' || finite) return;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(normalize, 140);
    }, { passive: true });

    // клавиатура: пока фокус внутри блока - ничего не едет
    box.addEventListener('focusin', function (e) {
      var fv = true;
      try { fv = e.target.matches(':focus-visible'); } catch (err) { fv = true; }
      st.focus = fv;
      sync();
    });
    box.addEventListener('focusout', function () { st.focus = false; sync(); });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var was = st.inView;
        st.inView = entries[entries.length - 1].isIntersecting;
        // блок появился на экране - отсчёт до первого перехода начинаем заново, чтобы карточку успели прочитать
        if (st.inView && !was && mode === 'scroll') startScroll();
        sync();
      }, { threshold: 0.15 }).observe(box);
    } else st.inView = true;
    document.addEventListener('visibilitychange', sync);

    function onMq(mq, fn) { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); }
    onMq(wideMq, setMode);
    onMq(reduceMotion, setMode);
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (mode === 'drift' && Math.abs(setW() - driftW) > 1) startDrift();
        checkClamp();
      }, 200);
    }, { passive: true });

    setMode();
    checkClamp();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { checkClamp(); if (mode === 'drift' && Math.abs(setW() - driftW) > 1) startDrift(); });
  }

  /* ---------- Запуск ---------- */
  safe(initReveal, 'reveal');
  safe(initConsent, 'consent');
  safe(initHeader, 'header');
  safe(initMenu, 'menu');
  safe(initScrollSpy, 'scrollspy');
  safe(initCounters, 'counters');
  safe(initSteps, 'steps');
  safe(initWaits, 'waits');
  safe(initTilt, 'tilt');
  safe(initChat, 'chat');
  safe(initFloating, 'floating');
  safe(initTracking, 'tracking');
  safe(initLeadForm, 'form');
  safe(initFormLinks, 'formlinks');
  safe(initReviews, 'reviews');
  safe(function () { $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); }); }, 'year');
  runScroll();

  // Общие функции для других скриптов сайта (js/docs.js): UTM, пиксель после согласия, отправка в Make
  window.Residia = {
    isProd: IS_PROD,
    webhook: CONFIG.webhook,
    phone: CONFIG.phone,
    attr: function () { return Attr.get(); },
    track: function (name, params, opts) { Pixel.track(name, params, opts); },
    normalizePhone: normalizePhone,
    log: log
  };

  root.classList.add('rz-ready');
})();
