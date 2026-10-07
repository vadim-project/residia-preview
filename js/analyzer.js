// ============================================================
// RESIDIA - Анализатор шансов (v3, сентябрь 2026)
// Ветвящийся опросник | Оценка по рискам | Экран контактов | Отчёт
//
// Как считается оценка (раздел 2b):
//   старт - 100 баллов (кейс без рисков). Каждый риск из ответов снижает оценку:
//   небольшой -5, средний -12, серьёзный -25, критичный -35 и не выше 40,
//   стоп-фактор (подать в текущем виде нельзя) - не выше 15 или своего лимита.
//   Если рисков нет, их не придумываем: оценка 100, в отчёте - «рисков не выявлено».
// Правила по каждому ответу - в RULES (2b), списки документов - в DOCS (2c).
// Вопросы и ветки (FLOW), отправка в Make и оформление не менялись.
// ============================================================

// ─── 1. STATE ───────────────────────────────────────────────

const AnalyzerState = {
    currentStepId: null,
    answers: {},
    history: [],
    downloadedPdf: false,
    contactInfo: {},
    docExpiryDays: null,
    progressTotal: 8,
    conversationHistory: [],
    aiMode: false,

    reset() {
        this.currentStepId = null;
        this.answers = {};
        this.history = [];
        this.downloadedPdf = false;
        this.contactInfo = {};
        this.docExpiryDays = null;
        this.progressTotal = 8;
        this.conversationHistory = [];
        this.aiMode = false;
        this.notionPageId = null;
        this.finalTimeline = null;
        this.eventId = null;
    },

    // Ответ хранит только выбор человека. Оценка, риски и плюсы каждый раз
    // заново считаются из ответов (evaluateCase), поэтому «Назад» ничего не ломает
    // и риски не дублируются.
    addAnswer(questionId, valueId, label) {
        this.answers[questionId] = { value: valueId, label };
    },

    rollbackAnswer(questionId) {
        if (questionId === 'doc_expiry_days') this.docExpiryDays = null;
        delete this.answers[questionId];
    },

    getDeadlineInfo() {
        const days = this.docExpiryDays;
        if (!days || days <= 0) return null;
        const submitByDate = new Date();
        submitByDate.setDate(submitByDate.getDate() + days - 14);
        const formatted = submitByDate.toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
        return {
            daysLeft:   days,
            submitBy:   formatted,
            isUrgent:   days <= 45,
            isCritical: days <= 14,
        };
    },

    getFinalScore() {
        return evaluateCase().score;
    }
};

// ─── 2. STATIC DECISION TREE ────────────────────────────────

