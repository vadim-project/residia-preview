# RESIDIA Consulting — Legalizacja w Warszawie
https://vadim-project.github.io/residia-consulting/

> **To nie jest projekt szkolny z fałszywymi danymi.**  
> To działająca strona internetowa prawdziwej firmy konsultingowej z Warszawy.  
> Formularz kontaktowy jest podłączony do prawdziwego systemu — każde zgłoszenie trafia do klienta.

---

## O projekcie

RESIDIA Consulting to firma oferująca usługi legalizacji i obsługi biznesowej w Polsce.  
Strona została zaprojektowana i zbudowana od zera jako **produkcyjny projekt komercyjny** — nie szablon, nie kopia, nie demo.

Wszystkie dane kontaktowe, numery telefonów i adresy Telegram są prawdziwe i aktywne.

---

## Technologie

- **HTML5** — semantyczne znaczniki (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`, `<article>`)
- **CSS3** — własne style bez Bootstrap/Tailwind
  - CSS Variables (paleta kolorów, spacing)
  - Flexbox (nagłówek, statystyki, CTA, formularz)
  - CSS Grid (karty usług, sekcja "Dlaczego RESIDIA", stopka)
  - Media queries — 3 breakpointy (mobile 480px, tablet 768px, desktop 1024px)
  - Transitions & animations (karty, FAB, przełącznik motywu, scroll animations)
- **JavaScript ES6+** — czysty Vanilla JS, zero jQuery
  - `createElement` — dynamiczne renderowanie kart usług z tablicy obiektów
  - Intersection Observer API — animacje przy scrollowaniu
  - Scroll event listener — sticky header z cieniem
  - Dark/Light mode z zapisem do `localStorage`
  - Walidacja formularza z RegExp (telefon `+48` + 9 cyfr)
  - Fetch API — asynchroniczna wysyłka formularza
  - `event.preventDefault()` — obsługa formularza bez przeładowania
  - FAB menu z animacją

---

## ⚡ Prawdziwy formularz kontaktowy

Formularz na stronie jest **w pełni skonfigurowany i działa produkcyjnie**.

- Podłączony do **Formspree** (zewnętrzne API)
- Każde zgłoszenie trafia bezpośrednio do skrzynki
- Walidacja po stronie JS przed wysyłką (imię, telefon, wybór usługi)
- Obsługa stanów: ładowanie → sukces / błąd
- Po pomyślnej wysyłce formularz zastępowany jest ekranem potwierdzenia

To odróżnia ten projekt od typowych projektów studenckich z formularzami `action="#"`.

---

## Funkcjonalności

- [x] Przełącznik Dark/Light mode z zapisem preferencji (`localStorage`)
- [x] Dynamiczne renderowanie kart usług (`createElement`, tablica obiektów)
- [x] Animacje wejścia przy scrollowaniu (Intersection Observer API)
- [x] Sticky header z efektem cienia przy scrollowaniu
- [x] Formularz kontaktowy z walidacją RegExp i Fetch API
- [x] FAB (Floating Action Button) z menu kontaktowym i animacją
- [x] Responsywny layout — mobile, tablet, desktop
- [x] Płynne przewijanie do sekcji (smooth scroll)
- [x] Obsługa błędów wysyłki formularza z komunikatem fallback

---

## Struktura projektu

```
residia/
├── index.html          # Główny plik HTML
├── css/
│   └── styles.css      # Wszystkie style
├── js/
│   └── main.js         # Cała logika JavaScript
├── img/
│   └── residia.svg     # Logo firmy
└── README.md
```

---

## Uruchomienie

## Live Demo

🌐 https://vadim-project.github.io/residia-consulting/

---

## Autor
Rahozhnikau Vadzim
Number albomu: 76346
Projekt zrealizowany jako komercyjna strona internetowa dla RESIDIA Consulting, Warszawa.



*Projekt spełnia wymagania przedmiotu "Wprowadzenie do Technologii Internetowych" —  
responsywność, semantyczny HTML, CSS Grid/Flexbox, Vanilla JS, Fetch API, localStorage, walidacja formularzy.*
