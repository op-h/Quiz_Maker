# Capture The Flag (CTF) Exam Builder

A self-contained, offline-first exam builder for CTF-style challenges. This tool allows teachers to create Web Design and Security quizzes, and export them as standalone, single-file HTML exams that students can take offline without needing a server.

## Features
- **Standalone Exams:** Generated exams are bundled into a single `.html` file containing all CSS, JS, and layout logic.
- **Anti-Cheat Mechanics:**
  - Browser right-click explicitly disabled.
  - Selecting and copying/pasting text explicitly disabled.
  - F12/Developer Tools blocked.
  - Scrambled and random questions.
- **Auto Grading:** Hash-based evaluation of input strings directly inline without exposing the answer key payload easily.
- **Customizable Dashboard:** Add, edit, format, and assign points (including float points) to questions. Questions also support Native formatting via multi-line text mapping.
- **Bilingual Support:** Students can toggle translating exam questions from English to Arabic or vice-versa.
- **Dark/Light Mode:** A sleek, beautiful interface that switches automatically or persists user's custom localStorage overrides. 

## Instructions
1. Open up `admin.html` inside any modern browser.
2. Click **Add Question** or adjust any current Default Questions using the editor. 
3. After completing the desired amount of custom exam questions, title your exam and press **Create Quiz File**.
4. The standalone `[your_title_exam].html` file will download to your machine. 
5. Distribute this single file out to students seamlessly! Any completed test will automatically display their Name, Time and Final Grade Points in the Results window.