const FLOW = {

    start_status: {
        question: "Каков ваш текущий статус легализации?",
        subtitle: "Выберите подходящий вариант, чтобы адаптировать юридический разбор под вашу ситуацию.",
        type: "options",
        options: [
            { id: "status_submitted", label: "⏳ Я уже подан на карту побыта (жду решение)", next: "urzad_location" },
            { id: "status_planning", label: "📅 Я только планирую подачу документов", next: "main_goal" }
        ]
    },

    main_goal: {
        question: "Что именно вас интересует?",
        subtitle: "Выберите наиболее подходящий вариант, чтобы система адаптировала юридические вопросы под ваш кейс.",
        type: "options",
        options: [
            { id: "goal_work", label: "Карта побыта по работе", next: "urzad_location" },
            { id: "goal_cukr", label: "Подача на карту CUKR", next: "urzad_location" },
            { id: "goal_family", label: "Карта побыта/Воссоединение семьи", next: "urzad_location" },
            { id: "goal_staly", label: "Карта сталого побыта", next: "urzad_location" },
            { id: "goal_resident", label: "Карта долгосрочного резидента ЕС", next: "urzad_location" }
        ]
    },

    staly_basis: {
        question: "На каком основании вы планируете запрашивать Карту Сталого Побыта?",
        subtitle: "Для этой карты необходимы веские основания, связанные с происхождением или семейным статусом.",
        type: "options",
        options: [
            { id: "staly_kp", label: "У меня есть действующая Карта Поляка", next: "staly_integration" },
            { id: "staly_roots", label: "У меня есть документы, подтверждающие польские корни", next: "staly_integration" },
            { id: "staly_marriage", label: "Брак с гражданином / гражданкой Польши", next: "staly_marriage_dates" },
            { id: "staly_long_residence", label: "Проживание в Польше более 5 лет по работе", next: "nationality" }
        ]
    },

    staly_marriage_dates: {
        question: "Соответствуете ли вы временным критериям подачи по браку?",
        subtitle: "Закон требует одновременного выполнения двух условий по срокам на момент подачи.",
        type: "options",
        options: [
            { id: "staly_m_ok", label: "В браке > 3 лет, и последние 2 года живу в Польше по ВНЖ", next: "nationality" },
            { id: "staly_m_fail", label: "Брак менее 3 лет ИЛИ по ВНЖ живу в Польше менее 2 лет", next: "nationality" }
        ]
    },

    staly_integration: {
        question: "Сможете ли вы подтвердить намерение остаться в Польше?",
        subtitle: "Инспекторы тщательно проверяют экономическую и социальную связь со страной.",
        type: "options",
        options: [
            { id: "staly_int_yes", label: "Да, официально работаю / учусь или арендую жилье", next: "nationality" },
            { id: "staly_int_no", label: "Пока нет (только переехал или работаю неофициально)", next: "nationality" }
        ]
    },

    resident_years: {
        question: "Сколько полных лет вы непрерывно проживаете в Польше?",
        subtitle: "Для получения статуса Резидента ЕС закон требует минимум 5 лет непрерывного легального пребывания.",
        type: "options",
        options: [
            { id: "res_5y_ok", label: "5 лет и более", next: "resident_basis" },
            { id: "res_5y_fail", label: "Менее 5 лет", next: "resident_basis" }
        ]
    },

    resident_basis: {
        question: "На каком основании вы находились в Польше большую часть этих 5 лет?",
        subtitle: "Студенческий стаж учитывается Ужондом по особому коэффициенту.",
        type: "options",
        options: [
            { id: "res_base_work", label: "По работе, бизнесу или воссоединению семьи", next: "resident_language" },
            { id: "res_base_study", label: "В основном по учебе (студенческая карта / виза)", next: "resident_language" }
        ]
    },

    resident_language: {
        question: "Есть ли у вас подтверждение знания польского языка (уровень B1)?",
        subtitle: "Без подтвержденного знания языка подача на статус Резидента ЕС невозможна.",
        type: "options",
        options: [
            { id: "res_lang_cert", label: "Да, гос. сертификат B1 или диплом польского ВУЗа", next: "resident_income_history" },
            { id: "res_lang_szkola", label: "Да, есть диплом полицеальной школы", next: "resident_income_history" },
            { id: "res_lang_plan", label: "Пока нет, планирую сдавать гос. экзамен", next: "resident_income_history" },
            { id: "res_lang_none", label: "Нет и не планирую сдавать", next: "resident_income_history" }
        ]
    },

    resident_income_history: {
        question: "Каков статус вашей занятости и меняли ли вы работу за последние 3 года?",
        subtitle: "Инспектор затребует налоговые декларации (PIT) за последние 3 года для проверки стабильности дохода.",
        type: "options",
        options: [
            { id: "res_inc_stable", label: "Работаю официально, за 3 года работу не менял(а) / без перерывов", next: "nationality" },
            { id: "res_inc_gaps", label: "Работаю официально, но часто менял(а) работу, были периоды без дохода", next: "nationality" },
            { id: "res_inc_nowork", label: "На данный момент официально не работаю", next: "nationality" }
        ]
    },

    fam_relative_work: {
        question: "Работает ли официально член семьи, к которому вы переезжаете?",
        subtitle: "Наличие стабильного источника дохода у принимающей стороны - обязательное условие для воссоединения.",
        type: "options",
        options: [
            { id: "f_work_yes", label: "💼 Да, работает по найму (Umowa o pracę / Zlecenie)", next: "fam_relative_status" },
            { id: "f_work_biz", label: "🏢 Да, ведет свой бизнес (JDG / Sp. z o.o.)", next: "fam_relative_status" },
            { id: "f_work_no", label: "❌ Нет, не работает / Работает неофициально", next: "fam_relative_status" }
        ]
    },

    fam_relative_status: {
        question: "Какой статус пребывания в Польше у вашего родственника?",
        subtitle: "От статуса принимающей стороны зависят ваши права (например, доступ к рынку труда без дополнительных разрешений).",
        type: "options",
        options: [
            { id: "f_stat_karta", label: "💳 Временный ВНЖ (Karta Pobytu czasowego)", next: "fam_count_input" },
            { id: "f_stat_blue", label: "🌐 Blue Card / Сталый побыт / Резидент ЕС", next: "fam_count_input" },
            { id: "f_stat_pl", label: "🇵🇱 Гражданство Польши (Паспорт)", next: "fam_count_input" },
            { id: "f_stat_visa", label: "⏳ Национальная виза / Печать (ждет решения)", next: "fam_count_input" }
        ]
    },

    fam_count_input: {
        question: "Сколько членов семьи будут подаваться на ВНЖ вместе с вами?",
        subtitle: "Укажите количество человек (включая вас и детей), не считая принимающего родственника:",
        type: "input_number",
        placeholder: "Например: 2",
        min: 0,
        max: 12,
        next: "fam_income_input"
    },

    fam_income_input: {
        question: "Укажите официальный чистый доход вашего родственника в месяц (нетто, на руки):",
        subtitle: "Сумма в PLN, подтвержденная договором, фактурами или налоговой декларацией (PIT):",
        type: "input_number",
        placeholder: "Например: 6000",
        min: 0,
        max: 200000,
        next: "lead_gate"
    },

    cukr_pesel: {
        question: "Каков статус вашего PESEL UKR на сегодняшний день?",
        subtitle: "Карта CUKR доступна только лицам, имеющим активный статус временной защиты.",
        type: "options",
        options: [
            { id: "c_pesel_active", label: "🟢 Активен, нарушений и сбоев не было", next: "cukr_exits" },
            { id: "c_pesel_restored", label: "🟡 Был аннулирован, но я его официально восстановил(а)", next: "cukr_exits" },
            { id: "c_pesel_lost", label: "🔴 Статус утрачен / база показывает обычный PESEL", next: "cukr_exits" }
        ]
    },

    cukr_exits: {
        question: "Выезжали ли вы за пределы Польши на срок более 30 дней за один выезд?",
        subtitle: "Однократный выезд из Польши более чем на 30 дней автоматически аннулирует статус временной защиты по закону.",
        type: "options",
        options: [
            { id: "c_exits_none", label: "❌ Нет, не выезжал(а) или выезды были короткими (<30 дней)", next: "cukr_income" },
            { id: "c_exits_long", label: "⚠️ Да, был минимум один выезд дольше чем на 30 дней", next: "cukr_income" }
        ]
    },

    cukr_income: {
        question: "Есть ли у вас официальный источник дохода в Польше на данный момент?",
        subtitle: "Закон требует ведения стабильной экономической или трудовой деятельности на день подачи заявления.",
        type: "options",
        options: [
            { id: "c_inc_work", label: "💼 Да, официально работаю (Umowa o pracę / Zlecenie)", next: "cukr_zus" },
            { id: "c_inc_jdg", label: "🏢 Да, веду бизнес (ИП / JDG / Sp. z o.o.)", next: "cukr_zus" },
            { id: "c_inc_none", label: "❌ Нет официального дохода / Работаю неофициально", next: "cukr_zus" }
        ]
    },

    cukr_zus: {
        question: "Своевременно ли отчисляются за вас взносы в ZUS (страхование)?",
        type: "options",
        options: [
            { id: "c_zus_ok", label: "Да, работодатель / бухгалтер всё оплачивает, долгов нет", next: "lead_gate" },
            { id: "c_zus_no", label: "Взносы не платятся / есть задолженность по налогам", next: "lead_gate" },
            { id: "c_zus_unknown", label: "Не знаю / Не проверял(а) выписку", next: "lead_gate" }
        ]
    },

    work_contract_type: {
        question: "По какому типу договора вы работаете?",
        subtitle: "Тип договора напрямую влияет на стабильность кейса и требования к документам.",
        type: "options",
        options: [
            { id: "w_umowa_prace", label: "💼 Umowa o pracę (Трудовой договор)", next: "work_salary" },
            { id: "w_umowa_zlecenie", label: "📋 Umowa Zlecenie (Договор подряда)", next: "work_salary" },
            { id: "w_b2b_jdg", label: "🏢 B2B контракт (своё ИП / JDG)", next: "jdg_path" },
            { id: "w_agency", label: "🏭 Работаю через агенцию (Agencja Pracy)", next: "work_salary" },
            { id: "w_no_contract", label: "❌ Пока нет договора / Ищу работу", next: "work_legal_status" }
        ]
    },

    work_salary: {
        question: "Какова ваша официальная зарплата брутто в месяц?",
        subtitle: "Минимальная зарплата в 2026 году - 4 806 PLN brutto, с 1 января 2027 - 4 950 PLN.",
        type: "options",
        options: [
            { id: "ws_high", label: "Более 7 000 PLN brutto (Высокая)", next: "work_zus" },
            { id: "ws_mid", label: "От 4 806 до 7 000 PLN brutto", next: "work_zus" },
            { id: "ws_min", label: "Ровно минималка (4 806 PLN)", next: "work_zus" },
            { id: "ws_low", label: "Ниже 4 806 PLN / часть ставки", next: "work_zus" }
        ]
    },

    work_zus: {
        question: "Оплачивает ли работодатель за вас налоги и взносы ZUS?",
        type: "options",
        options: [
            { id: "wz_yes", label: "Да, всё оплачивается официально", next: "work_employer_size" },
            { id: "wz_student", label: "Я студент до 26 лет (ZUS не платится по закону)", next: "work_employer_size" },
            { id: "wz_no", label: "Нет, получаю часть денег «в конверте»", next: "work_employer_size" },
            { id: "wz_unknown", label: "Не уверен(а) / Не проверял(а)", next: "work_employer_size" }
        ]
    },

    work_employer_size: {
        question: "Насколько крупная компания, в которой вы работаете?",
        subtitle: "Ужонд по-разному проверяет корпорации и мелкий бизнес.",
        type: "options",
        options: [
            { id: "we_big", label: "Крупная компания (более 50 сотрудников)", next: "work_legal_status" },
            { id: "we_mid", label: "Средний или малый бизнес (есть офис и сайт)", next: "work_legal_status" },
            { id: "we_micro", label: "Микробизнес (оформлен недавно, 1-2 человека)", next: "work_legal_status" }
        ]
    },

    work_legal_status: {
        question: "На каком основании вы сейчас находитесь в Польше?",
        subtitle: "Важно подать документы до истечения легального пребывания.",
        type: "options",
        options: [
            { id: "wls_active", label: "Действующая виза / Безвиз / Старая Карта", next: "lead_gate" },
            { id: "wls_stamp", label: "Уже есть штамп в паспорте (жду решения)", next: "lead_gate" },
            { id: "wls_illegal", label: "Документы просрочены", next: "lead_gate" }
        ]
    },

   urzad_location: {
        // Текст зависит от ветки: подавшимся - "подано", планирующим - "будете подавать"
        question: () => (AnalyzerState.answers['start_status']?.value === 'status_planning')
            ? "В какой воеводский ужонд вы будете подавать документы?"
            : "В какой воеводский ужонд подано ваше дело?",
        type: "options",
        options: [
            { id: "urzad_mazowiecki", label: "Мазовецкое (Варшава)", next: "main_goal", expected_wait: 12 },
            { id: "urzad_dolnoslaski", label: "Нижнесилезское (Вроцлав)", next: "main_goal", expected_wait: 16 },
            { id: "urzad_wielkopolskie", label: "Великопольское (Познань)", next: "main_goal", expected_wait: 11 },
            { id: "urzad_opolskie", label: "Опольское (Ополе)", next: "main_goal", expected_wait: 19 },
            { id: "urzad_pomorskie", label: "Поморское (Гданьск)", next: "main_goal", expected_wait: 10 },
            { id: "urzad_slaskie", label: "Силезское (Катовице)", next: "main_goal", expected_wait: 9 },
            { id: "urzad_malopolskie", label: "Малопольское (Краков)", next: "main_goal", expected_wait: 5 },
            { id: "urzad_lodzkie", label: "Лодзинское (Лодзь)", next: "main_goal", expected_wait: 7 },
            { id: "urzad_zachodniopomorskie", label: "Западнопоморское (Щецин)", next: "main_goal", expected_wait: 9 },
            { id: "urzad_lubelskie", label: "Люблинское (Люблин)", next: "main_goal", expected_wait: 5 },
            { id: "urzad_podkarpackie", label: "Подкарпатское (Жешув)", next: "main_goal", expected_wait: 6 },
            { id: "urzad_kujawskopomorskie", label: "Куявско-Поморское (Быдгощ / Торунь)", next: "main_goal", expected_wait: 7 },
            { id: "urzad_podlaskie", label: "Подляское (Белосток)", next: "main_goal", expected_wait: 6 },
            { id: "urzad_lubuskie", label: "Любушское (Гожув / Зелёна-Гура)", next: "main_goal", expected_wait: 8 },
            { id: "urzad_warminskomazurskie", label: "Варминско-Мазурское (Ольштын)", next: "main_goal", expected_wait: 6 },
            { id: "urzad_swietokrzyskie", label: "Свентокшиское (Кельце)", next: "main_goal", expected_wait: 4 }
        ]
    },

    waiting_time_input: {
        question: "Сколько полных месяцев прошло с момента подачи заявления?",
        subtitle: "Закон отводит 60 дней на выдачу решения, но реальная статистика по воеводствам другая. Введите число месяцев:",
        type: "input_number",
        placeholder: "Например: 8",
        min: 1,
        max: 120,
        next: "fingerprints_status"
    },

    fingerprints_status: {
        question: "Вы уже сдали отпечатки пальцев и получили красную печать в паспорт?",
        type: "options",
        options: [
            { id: "fingers_yes", label: "Да, отпечатки сданы, печать стоит", next: "wezwanie_status" },
            { id: "fingers_no_letter", label: "Нет, даже не было письма с датой", next: "wezwanie_status" },
            { id: "fingers_missed", label: "Пропустил(а) дату сдачи отпечатков", next: "wezwanie_status" }
        ]
    },

    wezwanie_status: {
        question: "Присылал ли вам инспектор письма (Wezwanie) с просьбой донести документы?",
        type: "options",
        options: [
            { id: "wez_no", label: "Нет, писем не было", next: "lead_gate" },
            { id: "wez_yes_done", label: "Да, документы донесены в срок", next: "lead_gate" },
            { id: "wez_yes_missed", label: "Да, но я не успел(а) / проигнорировал(а)", next: "lead_gate" }
        ]
    },

    nationality: {
        question: "Какое у вас гражданство?",
        subtitle: "Это определяет базовые права и ограничения для вашего кейса.",
        type: "options",
        options: [
            { id: "ua", label: "🇺🇦 Украина", next: "ukr_status" },
            { id: "by", label: "🇧🇾 Беларусь", next: "stay_basis" },
            { id: "ru", label: "🇷🇺 Россия", next: "stay_basis" },
            { id: "kz", label: "🇰🇿 Казахстан / Средняя Азия", next: "stay_basis" },
            { id: "md", label: "🇲🇩 Молдова / Грузия", next: "stay_basis" },
            { id: "other_eu", label: "🇪🇺 Гражданин ЕС", next: "eu_path" },
            { id: "other", label: "🌍 Другое гражданство", next: "stay_basis" },
        ]
    },

    ukr_status: {
        question: "Вы находитесь в Польше по статусу временной защиты (UKR)?",
        subtitle: "Это определяет, можете ли вы подать на CUKR или обычный pobyt.",
        type: "options",
        options: [
            { id: "ukr_yes_active", label: "Да, статус UKR активен", next: "ukr_details" },
            { id: "ukr_expired", label: "Статус UKR истёк или я его не продлевал(а)", next: "stay_basis" },
            { id: "ukr_no", label: "Нет, прибыл(а) не как украинец по защите", next: "stay_basis" },
        ]
    },

    ukr_details: {
        question: "Укажите детали вашего UKR-статуса:",
        subtitle: "Для CUKR важны соблюдение условий пребывания.",
        type: "options",
        options: [
            { id: "ukr_work", label: "Официально работаю, PESEL UKR есть", next: "pesel_status" },
            { id: "ukr_no_work", label: "PESEL UKR есть, но работаю неофициально", next: "pesel_status" },
            { id: "ukr_exits", label: "Выезжал(а) за пределы Польши более чем на 30 дней", next: "pesel_status" },
            { id: "ukr_clean", label: "Всё чисто: не выезжал(а), работаю, нарушений нет", next: "pesel_status" },
        ]
    },

    doc_expiry_days: {
        question: "Сколько дней осталось до истечения вашего документа?",
        subtitle: "Введите точное количество дней. Система рассчитает крайний срок подачи и предупредит о рисках.",
        type: "input_number",
        placeholder: "Например: 45",
        min: 0,
        max: 3650,
        next: "employment_basis"
    },

    stay_basis: {
        question: "На каком основании вы сейчас находитесь в Польше?",
        subtitle: "Ваш текущий правовой статус - ключевой параметр оценки.",
        type: "options",
        options: [
            { id: "visa_d_work", label: "Рабочая виза D (зарплатная / для высококвал.)", next: "doc_expiry_days" },
            { id: "visa_d_other", label: "Национальная виза D (другое основание)", next: "doc_expiry_days" },
            { id: "bezwiz", label: "Безвизовый режим (биометрический паспорт)", next: "bezwiz_days" },
            { id: "stamp", label: "Штамп в паспорте (ожидаю решения по заявке)", next: "stamp_details" },
            { id: "karta_active", label: "Действующая Карта Побыту", next: "doc_expiry_days" },
            { id: "student_visa", label: "Студенческая виза / разрешение на обучение", next: "doc_expiry_days" },
            { id: "expired_docs", label: "Документы просрочены / нет легального основания", next: "overstay_details" },
        ]
    },

    pesel_status: {
        question: "Есть ли у вас PESEL и meldunek (регистрация по адресу)?",
        type: "options",
        options: [
            { id: "pesel_meldunek", label: "Есть PESEL и meldunek по текущему адресу", next: "employment_basis" },
            { id: "pesel_no_meld", label: "PESEL есть, но meldunek отсутствует или устарел", next: "employment_basis" },
            { id: "no_pesel", label: "PESEL нет", next: "employment_basis" },
        ]
    },

    visa_expiry: {
        question: "Когда истекает ваша виза?",
        type: "options",
        options: [
            { id: "visa_3m_plus", label: "Более 3 месяцев", next: "employment_basis" },
            { id: "visa_1_3m", label: "1-3 месяца (время подавать документы)", next: "employment_basis" },
            { id: "visa_30d", label: "Менее 30 дней (критический срок!)", next: "employment_basis" },
        ]
    },

    bezwiz_days: {
        question: "Сколько дней из 90 безвизового периода вы уже использовали?",
        subtitle: "Правило 90/180: не более 90 дней в любом 180-дневном периоде.",
        type: "options",
        options: [
            { id: "bw_safe", label: "Менее 60 дней - запас есть", next: "employment_basis" },
            { id: "bw_tight", label: "60-80 дней - срок поджимает", next: "employment_basis" },
            { id: "bw_over", label: "Уже превысил(а) 90 дней", next: "employment_basis" },
        ]
    },

    stamp_details: {
        question: "Детали вашего ожидания решения (штамп в паспорте):",
        type: "options",
        options: [
            { id: "stamp_ok", label: "Подан вовремя, оснований для отказа нет", next: "employment_basis" },
            { id: "stamp_wezwanie", label: "Получил(а) wezwanie (запрос доп. документов)", next: "wezwanie_details" },
            { id: "stamp_long", label: "Жду более 18 месяцев", next: "employment_basis" },
        ]
    },

    wezwanie_details: {
        question: "Что именно запросили в wezwanie?",
        type: "options",
        options: [
            { id: "wez_income", label: "Документы о доходах / договор с работодателем", next: "employment_basis" },
            { id: "wez_residence", label: "Подтверждение проживания / meldunek", next: "employment_basis" },
            { id: "wez_marriage", label: "Доказательства брака / совместной жизни", next: "employment_basis" },
            { id: "wez_employer", label: "Информация о работодателе / его деятельности", next: "employment_basis" },
            { id: "wez_other", label: "Другое / не уверен(а)", next: "employment_basis" },
        ]
    },

    karta_details: {
        question: "Когда истекает ваша Карта Побыту и на каком основании она выдана?",
        type: "options",
        options: [
            { id: "kp_1y_work", label: "До 1 года, рабочее основание - продление", next: "employment_basis" },
            { id: "kp_3y_work", label: "2-3 года, рабочее основание", next: "employment_basis" },
            { id: "kp_expires_soon", label: "Карта истекает в течение 3 месяцев", next: "employment_basis" },
            { id: "kp_family", label: "На основании воссоединения семьи / брака", next: "family_path" },
        ]
    },

    overstay_details: {
        question: "Как давно истекли ваши документы?",
        subtitle: "Каждый день незаконного пребывания увеличивает риск.",
        type: "options",
        options: [
            { id: "ov_7d", label: "Менее 7 дней - только что истекли", next: "employment_basis" },
            { id: "ov_30d", label: "Истекли 7-30 дней назад", next: "employment_basis" },
            { id: "ov_3m", label: "Более месяца назад", next: "employment_basis" },
        ]
    },

    employment_basis: {
        question: "Какой у вас основной источник дохода / тип занятости в Польше?",
        subtitle: "Это определяет тип подаваемого разрешения и требования к документам.",
        type: "options",
        options: [
            { id: "emp_umowa_pracę", label: "💼 Umowa o pracę (трудовой договор)", next: "employer_check" },
            { id: "emp_zlecenie", label: "📋 Umowa zlecenie / o dzieło", next: "employer_check" },
            { id: "emp_blue_card", label: "🌐 Высококвалифицированный специалист (Blue Card)", next: "blue_card_path" },
            { id: "emp_jdg", label: "🏢 JDG (собственный бизнес / ИП)", next: "jdg_path" },
            { id: "emp_sp_zoo", label: "🏗️ Sp. z o.o. (ООО / учредитель)", next: "jdg_path" },
            { id: "emp_student", label: "🎓 Студент (учёба - основное основание)", next: "study_details" },
            { id: "emp_family", label: "👨‍👩‍👧 Воссоединение семьи / брак с гражданином ПЛ/ЕС", next: "family_path" },
            { id: "emp_no_income", label: "❌ Нет официального дохода в Польше", next: "no_income_path" },
        ]
    },

    employer_check: {
        question: "Расскажите о вашем работодателе:",
        type: "options",
        options: [
            { id: "emp_large", label: "Крупная/средняя известная компания (50+ сотрудников)", next: "salary_level" },
            { id: "emp_small", label: "Малый бизнес, 5-50 сотрудников, есть сайт", next: "employer_foreigners" },
            { id: "emp_micro", label: "Микро-компания, <5 человек или без сайта", next: "employer_foreigners" },
            { id: "emp_recent", label: "Компания существует менее 1 года", next: "employer_foreigners" },
            { id: "emp_change", label: "Я недавно сменил(а) работодателя (менее 3 мес.)", next: "employer_foreigners" },
        ]
    },

    employer_foreigners: {
        question: "Есть ли у работодателя опыт найма иностранцев?",
        type: "options",
        options: [
            { id: "emp_for_yes", label: "Да, регулярно нанимает иностранцев, знаком с процессом", next: "salary_level" },
            { id: "emp_for_no", label: "Нет опыта с иностранцами, первый раз", next: "salary_level" },
            { id: "emp_for_unknown", label: "Не знаю", next: "salary_level" },
        ]
    },

    salary_level: {
        question: "Какова ваша официальная зарплата по договору?",
        subtitle: "Минимальная зарплата в 2026 году - 4 806 PLN brutto.",
        type: "options",
        options: [
            { id: "sal_high", label: "Выше 7 000 PLN brutto (сильная позиция)", next: "previous_refusals" },
            { id: "sal_mid", label: "4 806 - 7 000 PLN brutto (достаточно)", next: "previous_refusals" },
            { id: "sal_min", label: "Минималка - 4 806 PLN brutto", next: "previous_refusals" },
            { id: "sal_low", label: "Ниже минималки / нестабильный доход", next: "previous_refusals" },
        ]
    },

    blue_card_path: {
        question: "Параметры для Blue Card (EU):",
        subtitle: "В 2026 году Blue Card требует зарплату от 13 355 PLN brutto (150% средней по Польше).",
        type: "options",
        options: [
            { id: "bc_salary_ok", label: "Зарплата от 13 355 PLN brutto + высшее образование", next: "previous_refusals" },
            { id: "bc_salary_border", label: "Зарплата ниже 13 355 PLN brutto", next: "previous_refusals" },
            { id: "bc_no_diploma", label: "Нет диплома о высшем образовании", next: "employment_basis" },
        ]
    },

    jdg_path: {
        question: "Детали вашего бизнеса (JDG / Sp. z o.o.):",
        type: "options",
        options: [
            { id: "jdg_real_revenue", label: "Стабильные обороты, польские клиенты, есть фактуры", next: "jdg_zus" },
            { id: "jdg_b2b_one", label: "Один клиент (B2B с одной компанией)", next: "jdg_zus" },
            { id: "jdg_new", label: "Бизнес открыт менее 6 месяцев назад", next: "jdg_zus" },
            { id: "jdg_low_revenue", label: "Обороты минимальные или нестабильные", next: "jdg_zus" },
        ]
    },

    jdg_zus: {
        question: "Статус оплаты ZUS и US (налоги):",
        type: "options",
        options: [
            { id: "zus_ok", label: "ZUS и US оплачены вовремя, задолженностей нет", next: "work_legal_status" },
            { id: "zus_arrears", label: "Есть задолженность по ZUS или налогам", next: "work_legal_status" },
            { id: "zus_unknown", label: "Не знаю текущий статус", next: "work_legal_status" },
        ]
    },

    study_details: {
        question: "Детали вашего обучения в Польше:",
        type: "options",
        options: [
            { id: "study_uni", label: "Государственный или аккредитованный частный вуз (uczelnia)", next: "study_attendance" },
            { id: "study_policealna", label: "Полицеальная школа / курсы языка", next: "study_attendance" },
            { id: "study_mba", label: "MBA / профессиональная программа (платная)", next: "study_attendance" },
        ]
    },

    study_attendance: {
        question: "Посещаемость и академический статус:",
        type: "options",
        options: [
            { id: "att_regular", label: "Регулярное посещение, нет задолженностей", next: "previous_refusals" },
            { id: "att_poor", label: "Плохая посещаемость / под угрозой отчисления", next: "previous_refusals" },
            { id: "att_leave", label: "Академический отпуск", next: "previous_refusals" },
        ]
    },

    family_path: {
        question: "На каком семейном основании?",
        type: "options",
        options: [
            { id: "fam_spouse_pl", label: "Супруг(а) - гражданин Польши", next: "marriage_details" },
            { id: "fam_spouse_eu", label: "Супруг(а) - гражданин ЕС (не Польши)", next: "marriage_details" },
            { id: "fam_spouse_kp", label: "Супруг(а) - иностранец с Картой Побыту", next: "marriage_details" },
            { id: "fam_child_pl", label: "Мой ребёнок - гражданин Польши", next: "previous_refusals" },
            { id: "fam_parent_pl", label: "Мои родители - граждане Польши", next: "previous_refusals" },
        ]
    },

    marriage_details: {
        question: "Детали вашего брака:",
        type: "options",
        options: [
            { id: "mar_3y_joint", label: "В браке >2 лет, живём вместе, есть общие дети", next: "previous_refusals" },
            { id: "mar_fresh", label: "Бракосочетание менее 1 года назад", next: "previous_refusals" },
            { id: "mar_separate_addr", label: "Разные адреса регистрации у супругов", next: "previous_refusals" },
            { id: "mar_no_lang", label: "Не говорим на общем языке / культурный барьер", next: "previous_refusals" },
        ]
    },

    eu_path: {
        question: "Вы гражданин ЕС - ваш путь значительно проще.",
        subtitle: "Для граждан ЕС доступна упрощённая регистрация без karta pobytu.",
        type: "options",
        options: [
            { id: "eu_register", label: "Хочу зарегистрировать пребывание (zaświadczenie)", next: "previous_refusals" },
            { id: "eu_family_non_eu", label: "Хочу легализовать члена семьи - не гражданина ЕС", next: "family_path" },
        ]
    },

    no_income_path: {
        question: "Есть ли у вас другие подтверждённые источники средств к существованию?",
        type: "options",
        options: [
            { id: "ni_savings", label: "Собственные накопления на счёте польского банка (от 30 000 PLN)", next: "previous_refusals" },
            { id: "ni_family_support", label: "Финансовое обеспечение от члена семьи в Польше", next: "previous_refusals" },
            { id: "ni_nothing", label: "Нет ни доходов, ни накоплений в Польше", next: "previous_refusals" },
        ]
    },

    previous_refusals: {
        question: "Была ли у вас когда-либо история отказов или нарушений в Польше / ЕС?",
        type: "options",
        options: [
            { id: "hist_clean", label: "Нет, история чистая", next: "criminal_check" },
            { id: "hist_refusal_pl", label: "Был отказ в Польше (odmowa decyzji)", next: "refusal_details" },
            { id: "hist_refusal_eu", label: "Был отказ в другой стране ЕС", next: "refusal_details" },
            { id: "hist_deportation", label: "Депортация или запрет въезда в ЕС", next: "refusal_details" },
            { id: "hist_violations", label: "Нарушения (штрафы STRAŻ, незаконная работа)", next: "refusal_details" },
        ]
    },

    refusal_details: {
        question: "Причина отказа или нарушения:",
        type: "options",
        options: [
            { id: "ref_docs", label: "Недостаток документов / технический отказ", next: "criminal_check" },
            { id: "ref_income", label: "Недостаточный доход / фиктивная занятость", next: "criminal_check" },
            { id: "ref_fraud", label: "Подозрение в мошенничестве / фиктивный брак", next: "criminal_check" },
            { id: "ref_unknown", label: "Не знаю официальной причины", next: "criminal_check" },
        ]
    },

    criminal_check: {
        question: "Есть ли у вас судимости (в Польше, стране гражданства или других странах ЕС)?",
        type: "options",
        options: [
            { id: "crim_none", label: "Нет судимостей", next: "residence_continuity" },
            { id: "crim_minor", label: "Административные нарушения (мелкие)", next: "residence_continuity" },
            { id: "crim_serious", label: "Уголовная судимость (погашена или активная)", next: "residence_continuity" },
        ]
    },

    residence_continuity: {
        question: "Как долго вы непрерывно проживаете в Польше?",
        subtitle: "Непрерывность пребывания критически важна для долгосрочных видов на жительство.",
        type: "options",
        options: [
            { id: "res_5y_plus", label: "5 лет и более (право на stały pobyt)", next: "family_situation" },
            { id: "res_3_5y", label: "3-5 лет", next: "family_situation" },
            { id: "res_1_3y", label: "1-3 года", next: "family_situation" },
            { id: "res_less_1y", label: "Менее 1 года", next: "family_situation" },
            { id: "res_gaps", label: "Есть разрывы пребывания (выезды >90 дней)", next: "family_situation" },
        ]
    },

    family_situation: {
        question: "Семейная ситуация при подаче:",
        type: "options",
        options: [
            { id: "fam_solo", label: "Подаюсь один(одна)", next: "lead_gate" },
            { id: "fam_with_spouse", label: "С супругом/супругой (будем подавать вместе)", next: "lead_gate" },
            { id: "fam_with_kids", label: "С несовершеннолетними детьми", next: "lead_gate" },
            { id: "fam_full", label: "Вся семья - супруг(а) + дети", next: "lead_gate" },
        ]
    },

    lead_gate: {
        type: "lead_gate",
        question: "Ваш предварительный результат",
        subtitle: "Введите ваши контакты, чтобы получить полный персональный отчёт с рекомендациями."
    },

    ai_analysis: {
        type: "ai_result"
    }
};

