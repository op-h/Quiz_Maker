# Quiz Maker — Threat model & honest limitations

Quiz Maker is **offline-first and backend-free**: the exam is a single self-contained
HTML file that runs entirely in the student's browser. That design has real benefits
(no server, no accounts, works anywhere) and real security limits. This document states
them plainly so no one relies on guarantees the app cannot make.

## What the "security" features actually are
They are **deterrents and civility nudges, not enforcement**:

| Feature | What it does | What it does NOT do |
|---|---|---|
| Focus-loss logging (Exam Mode) | Counts times the student leaves the tab/window and shows it to the instructor | Cannot stop a second device, a phone camera, or a friend in the room |
| Copy/paste & context-menu lock | Discourages casual copying | Trivially bypassed via devtools, view-source, or the OS |
| Answer hashing (SHA-256) | Keeps the *plaintext* answer out of the file | The file still ships enough to check answers locally; a determined user can brute-force short answers offline |
| Password gate | Stops casual starting/opening | The password hash ships in the file; it is a gate, not encryption |

## The core fact: grading happens on the student's machine
Because everything runs client-side:

- The exported file contains each answer's **hash** (and, for the slotted answer box,
  the answer's **length/word pattern** — this is an intentional hint, and it narrows
  guessing). Anyone who opens the file or devtools can inspect these.
- Scores are computed in the student's browser, so a technical student can alter them.
- No client-side trick (fullscreen, blur, obfuscation, key-blocking) changes this. Those
  were removed or softened precisely because they harm honest students without stopping
  determined ones.

**Treat offline exams as honor-based / low-stakes** (practice, homework, formative
quizzes, self-check). Do not use them where a motivated cheater must be prevented.

## If you need real integrity
The only robust fix is **server-side grading**: keep answers and grading on a server
(e.g. a Cloud Function) so the client never receives the answers and the score is
authoritative. That requires adding a backend and is out of scope for the offline build —
see `docs/ideas.md` ("Server-side grading option"). Consider it for high-stakes exams.

## Good practice for teachers
- Use unique exam files / question subsets per sitting so a leaked file has limited value.
- Prefer larger question banks with a random subset per attempt.
- Use the focus-loss log and (future) time-per-question signals as *conversation starters*,
  not automatic verdicts.
- Keep real high-stakes assessment on a proctored or server-graded platform.
