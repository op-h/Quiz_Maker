# Quiz Maker — Ideas Backlog

Great things to implement next, grouped by theme. Effort: S (hours) · M (a day) · L (multi-day).
Items marked ⭐ are the highest value-for-effort.

## Saving, sharing & organizing
- ⭐ **Autosave the builder + "last edited" recovery** (S) — beyond the current single working set, snapshot periodically so a crash never loses work.
- ⭐ **QR code for share links** (S) — render the `#exam=` link as a QR so students can open the exam on phones instantly (self-contained, no CDN — generate the QR in-browser).
- **Import/merge instead of replace** (M) — when loading/importing, offer "merge into current bank" with automatic ID reconciliation, not just full replace.
- **Folders / tags for the Exam Library** (M) — group saved exams by course/unit; search and filter.
- **Optional cloud sync (opt-in backend)** (L) — a small Firebase/Supabase layer so a teacher can save exams to an account and share a short link instead of a long code. Keep the offline path as default.
- **Attachment-aware sharing** (M) — today share codes strip files; add an option to bundle attachments (with a size warning) or upload them and reference URLs.

## The taker experience (highest impact — carried over from the UX audit)
- ⭐ **Autosave + resume an in-progress attempt** (M) — persist answers + the absolute timer deadline so a refresh/crash/sleep doesn't wipe the exam; offer "Resume".
- ⭐ **Pre-exam instructions / consent screen** (M) — show question count, duration, navigation rules, grading model, and exactly what is monitored, with one "I understand — begin".
- ⭐ **Unify the grading model** (M) — record answers without a correctness oracle, keep them editable until final submit, grade at the end. Removes the one-shot MCQ lock and the brute-forceable infinite-retry text field.
- **"Download my answers" receipt** (S) — always give the student a durable artifact (JSON/HTML) to submit, independent of the teacher-unlock gate.
- **Question flagging + review screen** (S) — let students mark questions to revisit and see a "review before submit" summary.
- **Better code questions** (M) — trap Tab for indentation, show sample/expected I/O, optional auto-checks; today it's a bare textarea with manual grading only.

## Authoring (maker) power features
- ⭐ **Drag-to-reorder questions** (M) — replace manual "Position" renumbering with drag handles / move up-down.
- **Reveal / verify the saved answer** (S) — let the teacher see or test a text/code answer after saving (it's currently write-only hashed).
- **Inline field validation** (S) — make the editor a real `<form>` with per-field errors + focus instead of blocking `alert()`s.
- **Question templates & duplication** (S) — "duplicate question", starter templates per type.
- **Bulk actions** (S) — multi-select delete, change points/topic in bulk, bulk translate.
- **Rich content** (M) — Markdown/LaTeX in questions (math/code formatting), and images embedded in the question body.
- **Question bank import from CSV/Google Forms/Moodle GIFT** (M) — meet teachers where their content already lives.

## Grading & results
- **Instructor results dashboard** (L) — aggregate multiple students' result files: per-question stats, score distribution, item difficulty, CSV export.
- **Partial credit & rubrics** (M) — for text/code, allow multiple accepted answers, regex/keyword matching, and rubric points.
- **Multiple accepted answers for text** (S) — store a set of acceptable hashes, not just one.

## Accessibility, i18n & polish
- **Full RTL/Arabic UI mode** (M) — the content already supports Arabic; mirror the whole layout when Arabic is active.
- **More languages** (M) — generalize the EN/AR toggle to an arbitrary language list.
- **Print / PDF exam + answer key** (S) — a print stylesheet so teachers can hand out a paper version.
- **Theme presets** (S) — a few exam skins (HTB green, classic light, high-contrast) the teacher can pick per exam.
- **Reduced-data / low-end mode** (S) — a toggle that drops the background FX and animations for very old devices.

## Trust & integrity (be honest about limits)
- **Documented threat model** (S) — a short "what the security features do and don't do" note; today client-side grading is honor-based by nature.
- **Server-side grading option** (L) — the only real anti-cheat: grade in a Cloud Function so answers/hashes never ship to the client and scores are authoritative.
- **Soft integrity signals** (S) — already logging focus-loss; add optional time-per-question and paste-count signals surfaced to the instructor (not punitive to the student).

## Engineering health
- **Self-host Skulpt / pin versions + SRI** (S) — make "offline" truly offline and tamper-resistant.
- **Unit tests for hashing + share round-trip + AI-response parsing** (S) — pin known input→output pairs; a CI check.
- **Split the exported runtime into a source file + build step** (M) — the exam template is a large string in admin.js; a tiny build would make it far easier to maintain and test.
