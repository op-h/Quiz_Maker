# Quiz Maker — Code Review & Improvement Notes

A file‑by‑file review of what's wrong (bugs, security, maintainability) and concrete
ideas to make it better. Severity tags:

- 🔴 **Critical** — data loss, cheating, credentials, or crashes for normal users
- 🟠 **Major** — real bug or design flaw that will bite in normal use
- 🟡 **Minor** — quality, maintainability, or polish

---

## ✅ Fixes applied (offline‑export pass)

Focused on the **Export Offline HTML** pipeline (`admin.js`), since exams run offline.
All changes were verified by generating a real exam file through the full
`buildExamHtml → packStandaloneHtml` pipeline and running it in a browser end‑to‑end
(join → answer MCQ + text → grade → 100% result screen), with no console errors.

- **Offline Python export** — `buildExamHtml` now checks the *selected* export set (not
  the whole bank) for Python, and the Skulpt engine is fetched through `loadSkulptEngine()`
  which **caches** it (in‑memory + best‑effort `localStorage`) and falls back to a second
  CDN. After one online export, Python exams can be exported offline.
- **Answer leak removed** — `sanitizeChallengesForStudent()` strips the `isCorrect` flag
  from MCQ options before they're embedded in the exported file (and before live publish).
  Grading still works because it uses the answer hash. Verified: exported HTML contains no
  `isCorrect`.
