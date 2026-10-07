document.addEventListener('DOMContentLoaded', () => {
    /* === 1. ТЕМНАЯ/СВЕТЛАЯ ТЕМА === */
    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;
    const savedTheme = localStorage.getItem('theme') || 'light';
    htmlElement.setAttribute('data-theme', savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = htmlElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            htmlElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    // =========================================================
    // ГЛОБАЛЬНЫЕ НАСТРОЙКИ ФОРМ
    // =========================================================
    // Единый вебхук (тот же, что и в Анализаторе)
    const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/58m3066jyr2wr7pm5g6ql6zvb2utponu';
    // Мягкая валидация (пропускает +, скобки, пробелы и коды любых стран)
    const phoneRegex = /^\+?[0-9\s\-\(\)]{9,15}$/;

    /* === 2. КОНТАКТНАЯ ФОРМА (В ПОДВАЛЕ ГЛАВНОЙ СТРАНИЦЫ) === */
    const mainForm = document.getElementById('contact-form');
    if (mainForm) {
        mainForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Блокируем стандартную отправку
            
            const nameInput = document.getElementById('cf-name');
            const phoneInput = document.getElementById('cf-phone');
            const telegramInput = document.getElementById('cf-telegram');
            const serviceInput = document.getElementById('cf-service');
            const messageInput = document.getElementById('cf-message');
            
            const name = nameInput.value.trim();
            const phone = phoneInput.value.trim();
            const telegram = telegramInput ? telegramInput.value.trim() : '';
            const service = serviceInput ? serviceInput.value : 'Не указано';
            const message = messageInput ? messageInput.value.trim() : '';
            
            // Валидация
            let hasError = false;
            if (!name) { nameInput.parentElement.classList.add('has-error'); hasError = true; }
            if (!phoneRegex.test(phone)) { phoneInput.parentElement.classList.add('has-error'); hasError = true; }
            if (!service) { serviceInput.parentElement.classList.add('has-error'); hasError = true; }
            
            if (hasError) return;
            
            const submitBtn = mainForm.querySelector('.btn-contact-submit');
            submitBtn.classList.add('is-loading');
            submitBtn.disabled = true;
            
            const payload = {
                name: name,
                phone: phone,
                telegram: telegram,
                service: service,
                source: 'main_page_form',
                comment: message,
                submitted_at: new Date().toISOString()
            };

            fetch(MAKE_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(() => {
                document.getElementById('cf-success').classList.remove('hidden');
                mainForm.style.opacity = '0'; 
                mainForm.style.pointerEvents = 'none';
                
                if (typeof fbq === 'function') {
                    fbq('track', 'Contact', { content_name: 'Modal Form' });
                }

            }).catch(err => {
                console.error('Ошибка:', err);
                submitBtn.classList.remove('is-loading');
                submitBtn.disabled = false;
                alert('Произошла ошибка связи с сервером. Попробуйте еще раз.');
            });
        });
        
        mainForm.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', () => input.parentElement.classList.remove('has-error'));
        });
    }

    /* === 3. ЛОГИКА ПЛАВАЮЩИХ КНОПОК И МОДАЛКИ === */
    const fabToggle = document.getElementById('fab-toggle');
    const fabWrapper = document.getElementById('fab-wrapper');
    const chatFab = document.getElementById('open-modal-fab');
    const modal = document.getElementById('callback-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const modalForm = document.getElementById('modal-callback-form');

    if (fabToggle && fabWrapper) {
        fabToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            fabWrapper.classList.toggle('is-open');
            
            if (chatFab) {
                if (fabWrapper.classList.contains('is-open')) chatFab.classList.add('is-hidden');
                else chatFab.classList.remove('is-hidden');
            }
        });
    }

    function closeModal() {
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = ''; 
            const successMsg = document.getElementById('md-success-msg');
            if (successMsg) successMsg.classList.add('hidden');
            if (modalForm) {
                modalForm.style.display = 'block';
                modalForm.reset();
            }
        }
    }

    if (chatFab && modal) {
        chatFab.addEventListener('click', (e) => {
            e.stopPropagation();
            if (modal.classList.contains('hidden')) {
                modal.classList.remove('hidden');
                document.body.style.overflow = 'hidden'; 
            } else {
                closeModal();
            }
        });
    }

    document.addEventListener('click', (event) => {
        if (fabWrapper && fabWrapper.classList.contains('is-open') && !fabWrapper.contains(event.target)) {
            fabWrapper.classList.remove('is-open');
            if (chatFab) chatFab.classList.remove('is-hidden');
        }
        if (modal && !modal.classList.contains('hidden') && event.target === modal) {
            closeModal();
        }
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // =========================================================
    // 4. ФОРМА БЫСТРОЙ СВЯЗИ (В МОДАЛКЕ)
    // =========================================================
    if (modalForm) {
        modalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const nameInput = document.getElementById('md-name');
            const phoneInput = document.getElementById('md-phone');
            const commentInput = document.getElementById('md-comment');
            
            const name = nameInput.value.trim();
            const phone = phoneInput.value.trim();
            const comment = commentInput ? commentInput.value.trim() : '';
            
            let hasError = false;
            if (!name) { nameInput.style.borderColor = '#ef4444'; hasError = true; }
            if (!phoneRegex.test(phone)) { phoneInput.style.borderColor = '#ef4444'; hasError = true; }
            
            if (hasError) return;
            
            const submitBtn = document.getElementById('btn-modal-submit');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = 'Отправка... ⏳';
            submitBtn.disabled = true;
            
            // ВАЖНО: Структура теперь строго совпадает с нижней формой!
            const payload = {
                name: name,
                phone: phone,
                telegram: '', // Пустое поле, чтобы не сломать парсер Make
                service: 'Консультация', // ДОЛЖНО совпадать со списком Notion!
                source: 'modal_form',
                comment: comment,
                submitted_at: new Date().toISOString()
            };

            fetch(MAKE_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(() => {
                modalForm.style.display = 'none';
                document.getElementById('md-success-msg').classList.remove('hidden');
                setTimeout(closeModal, 3000);
            }).catch(err => {
                console.error('Ошибка:', err);
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                alert('Ошибка соединения. Попробуйте еще раз.');
            });
        });
        
        modalForm.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => input.style.borderColor = 'var(--border-color)');
        });
    }

    /* === 6. БУРГЕР-МЕНЮ (мобильная навигация) === */
    // Безопасно для всех страниц: если .burger-btn нет — ничего не делает.
    (function initBurgerMenu() {
    const burgerBtn = document.querySelector('.burger-btn');
    const mainNav   = document.querySelector('.main-nav');
    if (!burgerBtn || !mainNav) return;
    if (burgerBtn.dataset.bound === 'true') return;
    burgerBtn.dataset.bound = 'true';

    // Создаём подложку-затемнение
    let overlay = document.querySelector('.nav-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        document.body.appendChild(overlay);
    }

    const toggle = (open) => {
        const willOpen = (typeof open === 'boolean') ? open : !mainNav.classList.contains('active');
        mainNav.classList.toggle('active', willOpen);
        burgerBtn.classList.toggle('active', willOpen);
        document.body.classList.toggle('nav-open', willOpen);
        overlay.classList.toggle('active', willOpen);
    };

    burgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
    });

    // Клик по ссылке — закрываем
    mainNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => toggle(false));
    });

    // Клик вне панели — закрываем (overlay pointer-events:none, поэтому через document)
    document.addEventListener('click', (e) => {
        if (mainNav.classList.contains('active') &&
            !mainNav.contains(e.target) &&
            !burgerBtn.contains(e.target)) {
            toggle(false);
        }
    });
    })();   
});

