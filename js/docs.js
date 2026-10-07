/* ==========================================================================
   Residia - раздел «Документы» (dokumenty/). Vanilla JS, без зависимостей.
   - Чек-лист: отметки хранятся в браузере (localStorage), счётчик, сброс
   - Печать и «Поделиться» (системное окно на телефоне, панель со ссылками на ПК)
   - Шаблоны: скачивание; вариант «за контакт» - заявка в Make (source = template_request)
   Общие функции (UTM, пиксель после согласия, отправка только с residia.pl) - window.Residia из js/site.js.
   ========================================================================== */
(function () {
  'use strict';

  var R = window.Residia || {};
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function track(name, params, opts) { try { if (R.track) R.track(name, params || {}, opts); } catch (e) { /* ignore */ } }
  function safe(fn, name) { try { fn(); } catch (e) { if (window.console) console.error('[Residia] ' + name, e); } }

  var LS = null;
  try { window.localStorage.setItem('__rz_t', '1'); window.localStorage.removeItem('__rz_t'); LS = window.localStorage; } catch (e) { LS = null; }

  /* ---------- Чек-лист ---------- */
  function initChecklist() {
    var box = $('[data-checklist]');
    if (!box) return;
    var slug = box.getAttribute('data-checklist');
    var key = 'rz_ck_' + slug;
    var all = $$('.ck__cb', box);
    // Необязательные группы («если работаете через агентство») в счётчик не входят
    var core = all.filter(function (cb) { return !cb.hasAttribute('data-ck-optional'); });
    var doneEl = $('[data-ck-done]', box);
    var fill = $('[data-ck-fill]', box);
    var resetBtn = $('[data-ck-reset]', box);

    var saved = [];
    try { saved = JSON.parse((LS && LS.getItem(key)) || '[]') || []; } catch (e) { saved = []; }
    if (Object.prototype.toString.call(saved) !== '[object Array]') saved = [];
    all.forEach(function (cb) { cb.checked = saved.indexOf(cb.value) !== -1; });
    var used = saved.length > 0;

    function checked(list) { return list.filter(function (cb) { return cb.checked; }); }
    function paint() {
      var n = checked(core).length;
      if (doneEl) doneEl.textContent = String(n);
      if (fill) fill.style.width = (core.length ? Math.round(n / core.length * 100) : 0) + '%';
      if (resetBtn) resetBtn.hidden = checked(all).length === 0;
    }
    function save() {
      var ids = checked(all).map(function (cb) { return cb.value; });
      try {
        if (!LS) return;
        if (ids.length) LS.setItem(key, JSON.stringify(ids)); else LS.removeItem(key);
      } catch (e) { /* ignore */ }
    }
    box.addEventListener('change', function (e) {
      if (!e.target.classList || !e.target.classList.contains('ck__cb')) return;
      save();
      paint();
      if (!used) { used = true; track('ChecklistUse', { page: slug }); }
    });
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        all.forEach(function (cb) { cb.checked = false; });
        save();
        paint();
        if (core[0]) core[0].focus();
      });
    }
    paint();
  }

  /* ---------- Печать ---------- */
  function initPrint() {
    $$('[data-print]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        track('ChecklistPrint', { page: location.pathname });
        window.print();
      });
    });
  }

  /* ---------- Поделиться ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }
  function initShare() {
    var btn = $('[data-share]');
    var panel = $('[data-share-panel]');
    if (!btn || !panel) return;
    var holder = btn.closest('[data-share-url]');
    var url = (holder && holder.getAttribute('data-share-url')) || location.href;
    var title = (holder && holder.getAttribute('data-share-title')) || document.title;
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    function toggle(open) {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () {
      // На телефоне - системное окно «Поделиться», на ПК - панель со ссылками
      if (touch && navigator.share) {
        track('ChecklistShare', { via: 'native' });
        navigator.share({ title: title, url: url }).catch(function () { /* закрыли окно - ничего не делаем */ });
        return;
      }
      toggle(panel.hidden);
    });
    var copyBtn = $('[data-copy]', panel);
    var label = copyBtn && $('[data-copy-label]', copyBtn);
    if (copyBtn && label) {
      var initial = label.textContent;
      copyBtn.addEventListener('click', function () {
        copyText(url).then(function () {
          label.textContent = 'Ссылка скопирована';
          track('ChecklistShare', { via: 'copy' });
        }, function () {
          label.textContent = 'Не получилось - скопируйте из адресной строки';
        }).then(function () {
          setTimeout(function () { label.textContent = initial; }, 2600);
        });
      });
    }
    panel.addEventListener('click', function (e) {
      var a = e.target.closest('[data-share-to]');
      if (a) track('ChecklistShare', { via: a.getAttribute('data-share-to') });
    });
  }

  /* ---------- Шаблоны документов ---------- */
  function initTemplates() {
    document.addEventListener('click', function (e) {
      var dl = e.target.closest('[data-tpl-download]');
      if (dl) track('TemplateDownload', { template: dl.getAttribute('data-tpl') });
    });

    // Вариант «за контакт»: окно с формой есть на странице только в этом режиме
    var dlg = $('[data-tpl-dialog]');
    if (!dlg) return;
    var form = $('[data-tpl-form]', dlg);
    var done = $('[data-tpl-done]', dlg);
    var nameEl = $('[data-tpl-name]', dlg);
    var fileLink = $('[data-tpl-file-link]', dlg);
    var submitBtn = $('[data-tpl-submit]', form);
    var current = null;
    var sending = false;
    var lastFocus = null;

    function setErr(name, on) {
      var m = $('[data-tpl-err="' + name + '"]', form);
      if (m) m.hidden = !on;
      form.elements[name].setAttribute('aria-invalid', on ? 'true' : 'false');
    }
    function startDownload() {
      if (!current) return;
      var a = document.createElement('a');
      a.href = current.file;
      a.setAttribute('download', '');
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    function open(btn) {
      current = { key: btn.getAttribute('data-tpl'), title: btn.getAttribute('data-tpl-title'), file: btn.getAttribute('data-tpl-file') };
      lastFocus = btn;
      if (nameEl) nameEl.textContent = current.title;
      if (fileLink) fileLink.setAttribute('href', current.file);
      form.hidden = false;
      done.hidden = true;
      setErr('name', false);
      setErr('phone', false);
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else { startDownload(); return; }   // старые браузеры: отдаём файл без формы
      track('TemplateOpen', { template: current.key });
    }
    function close() {
      if (dlg.open) dlg.close();
    }
    dlg.addEventListener('close', function () {
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-tpl-close]')) close();
    });
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tpl-open]');
      if (btn) open(btn);
    });

    function send(payload) {
      if (!R.isProd || !R.webhook) {
        if (R.log) R.log('Превью: запрос шаблона НЕ отправлен в Make (отправка работает только на residia.pl). Данные:', payload);
        return new Promise(function (resolve) { setTimeout(resolve, 400); });
      }
      return fetch(R.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res; });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending || !current) return;
      var name = String(form.elements.name.value || '').trim();
      var phone = R.normalizePhone ? R.normalizePhone(form.elements.phone.value) : String(form.elements.phone.value || '').trim();
      var nameOk = name.length >= 2;
      var phoneOk = !!phone;
      setErr('name', !nameOk);
      setErr('phone', !phoneOk);
      if (!nameOk) { form.elements.name.focus(); return; }
      if (!phoneOk) { form.elements.phone.focus(); return; }
      function finish() {
        form.hidden = true;
        done.hidden = false;
        done.focus({ preventScroll: true });
        startDownload();
      }
      // Бот заполнил скрытое поле - файл отдаём, заявку не создаём
      if (String(form.elements.company.value || '')) { finish(); return; }
      sending = true;
      submitBtn.setAttribute('aria-busy', 'true');
      var attr = R.attr ? R.attr() : {};
      var eventId = 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      var payload = {
        name: name.slice(0, 60),
        phone: phone,
        telegram: '',
        service: 'Шаблон: ' + current.title,
        source: 'template_request',
        comment: ['Запрос шаблона документа с сайта', 'Шаблон: ' + current.title, 'Страница: ' + location.pathname].join('\n'),
        submitted_at: new Date().toISOString(),
        template: current.key,
        utm_source: attr.utm_source || '',
        utm_medium: attr.utm_medium || '',
        utm_campaign: attr.utm_campaign || '',
        utm_content: attr.utm_content || '',
        utm_term: attr.utm_term || '',
        fbclid: attr.fbclid || '',
        landing_page: attr.landing_page || location.href,
        referrer: attr.referrer || '',
        page_url: location.href.slice(0, 1000),
        page_lang: 'ru',
        event_id: eventId
      };
      // Файл отдаём в любом случае: человек не должен остаться без шаблона из-за сбоя сети
      send(payload).then(function () {
        // Не стандартный Lead: запрос шаблона слабее заявки, оптимизация рекламы остаётся на настоящих лидах
        track('TemplateLead', { template: current.key }, { eventID: eventId });
      }, function (err) {
        if (R.log) R.log('Ошибка отправки запроса шаблона', err);
      }).then(function () {
        sending = false;
        submitBtn.removeAttribute('aria-busy');
        finish();
      });
    });
  }

  safe(initChecklist, 'checklist');
  safe(initPrint, 'print');
  safe(initShare, 'share');
  safe(initTemplates, 'templates');
})();