- **Anti‑debugger traps removed** — the three `Function("debugger")`/`setInterval` traps
  (data‑logic script, embedded game script, and the obfuscator) are gone. They froze
  DevTools (including the teacher's), burned CPU on low‑end exam machines, and stopped
  nothing.
- **Data‑loss guard** — changing a question's Order/ID to one already in use is now blocked
  with a clear message instead of silently overwriting/duplicating another question.
- **Storage‑full handling** — `saveToStorage` catches `QuotaExceededError` and warns the
  teacher instead of losing the save silently.
- **Correctness fixes** — the results screen now uses `cancelAnimationFrame` (was
  `clearInterval`) to stop the focus‑poll loop; the text‑answer placeholder is escaped via
  `escHtml(p)`; the builder's `escHtml` now also escapes `'` and coerces to string.

Still open / recommended next (see below): move grading server‑side or document offline as
honor‑based (§0), the whole live/Firebase path (§1, §5), and the maintainability cluster
(§7). The online `take.html` portal was intentionally **not** modified in this pass.

---

## 0. The big picture (read this first)

**All grading and "security" runs in the student's own browser.** That single fact
undermines most of the anti‑cheat features:

- The offline exported `.html` **contains the answers**: every text answer's hash, and
  for MCQ the correct option is flagged `isCorrect:true` right in the shipped `options`
  array. Anyone who opens the file (or DevTools) can read them.
- The live exam reads the **entire** exam node — including `challenges`, `passHash`, and
  `teacherPassHash` — into the student's browser, and the recommended Firebase rule is
  world read/write.
- Scores are computed on the client and written straight to Firebase, so a student can
  set any score.

None of this can be fixed by more obfuscation. The only real fix is **server‑side
grading** (Cloud Function / small backend) so answers never reach the client and scores
are authoritative. Everything client‑side (fullscreen lock, screenshot blur, `debugger`
traps, obfuscation) is a *deterrent*, not security, and should be described that way in
the README. Recommend adding a short "Threat model & limitations" section that says so
honestly.

Below, findings that stem from this are marked **[client‑trust]**.

---

## 1. `js/firebase-config.js` + `.gitignore` + `deploy.yml`

🔴 **Real credentials are committed.** `js/firebase-config.js:12-18` holds the live
`live-online-exam1` project keys, yet `.gitignore` says *"Nothing to ignore"* and there's
already a `firebase-config.example.js`. The Firebase **web API key isn't secret by
design**, but combined with the world‑writable DB rule the README recommends, anyone who
reads the repo can read/delete every live exam. Also, `deploy.yml` **overwrites this file
from CI secrets**, so committing the real values is pointless *and* leaky.
- **Fix:** commit only `firebase-config.example.js`; add `js/firebase-config.js` to
  `.gitignore`; rotate the project or lock it with proper rules (below).

🔴 **[client‑trust] Firebase rules.** README/setup tell users to set rules to *"True for
read/write."* That lets any visitor read all answers/passwords and overwrite/delete data.
- **Fix:** at minimum, split the data so answers live under a path students can't read,
  gate writes to a student's own node, and use Firebase **Anonymous Auth** + rules keyed
  on `auth.uid`. Properly, grade in a Cloud Function so `challenges`/hashes never ship.

🟠 **`deploy.yml` heredoc isn't escaped.** `cat > js/firebase-config.js << SCRIPT_END`
with `${FB_*}` interpolation will break (or inject) if any secret contains `"`, `` ` ``,
`$`, or a newline. Low risk for Firebase values, but fragile.
- **Fix:** write the values as JSON via a tiny node/jq step, or quote defensively.

🟠 **CI doesn't update `take.html`.** The workflow rewrites `js/firebase-config.js`, but
`take.html` carries its **own baked‑in copy** of the config (see §5). Rotating secrets in
CI silently leaves `take.html` pointing at the old project.

---

## 2. `challenges.js`

🟠 **Default question bank uses 32‑bit FNV hashes** (`hash:'56d78aa1'`, etc.). The
`legacyEncodeInput` path is a 32‑bit hash — trivially collidable and, for known formats
("A single word", "`<tag>`"), dictionary‑attackable. A *wrong* answer can even be accepted
via a collision (fairness bug).
- **Fix:** regenerate the 14 defaults with the SHA‑256 `encodeInput` and keep the legacy
  path only for backward compatibility with old exported files.

🟠 **Dead code.** `defaultChallenges` + `getChallenges()` read
`localStorage['__ctf_custom_challenges']`, but `admin.js` stores/loads from
`__ctf_exam_builder` and never calls `getChallenges()`. So this whole block appears
unused by the app today.
- **Fix:** either wire it up (seed an empty builder with these) or delete it to avoid
  confusion.

🟡 **Naming.** `window.CTF_DATA` — this is a quiz app, not a CTF. The name (and the stray
CTF `CLAUDE.md` one folder up) is confusing. Rename to e.g. `QUIZ_CRYPTO`.

🟡 **`escHtml` inconsistency starts here** — see §7.

---

## 3. `admin.js` — builder logic

🔴 **Order/ID overwrite silently deletes questions.** The "Order (ID)" field is also the
primary key. On save, `admin.js:505` does
`localChallenges = localChallenges.filter(c => c.id !== newId)` before pushing. If a
teacher types an Order that already exists, the other question is **silently destroyed**.
- **Fix:** separate a stable internal `id` (never user‑edited) from a display `order`;
  or detect the collision and warn/confirm.

🟠 **`hasPython` checks the wrong list.** `admin.js:1707`:
```js
const hasPython = localChallenges.some(c => c.type === 'code' && c.codeLang === 'python');
```
It should check `exportChallenges` (the selected subset), not the whole bank. As written,
exporting a selection with no Python still fetches and inlines the ~MB Skulpt engine if
*any* bank question is Python — and could miss it in edge cases.
- **Fix:** `const hasPython = exportChallenges.some(...)`.

🟠 **"Offline" export needs the internet.** `admin.js:1711` fetches Skulpt from
`skulpt.org` at export time. If that host is down/moved, export throws. Also no version
pin.
- **Fix:** self‑host a pinned Skulpt (or bundle it), and only fetch as a fallback.

🟠 **[client‑trust] MCQ answers leak in the export.** Exported `options` keep
`isCorrect:true`. Runtime grading uses `verifyHash(answer, hash)` and never reads
`isCorrect`, so shipping it is a pure giveaway.
- **Fix:** strip `isCorrect` from options before `buildExamHtml`/`Host Live` and rely on
  the hash only.

🟠 **localStorage quota / attachments.** Attachments (up to 2 MB each, `admin.js:367`) are
base64'd (+33%) into `localStorage` via `saveToStorage`. localStorage is ~5 MB per origin,
and `setItem` (`admin.js:520`) has **no try/catch** — a couple of attachments throws
`QuotaExceededError` and the save is lost with no message.
- **Fix:** store attachments in **IndexedDB**; wrap `setItem` in try/catch and surface a
  quota warning.

🟠 **Exam‑ID generation & collisions.** `admin.js:1462`
`Math.random().toString(36).substr(2,6)` — not crypto‑random, not checked for collisions
(`set()` would overwrite an existing exam), and only ~2 B space, so with open read rules
live exams are enumerable.
- **Fix:** use `crypto.getRandomValues`, check the ref doesn't exist, retry on collision.

🟠 **End‑exam cleanup is timing/tab‑dependent.** `admin.js:1535` sets status `ended`,
waits a hard‑coded 6 s, then deletes the node. If the teacher closes the tab, cleanup
never runs (orphaned data); students joining in the window race the delete.
- **Fix:** drive end‑of‑exam from server logic (Function) or at least don't rely on the
  teacher's tab staying open.

🟡 **`obfuscatePayload` / `packStandaloneHtml` are counter‑productive.** XOR with a
hard‑coded key `"OPH_SEC"` (`admin.js:1623`) + base64 + `Function(decoded)()` +
`document.write` is security theater (key is right there) and has costs: it breaks CSP,
makes the file undebuggable, ~doubles memory, and — importantly — **self‑decoding HTML
that evals a blob trips antivirus/SmartScreen heuristics**, so exported exams may get
flagged. 
- **Fix:** drop it (or make it opt‑in). It protects nothing that server‑side grading
  wouldn't protect properly.

🟡 **`Function("debugger")` trap every 50 ms** (`admin.js:1909`, `:2025`; also `take.js`).
This harasses anyone with DevTools open — *including the teacher debugging their own
exam* — burns CPU/battery 20×/s forever, and is bypassed by one "deactivate breakpoints"
click. Net negative.
- **Fix:** remove entirely.

🟡 **`escHtml` here doesn't escape `'`** (`admin.js:1923`) while the exported copy
(`:2122`) does — and `admin.js:2519` injects `ch.format` into `placeholder="'+p+'"`
**without** escaping (take.js escapes the same spot). Teacher‑controlled, low risk, but
inconsistent.
- **Fix:** one shared `escHtml` that escapes `& < > " '`, used everywhere.

🟡 **`_markCorrect/_markWrong` rely on the global `event`** (`admin.js:2627`) — non‑
standard, works only in Chromium. Pass the event or use a closure.

🟡 **`thmConfirm` has no cancel callback and clones nodes each call** (`admin.js:60`).
Works, but there's no "on cancel" path and no backdrop/Escape close.
- **Fix:** single persistent handler with an `AbortController`, resolve/reject as a
  Promise.

🟡 Deprecated `String.prototype.substr` used in several places — prefer `slice`.

---

## 4. `index.html`

🟠 **CDN scripts with no SRI and no fallback** (`index.html:1002-1005`): Firebase 8.10.1
and qrcodejs load from CDNs. No `integrity`/`crossorigin`, so a CDN compromise runs
arbitrary code in the builder; and the builder won't work offline. Firebase v8 is the
legacy namespaced SDK (v9+ modular is current).
- **Fix:** add SRI hashes or self‑host; plan a migration to Firebase v9+.

🟠 **No `<noscript>` fallback.** With JS disabled the page is blank. Add a message.

🟡 **Massive inline styles + a second `<style>` block** (e.g. the "designed by OPH" badge,
`index.html:472-552`). Move to `style.css` for maintainability.

🟡 **Theme‑toggle logic is duplicated** three times (inline here, embedded export, take.js).
DRY it into one helper.

🟡 Icon‑only buttons rely on `title` only — add `aria-label` for screen readers.

---

## 5. `take.html` (the live student portal)

🔴 **It's a committed, packed build with no source in the repo.** The 80 KB is one
minified line: a bootstrap that base64‑decodes four reversed chunk arrays into a
`<style>`, the body HTML, an **embedded Firebase config**, and the ~815‑line portal JS.
To change the portal you must regenerate this blob — but the generator/source isn't in
the repo.
- **Fix:** keep an unpacked `take.src.html` (or generate `take.html` in CI), so the
  student portal is actually editable and reviewable.

🔴 **Embedded Firebase config drifts from `js/firebase-config.js`.** `take.html` does
**not** load `js/firebase-config.js`; it inlines its own copy (currently the real
`live-online-exam1` keys). So CI secret injection never reaches it — rotate the project
and live exams break or hit the wrong DB.
- **Fix:** make `take.html` load `js/firebase-config.js` exactly like `index.html` does.

🔴 **Reloading mid‑exam locks the student out.** On join, `take.js` writes
`students/<name>` and rejects a name that already exists ("name already taken"). A student
who refreshes (or has a flaky connection) can't rejoin their own attempt.
- **Fix:** support **resume** — if the node exists and belongs to this session, reload
  their state instead of blocking; or key students by a stored client id.

🟠 **Student name used as a raw Firebase key** (`take.js` join/sync/finish). Names
containing `. # $ [ ] /` are **illegal Firebase path chars and throw**; there's also no
length cap and no real identity (you can take someone else's name before they join).
- **Fix:** validate/sanitize the name, store it as a `displayName` field under a
  `push()`‑generated key.

🟠 **`EXAM_ID` from the URL is unvalidated** and concatenated into ref paths. Constrain it
to `^[A-Z0-9]{6}$` before use.

🔴 **[client‑trust] Score is client‑authored.** `syncToFirebase`/`awardCTFPoints` write
`state.totalScore` directly; the "First Blood" transaction only guards the *bonus flag*,
not the score itself. Fully cheatable. Only server‑side grading fixes this.

🟡 Same `debugger` trap, duplicated SHA‑256, and duplicated security/theme code as the
exported offline file — all candidates for a shared module.

---

## 6. `setup_ollama_local_ai.bat`

🟡 **`irm https://ollama.com/install.ps1 | iex`** pipes a remote script straight to
execution. Standard for Ollama, but worth a comment and, ideally, download‑then‑inspect.

🟡 **Persistent `OLLAMA_ORIGINS`** is set at User scope so the site can reach local
Ollama. That means *any* page from that origin can talk to your local model afterward.
Note this in the README.

🟡 The readiness loop/`:ready` fall‑through works, but add `EnableDelayedExpansion` if you
ever read loop‑set vars inside the block, to avoid a classic batch footgun.

Otherwise this script is solid (good error handling and `[n/6]` progress).

---

## 7. Cross‑cutting quality

🟠 **Three hand‑maintained copies of SHA‑256** (`challenges.js`, the exported script in
`admin.js`, `take.js`). They *will* drift.
- **Fix:** prefer the native, correct, fast `crypto.subtle.digest('SHA-256', …)` (async);
  keep one shared sync fallback if you must. Add a unit test that pins known
  answer→hash pairs so copies can't silently diverge.

🟠 **HTML built by string concatenation everywhere.** Even with `escHtml`, it's fragile
and XSS‑prone. Prefer `<template>` cloning or a tiny tagged‑template helper that escapes
by default.

🟡 **No tooling:** no ESLint/Prettier, no tests, no build. For a codebase this size, add
ESLint + Prettier and a couple of unit tests around `encodeInput`/`verifyHash` and the
AI‑response normalizer.

🟡 **Accessibility & UX of "strict mode":** forced fullscreen, key‑blocking, and
screenshot‑blur have **no override** for legitimate needs (assistive tech, a permitted
alt‑tab) and stop nothing on a second device. High effort, real accessibility harm, low
value. Consider making it lighter and honestly labeled.

🟡 **`format` reveals answer length/spaces** (`admin.js:439` dash pattern shown as the
input placeholder) — an information leak that eases guessing. Make it optional.

---

## Suggested priority order

1. Stop committing real Firebase creds; write proper Firebase Security Rules (§1).
2. Fix the Order/ID overwrite data‑loss bug (§3).
3. Fix reload‑locks‑student‑out and name‑as‑key crash in the live portal (§5).
4. Make `take.html` load the shared config + keep a real source file (§5).
5. Move grading server‑side (or accept & document that offline is honor‑based) (§0).
6. Remove the `debugger` traps and reconsider the obfuscation (§3).
7. Then the maintainability cluster: dedupe SHA‑256, add tooling/tests, SRI on CDNs.