// ─── 2b. ОЦЕНКА: ПРАВИЛА ПО ОТВЕТАМ ────────────────────────
// Ключ - id варианта ответа из FLOW. Если варианта здесь нет, ответ нейтральный.
//   sev   - серьёзность риска (баллы - в SEVERITY), risk - текст риска в отчёте
//           (часть до " - " - короткая подпись в расчёте), fix - что сделать
//   plus  - сильная сторона, check - что стоит проверить (без штрафа)
//   cap   - лимит оценки (для стоп-факторов), stopText - текст на экране результата
//   wez   - риск, из-за которого ужонд чаще присылает wezwanie
//   scope: 'work' - правило про работу и доход: для сталого побыта это не условие
// Цифры проверены по состоянию на сентябрь 2026 (минималка, пороги, сроки CUKR, MOS).

const SEVERITY = {
    stop: { pen: 0,  cap: 15, label: 'стоп-фактор', order: 0 },
    crit: { pen: 35, cap: 40, label: 'критично',    order: 1 },
    high: { pen: 25,          label: 'серьёзно',    order: 2 },
    med:  { pen: 12,          label: 'средне',      order: 3 },
    low:  { pen: 5,           label: 'небольшой',   order: 4 }
};

const RULES = {
    // ── Карта по работе ──
    w_umowa_prace:    { plus: 'Umowa o pracę - самый надёжный тип договора для ужонда' },
    w_umowa_zlecenie: { check: 'По umowa zlecenie зарплата тоже должна быть не ниже минимальной - независимо от количества часов' },
    w_b2b_jdg:        { check: 'С собственной JDG подаются не «по работе», а по основанию «działalność gospodarcza» - ужонд смотрит на доход фирмы за прошлый год' },
    w_agency:         { sev: 'low', wez: true, risk: 'Работа через агентство - нужен ещё договор агентства с работодателем-пользователем, а при смене объекта - изменение карты', fix: 'Попросить у агентства выписку из KRAZ и договор с работодателем-пользователем' },
    w_no_contract:    { sev: 'stop', cap: 15, risk: 'Нет договора - подавать по работе пока не из чего', fix: 'Оформить umowa o pracę или umowa zlecenie, потом подавать',
                        stopText: 'Вы выбрали карту по работе, но договора пока нет. Подавать по работе не из чего: ужонду нужен действующий договор и взносы. Сначала оформляется umowa - потом подача.' },
    ws_high:          { plus: 'Зарплата заметно выше минимальной' },
    ws_min:           { check: 'С 1 января 2027 минимальная зарплата - 4 950 PLN brutto: если решение будет позже, ставку в договоре нужно поднять' },
    ws_low:           { sev: 'crit', risk: 'Зарплата ниже минимальной (4 806 PLN brutto) - по закону это основание для отказа, даже на неполной ставке', fix: 'Поднять зарплату в договоре хотя бы до минимальной до подачи (с 1 января 2027 - 4 950 PLN brutto)' },
    wz_yes:           { plus: 'Взносы ZUS и налоги платятся официально' },
    wz_student:       { check: 'За студента до 26 лет на zlecenie взносы ZUS не платятся - для карты нужна отдельная медстраховка (полис или добровольный NFZ)' },
    wz_no:            { sev: 'crit', risk: 'Часть зарплаты «в конверте» - ужонд видит в ZUS только официальную часть', fix: 'Перейти на полностью официальную зарплату с взносами ZUS до подачи' },
    wz_unknown:       { sev: 'low', risk: 'Не проверено, платит ли работодатель взносы ZUS', fix: 'Проверить взносы в PUE/eZUS - это 5 минут' },
    we_big:           { plus: 'Крупный работодатель - такие фирмы ужонд проверяет проще' },
    we_micro:         { sev: 'med', wez: true, risk: 'Небольшая или молодая фирма - ужонд чаще запрашивает документы о реальной деятельности работодателя', fix: 'Заранее подготовить от работодателя ZUS DRA, CIT или PIT и справки об отсутствии долгов' },
    wls_active:       { plus: 'Легальное пребывание на момент подачи' },
    wls_illegal:      { sev: 'crit', cap: 25, risk: 'Документы на пребывание просрочены - обычная подача не легализует пребывание', fix: 'Не подавать наугад: сначала разобрать ситуацию со специалистом' },

    // ── Своя JDG / B2B (основание działalność gospodarcza) ──
    jdg_real_revenue: { scope: 'work', plus: 'Стабильные обороты и польские клиенты' },
    jdg_b2b_one:      { scope: 'work', sev: 'med', wez: true, risk: 'Один клиент по B2B - ужонд может счесть это скрытым трудовым договором', fix: 'Показать реальную деятельность фирмы: договоры, фактуры, расходы' },
    jdg_new:          { scope: 'work', sev: 'high', risk: 'Фирма моложе 6 месяцев - нет дохода за прошлый год, по которому ужонд оценивает бизнес', fix: 'Подготовить доказательства будущего дохода или найма: договоры, инвестиции, план' },
    jdg_low_revenue:  { scope: 'work', sev: 'crit', risk: 'Доход фирмы низкий или нестабильный - главный критерий (доход за прошлый год) может быть не выполнен', fix: 'Сверить доход за прошлый год с порогом вместе с бухгалтером до подачи' },
    zus_ok:           { scope: 'work', plus: 'ZUS и налоги оплачены, долгов нет' },
    zus_arrears:      { scope: 'work', sev: 'crit', risk: 'Долги по ZUS или налогам - прямое основание для отказа', fix: 'Погасить долг и получить zaświadczenie o niezaleganiu' },
    zus_unknown:      { scope: 'work', sev: 'low', risk: 'Не проверено, есть ли долги по ZUS и налогам', fix: 'Проверить в PUE/eZUS и e-Urząd Skarbowy' },

    // ── CUKR ──
    // Работа, доход и ZUS - не условие для CUKR (UdSC: gov.pl/web/udsc/CUKR-procedura).
    // Вопросы о них оставлены для CRM, на оценку они не влияют.
    c_pesel_active:   { plus: 'Статус UKR активен' },
    c_pesel_restored: { sev: 'med', risk: 'Статус UKR восстанавливали - он должен быть активен на 4 июня 2025 и без перерыва минимум 365 дней', fix: 'Проверить даты статуса UKR в mObywatel или в гмине' },
    c_pesel_lost:     { sev: 'stop', cap: 10, risk: 'Статус UKR утрачен - без него подать на CUKR нельзя', fix: 'Разобрать со специалистом другое основание для карты',
                        stopText: 'Карту CUKR дают только при активном статусе UKR: он нужен на 4 июня 2025, на день подачи и на день выдачи карты. Сейчас статус утрачен - нужно другое основание.' },
    c_exits_none:     { plus: 'Не было выездов из Польши дольше 30 дней' },
    c_exits_long:     { sev: 'crit', risk: 'Был выезд дольше 30 дней - это прекращает статус UKR, и условие «365 дней без перерыва» может быть нарушено', fix: 'Сверить даты выездов и статуса UKR до подачи' },

    // ── Воссоединение семьи ──
    // f_work_no и доход родственника - в COMBO_RULES и INPUT_RULES: зависят от статуса родственника
    f_stat_karta:     { check: 'Родственник должен прожить в Польше минимум 2 года на картах побыту подряд, а его последняя карта - выдана не меньше чем на 1 год' },
    f_stat_blue:      { plus: 'Статус родственника позволяет подаваться без 2 лет ожидания' },
    f_stat_pl:        { plus: 'Родственник - гражданин Польши: для супруга это основание art. 158 без требований к доходу и жилью' },
    f_stat_visa:      { sev: 'crit', risk: 'У родственника пока нет карты побыту - по воссоединению можно подать только после того, как он её получит', fix: 'Сначала родственник получает карту, затем подаётесь вы' },

    // ── Сталый побыт ──
    staly_kp:         { plus: 'Карта Поляка - основание без требований к стажу, доходу и языку' },
    staly_roots:      { check: 'Польское происхождение подтверждают документы предков с записью «narodowość polska»' },
    staly_long_residence: { sev: 'stop', cap: 15, risk: '5 лет работы - не основание для сталого побыта: по стажу подаются на резидента ЕС', fix: 'Подаваться на резидента ЕС (rezydent długoterminowy UE)',
                        stopText: 'Сталый побыт за 5 лет проживания законом не предусмотрен: по стажу получают статус резидента ЕС. Нужно сменить программу подачи.' },
    staly_m_ok:       { plus: 'Брак больше 3 лет и 2 года в Польше по карте - сроки соблюдены' },
    staly_m_fail:     { sev: 'stop', cap: 10, risk: 'Не соблюдены сроки - нужен брак от 3 лет и 2 года в Польше по карте по браку', fix: 'Продлевать временную карту по браку, пока не наберутся сроки',
                        stopText: 'Не соблюдены сроки. Для сталого побыта по браку он должен длиться не меньше 3 лет, и последние 2 года вы должны непрерывно жить в Польше по карте, полученной по этому браку.' },
    staly_int_yes:    { plus: 'Есть подтверждение, что вы обосновались в Польше' },
    staly_int_no:     { sev: 'med', risk: 'Пока нечем подтвердить намерение остаться в Польше', fix: 'Подготовить договор аренды, работы или учёбы' },

    // ── Резидент ЕС ──
    res_5y_ok:        { plus: '5 лет и больше легального пребывания в Польше' },
    res_5y_fail:      { sev: 'stop', cap: 10, risk: 'Меньше 5 лет пребывания - на резидента ЕС подавать рано', fix: 'Продлевать временную карту, пока не наберётся 5 лет',
                        stopText: 'Для статуса резидента ЕС нужно минимум 5 лет непрерывного легального пребывания в Польше. Пока подаваться нужно на временную карту (karta pobytu czasowego).' },
    res_base_study:   { sev: 'high', risk: 'Годы учёбы засчитываются только наполовину - 5 лет может не набраться', fix: 'Пересчитать стаж: учёба x 0,5 + остальные годы' },
    res_lang_cert:    { plus: 'Польский B1 подтверждён' },
    res_lang_szkola:  { sev: 'crit', risk: 'Диплом полицеальной школы больше не подтверждает B1 - нужен сертификат', fix: 'Сдать государственный экзамен B1' },
    res_lang_plan:    { sev: 'crit', risk: 'Сертификата B1 пока нет - без него подать на резидента ЕС нельзя', fix: 'Сдать государственный экзамен B1, затем подавать' },
    res_lang_none:    { sev: 'stop', cap: 5, risk: 'Нет подтверждения польского B1 - без него статус резидента ЕС не дают', fix: 'Сдать экзамен B1 или рассмотреть другое основание',
                        stopText: 'Без государственного сертификата B1 (или польского диплома) статус резидента ЕС получить нельзя - это обязательное требование закона.' },
    res_inc_stable:   { plus: 'Стабильный официальный доход за 3 года' },
    res_inc_gaps:     { sev: 'med', wez: true, risk: 'Были перерывы в доходе - ужонд проверит PIT за 3 года, доход должен быть выше порога всё это время', fix: 'Собрать PIT за 3 года и проверить каждый год' },
    res_inc_nowork:   { sev: 'stop', cap: 15, risk: 'Сейчас нет официальной работы - нужен стабильный доход на момент подачи', fix: 'Оформить официальную работу, потом подавать',
                        stopText: 'На момент подачи на резидента ЕС нужен стабильный и регулярный доход. Без действующей работы подача сейчас закончится отказом.' },

    // ── Общая часть (гражданство, пребывание, история) ──
    ru:               { check: 'Гражданам РФ ужонд обычно проверяет дело дольше - заложите больше времени' },
    other_eu:         { plus: 'Гражданство ЕС - вместо карты побыту достаточно регистрации пребывания' },
    ukr_expired:      { sev: 'high', risk: 'Статус UKR истёк - есть риск нелегального пребывания', fix: 'Проверить, на каком основании вы сейчас находитесь в Польше' },
    ukr_no_work:      { scope: 'work', sev: 'med', risk: 'Работа без договора - её нельзя показать как доход', fix: 'Оформить договор с работодателем' },
    ukr_exits:        { sev: 'high', risk: 'Выезды дольше 30 дней - прерывают статус UKR и непрерывность пребывания', fix: 'Сверить даты всех выездов' },
    ukr_clean:        { plus: 'Статус UKR без нарушений' },
    karta_active:     { plus: 'Действующая карта побыту' },
    expired_docs:     { sev: 'crit', cap: 25, risk: 'Нет действующих документов на пребывание - обычная подача не легализует пребывание', fix: 'Не подавать наугад: сначала разобрать ситуацию со специалистом' },
    pesel_meldunek:   { plus: 'PESEL и meldunek в порядке' },
    pesel_no_meld:    { sev: 'low', wez: true, risk: 'Нет актуального meldunku - частая причина wezwania', fix: 'Оформить meldunek по текущему адресу' },
    no_pesel:         { sev: 'low', risk: 'Нет PESEL - подача и переписка с ужондом сложнее', fix: 'Получить PESEL в гмине' },
    visa_30d:         { sev: 'med', risk: 'Виза заканчивается меньше чем через 30 дней - подать нужно срочно', fix: 'Подать заявление до окончания визы' },
    bw_tight:         { sev: 'med', risk: 'Заканчиваются дни безвиза - подать нужно до конца 90 дней', fix: 'Подать заявление до окончания безвизового срока' },
    bw_over:          { sev: 'crit', cap: 25, risk: 'Превышен лимит безвиза 90/180 - пребывание нелегальное', fix: 'Срочно разобрать ситуацию со специалистом' },
    stamp_ok:         { plus: 'Текущее дело подано вовремя' },
    stamp_long:       { check: 'Дело рассматривается больше 18 месяцев - его можно проверить через Wgląd w akta' },
    wez_income:       { sev: 'low', risk: 'По текущему делу запросили документы о доходе', fix: 'Ответить на wezwanie полностью и в срок' },
    wez_residence:    { sev: 'low', risk: 'Ужонд запросил подтверждение проживания', fix: 'Приложить договор аренды и meldunek' },
    wez_marriage:     { sev: 'med', risk: 'Ужонд запросил доказательства брака - проверяет, не фиктивный ли он', fix: 'Собрать доказательства совместной жизни' },
    wez_employer:     { sev: 'low', risk: 'Ужонд проверяет работодателя', fix: 'Попросить у работодателя документы о деятельности фирмы' },
    ov_3m:            { sev: 'high', risk: 'Без документов больше месяца - растёт риск решения о выезде', fix: 'Срочно разобрать ситуацию со специалистом' },
    emp_umowa_pracę:  { scope: 'work', plus: 'Работа по umowa o pracę' },
    emp_no_income:    { scope: 'work', sev: 'high', risk: 'Нет официального дохода в Польше', fix: 'Оформить официальную работу или подтвердить средства' },
    emp_large:        { scope: 'work', plus: 'Крупный работодатель' },
    emp_micro:        { scope: 'work', sev: 'med', wez: true, risk: 'Работодатель - микрофирма: ужонд чаще проверяет реальность деятельности', fix: 'Подготовить от работодателя ZUS DRA, CIT или PIT и справки об отсутствии долгов' },
    emp_recent:       { scope: 'work', sev: 'med', wez: true, risk: 'Фирме меньше года - ужонд тщательнее проверяет, настоящая ли она', fix: 'Подготовить документы о деятельности фирмы' },
    emp_change:       { scope: 'work', sev: 'low', risk: 'Недавно сменили работодателя - при действующей карте по работе её нужно изменить', fix: 'Проверить, нужно ли изменение карты' },
    sal_high:         { scope: 'work', plus: 'Зарплата заметно выше минимальной' },
    sal_min:          { scope: 'work', check: 'С 1 января 2027 минимальная зарплата - 4 950 PLN brutto' },
    sal_low:          { scope: 'work', sev: 'high', risk: 'Зарплата ниже минимальной или нестабильная', fix: 'Поднять официальную зарплату до подачи' },
    bc_salary_ok:     { scope: 'work', plus: 'Параметры для Blue Card выполнены' },
    bc_salary_border: { scope: 'work', sev: 'high', risk: 'Зарплата ниже порога Blue Card - в 2026 году нужно от 13 355 PLN brutto', fix: 'Рассмотреть обычную карту по работе' },
    bc_no_diploma:    { scope: 'work', sev: 'high', risk: 'Нет высшего образования - Blue Card недоступна', fix: 'Рассмотреть обычную карту по работе' },
    study_policealna: { scope: 'work', sev: 'med', risk: 'Полицеальная школа или курсы - ужонд проверяет, реальное ли обучение', fix: 'Подготовить справки о посещаемости' },
    att_poor:         { scope: 'work', sev: 'high', risk: 'Плохая посещаемость - признак фиктивного обучения', fix: 'Выровнять посещаемость и взять справку из учебного заведения' },
    att_leave:        { scope: 'work', sev: 'med', risk: 'Академический отпуск - прерывает основание для учебной карты', fix: 'Уточнить статус в учебном заведении' },
    mar_3y_joint:     { plus: 'Давний брак и общие дети' },
    mar_fresh:        { sev: 'low', wez: true, risk: 'Брак моложе года - стандартная проверка на фиктивность', fix: 'Собрать доказательства совместной жизни' },
    mar_separate_addr:{ sev: 'med', wez: true, risk: 'Разные адреса у супругов - ужонд может заподозрить фиктивный брак', fix: 'Оформить общий адрес или объяснить причину' },
    mar_no_lang:      { sev: 'low', risk: 'Нет общего языка у супругов - вопросы на интервью будут сложнее', fix: 'Подготовиться к интервью в ужонде' },
    ni_nothing:       { scope: 'work', sev: 'crit', risk: 'Нет ни доходов, ни накоплений - подтвердить средства на жизнь нечем', fix: 'Найти официальный доход до подачи' },
    hist_clean:       { plus: 'Чистая миграционная история' },
    hist_refusal_pl:  { sev: 'high', risk: 'Был отказ в Польше - ужонд увидит прошлое дело', fix: 'Разобрать причину прошлого отказа до новой подачи' },
    hist_refusal_eu:  { sev: 'med', risk: 'Был отказ в другой стране ЕС - он виден в шенгенских базах', fix: 'Подготовить объяснение и документы' },
    hist_deportation: { sev: 'stop', cap: 8, risk: 'Депортация или запрет въезда - запись в базах блокирует выдачу карты', fix: 'Сначала проверить запись в SIS со специалистом',
                        stopText: 'Была депортация или запрет въезда в ЕС. Пока действует запись в базах, карту не выдадут - сначала нужен разбор со специалистом.' },
    hist_violations:  { sev: 'med', risk: 'Были нарушения (штрафы, нелегальная работа) - снижают доверие ужонда', fix: 'Собрать подтверждения, что штрафы оплачены' },
    ref_income:       { sev: 'low', risk: 'Прошлый отказ - из-за дохода или занятости', fix: 'Показать, что доход теперь стабильный' },
    ref_fraud:        { sev: 'crit', risk: 'В прошлом было подозрение в мошенничестве или фиктивном браке', fix: 'Только со специалистом: нужна отдельная стратегия' },
    ref_unknown:      { check: 'Причина прошлого отказа указана в решении (decyzja) - её стоит знать до новой подачи' },
    crim_none:        { plus: 'Нет судимостей' },
    crim_serious:     { sev: 'stop', cap: 12, risk: 'Уголовная судимость - препятствие для большинства оснований', fix: 'Разобрать ситуацию со специалистом',
                        stopText: 'Уголовная судимость - препятствие для большинства оснований. Прежде чем подаваться, нужен разбор со специалистом.' },
    res_5y_plus:      { plus: '5 лет и больше легального пребывания в Польше' },
    res_gaps:         { sev: 'med', risk: 'Были долгие выезды - непрерывность пребывания может быть нарушена (выезд не дольше 6 месяцев за раз и 10 месяцев всего)', fix: 'Составить список всех выездов с датами' },

    // ── Уже подано (ускорение) ──
    fingers_yes:      { plus: 'Отпечатки сданы - дело в работе' },
    fingers_no_letter:{ check: 'Приглашения на отпечатки пока не было - важно не пропустить письмо из ужонда' },
    fingers_missed:   { sev: 'high', risk: 'Пропущена сдача отпечатков - дело могут оставить без рассмотрения', fix: 'Срочно связаться с ужондом и назначить новую дату' },
    wez_no:           { plus: 'Требований донести документы не поступало' },
    wez_yes_done:     { plus: 'Требования инспектора выполнены в срок' },
    wez_yes_missed:   { sev: 'crit', risk: 'Не выполнено wezwanie - главная причина отказа или оставления дела без рассмотрения', fix: 'Срочно проверить дело через Wgląd w akta и ответить на требования' }
};

