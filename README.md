# Quiz Maker — Exam Builder

A fully offline, browser-based exam builder and student exam runner. Built for programming lab exams where you need to run your own show without depending on any backend.

---

## What it does

You build exams in the admin panel, export them as a single `.html` file, then hand that file to students. That's it. No server, no internet required during the exam, no accounts. Everything runs locally in the browser.

Students get a locked-down experience — the exam tracks their answers, runs their code, and submits everything at the end. You review manually from the results panel.

---

## Question types

**Multiple choice** — classic MCQ. Students pick one answer. You set which one is correct. Feedback is held until they submit everything.

**Text answer** — student types a free answer. You can set a format hint (shown as dashes in the input box) and an optional hint badge below the question.

**Code challenge** — student writes code directly in the exam. Supports:
- Python (runs via Skulpt — no server needed)
- JavaScript (executed live in the browser)
- HTML (rendered in a preview pane)

---

## How to use it

### Building an exam

1. Open `index.html` in your browser
2. Add questions using the sidebar
3. Configure the exam title, password (optional), and whether to lock copy-paste
4. Hit **Generate Output** — it downloads a standalone `.html` file

### Running an exam

Just open the downloaded `.html` file. If you set a password, students enter it to unlock. Once they start, the exam is locked to that browser session.

At the end they click **Submit All Answers** and a results screen shows everything they answered. Teachers can review code submissions and manually mark them correct or incorrect.

---

## Stack

Nothing fancy. Vanilla HTML, CSS, and JavaScript for everything. Skulpt is fetched and embedded at build time for Python execution (needs internet once, when you generate the exam file).

The admin panel uses `localStorage` to persist questions between sessions so you don't lose your work if you close the tab.

---

## Features worth noting

- **Completely offline** — the generated exam file is self-contained
- **Python code execution** — actually runs `print()` and shows output, powered by Skulpt
- **Copy-paste lock** — optional setting that blocks right-click, copy, and paste
- **Light / dark mode** — works in both, with a toggle in the corner
- **Arabic translation** — translate questions to Arabic with one click (via browser API)
- **Optional hints** — teachers can add a hint that students can reveal
- **Attempt counter** — tracks how many times the exam was retried

---

## Project structure

```
index.html      → Admin exam builder
style.css       → Shared styles (dark/light theme)
admin.js        → Builder logic + exam file generation
challenges.js   → Shared question utilities
```

---

## Screenshots

> TODO — drop screenshots here once you have them

---

## Credits

Designed and built by **oph**
