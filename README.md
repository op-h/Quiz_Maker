<div align="center">

#  Quiz Maker

### Secure Exam Builder & Live Online Portal

[![Live Demo](https://img.shields.io/badge/Live_Demo-op--h.github.io-58a6ff?style=for-the-badge&logo=github&logoColor=white)](https://op-h.github.io/Quiz_Maker/)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime_DB-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-39d353?style=for-the-badge)](LICENSE)
[![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-e3b341?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

<br>

<p>
  <strong>Build exams in a premium admin dashboard. Export as offline HTML or host live sessions with real-time leaderboards.</strong>
  <br>
  No server. No accounts. No backend. Everything runs in the browser.
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

###  Live Online Exams
- Real-time Firebase-powered sessions
- Live leaderboard with scores & completion times
- 6-character exam codes for students to join
- Auto-submit on timer expiry
- Teacher dashboard with live student tracking
- Graceful exam termination with data preservation

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
2.  Add questions using the sidebar navigation
3.  Configure title, password, timer, and security settings
4.  Click "Export Offline HTML" → downloads a standalone exam file
```

### Hosting a Live Exam (Online)

```
1.  Set up Firebase (see Configuration below)
2.  Add your questions in the builder
3.  Click "Host Live Exam" → generates a 6-character exam code
4.  Share the code — students join at take.html
5.  Monitor live progress on the teacher dashboard
6.  Click "End Exam" when done → results are preserved
```

### Taking an Exam (Student)

```
1.  Open the .html file (offline) or navigate to take.html (online)
2.  Enter your name and exam password (if required)
3.  Answer questions — use the sidebar to navigate
4.  Click "Submit All Answers" when finished
```

<br>

---

<br>

## Configuration

### Firebase Setup (for Live Exams only)

<details>
<summary><strong>Click to expand Firebase setup instructions</strong></summary>

<br>

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a free project
3. Add a **Web App** to get your config keys
4. Create a **Realtime Database** and set rules to allow read/write
5. Copy your config into `js/firebase-config.js`:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  databaseURL: "https://your-project-default-rtdb.firebasedatabase.app",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

> **Note:** Firebase web API keys are designed to be client-side. Secure your data using [Firebase Security Rules](https://firebase.google.com/docs/database/security), not by hiding the config.

</details>

<br>

---

<br>

##  Project Structure

```
Quiz_Maker/
│
├── index.html              → Admin exam builder dashboard
├── take.html               → Live online exam student portal
├── style.css               → Shared glassmorphism dark/light theme
├── admin.js                → Builder logic + offline exam generation
├── challenges.js           → Shared question encoding utilities
│
├── js/
│   ├── firebase-config.js  → Firebase credentials (your config)
│   └── take.js             → Student exam logic (online mode)
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
| ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black) | Live exam sync |
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
