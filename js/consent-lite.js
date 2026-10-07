/* ==========================================================================
   Residia - согласие на cookie + Meta Pixel для внутренних страниц
   (analyzer.html, faq.html, privacy.html). Тот же ключ, что и на главной:
   если человек уже нажал «Принять» или «Только необходимые» на главной,
   баннер здесь не показывается повторно.
   ========================================================================== */
(function () {
  'use strict';
  var KEY = 'rz_consent';
  var ATTR_KEY = 'rz_attr';
  var PIXEL_ID = '984774087451139';
  var IS_PROD = ['residia.pl', 'www.residia.pl'].indexOf(location.hostname) !== -1;

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) {
    try { localStorage.setItem(KEY, v); localStorage.setItem(KEY + '_at', new Date().toISOString()); } catch (e) { /* ignore */ }
  }

  // UTM / fbclid сохраняем так же, как на главной (для заявки из квиза)
  try {
    var params = new URLSearchParams(location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
    var fresh = {};
    keys.forEach(function (k) { var v = params.get(k); if (v) fresh[k] = v.slice(0, 300); });
    var saved = JSON.parse(sessionStorage.getItem(ATTR_KEY) || '{}') || {};
    if (Object.keys(fresh).length) {
      fresh.landing_page = location.href.slice(0, 1000);
      fresh.referrer = (document.referrer || '').slice(0, 500);
      sessionStorage.setItem(ATTR_KEY, JSON.stringify(fresh));
    } else if (!saved.landing_page) {
      saved.landing_page = location.href.slice(0, 1000);
      saved.referrer = (document.referrer || '').slice(0, 500);
      sessionStorage.setItem(ATTR_KEY, JSON.stringify(saved));
    }
  } catch (e) { /* ignore */ }

  function loadPixel() {
    if (window.__rzPixelLoaded) return;
    window.__rzPixelLoaded = true;
    if (!IS_PROD) { if (window.console) console.info('[Residia] Пиксель: режим превью, скрипт Meta не загружается'); return; }
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('consent', 'grant');
    // Как в site.js: пиксель не собирает сам тексты нажатых кнопок, только названные события
    window.fbq('set', 'autoConfig', false, PIXEL_ID);
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function showBanner() {
    if (document.getElementById('rz-cookie')) return;
    var box = document.createElement('div');
    box.id = 'rz-cookie';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Настройки cookie');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:460px;padding:16px;border-radius:20px;background:#14181A;color:#D6D1C8;box-shadow:inset 0 0 0 1px rgba(244,239,230,.12),0 20px 50px rgba(0,0,0,.4);font:14px/1.5 Onest,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    box.innerHTML =
      '<p style="margin:0 0 12px">Мы используем cookie и пиксель Meta, чтобы понимать, откуда приходят клиенты, и не показывать лишнюю рекламу. <a href="privacy.html" style="color:#8CEFC4">Подробнее</a></p>' +
      '<div style="display:flex;gap:8px">' +
      '<button type="button" data-a="granted" style="flex:1;min-height:46px;border:0;border-radius:13px;background:#2FA876;color:#0E1112;font:600 15px/1.2 Onest,system-ui,-apple-system,sans-serif;cursor:pointer">Принять</button>' +
      '<button type="button" data-a="denied" style="flex:1;min-height:46px;border:0;border-radius:13px;background:transparent;color:#F4EFE6;box-shadow:inset 0 0 0 1px rgba(244,239,230,.24);font:600 15px/1.2 Onest,system-ui,-apple-system,sans-serif;cursor:pointer">Только необходимые</button>' +
      '</div>';
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-a]');
      if (!btn) return;
      var v = btn.getAttribute('data-a');
      set(v);
      box.parentNode.removeChild(box);
      if (v === 'granted') loadPixel();
      else if (typeof window.fbq === 'function') window.fbq('consent', 'revoke');
    });
    document.body.appendChild(box);
  }

  window.rzCookieSettings = showBanner;
  var state = get();
  if (state === 'granted') loadPixel();
  else if (!state) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(showBanner, 600); });
    else setTimeout(showBanner, 600);
  }
})();