// Воссоединение семьи: закон требует доход больше 823 PLN на каждого члена семьи вместе
// с родственником (1 010 PLN, если человек один). Ориентир Residia с учётом жилья - 1 300 PLN на человека.
function familyIncomeCheck(income, famCount) {
    const total = 1 + (parseInt(famCount, 10) || 0);
    const legalMin = total === 1 ? 1010 : 823 * total;
    const comfort = 1300 * total;
    const level = income >= comfort ? 'ok' : income > legalMin ? 'border' : 'low';
    return { total, legalMin, comfort, level };
}

const fmtPLN = (n) => Number(n).toLocaleString('ru-RU');

// Правила для шагов с вводом числа
const INPUT_RULES = {
    fam_income_input: (v, A) => {
        if (A['fam_relative_status']?.value === 'f_stat_pl') return null;
        if (A['fam_relative_work']?.value === 'f_work_no') return null;   // уже стоп-фактор в COMBO_RULES
        const c = familyIncomeCheck(Number(v) || 0, A['fam_count_input']?.value);
        if (c.level === 'ok') return { plus: `Доход родственника с запасом выше порога (больше ${fmtPLN(c.legalMin)} PLN на ${c.total} чел.)` };
        if (c.level === 'border') return { sev: 'med', wez: true, risk: `Доход выше минимума по закону (больше ${fmtPLN(c.legalMin)} PLN на ${c.total} чел.), но запас небольшой - с учётом аренды ужонд может счесть его недостаточным`, fix: `Подготовить подтверждение дохода за последние месяцы: спокойнее от ${fmtPLN(c.comfort)} PLN чистыми` };
        return { sev: 'crit', risk: `Доход ниже минимума по закону - нужно больше ${fmtPLN(c.legalMin)} PLN чистыми на ${c.total} чел. (823 PLN на человека)`, fix: 'Повысить официальный доход родственника до подачи' };
    },
    doc_expiry_days: (v) => {
        const d = Number(v) || 0;
        if (d <= 14) return { sev: 'med', risk: `До окончания документа ${d} дн. - заявление нужно успеть подать до этой даты`, fix: 'Подать заявление в MOS в ближайшие дни' };
        if (d <= 45) return { check: `До окончания документа ${d} дн. - подавать лучше заранее, не в последний день` };
        return null;
    }
};

// Правила, которые зависят от нескольких ответов сразу
const COMBO_RULES = [
    // Без дохода родственника воссоединение невозможно - кроме супруга гражданина Польши (art. 158)
    (val, goal) => (goal === 'goal_family' && val('fam_relative_work') === 'f_work_no' && val('fam_relative_status') !== 'f_stat_pl')
        ? { sev: 'stop', cap: 10, risk: 'У родственника нет официального дохода - без него воссоединение не одобрят', fix: 'Родственнику - оформить официальную работу или бизнес',
            stopText: 'Для воссоединения семьи родственник, к которому вы едете, должен иметь стабильный официальный доход в Польше. Без подтверждённого дохода ужонд не одобрит карту.' }
        : null,
    (val, goal) => (goal === 'goal_family' && val('fam_relative_work') === 'f_work_no' && val('fam_relative_status') === 'f_stat_pl')
        ? { check: 'Если вы супруг(а) гражданина Польши, доход родственника не проверяют (art. 158)' }
        : null,
    // Резидент ЕС: время на статусе UKR не засчитывается, а во время временной защиты подать нельзя
    (val, goal) => (goal === 'goal_resident' && val('ukr_status') === 'ukr_yes_active')
        ? { sev: 'crit', risk: 'Время на статусе UKR не засчитывается в 5 лет, а во время временной защиты подать на резидента ЕС нельзя', fix: 'Сначала оформить CUKR или другую карту - её время засчитывается' }
        : null,
    (val, goal) => (goal === 'goal_resident' && val('stay_basis') === 'student_visa')
        ? { sev: 'crit', risk: 'Во время пребывания по учёбе подать на резидента ЕС нельзя', fix: 'Сначала сменить основание пребывания, например на работу' }
        : null
];

// Правило для ответа на конкретный шаг (с учётом цели)
function ruleFor(stepId) {
    const A = AnalyzerState.answers;
    const ans = A[stepId];
    if (!ans) return null;
    const goal = A['main_goal'] ? A['main_goal'].value : undefined;
    const rule = INPUT_RULES[stepId] ? INPUT_RULES[stepId](ans.value, A) : RULES[ans.value];
    if (!rule) return null;
    if (rule.scope === 'work' && goal === 'goal_staly') return null;
    return rule;
}

// Главный расчёт: 100 минус риски, лимиты для стоп-факторов и критичных рисков
function evaluateCase() {
    const A = AnalyzerState.answers;
    const val = (id) => (A[id] ? A[id].value : undefined);
    const goal = val('main_goal');
    const ev = { goal, score: 100, risks: [], pluses: [], checks: [], stop: null, stopCap: null, capApplied: null };

    const push = (rule, stepId) => {
        if (!rule) return;
        if (rule.plus && ev.pluses.indexOf(rule.plus) === -1) ev.pluses.push(rule.plus);
        if (rule.check && ev.checks.indexOf(rule.check) === -1) ev.checks.push(rule.check);
        if (rule.sev && SEVERITY[rule.sev]) {
            const sv = SEVERITY[rule.sev];
            ev.risks.push({
                text: rule.risk, sev: rule.sev, fix: rule.fix || '', wez: !!rule.wez, step: stepId,
                pen: typeof rule.pen === 'number' ? rule.pen : sv.pen,
                cap: typeof rule.cap === 'number' ? rule.cap : (typeof sv.cap === 'number' ? sv.cap : null),
                stopText: rule.stopText || ''
            });
        }
    };

    // В порядке вопросов - так, как человек отвечал
    const seen = {};
    AnalyzerState.history.forEach(stepId => {
        if (seen[stepId]) return;
        seen[stepId] = true;
        push(ruleFor(stepId), stepId);
    });
    COMBO_RULES.forEach(fn => push(fn(val, goal), 'combo'));

    // От самых серьёзных рисков к небольшим
    ev.risks.sort((a, b) => SEVERITY[a.sev].order - SEVERITY[b.sev].order);

    let raw = 100;
    ev.risks.forEach(r => { raw -= r.pen; });
    raw = Math.max(0, raw);
    const caps = ev.risks.filter(r => typeof r.cap === 'number').map(r => r.cap);
    const cap = caps.length ? Math.min.apply(null, caps) : 100;
    // Нижняя граница - 5: «0 из 100» выглядит как сбой, а смысл тот же
    ev.score = Math.max(5, Math.min(raw, cap));
    if (cap < raw) ev.capApplied = cap;

    const stops = ev.risks.filter(r => r.sev === 'stop').sort((a, b) => a.cap - b.cap);
    if (stops.length) {
        ev.stop = stops[0].stopText || stops[0].text;
        ev.stopCap = stops[0].cap;
    }
    return ev;
}

