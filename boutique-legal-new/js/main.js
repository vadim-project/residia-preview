document.addEventListener('DOMContentLoaded', () => {
    
    /*(Dark/Light Mode)*/
    const themeToggleBtn = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

// Если пользователь ещё не выбрал — берём системную тему
const savedTheme = localStorage.getItem('theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

htmlElement.setAttribute('data-theme', savedTheme);

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

    /*Контактная форма (AJAX + Validation)*/
    const contactForm = document.getElementById('contact-form');

    if (contactForm) {
        const cfSuccess = document.getElementById('cf-success');
        const submitBtn = contactForm.querySelector('.btn-contact-submit');
        const phoneRegex = /^\+48\d{9}$/;

        const fields = {
            name: document.getElementById('cf-name'),
            phone: document.getElementById('cf-phone'),
            telegram: document.getElementById('cf-telegram'),
            service: document.getElementById('cf-service'),
        };

        Object.values(fields).forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    input.parentElement.classList.remove('has-error');
                });
            }
        });

        const validate = () => {
            let valid = true;

            // Имя (обязательно)
            if (!fields.name.value.trim()) {
                fields.name.parentElement.classList.add('has-error');
                valid = false;
            }

            // Телефон (обязательно, формат +48 и 9 цифр)
            const cleanPhone = fields.phone.value.replace(/[\s\-]/g, '');
            if (!phoneRegex.test(cleanPhone)) {
                fields.phone.parentElement.classList.add('has-error');
                valid = false;
            }

            // Услуга 
            if (!fields.service.value) {
                fields.service.parentElement.classList.add('has-error');
                valid = false;
            }

            return valid;
        };

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validate()) return;

            submitBtn.classList.add('is-loading');
            submitBtn.disabled = true;

            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: new FormData(contactForm),
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    contactForm.classList.add('hidden');
                    cfSuccess.classList.remove('hidden');
                } else {
                    throw new Error();
                }
            } catch (err) {
                alert('Ошибка отправки. Пожалуйста, напишите нам в Telegram @residia');
                submitBtn.classList.remove('is-loading');
                submitBtn.disabled = false;
            }
        });
    }

    /*Плавающая кнопка (FAB)*/
    const fabToggle = document.getElementById('fab-toggle');
    const fabWrapper = document.getElementById('fab-wrapper');

    if (fabToggle && fabWrapper) {
        fabToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            fabWrapper.classList.toggle('is-open');
        });

        // Закрытие меню при клике вне кнопки
        document.addEventListener('click', (event) => {
            if (!fabWrapper.contains(event.target)) {
                fabWrapper.classList.remove('is-open');
            }
        });
    }
});

const services = [
    {
        id: '01',
        tag: 'B2B',
        title: 'Регистрация Sp. z o.o.',
        desc: 'Полный цикл открытия компании в Польше. Подготовка устава, нотариальное сопровождение, регистрация в KRS, VAT и ZUS.'
    },
    {
        id: '02',
        tag: 'B2B',
        title: 'Бизнес-инкубатор',
        desc: 'Легальная работа в Польше без регистрации собственного юрлица. Идеально для фрилансеров и IT-контракторов.'
    },
    {
        id: '03',
        tag: 'B2C',
        title: 'Karta Pobytu',
        desc: 'ВНЖ на основании работы, бизнеса или воссоединения семьи. От аудита документов до получения пластика.'
    },
    {
        id: '04',
        tag: 'B2C',
        title: 'Blue Card (EU)',
        desc: 'Оформление ВНЖ для высококвалифицированных специалистов. Ускоренная процедура и расширенные права для семьи.'
    }
];

function renderServices() {
    const grid = document.getElementById('services-grid');
    if (!grid) return;

    services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.dataset.category = service.tag.toLowerCase();

        card.innerHTML = `
            <div class="card-bg-number">${service.id}</div>
            <div class="card-content">
                <div class="card-tag">${service.tag}</div>
                <h3>${service.title}</h3>
                <p>${service.desc}</p>
            </div>
        `;

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

    document.querySelectorAll('.service-card, .feature-card, .stat-item')
        .forEach(el => {
            el.classList.add('animate-on-scroll');
            observer.observe(el);
        });
}

initScrollAnimations();

function initStickyHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

initStickyHeader();