/* === 5. АНИМАЦИИ И РЕНДЕР СЕРВИСОВ (НЕ ТРОГАЕМ) === */
const services = [
    { id: '01', tag: 'B2C', title: 'Карта CUKR', desc: 'Переход с временной защиты на ВНЖ сроком на 3 года для граждан Украины. Упрощенная процедура легализации.' },
    { id: '02', tag: 'B2C', title: 'Замена прав', desc: 'Полное сопровождение процесса обмена иностранного водительского удостоверения на польское.' },
    { id: '03', tag: 'B2C', title: 'Karta Pobytu', desc: 'ВНЖ на основании работы, бизнеса или воссоединения семьи. От аудита документов до получения пластика.' },
    { id: '04', tag: 'B2C', title: 'Blue Card (EU)', desc: 'Оформление ВНЖ для высококвалифицированных специалистов. Ускоренная процедура.' }
];

function renderServices() {
    const grid = document.getElementById('services-grid');
    if (!grid) return;
    services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.dataset.category = service.tag.toLowerCase();
        card.innerHTML = `<div class="card-bg-number">${service.id}</div>
            <div class="card-content"><div class="card-tag">${service.tag}</div><h3>${service.title}</h3><p>${service.desc}</p></div>`;
        grid.appendChild(card);
    });
}
renderServices();

function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.service-card, .feature-card, .stat-item').forEach(el => {
        el.classList.add('animate-on-scroll');
        observer.observe(el);
    });
}
initScrollAnimations();

function initStickyHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    });
}
initStickyHeader();