// Риск отказа и риск wezwania - из тех же рисков, что и оценка
function getProbabilities(ev) {
    const has = (s) => ev.risks.some(r => r.sev === s);
    let refusal = 'Низкая';
    if (ev.stop || has('crit') || ev.score < 45) refusal = 'Высокая';
    else if (has('high') || ev.score < 65) refusal = 'Средняя';
    let wezwanie = 'Низкая';
    if (ev.score < 60) wezwanie = 'Высокая';
    else if (ev.score < 85 || ev.risks.some(r => r.wez)) wezwanie = 'Средняя';
    return { refusal, wezwanie };
}

// ─── 2c. ДОКУМЕНТЫ ПО ОСНОВАНИЯМ ────────────────────────────
// Базовые списки, не полные: ужонд может запросить и другие документы.
// Формат пункта: "Название - пояснение". Группа: ['Заголовок', [пункты]].
// page - страница этого основания в разделе dokumenty/. Страницы раздела собираются
// из этих же списков (_tools/build_docs.py), поэтому правки вносятся только здесь.
// Проверено по сайтам UdSC и воеводских ужондов (сентябрь 2026).

const DOCS_MOS_NOTE = 'С 27 апреля 2026 заявление подаётся только онлайн через MOS: документы загружаются сканами, подписать нужно профилем zaufany или e-podpisem.';

const DOCS = {
    work: {
        page: 'karta-pobytu-praca.html',
        title: 'Карта побыту по работе (pobyt czasowy i praca)',
        short: 'карта по работе',
        note: DOCS_MOS_NOTE,
        groups: [
            ['Ваши документы', [
                'Паспорт - скан всех страниц',
                'Цифровое фото - по требованиям MOS',
                'Umowa o pracę или umowa zlecenie - действующий договор',
                'Opłata skarbowa - подтверждение оплаты пошлины и карты'
            ]],
            ['От работодателя', [
                'Załącznik nr 1 - работодатель заполняет и подписывает в MOS',
                'KRS или CEIDG - выписка о фирме работодателя',
                'ZUS RCA / ZUA - регистрация в ZUS и взносы за вас, подтверждают и медстраховку',
                'Zaświadczenie o niezaleganiu - справки из ZUS и US, что у фирмы нет долгов'
            ]],
            ['Часто просят дополнительно', [
                'ZUS DRA, CIT-8 или PIT работодателя - подтверждают реальную деятельность фирмы'
            ]]
        ],
        steps: [
            'Собрать документы по списку ниже',
            'Работодатель заполняет и подписывает załącznik nr 1 в MOS',
            'Подать заявление в MOS до окончания текущего документа'
        ]
    },
    work_b2b: {
        page: 'karta-pobytu-jdg.html',
        title: 'Карта побыту для владельца JDG (działalność gospodarcza)',
        short: 'карта для владельца JDG',
        note: DOCS_MOS_NOTE + ' Главное условие: доход фирмы за прошлый год - не ниже 12 средних зарплат в воеводстве, или в фирме уже год работают 2 человека на полной ставке.',
        groups: [
            ['Ваши документы', [
                'Паспорт - скан всех страниц',
                'Цифровое фото - по требованиям MOS',
                'Медстраховка - zaświadczenie z ZUS',
                'Tytuł prawny do lokalu - договор аренды или право собственности',
                'Opłata skarbowa - подтверждение оплаты пошлины и карты'
            ]],
            ['По фирме', [
                'Wpis do CEIDG - выписка о вашей JDG',
                'PIT за прошлый год с UPO - главный документ о доходе фирмы',
                'Zaświadczenie o niezaleganiu - справки из ZUS и US'
            ]],
            ['Часто просят дополнительно', [
                'KPiR, фактуры и договоры с клиентами - подтверждают реальную деятельность',
                'Выписки с банковского счёта фирмы'
            ]]
        ],
        steps: [
            'Сверить доход фирмы за прошлый год с порогом по воеводству',
            'Собрать PIT с UPO и справки o niezaleganiu',
            'Подать заявление в MOS'
        ]
    },
    cukr: {
        page: 'karta-cukr.html',
        title: 'Karta pobytu CUKR - карта на 3 года для граждан Украины',
        short: 'карта CUKR',
        note: 'Заявления на CUKR принимают с 4 мая 2026 по 4 марта 2027, только онлайн через MOS. Работа и доход для CUKR не требуются.',
        groups: [
            ['Что понадобится', [
                'Паспорт - действующий и внесённый в реестр PESEL',
                'Отпечатки пальцев - должны быть в реестре PESEL',
                'Цифровое фото - по требованиям MOS',
                'Opłata skarbowa - подтверждение оплаты пошлины и карты',
                'Profil zaufany или e-podpis - чтобы подписать заявление в MOS'
            ]]
        ],
        steps: [
            'Проверить статус UKR и данные в PESEL: паспорт и отпечатки',
            'Оплатить пошлину и карту',
            'Подать заявление в MOS до 4 марта 2027'
        ]
    },
    family: {
        page: 'polaczenie-z-rodzina.html',
        title: 'Карта побыту по воссоединению семьи (art. 159)',
        short: 'воссоединение семьи',
        note: DOCS_MOS_NOTE + ' Доход родственника должен быть больше 823 PLN на каждого члена семьи вместе с ним.',
        groups: [
            ['Ваши документы', [
                'Паспорт - скан всех страниц',
                'Цифровое фото - по требованиям MOS',
                'Свидетельство о браке или о рождении - с присяжным переводом (апостиль - если требуется)',
                'Медстраховка - ZUS или частный полис',
                'Opłata skarbowa - подтверждение оплаты пошлины и карты'
            ]],
            ['От родственника', [
                'Карта побыту родственника - или решение о ней',
                'Подтверждение дохода - umowa, справка о зарплате, PIT, ZUS',
                'Tytuł prawny do lokalu - договор аренды или право собственности'
            ]],
            ['Часто просят дополнительно', [
                'Доказательства совместной жизни - фото, общие счета, переписка'
            ]]
        ],
        steps: [
            'Собрать документы родственника: карта, доход, жильё',
            'Сделать присяжный перевод свидетельств',
            'Подать заявление в MOS'
        ]
    },
    family_pl: {
        page: 'malzonek-obywatela-polski.html',
        title: 'Карта побыту для супруга гражданина Польши (art. 158)',
        short: 'карта для супруга гражданина Польши',
        note: DOCS_MOS_NOTE + ' Доход, жильё и страховку для этого основания не проверяют - ужонд смотрит, что брак настоящий.',
        groups: [
            ['Ваши документы', [
                'Паспорт - скан всех страниц',
                'Цифровое фото - по требованиям MOS',
                'Odpis aktu małżeństwa - не старше 3 месяцев (иностранный - с присяжным переводом)',
                'Копия dowodu osobistego супруга - гражданина Польши',
                'Opłata skarbowa - подтверждение оплаты пошлины и карты'
            ]],
            ['Часто просят дополнительно', [
                'Доказательства совместной жизни - фото, общие счета, переписка'
            ]]
        ],
        steps: [
            'Заказать свежий odpis aktu małżeństwa',
            'Подать заявление в MOS'
        ]
    },
    staly_kp: {
        page: 'pobyt-staly-karta-polaka.html',
        title: 'Сталый побыт по Карте Поляка',
        short: 'сталый побыт по Карте Поляка',
        note: DOCS_MOS_NOTE + ' С Картой Поляка пошлина за решение не взимается.',
        groups: [
            ['Ваши документы', [
                'Паспорт - скан всех страниц',
                'Цифровое фото - по требованиям MOS',
                'Карта Поляка - действующая',
                'Oświadczenie o zamiarze osiedlenia się - заявление, что вы намерены поселиться в Польше насовсем',
                'Подтверждение, что вы обосновались в Польше - договор аренды, работы или учёбы',
                'Оплата карты - подтверждение перевода 100 zł'
            ]]
        ],
        steps: [
            'Подготовить подтверждение, что вы обосновались в Польше',
            'Подать заявление в MOS'
        ]
    },
    staly_roots: {
        page: 'pobyt-staly-polskie-pochodzenie.html',
        title: 'Сталый побыт по польскому происхождению',
        short: 'сталый побыт по происхождению',
        note: DOCS_MOS_NOTE + ' Поляком должен быть хотя бы один из родителей или дедушек и бабушек либо двое прадедов.',
        groups: [
            ['Ваши документы', [
                'Паспорт - скан всех страниц',
                'Цифровое фото - по требованиям MOS',
                'Oświadczenie o narodowości polskiej - заявление о польской национальности',
                'Документы предков - akty stanu cywilnego, metryki chrztu, военные и другие документы с записью «narodowość polska»',
                'Свидетельства о рождении - цепочка родства до предка',
                'Подтверждение намерения остаться - договор аренды, работы или учёбы',
                'Opłata skarbowa - подтверждение оплаты пошлины и карты'
            ]],
            ['Часто просят дополнительно', [
                'Подтверждение связи с польскостью - язык, традиции, польские организации'
            ]]
        ],
        steps: [
            'Собрать документы предков с записью о польской национальности',
            'Сделать присяжный перевод',
            'Подать заявление в MOS'
        ]
    },
    staly_marriage: {
        page: 'pobyt-staly-malzenstwo.html',
        title: 'Сталый побыт по браку с гражданином Польши',
        short: 'сталый побыт по браку',
        note: DOCS_MOS_NOTE + ' Брак - от 3 лет, и последние 2 года вы непрерывно живёте в Польше по карте, полученной по этому браку.',
        groups: [
            ['Ваши документы', [
                'Паспорт - скан всех страниц',
                'Цифровое фото - по требованиям MOS',
                'Odpis aktu małżeństwa - не старше 3 месяцев',
                'Документ супруга - dowód osobisty или паспорт гражданина Польши',
                'Opłata skarbowa - подтверждение оплаты пошлины и карты'
            ]],
            ['Часто просят дополнительно', [
                'Список выездов из Польши за 2 года',
                'Доказательства совместной жизни - фото, общие счета, переписка',
                'Zaświadczenie o niezaleganiu из налоговой (US)'
            ]]
        ],
        steps: [
            'Заказать свежий odpis aktu małżeństwa',
            'Составить список выездов за 2 года',
            'Подать заявление в MOS'
        ]
    },
    resident: {
        page: 'rezydent-ue.html',
        title: 'Резидент ЕС (rezydent długoterminowy UE)',
        short: 'резидент ЕС',
        note: DOCS_MOS_NOTE + ' Нужно 5 лет непрерывного пребывания: выезды не дольше 6 месяцев за раз и 10 месяцев всего. Учёба засчитывается наполовину, статус UKR не засчитывается.',
        groups: [
            ['Ваши документы', [
                'Паспорт - скан всех страниц',
                'Цифровое фото - по требованиям MOS',
                'Подтверждение польского B1 - государственный сертификат или польский диплом',
                'Подтверждение дохода за 3 года - PIT, umowa, справка о зарплате',
                'Медстраховка - ZUS или частный полис',
                'Tytuł prawny do lokalu - договор аренды или право собственности',
                'Opłata skarbowa - подтверждение оплаты пошлины и карты'
            ]],
            ['Часто просят дополнительно', [
                'Прежние карты побыту и решения по ним',
                'Список выездов из Польши за 5 лет'
            ]]
        ],
        steps: [
            'Собрать PIT за 3 года и подтверждение B1',
            'Составить список выездов за 5 лет',
            'Подать заявление в MOS'
        ]
    },
    speedup: {
        page: 'po-zlozeniu-wniosku.html',
        title: 'Что обновить в уже поданном деле',
        short: 'для уже поданного дела',
        note: 'Для поданного дела обычно нужны только свежие справки - остальное уже есть в деле.',
        groups: [
            ['Актуальные справки', [
                'ZUS RCA / ZUA - за последние месяцы',
                'Zaświadczenie o niezaleganiu - свежие справки из ZUS и US'
            ]]
        ],
        steps: []
    }
};

// Дополнения к списку по ответам
const DOCS_EXTRA = {
    agency: ['Если работаете через агентство', [
        'Выписка агентства из KRAZ - реестр агентств труда',
        'Договор агентства с работодателем-пользователем - где вы фактически работаете',
        'Umowa o pracę tymczasową - ваш договор с агентством'
    ]],
    student: 'Медстраховка - частный полис или добровольный NFZ: за студента до 26 лет ZUS не платится'
};

function getBasisKey(A) {
    const v = (id) => (A[id] ? A[id].value : undefined);
    const g = v('main_goal');
    if (g === 'goal_speedup') return 'speedup';
    if (g === 'goal_work') return v('work_contract_type') === 'w_b2b_jdg' ? 'work_b2b' : 'work';
    if (g === 'goal_cukr') return 'cukr';
    if (g === 'goal_family') return v('fam_relative_status') === 'f_stat_pl' ? 'family_pl' : 'family';
    if (g === 'goal_staly') {
        const b = v('staly_basis');
        if (b === 'staly_roots') return 'staly_roots';
        if (b === 'staly_marriage') return 'staly_marriage';
        if (b === 'staly_long_residence') return 'resident';
        return 'staly_kp';
    }
    if (g === 'goal_resident') return 'resident';
    return 'work';
}

function getDocsFor(A) {
    const key = getBasisKey(A);
    const base = DOCS[key] || DOCS.work;
    const d = {
        key,
        page: base.page,
        title: base.title,
        short: base.short,
        note: base.note,
        steps: base.steps.slice(),
        groups: base.groups.map(g => [g[0], g[1].slice()])
    };
    const v = (id) => (A[id] ? A[id].value : undefined);
    if (key === 'work' && v('work_contract_type') === 'w_agency') d.groups.push([DOCS_EXTRA.agency[0], DOCS_EXTRA.agency[1].slice()]);
    if (key === 'work' && v('work_zus') === 'wz_student') d.groups[0][1].push(DOCS_EXTRA.student);
    if (v('staly_basis') === 'staly_long_residence') d.note = 'По стажу вам подходит статус резидента ЕС - ниже документы для него. ' + d.note;
    return d;
}

function countDocs(d) {
    return d.groups.reduce((s, g) => s + g[1].length, 0);
}

// Средний срок по нашим делам в ужонде (expected_wait) и сколько человек уже ждёт (для уже поданных дел)
function getWaitInfo(A) {
    const urzadId = A['urzad_location']?.value;
    const urzadOpt = urzadId ? FLOW['urzad_location'].options.find(o => o.id === urzadId) : null;
    const expected = urzadOpt && urzadOpt.expected_wait ? urzadOpt.expected_wait : 10;
    const months = Number(A['waiting_time_input']?.value) || 0;
    const speedup = A['main_goal']?.value === 'goal_speedup';
    const overdue = speedup && months >= expected;
    const near = speedup && !overdue && months >= Math.max(1, Math.round(expected * 0.8));
    return { urzadOpt, expected, months, speedup, overdue, near };
}

// ─── 3. PROGRESS TRACKER ────────────────────────────────────

// Знаменатель прогресса не должен уменьшаться на ходу: он только растёт,
// иначе пользователь видит "2 / 7" сразу после "1 / 8" и перестаёт доверять счётчику.
function getDynamicTotalSteps() {
    const actualSteps = Math.max(AnalyzerState.history.length, 1);
    const stored = AnalyzerState.progressTotal || 8;
    AnalyzerState.progressTotal = Math.max(stored, actualSteps, 8);
    return AnalyzerState.progressTotal;
}

