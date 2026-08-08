<div align="center">

#  Quiz Maker

### Secure Offline Exam Builder

[![Live Demo](https://img.shields.io/badge/Live_Demo-op--h.github.io-58a6ff?style=for-the-badge&logo=github&logoColor=white)](https://op-h.github.io/Quiz_Maker/)
[![License](https://img.shields.io/badge/License-MIT-39d353?style=for-the-badge)](LICENSE)
[![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-e3b341?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

<br>

<p>
  <strong>Build exams in a premium admin dashboard and export a single self-contained offline HTML file.</strong>
  <br>
  No server. No accounts. No backend. The exported exam runs fully offline in any browser.
</p>

<br>

<img width="90%" alt="Admin Dashboard" src="https://github.com/user-attachments/assets/849912af-8199-448b-a029-5442b0242161" />

</div>

---

<br>

##  Features at a Glance

<table>
<tr>
<td width="50%">

###  Admin Dashboard
- Drag-and-drop question builder
- MCQ, Text, and Code question types
- File attachment support (images, PDFs, code)
- Arabic translation with one click
- AI Studio for notes/PDF-to-quiz generation
- AI distractor generation for MCQs
- AI English/Arabic wording improvement
- Light & dark mode toggle
- LocalStorage persistence — never lose your work

</td>
<td width="50%">

###  Exam Security Suite
- Fullscreen enforcement
- Focus/blur detection with overlay lock
- Keyboard shortcut blocking (F11, Esc, PrtScn)
- Clipboard wiping & paste prevention
- Anti-screenshot overlay
- Copy-paste lock (optional)

</td>
</tr>
<tr>
<td width="50%">

###  Offline-First Exams
- Export one standalone `.html` exam file
- Runs with no server, no internet, no install
- Optional random question subset per attempt
- Retake support with a fresh shuffle
- Answers stored as hashes, never plain text
- Built-in timer with auto-submit

</td>
<td width="50%">

###  Code Execution
- **Python** — runs via Skulpt (no server needed)
- **JavaScript** — executed live in the browser
- **HTML** — rendered in an inline preview pane
- Code verification with expected output matching
- Syntax-highlighted editor with Run button

</td>
</tr>
</table>

<br>

---

<br>

##  Question Types

| Type | Description | Grading |
|:---|:---|:---|
| **Multiple Choice** | Classic MCQ — students pick one answer from shuffled options | Auto-graded on submit |
| **Text Answer** | Free text input with format hints and optional hint badges | Auto-graded against hashed answer |
| **Code Challenge** | Write & run Python, JavaScript, or HTML directly in the exam | Manual review by teacher |

> All question types support **file attachments** — attach images, PDFs, or reference code that students can download during the exam.

<br>

---

<br>

##  Getting Started

### Building an Exam (Offline)

```
1.  Open index.html in your browser
2.  Add questions using the sidebar navigation or AI Studio
3.  Configure title, password, timer, and security settings
4.  Click "Export Offline HTML" → downloads a standalone exam file
```

### AI Features (Teacher Builder)

```
1.  Open AI Studio in the sidebar
2.  Pick a provider: Ollama (free local), OpenRouter (one sign-in for GPT/Claude/Gemini),
    OpenAI, or any OpenAI-compatible endpoint
3.  Either paste an API key, or click "Sign in with OpenRouter" to fetch one automatically
4.  Paste notes or upload a PDF/TXT/MD file
5.  Generate questions, review the preview, then import them into the question bank
6.  Use the editor AI buttons to improve English/Arabic wording or generate MCQ distractors
```

> "Sign in with OpenRouter" uses a browser OAuth (PKCE) flow, so it only works when the
> builder is served over http/https (e.g. GitHub Pages or `py -m http.server`), not from a
> `file:///` page.

### Taking an Exam (Student)

```
1.  Open the exported .html file (works fully offline)
2.  Enter your name and exam password (if required)
3.  Answer questions — use the sidebar to navigate
4.  Click "Submit All Answers" when finished
```

<br>

---

<br>

## Configuration

### AI Setup (for AI Studio)

- The builder supports:
  `Ollama (free local)` for notes-to-quiz, distractors, and language improvement
  `OpenRouter` — one sign-in (OAuth) to reach GPT, Claude, Gemini, Llama and more
  `OpenAI Responses` for hosted generation plus direct PDF file input
  `Custom OpenAI-compatible` endpoints/proxies
- For local/personal use, `Ollama` is the easiest free option. Run Ollama locally, pull a model such as `llama3.2`, `qwen2.5:14b`, or `gpt-oss:20b`, then select `Ollama (Free Local)` in `AI Studio`.
- When using `Ollama` in the browser, do not open the builder as `file:///...`. Serve the folder locally instead, for example:
  `py -m http.server 5500`
  then open `http://127.0.0.1:5500/index.html`
- For production or shared environments, route AI calls through your own backend/proxy instead of exposing a real secret in the browser.

<br>

---

<br>

##  Project Structure

```
Quiz_Maker/
│
├── index.html              → Admin exam builder dashboard
├── style.css               → Glassmorphism dark/light theme
├── admin.js                → Builder logic + offline exam generation
├── challenges.js           → Shared question encoding utilities
│
└── .github/
    └── workflows/
        └── deploy.yml      → GitHub Pages auto-deployment
```

<br>

---

<br>

##  Screenshots

<div align="center">

<img width="90%" alt="Exam Builder Dashboard" src="https://github.com/user-attachments/assets/849912af-8199-448b-a029-5442b0242161" />
<br><br>
<img width="60%" alt="Student Exam View" src="https://github.com/user-attachments/assets/2f5db86d-a908-4aa7-8d82-9b79e0d4edd5" />

</div>

<br>

---

<br>

##  Tech Stack

<div align="center">

| Technology | Purpose |
|:---:|:---:|
| ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) | Structure |
| ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) | Glassmorphism theme |
| ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) | Core logic |
| ![Skulpt](https://img.shields.io/badge/Skulpt-3776AB?style=flat-square&logo=python&logoColor=white) | Python execution |

</div>

<br>

---

<br>

<div align="center">

### Built with ❤️ by [OPH](https://github.com/op-h)

<br>

[![GitHub Stars](https://img.shields.io/github/stars/op-h/Quiz_Maker?style=social)](https://github.com/op-h/Quiz_Maker)

</div>