function updateProgress(stepIndex) {
    const progressContainer = document.getElementById('analyzer-progress');
    const progressFill = document.getElementById('progress-fill');
    const stepCurrent = document.getElementById('step-current');
    const stepTotal = document.getElementById('step-total');
    if (!progressContainer || !progressFill) return;

    const currentTotal = getDynamicTotalSteps();
    const current = Math.min(currentTotal, stepIndex + 1);

    const pct = Math.min(95, Math.round((current / currentTotal) * 100));

    progressFill.style.width = pct + '%';
    if (stepCurrent) stepCurrent.textContent = current;
    if (stepTotal) stepTotal.textContent = currentTotal;
}

// ─── 3b. UI HELPERS (дизайн сайта) ─────────────────────────

// Эмодзи в подписях оставляем для CRM, а на экране показываем чистый текст
function cleanLabel(text) {
    try {
        return String(text).replace(/^[\p{Extended_Pictographic}\p{Regional_Indicator}️‍\s]+/u, '');
    } catch (e) {
        return String(text);
    }
}

const RZ_ICON = (id, cls) => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#${id}"/></svg>`;

function ringSvg(score, extraClass) {
    const circ = 326.73;
    const off = (circ * (1 - Math.max(0, Math.min(100, score)) / 100)).toFixed(2);
    return `
        <div class="gauge gauge--result ${extraClass || ''}" data-level="${getScoreClass(score)}" style="--off:${off}" role="img" aria-label="Оценка ${score} из 100">
            <svg class="gauge__svg" viewBox="0 0 120 120" aria-hidden="true"><circle class="gauge__track" cx="60" cy="60" r="52"/><circle class="gauge__arc" cx="60" cy="60" r="52"/></svg>
            <span class="gauge__val" aria-hidden="true"><b data-count-to="${score}">0</b><small>из 100</small></span>
        </div>`;
}

// Число внутри кольца «докручивается» до результата
function animateScoreNumbers(root) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (root || document).querySelectorAll('[data-count-to]').forEach(el => {
        const target = parseInt(el.getAttribute('data-count-to'), 10) || 0;
        if (reduce) { el.textContent = target; return; }
        const t0 = performance.now();
        const dur = 1400;
        const tick = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

// Пиксель: работает, только если человек согласился на cookie (fbq грузит site.js)
function rzTrack(name, params, opts) {
    if (typeof fbq !== 'function') return;
    const standard = ['Lead', 'Contact', 'ViewContent'];
    const method = standard.indexOf(name) !== -1 ? 'track' : 'trackCustom';
    if (opts) fbq(method, name, params || {}, opts); else fbq(method, name, params || {});
}

// UTM / fbclid из sessionStorage (их сохраняет site.js при первом заходе)
function rzAttribution() {
    let a = {};
    try { a = JSON.parse(sessionStorage.getItem('rz_attr') || '{}') || {}; } catch (e) { a = {}; }
    return {
        utm_source: a.utm_source || '',
        utm_medium: a.utm_medium || '',
        utm_campaign: a.utm_campaign || '',
        utm_content: a.utm_content || '',
        utm_term: a.utm_term || '',
        fbclid: a.fbclid || '',
        landing_page: a.landing_page || location.href,
        referrer: a.referrer || document.referrer || '',
        page_url: location.href,
        page_lang: 'ru'
    };
}

// ─── 4. RENDERER ───────────────────────────────────────────

// Часть вопросов зависит от ветки, поэтому question может быть функцией
function resolveQuestion(step) {
    return typeof step.question === 'function' ? step.question() : step.question;
}

function renderStep(stepId) {
    const step = FLOW[stepId];
    if (!step) { console.error('Unknown step:', stepId); return; }

    AnalyzerState.currentStepId = stepId;
    AnalyzerState.history.push(stepId);

    const container = document.getElementById('question-container');
    container.classList.remove('active');
    container.classList.add('hidden');
    container.classList.remove('is-wide');

    if (step.type === 'lead_gate') {
        const progressFill = document.getElementById('progress-fill');
        const stepCurrent = document.getElementById('step-current');
        const stepTotal = document.getElementById('step-total');

        const total = getDynamicTotalSteps();

        if (progressFill) progressFill.style.width = '95%';
        if (stepCurrent) stepCurrent.textContent = total;
        if (stepTotal) stepTotal.textContent = total;
    } else if (step.type !== 'ai_result') {
        updateProgress(AnalyzerState.history.length - 1);
    }

    setTimeout(() => {
        if (step.type === 'lead_gate') {
            container.innerHTML = buildLeadGate();
            bindLeadGateEvents();
            animateScoreNumbers(container);
            rzTrack('AnalyzerGate', {});   // без оценки и цели: ответы видят только человек и специалист (так написано над вопросами и в политике)
        } else if (step.type === 'ai_result') {
            container.innerHTML = buildLoadingScreen();
            animateLoadingSteps();
            runAIAnalysis();
        } else if (step.type === 'input_number') {
            container.innerHTML = buildInputStep(step, stepId);
            bindInputButton(stepId);
        } else {
            container.innerHTML = buildOptionsStep(step, stepId);
            bindOptionButtons(stepId);
        }
        container.classList.remove('hidden');
        container.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 280);
}


function buildOptionsStep(step) {
    // Показываем, только если прошлый ответ действительно риск (правило из RULES)
    const prevStepId = AnalyzerState.history[AnalyzerState.history.length - 2];
    const prevRule = prevStepId ? ruleFor(prevStepId) : null;
    const redFlagAlert = prevRule && prevRule.sev
        ? `<div class="an-alert an-alert--risk" role="status">${RZ_ICON('i-flag')}Прошлый ответ учли как риск - в отчёте покажем, как его закрыть</div>`
        : '';

    const optionsHTML = step.options.map(opt => `
        <button type="button" class="an-option analyzer-option-btn" data-option-id="${opt.id}" data-option-label="${opt.label.replace(/"/g, '&quot;')}">
            <span class="an-option__text">${cleanLabel(opt.label)}</span>
            ${RZ_ICON('i-arrow', 'an-option__go')}
        </button>
    `).join('');

    return `
        ${redFlagAlert}
        <h2 class="an-q">${resolveQuestion(step)}</h2>
        ${step.subtitle ? `<p class="an-sub">${step.subtitle}</p>` : ''}
        <div class="an-options${step.options.length > 6 ? ' an-options--grid' : ''}">${optionsHTML}</div>
        ${AnalyzerState.history.length > 1 ? `<button type="button" class="an-back" id="btn-back">${RZ_ICON('i-back')}Назад</button>` : ''}
    `;
}

function bindOptionButtons(stepId) {
    const step = FLOW[stepId];
    document.querySelectorAll('.analyzer-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const optionId = btn.dataset.optionId;
            const label = btn.dataset.optionLabel;
            const selectedOpt = step.options.find(o => o.id === optionId);

            AnalyzerState.addAnswer(stepId, optionId, label);

            // Если человек уже подан, автоматически симулируем выбор цели "Ускорение дела"
            // Это позволит всем остальным функциям корректно распознавать и собирать speedup-сценарий
            if (stepId === 'start_status' && optionId === 'status_submitted') {
                AnalyzerState.answers['main_goal'] = {
                    value: 'goal_speedup',
                    label: 'Ускорение вашего дела'
                };
            }

            document.querySelectorAll('.analyzer-option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            let nextStep = selectedOpt.next;

            if (stepId === 'urzad_location') {
                const goal = AnalyzerState.answers['main_goal']?.value;
                if (goal === 'goal_work') nextStep = 'work_contract_type';
                else if (goal === 'goal_cukr') nextStep = 'cukr_pesel';
                else if (goal === 'goal_family') nextStep = 'fam_relative_work';
                else if (goal === 'goal_speedup') nextStep = 'waiting_time_input';
                // Новые типы планирования направляем в общую ветку проверки базовых критериев (гражданство/основания)
                else if (goal === 'goal_staly') nextStep = 'staly_basis';
                else if (goal === 'goal_resident') nextStep = 'resident_years';
            }

            setTimeout(() => renderStep(nextStep), 200);
        });
    });

    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            AnalyzerState.history.pop();
            const prev = AnalyzerState.history.pop();

            AnalyzerState.rollbackAnswer(prev);

            if (prev) renderStep(prev);
        });
    }
}

function buildInputStep(step, stepId) {
    const minAttr = typeof step.min === 'number' ? step.min : 0;
    const maxAttr = typeof step.max === 'number' ? step.max : 1000000;
    return `
        <h2 class="an-q">${resolveQuestion(step)}</h2>
        ${step.subtitle ? `<p class="an-sub">${step.subtitle}</p>` : ''}
        <div class="an-number">
            <input class="an-number__input" type="number" inputmode="numeric" id="an-num-input" placeholder="${step.placeholder}" min="${minAttr}" max="${maxAttr}" aria-label="${step.placeholder}">
        </div>
        <div id="violation-alert" class="an-alert hidden" role="status"></div>
        <button type="button" class="btn btn--primary an-next" id="btn-next-step">Продолжить ${RZ_ICON('i-arrow')}</button>
        ${AnalyzerState.history.length > 1 ? `<button type="button" class="an-back" id="btn-back" style="display:flex">${RZ_ICON('i-back')}Назад</button>` : ''}
    `;
}

function bindInputButton(stepId) {
    const step = FLOW[stepId];
    const btnNext = document.getElementById('btn-next-step');
    const input = document.getElementById('an-num-input');
    const alertBox = document.getElementById('violation-alert');

    // Цвет подсказки задаём классом - оформление в css/analyzer.css
    const paintAlert = (mode) => {
        alertBox.classList.remove('an-alert--error', 'an-alert--warn', 'an-alert--ok');
        alertBox.classList.add(mode === 'error' ? 'an-alert--error' : mode === 'warning' ? 'an-alert--warn' : 'an-alert--ok');
    };

    // Раньше при пустом или некорректном вводе кнопка молча не срабатывала -
    // человек не понимал, что от него хотят, и уходил
    const showInputError = (msg) => {
        input.style.borderColor = '#ef4444';
        input.setAttribute('aria-invalid', 'true');
        paintAlert('error');
        alertBox.innerHTML = msg;
        alertBox.classList.remove('hidden');
    };

    btnNext.addEventListener('click', () => {
        const raw = (input.value || '').trim();
        const val = parseInt(raw, 10);
        const min = typeof step.min === 'number' ? step.min : 0;
        const max = typeof step.max === 'number' ? step.max : 1000000;

        if (raw === '')      { showInputError('Введите число, чтобы продолжить.'); return; }
        if (isNaN(val))      { showInputError('Нужно указать число - без букв и пробелов.'); return; }
        if (val < min)       { showInputError(`Значение слишком маленькое. Минимум - ${min}.`); return; }
        if (val > max)       { showInputError(`Похоже на опечатку. Максимум - ${max}.`); return; }

        alertBox.classList.add('hidden');
        input.style.borderColor = 'var(--border-color)';
        let warningText = "";
        let displayTime = 4000;

        if (stepId === 'waiting_time_input') {
            const urzadId = AnalyzerState.answers['urzad_location']?.value;
            const urzadOpt = FLOW['urzad_location'].options.find(o => o.id === urzadId);
            const expectedWait = urzadOpt ? urzadOpt.expected_wait : 10;
            const nearLimit = Math.max(1, Math.round(expectedWait * 0.8));

            if (val >= expectedWait) {
                paintAlert('error');
                warningText = `⚠️ <strong>Срок выше типичного для вашего ужонда.</strong><br><br>Среднее время ожидания здесь по нашим делам - ${expectedWait} мес., вы ждёте уже ${val} мес. Это даёт основание подать Ponaglenie - жалобу на бездействие воеводы.`;
            } else if (val >= nearLimit) {
                paintAlert('warning');
                warningText = `ℹ️ <strong>Срок близок к типичному.</strong><br><br>Среднее ожидание в вашем ужонде по нашим делам - ${expectedWait} мес., вы ждёте ${val} мес. Пока это в пределах нормы. Имеет смысл проверить дело через Wgląd w akta - не зависло ли письмо от инспектора.`;
            } else {
                const left = Math.max(1, expectedWait - val);
                paintAlert('ok');
                warningText = `ℹ️ <strong>В пределах нормы.</strong><br><br>Среднее время ожидания в выбранном ужонде по нашим делам - ${expectedWait} мес. Вы ждёте ${val} мес., ориентировочно до решения ещё <strong>~${left} мес.</strong> Жалоба на бездействие на этом сроке обычно не ускоряет дело.`;
            }
        }

        else if (stepId === 'fam_count_input') {
            paintAlert('ok');
            warningText = `✓ Данные зафиксированы. Переходим к расчету финансового критерия...`;
            displayTime = 1000;
        }

        else if (stepId === 'fam_income_input') {
            // Закон: больше 823 PLN на каждого члена семьи вместе с родственником.
            // Ориентир Residia с учётом аренды - 1 300 PLN на человека (familyIncomeCheck).
            const c = familyIncomeCheck(val, AnalyzerState.answers['fam_count_input']?.value);
            if (AnalyzerState.answers['fam_relative_status']?.value === 'f_stat_pl') {
                paintAlert('ok');
                warningText = `ℹ️ <strong>Данные записали.</strong><br><br>Если вы супруг(а) гражданина Польши, требований к доходу нет (art. 158) - учтём это в отчёте.`;
            } else if (c.level === 'ok') {
                paintAlert('ok');
                warningText = `ℹ️ <strong>Финансовый критерий выполнен.</strong><br><br>Для семьи из ${c.total} чел. (вместе с родственником) закон требует больше <strong>${fmtPLN(c.legalMin)} PLN</strong> чистыми в месяц - 823 PLN на человека. Доход ${fmtPLN(val)} PLN - с запасом.`;
            } else if (c.level === 'border') {
                paintAlert('warning');
                warningText = `ℹ️ <strong>Порог по закону пройден, но запас небольшой.</strong><br><br>Для семьи из ${c.total} чел. закон требует больше <strong>${fmtPLN(c.legalMin)} PLN</strong> чистыми (823 PLN на человека). С учётом аренды ужонд может счесть ${fmtPLN(val)} PLN недостаточным - спокойнее от ~${fmtPLN(c.comfort)} PLN.`;
            } else {
                paintAlert('error');
                warningText = `⚠️ <strong>Дохода недостаточно.</strong><br><br>Для семьи из ${c.total} чел. нужно больше <strong>${fmtPLN(c.legalMin)} PLN</strong> чистыми в месяц (823 PLN на человека). Сейчас ${fmtPLN(val)} PLN - до подачи доход нужно повысить.`;
            }
        }

        else if (stepId === 'doc_expiry_days') {
            AnalyzerState.docExpiryDays = val;

            if (val <= 14) {
                paintAlert('error');
                warningText = `🚨 <strong>Критический срок!</strong><br><br>До истечения документа осталось всего <strong>${val} дней</strong>. Необходимо подавать документы немедленно - каждый день на счету.`;
            } else if (val <= 45) {
                paintAlert('warning');
                warningText = `⚠️ <strong>Время поджимает.</strong><br><br>До истечения документа <strong>${val} дней</strong>. Оптимальное окно для подачи - ближайшие 2 недели. Учтём это в финальном расчёте.`;
            } else if (val <= 90) {
                paintAlert('ok');
                warningText = `✓ <strong>Запас есть.</strong><br><br>До истечения <strong>${val} дней</strong>. Рекомендуем подавать не позже чем за 30 дней до окончания. Продолжаем анализ.`;
            } else {
                paintAlert('ok');
                warningText = `✓ <strong>Времени достаточно.</strong><br><br>До истечения документа <strong>${val} дней</strong>. Данные зафиксированы - в финальном отчёте покажем точный дедлайн подачи.`;
            }
            displayTime = 2200;
        }

        let inputLabel = `${val}`;
        if (stepId === 'fam_income_input') inputLabel = `${val} PLN`;
        else if (stepId === 'fam_count_input') inputLabel = `${val} чел.`;
        else if (stepId === 'waiting_time_input') inputLabel = `${val} мес.`;
        else if (stepId === 'doc_expiry_days') inputLabel = `${val} дней`;

        AnalyzerState.addAnswer(stepId, val, inputLabel);

        alertBox.innerHTML = cleanLabel(warningText);
        alertBox.classList.remove('hidden');
        btnNext.style.display = 'none';
        input.disabled = true;

        setTimeout(() => {
            renderStep(step.next);
        }, displayTime);
    });

    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            AnalyzerState.history.pop();
            const prev = AnalyzerState.history.pop();

            AnalyzerState.rollbackAnswer(prev);

            if (prev) renderStep(prev);
        });
    }
}

// Возвращает текст стоп-фактора, если по ответам подача в текущем виде невозможна
function getStopFactor() {
    return evaluateCase().stop;
}

const escHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildLeadGate() {
    const ev = evaluateCase();
    const score = ev.score;
    const riskCount = ev.risks.length;
    const urzad = AnalyzerState.answers['urzad_location']?.label || 'вашем воеводстве';
    const stopFactor = ev.stop;
    const docs = getDocsFor(AnalyzerState.answers);
    const docsTotal = countDocs(docs);
    const isSpeedup = docs.key === 'speedup';

    // Если подача в текущем виде невозможна - говорим это до формы, а не после
    const stopBlock = stopFactor ? `
        <div class="an-alert an-alert--error">
            <strong>Важно, до того как оставите контакты:</strong><br>${stopFactor}
        </div>` : '';

    const riskBadge = riskCount > 0
        ? `<p class="an-flagcount">${RZ_ICON('i-flag')}Выявлено рисков: <strong>${riskCount}</strong></p>`
        : `<p class="an-flagcount an-flagcount--ok">${RZ_ICON('i-check')}Рисков не выявлено</p>`;

    const docsLine = isSpeedup
        ? 'Какие справки обновить в деле'
        : `Список из ${docsTotal} ${plural(docsTotal, 'документа', 'документов', 'документов')}: ${docs.short}`;
    const wait = getWaitInfo(AnalyzerState.answers);
    const risksLine = riskCount > 0
        ? `Разбор ${riskCount} ${plural(riskCount, 'риска', 'рисков', 'рисков')} и как ${plural(riskCount, 'его', 'их', 'их')} закрыть`
        : isSpeedup
            ? (wait.overdue ? 'Как ускорить дело' : 'Что проверить по делу')
            : (ev.checks.length ? 'Что проверить перед подачей' : '');

    return `
        <div class="an-gate">
            <span class="an-kicker">Предварительный результат</span>
            <div class="an-gate__score">
                ${ringSvg(score)}
                <div class="an-gate__verdict">
                    <h2 class="an-q">${getScoreTitle(score)}</h2>
                    <p class="an-sub">${getScoreSummary(score, riskCount, ev.checks.length, !!stopFactor, wait)}</p>
                    ${riskBadge}
                </div>
            </div>

            ${stopBlock}

            <div class="an-locked">
                <p class="an-locked__title">Оставьте контакты - и на следующем экране сразу откроется:</p>
                <ul class="an-locked__list">
                    <li>${RZ_ICON('i-lock')}${docsLine}</li>
                    ${risksLine ? `<li>${RZ_ICON('i-lock')}${risksLine}</li>` : ''}
                    <li>${RZ_ICON('i-lock')}Срок рассмотрения - ${urzad}</li>
                    <li>${RZ_ICON('i-lock')}Пошаговый план под ваш случай</li>
                </ul>
            </div>

            <form id="analyzer-lead-form" class="an-form" novalidate>
                <div class="an-form__pair">
                    <div class="an-form__item">
                        <label class="field" for="an-name">
                            <span class="field__label">Ваше имя</span>
                            <input class="field__control" type="text" id="an-name" placeholder="Как к вам обращаться" autocomplete="given-name" maxlength="60" required>
                        </label>
                        <span id="an-name-error" class="error-msg" style="display:none">Укажите имя, чтобы мы знали, как к вам обращаться</span>
                    </div>
                    <div class="an-form__item">
                        <label class="field" for="an-phone">
                            <span class="field__label">Телефон (WhatsApp / Viber)</span>
                            <input class="field__control" type="tel" id="an-phone" placeholder="+48 ___ ___ ___" autocomplete="tel" inputmode="tel" maxlength="20">
                        </label>
                        <span id="an-phone-error" class="error-msg" style="display:none">Проверьте номер: например, +48 571 528 293</span>
                    </div>
                </div>
                <label class="field" for="an-telegram">
                    <span class="field__label">Telegram <span class="field__opt">- необязательно</span></span>
                    <input class="field__control" type="text" id="an-telegram" placeholder="@username" maxlength="40">
                </label>

                <p class="an-privacy">${RZ_ICON('i-lock')}<span>Результат откроется сразу на этой странице. Контакты нужны, чтобы специалист мог помочь, если понадобится. Отправляя форму, вы соглашаетесь с <a href="privacy.html" target="_blank" rel="noopener">политикой конфиденциальности</a>.</span></p>

                <button type="submit" class="btn btn--primary btn--block" id="btn-lead-submit">Открыть полный отчёт ${RZ_ICON('i-arrow')}</button>
            </form>
        </div>
    `;
}

function bindLeadGateEvents() {
    const form = document.getElementById('analyzer-lead-form');
    if (!form) return;
    const phoneRegex = /^\+?[0-9\s\-\(\)]{9,15}$/;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name     = document.getElementById('an-name').value.trim();
        const phone    = document.getElementById('an-phone').value.trim();
        const telegram = document.getElementById('an-telegram').value.trim();
        const phoneError = document.getElementById('an-phone-error');
        const nameError  = document.getElementById('an-name-error');

        // Раньше пустое имя просто ничего не делало - без единого сообщения
        if (!name) {
            if (nameError) nameError.style.display = 'block';
            document.getElementById('an-name').style.borderColor = '#ef4444';
            document.getElementById('an-name').setAttribute('aria-invalid', 'true');
            document.getElementById('an-name').focus();
            return;
        }
        if (nameError) nameError.style.display = 'none';
        document.getElementById('an-name').style.borderColor = 'var(--border-color)';
        document.getElementById('an-name').removeAttribute('aria-invalid');

        if (!phoneRegex.test(phone)) {
            phoneError.style.display = 'block';
            document.getElementById('an-phone').style.borderColor = '#ef4444';
            document.getElementById('an-phone').setAttribute('aria-invalid', 'true');
            document.getElementById('an-phone').focus();
            return;
        }
        phoneError.style.display = 'none';
        document.getElementById('an-phone').style.borderColor = 'var(--border-color)';
        document.getElementById('an-phone').removeAttribute('aria-invalid');

        AnalyzerState.contactInfo = { name, phone, telegram };

        const submitBtn = document.getElementById('btn-lead-submit');
        submitBtn.classList.add('is-loading');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Генерируем ваш отчёт…';

        // eventID совпадает с event_id в заявке - под будущий Conversions API
        AnalyzerState.eventId = 'lead_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        rzTrack('Lead', { content_name: 'Analyzer Completed', content_category: 'analyzer' }, { eventID: AnalyzerState.eventId });

        renderStep('ai_analysis');
    });
}

// ─── 6. AI ANALYSIS ENGINE ─────────────────────────────────

function buildLoadingScreen() {
    return `
        <div class="an-loading">
            <div class="an-loading__ring" aria-hidden="true"></div>
            <h2 class="an-q">Собираем ваш отчёт</h2>
            <p class="an-sub">Сверяем ответы с требованиями ужонда - это займёт несколько секунд.</p>
            <div class="an-loading__steps" id="ai-loading-steps">
                <div class="ai-step ai-step-active"><span class="ai-step__dot"></span>Проверяем основание для подачи</div>
                <div class="ai-step"><span class="ai-step__dot"></span>Ищем риски и противоречия</div>
                <div class="ai-step"><span class="ai-step__dot"></span>Считаем сроки по вашему ужонду</div>
                <div class="ai-step"><span class="ai-step__dot"></span>Формируем план действий</div>
            </div>
        </div>
    `;
}

function animateLoadingSteps() {
    const steps = document.querySelectorAll('.ai-step');
    let idx = 0;
    const interval = setInterval(() => {
        if (idx < steps.length) {
            steps.forEach(s => s.classList.remove('ai-step-active'));
            steps[idx].classList.add('ai-step-active', 'ai-step-done');
            idx++;
        } else {
            clearInterval(interval);
        }
    }, 900);
}

function runAIAnalysis() {
    const score = AnalyzerState.getFinalScore();
    setTimeout(() => {
        renderFinalResults(null, score);
    }, 4 * 900 + 200);
}

// ─── 7. RESULTS SCREEN ────────────────────────────────────

// Текст вердикта для ветки «планирую подачу» - только из найденных рисков
function buildVerdict(ev) {
    const n = ev.risks.length;
    const risksTxt = `${n} ${plural(n, 'риск', 'риска', 'рисков')}`;
    const found = plural(n, 'Выявлен', 'Выявлено', 'Выявлено');
    if (ev.stop) return { headline: 'Подать в текущем виде не получится', verdict: ev.stop };
    if (n === 0) return {
        headline: 'Рисков по вашим ответам не выявлено',
        verdict: 'Ситуация чистая. Главное теперь - собрать полный комплект документов и без ошибок подать заявление в MOS.'
    };
    if (ev.score >= 85) return { headline: 'Сильный кейс с небольшими рисками', verdict: `${found} ${risksTxt}. ${plural(n, 'Его', 'Их', 'Их')} стоит закрыть до подачи - тогда шансы максимальные.` };
    if (ev.score >= 65) return { headline: 'Хорошие шансы - есть что усилить', verdict: `${found} ${risksTxt}. Если закрыть ${plural(n, 'его', 'их', 'их')} до подачи, оценка заметно вырастет.` };
    if (ev.score >= 45) return { headline: 'Кейс требует доработки перед подачей', verdict: `${found} ${risksTxt}. Подавать стоит после того, как серьёзные из них будут закрыты.` };
    return { headline: 'Высокий риск отказа, если подавать сейчас', verdict: `${found} ${risksTxt}, ${plural(n, 'который может', 'которые могут', 'которые могут')} привести к отказу. Сначала нужно исправить ситуацию, потом подавать.` };
}

// Короткая подпись риска для расчёта: часть до " - "
function shortRisk(text) {
    const i = String(text).indexOf(' - ');
    return i > 0 ? String(text).slice(0, i) : String(text);
}

function renderFinalResults(analysis, originalScore) {
    const container = document.getElementById('question-container');
    const progressContainer = document.getElementById('analyzer-progress');

    const answers = AnalyzerState.answers;
    const ev = evaluateCase();
    const score = ev.score;
    const criticalRiskMessage = ev.stop;
    const goal = answers['main_goal']?.value;
    const isSpeedupPath = goal === 'goal_speedup';
    const name = escHtml(AnalyzerState.contactInfo.name || 'Клиент');
    const docs = getDocsFor(answers);
    const prob = getProbabilities(ev);
    const n = ev.risks.length;

    // ── Данные по срокам: сравниваем со средним сроком по нашим делам в этом ужонде ──
    const wait = getWaitInfo(answers);
    const urzadOpt = wait.urzadOpt;
    const expectedWait = wait.expected;
    const waitMonths = wait.months;
    const isOverdue = wait.overdue;
    const nearLimit = wait.near;

    let a;
    if (isSpeedupPath) {
        // Срок вышел за типичный по воеводству - есть основание для ponaglenie
        a = isOverdue ? {
            headline: 'Срок ожидания выше типичного для вашего ужонда',
            overall_verdict: `Вы ждёте ${waitMonths} мес. при среднем сроке ${expectedWait} мес. по нашим делам в этом воеводстве. Это даёт основание требовать ускорения через ponaglenie.`,
            main_basis: 'Жалоба на бездействие воеводы (ponaglenie)',
            steps: ['Подать ponaglenie', 'Запросить Wgląd w akta', 'Обновить ZUS RCA / ZUA и справки o niezaleganiu'],
            delay: 'Высокая',
            timeline: 'зачастую до 35 дней'
        } : {
            // Срок в пределах нормы - честно говорим, что жалоба сейчас не поможет
            headline: 'Срок ожидания в пределах нормы для вашего ужонда',
            overall_verdict: `Вы ждёте ${waitMonths} мес. при среднем сроке ${expectedWait} мес. по нашим делам в этом воеводстве - дело идёт в обычном темпе. Ponaglenie на этом сроке решение не ускорит: жалоба работает, когда срок вышел за типичный.`,
            main_basis: 'Наблюдение за делом и проверка через Wgląd w akta',
            steps: ['Проверить дело через Wgląd w akta', 'Следить за письмами из ужонда', 'Держать ZUS и справки o niezaleganiu актуальными'],
            delay: nearLimit ? 'Средняя' : 'Низкая',
            timeline: `ещё ~${Math.max(1, expectedWait - waitMonths)} мес.`
        };
        if (answers['fingerprints_status']?.value === 'fingers_no_letter' && a.delay === 'Низкая') a.delay = 'Средняя';
        a.wezwanie_probability = a.delay;
        a.refusal_probability = ev.risks.some(r => r.sev === 'crit' || r.sev === 'stop') ? 'Высокая'
            : ev.risks.some(r => r.sev === 'high') ? 'Средняя' : 'Низкая';
        if (n > 0) a.overall_verdict += ` По делу есть ${n} ${plural(n, 'риск', 'риска', 'рисков')} - ${plural(n, 'его', 'их', 'их')} нужно закрыть в первую очередь.`;
        a.checks = ev.checks.concat([
            'Справки ZUS и o niezaleganiu в деле устаревают - держите их актуальными',
            'Если сменили адрес - сообщите в ужонд, чтобы не пропустить письмо'
        ]);
    } else {
        const v = buildVerdict(ev);
        a = {
            headline: v.headline,
            overall_verdict: v.verdict,
            main_basis: docs.title,
            steps: docs.steps,
            wezwanie_probability: prob.wezwanie,
            refusal_probability: prob.refusal,
            // Сроки для ветки планирования берём из средних сроков по нашим делам в этом ужонде
            timeline: urzadOpt && urzadOpt.expected_wait ? `${urzadOpt.expected_wait}-${urzadOpt.expected_wait + 3} мес.` : '6-12 мес.',
            checks: ev.checks
        };
    }

    // Первоочередные шаги: сначала закрываем риски, потом - шаги по основанию
    const fixes = [];
    ev.risks.forEach(r => { if (r.fix && fixes.indexOf(r.fix) === -1) fixes.push(r.fix); });
    const steps = fixes.slice(0, 3).concat(a.steps.filter(s => fixes.indexOf(s) === -1)).slice(0, 4);

    AnalyzerState.finalTimeline = a.timeline;

    const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/58m3066jyr2wr7pm5g6ql6zvb2utponu';

    let answersLog = `🎯 РЕЗУЛЬТАТ АНАЛИЗА: ${score} баллов\n`;
    if (criticalRiskMessage) answersLog += `🚨 СРАБОТАЛ СТОП-ФАКТОР: ${criticalRiskMessage}\n`;
    answersLog += n
        ? `⚠️ РИСКИ (${n}):\n${ev.risks.map(r => `- ${r.text} [${SEVERITY[r.sev].label}${r.pen ? ', -' + r.pen : ''}]`).join('\n')}\n`
        : `✅ РИСКОВ НЕ ВЫЯВЛЕНО\n`;
    answersLog += `📄 ОСНОВАНИЕ: ${a.main_basis}\n`;
    answersLog += `-----------------------------------\n\n`;

    if (AnalyzerState.history && AnalyzerState.history.length > 0) {
        AnalyzerState.history.forEach((stepId) => {
            const step = FLOW[stepId];
            if (step && step.type !== 'onboarding' && step.type !== 'lead_gate' && step.question) {
                let answerText = AnalyzerState.answers[stepId] ? AnalyzerState.answers[stepId].label : 'Нет данных';
                answersLog += `❓ ${resolveQuestion(step)}\n👉 ${answerText}\n\n`;
            }
        });
    }

    fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: AnalyzerState.contactInfo.name || 'Без имени',
            phone: AnalyzerState.contactInfo.phone || 'Без телефона',
            telegram: AnalyzerState.contactInfo.telegram || '',
            service: 'Анализатор ВНЖ (AI)',
            source: 'analyzer_quiz',
            comment: answersLog,
            submitted_at: new Date().toISOString(),
            analyzer_score: score,
            analyzer_timeline: a.timeline,
            // Позволяет отделить в CRM тех, кому подавать сейчас нечего
            stop_factor: criticalRiskMessage ? true : false,
            stop_factor_reason: criticalRiskMessage || '',
            analyzer_risk_count: n,
            analyzer_risks: ev.risks.map(r => r.text).join('; '),
            analyzer_basis: a.main_basis,
            downloaded_pdf: false,
            event_id: AnalyzerState.eventId || '',
            ...rzAttribution(),
        })
    }).then(res => res.json()).then(data => AnalyzerState.notionPageId = data.notion_page_id || null).catch(e => console.error(e));

    if (progressContainer) document.getElementById('progress-fill').style.width = '100%';

    const criticalHtml = criticalRiskMessage ? `
        <div class="an-alert an-alert--error"><strong>Главное препятствие.</strong> ${criticalRiskMessage}</div>` : '';

    container.classList.add('hidden');
    setTimeout(() => {

        const ctaLabel  = isSpeedupPath ? 'Что делать дальше' : 'Следующий шаг';
        const ctaAction = steps[0] || a.main_basis;
        const ctaButton = isSpeedupPath
            ? (isOverdue ? 'Обсудить ускорение дела →' : 'Задать вопрос по своему делу →')
            : (criticalRiskMessage ? 'Подобрать решение со специалистом →' : 'Разобрать кейс со специалистом →');

        const ctaHtml = `
            <div class="an-next-step">
                <div>
                    <p class="an-next-step__label">${ctaLabel}</p>
                    <p class="an-next-step__action">${ctaAction}</p>
                    <p class="an-next-step__hint">Примерный срок: <strong>${a.timeline}</strong></p>
                </div>
                <div class="an-next-step__cta">
                    <a href="https://t.me/residia_consulting" target="_blank" rel="noopener" class="btn btn--primary" data-channel="telegram">${ctaButton}</a>
                    <button type="button" class="btn btn--glass" id="btn-transfer-case">Передать мой кейс специалисту</button>
                    <p class="an-next-step__note">Разбор проверяет специалист, не бот</p>
                </div>
            </div>`;

        const pluses = ev.pluses.slice(0, 6);
        const plusHtml = pluses.length
            ? `<div><h3 class="an-h-good">Плюсы</h3><ul class="an-ticks">${pluses.map(t => `<li>${RZ_ICON('i-check')}<span>${cleanLabel(t)}</span></li>`).join('')}</ul></div>`
            : '';
        const riskHtml = n
            ? `<ul class="an-crosses">${ev.risks.map(r => `<li>${RZ_ICON('i-x')}<span>${cleanLabel(r.text)} <em class="an-sev an-sev--${r.sev}">${SEVERITY[r.sev].label}</em></span></li>`).join('')}</ul>`
            : `<p class="an-empty">${RZ_ICON('i-check')}<span>Рисков по вашим ответам не выявлено</span></p>`;

        const checks = (a.checks || []).slice(0, 4);
        const checksHtml = checks.length
            ? `<div class="an-checks"><h3>Стоит проверить</h3><ul>${checks.map(c => `<li>${cleanLabel(c)}</li>`).join('')}</ul></div>`
            : '';

        // Прозрачный расчёт оценки: откуда взялось число
        const calcRows = ev.risks.map(r => `<li><span>${cleanLabel(shortRisk(r.text))}</span><b>${r.sev === 'stop' ? 'стоп' : '−' + r.pen}</b></li>`).join('');
        const capRow = ev.capApplied !== null
            ? `<li class="an-calc__cap"><span>${ev.stop ? 'Стоп-фактор' : 'Критичный риск'}: оценка не выше ${ev.capApplied}</span><b>≤ ${ev.capApplied}</b></li>`
            : '';
        const calcHtml = `
            <details class="an-calc">
                <summary>Как посчитана оценка ${score} из 100</summary>
                <ul class="an-calc__rows">
                    <li><span>Старт - кейс без рисков</span><b>100</b></li>
                    ${calcRows}
                    ${capRow}
                    <li class="an-calc__total"><span>Итог</span><b>${score}</b></li>
                </ul>
                <p class="an-calc__note">Риск снижает оценку по серьёзности: небольшой −5, средний −12, серьёзный −25, критичный −35 (и оценка не выше 40). Стоп-фактор - оценка не выше 15. Нет рисков - нет штрафов.</p>
            </details>`;

        // Документы: чек-лист, который можно отмечать
        const docsTotal = countDocs(docs);
        const docItem = (t) => {
            const i = t.indexOf(' - ');
            const main = i > 0 ? t.slice(0, i) : t;
            const rest = i > 0 ? t.slice(i + 3) : '';
            return `<li><label class="an-doc"><input type="checkbox" class="an-doc__cb"><span class="an-doc__text"><b>${main}</b>${rest ? `<small>${rest}</small>` : ''}</span></label></li>`;
        };
        const docsHtml = `
            <article class="an-panel an-docs" aria-labelledby="an-docs-title">
                <div class="an-docs__head">
                    <div>
                        <h3 id="an-docs-title">${isSpeedupPath ? 'Что обновить в деле' : 'Документы для подачи'}</h3>
                        <p class="an-docs__basis">${docs.title}</p>
                    </div>
                    <p class="an-docs__count">Есть: <b id="an-docs-done">0</b> из ${docsTotal}</p>
                </div>
                ${docs.note ? `<p class="an-docs__note">${docs.note}</p>` : ''}
                <div class="an-docs__groups">
                    ${docs.groups.map(g => `<div class="an-docs__group"><h4>${g[0]}</h4><ul>${g[1].map(docItem).join('')}</ul></div>`).join('')}
                </div>
                ${docs.page ? `<a class="an-docs__more" href="dokumenty/${docs.page}" target="_blank" rel="noopener" data-cta="analyzer_docs">${isSpeedupPath ? 'За чем следить после подачи' : 'Полный чек-лист: условия, пошлины и шаги подачи'}<span class="sr-only"> (откроется в новой вкладке)</span> ${RZ_ICON('i-out')}</a>` : ''}
                <p class="an-docs__foot">Список базовый: ужонд может запросить и другие документы. Точный список под ваш случай подготовит специалист.</p>
            </article>`;

        container.classList.add('is-wide');
        container.innerHTML = `
            <div class="an-report">
                <header class="an-report__head">
                    <span class="an-kicker">${isSpeedupPath ? 'Анализ сроков' : 'Анализ шансов'}</span>
                    <h2 class="an-report__title">${name}, ваш экспресс-разбор готов</h2>
                    <p class="an-report__quote">${a.headline}</p>
                </header>
                ${criticalHtml}
                <div class="an-metrics">
                    <div class="an-metrics__score">${ringSvg(score)}<span class="an-metrics__title">${getScoreTitle(score)}</span></div>
                    <div class="an-metric"><span class="an-metric__label">${isSpeedupPath ? 'Риск задержки' : 'Риск wezwanie'}</span><span class="an-metric__val prob-${getProbClass(a.wezwanie_probability)}">${a.wezwanie_probability}</span></div>
                    <div class="an-metric"><span class="an-metric__label">Риск отказа</span><span class="an-metric__val prob-${getProbClass(a.refusal_probability)}">${a.refusal_probability}</span></div>
                    <div class="an-metric an-metric--wide"><span class="an-metric__label">Примерный срок</span><span class="an-metric__val an-metric__val--accent">${a.timeline}</span></div>
                </div>
                ${ctaHtml}
                <div class="an-grid">
                    <article class="an-panel">
                        <h3>Резюме и стратегия</h3>
                        <p><strong>Вердикт:</strong> ${a.overall_verdict}</p>
                        <p><strong>Основание:</strong> ${a.main_basis}</p>
                        <h3>Первоочередные шаги</h3>
                        <ol class="an-steps">${steps.map(s => `<li><span>${cleanLabel(s)}</span></li>`).join('')}</ol>
                    </article>
                    <article class="an-panel">
                        <div class="an-split${plusHtml ? '' : ' an-split--single'}">
                            <div><h3 class="an-h-bad">Риски</h3>${riskHtml}</div>
                            ${plusHtml}
                        </div>
                        ${checksHtml}
                        ${calcHtml}
                    </article>
                </div>
                ${docsHtml}
                <p class="an-disclaimer">Это автоматическая оценка по вашим ответам, а не юридическое заключение. Точную стратегию и документы под ваш случай подскажет специалист.</p>
            </div>
        `;

        container.classList.remove('hidden');
        container.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        animateScoreNumbers(container);

        // Счётчик отмеченных документов
        const doneEl = document.getElementById('an-docs-done');
        container.querySelectorAll('.an-doc__cb').forEach(cb => {
            cb.addEventListener('change', () => {
                if (doneEl) doneEl.textContent = container.querySelectorAll('.an-doc__cb:checked').length;
            });
        });

        const btnTransfer = document.getElementById('btn-transfer-case');
        if (btnTransfer) {
            btnTransfer.addEventListener('click', () => {
                if (btnTransfer.disabled) return;
                btnTransfer.disabled = true;
                rzTrack('AnalyzerCallRequest', {});
                btnTransfer.textContent = 'Отправляем…';
                fetch(MAKE_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: AnalyzerState.contactInfo.name, phone: AnalyzerState.contactInfo.phone, source: 'analyzer_call_request', ...rzAttribution() })
                }).then(() => {
                    btnTransfer.textContent = 'Заявка отправлена - скоро свяжемся';
                    btnTransfer.style.borderColor = 'var(--accent-color)';
                    btnTransfer.style.color = 'var(--accent-color)';
                });
            });
        }
    }, 300);
}

// ─── 8. HELPERS ────────────────────────────────────────────

function plural(n, one, few, many) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
}

// Цвет кольца: зелёный - от 65, жёлтый - 45-64, красный - ниже 45
function getScoreClass(score) {
    if (score >= 65) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
}

// Кейс без рисков = 100 баллов. Небольшие риски оставляют кейс сильным,
// серьёзные и критичные - опускают в «требует доработки» и ниже.
function getScoreTitle(score) {
    if (score >= 85) return 'Сильный кейс';
    if (score >= 65) return 'Хорошие шансы';
    if (score >= 45) return 'Требует доработки';
    if (score >= 25) return 'Высокий риск';
    return 'Критическая ситуация';
}

function getScoreSummary(score, riskCount, checkCount, hasStop, wait) {
    const risks = `${riskCount} ${plural(riskCount, 'риск', 'риска', 'рисков')}`;
    const found = plural(riskCount, 'Выявлен', 'Выявлено', 'Выявлено');
    const them = plural(riskCount, 'его', 'их', 'их');
    const canLead = plural(riskCount, 'который может', 'которые могут', 'которые могут');
    if (hasStop) return 'Есть препятствие для подачи в текущем виде - подробности ниже.';
    if (riskCount === 0 && wait && wait.speedup) {
        return wait.overdue
            ? 'Рисков по делу не выявлено, но срок ожидания выше типичного для вашего ужонда - в отчёте покажем, что можно сделать.'
            : 'Рисков по делу не выявлено, срок ожидания пока в пределах нормы.';
    }
    if (riskCount === 0) {
        return checkCount > 0
            ? 'Рисков по вашим ответам не выявлено. Есть пара моментов, которые стоит проверить перед подачей.'
            : 'Рисков по вашим ответам не выявлено. Осталось правильно собрать документы и подать.';
    }
    if (score >= 85) return `Ситуация стабильная. ${found} ${risks} - закройте ${them} до подачи, чтобы не получить wezwanie.`;
    if (score >= 65) return `Шансы хорошие. ${found} ${risks} - ${them} стоит закрыть до подачи.`;
    if (score >= 45) return `${found} ${risks}. Подавать стоит после доработки.`;
    return `${found} ${risks}, ${canLead} привести к отказу. Подавать в текущем виде рискованно.`;
}

function getProbClass(prob) {
    if (prob === 'Низкая') return 'low';
    if (prob === 'Средняя') return 'medium';
    return 'high';
}

// ─── 9. STYLES ────────────────────────────────────────────
// Оформление анализатора - в css/analyzer.css (раньше стили вставлялись из JS).

// ─── 10. INIT ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Старые инлайн-стили больше не подключаем: оформление в css/analyzer.css

    // Переключатель темы остался от старого дизайна: на новой странице его нет,
    // поэтому код просто ничего не делает. try/catch - на случай запрета localStorage.
    try {
        const themeToggleBtn = document.getElementById('theme-toggle');
        if (themeToggleBtn) {
            const htmlElement = document.documentElement;
            htmlElement.setAttribute('data-theme', localStorage.getItem('theme') || 'light');
            themeToggleBtn.addEventListener('click', () => {
                const newTheme = htmlElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
                htmlElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
            });
        }
    } catch (e) { /* ignore */ }

    const typingContainer = document.getElementById('typing-text');
    let typingTimer = null;

    if (typingContainer) {
        const fullText = "Привет, я умный анализатор шансов ВНЖ от ";
        let index = 0;

        function typeEffect() {
            if (index < fullText.length) {
                typingContainer.innerHTML += fullText.charAt(index);
                index++;
                typingTimer = setTimeout(typeEffect, 45);
            } else {
                typingContainer.innerHTML += '<span class="text-accent fade-in-brand">Residia.</span>';

                setTimeout(() => {
                    const cursor = document.querySelector('.typing-cursor');
                    if (cursor) cursor.style.display = 'none';
                }, 1000);
            }
        }
        setTimeout(typeEffect, 300);
    }

    const btnStart = document.getElementById('btn-start-analyzer');
    const stepOnboarding = document.getElementById('step-onboarding');
    const questionContainer = document.getElementById('question-container');
    const progressContainer = document.getElementById('analyzer-progress');

    if (btnStart && stepOnboarding && questionContainer) {
        btnStart.addEventListener('click', () => {
            if (typingTimer) clearTimeout(typingTimer);

            AnalyzerState.reset();
            rzTrack('AnalyzerStart', {});

            stepOnboarding.classList.remove('active');
            stepOnboarding.classList.add('hidden');

            if (progressContainer) {
                progressContainer.classList.remove('hidden');
            }

            questionContainer.classList.remove('hidden');

            renderStep('start_status');
        });
    }

    // ── Бургер-меню (мобильная навигация) ──
    initBurgerMenu();
});

/**
 * Инициализация бургер-меню. Безопасна для всех страниц:
 * если кнопки .burger-btn нет - просто ничего не делает.
 * Защита от двойной инициализации через data-атрибут.
 */
function initBurgerMenu() {
    const burgerBtn = document.querySelector('.burger-btn');
    const mainNav   = document.querySelector('.main-nav');
    if (!burgerBtn || !mainNav) return;
    if (burgerBtn.dataset.bound === 'true') return;
    burgerBtn.dataset.bound = 'true';

    let overlay = document.querySelector('.nav-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        document.body.appendChild(overlay);
    }

    const toggle = (open) => {
        const willOpen = open ?? !mainNav.classList.contains('active');
        mainNav.classList.toggle('active', willOpen);
        burgerBtn.classList.toggle('active', willOpen);
        document.body.classList.toggle('nav-open', willOpen);
        overlay.classList.toggle('active', willOpen);
    };

    burgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
    });

    mainNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => toggle(false));
    });

    // Клик вне панели закрывает меню
    document.addEventListener('click', (e) => {
        if (mainNav.classList.contains('active') &&
            !mainNav.contains(e.target) &&
            !burgerBtn.contains(e.target)) {
            toggle(false);
        }
    });
}