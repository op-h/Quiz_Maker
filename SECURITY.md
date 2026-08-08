# Quiz Maker — Security Pen-Test Report

A full pen-test was run across the builder, the exported exam runtime, the import/share
paths, and the live `take.html`/Firebase portal. Prototype-pollution, exported-file
`</script>` breakout, and the student-name / question-text render paths were **reviewed and
cleared as non-issues** (shallow copies only; `<`→`<` + base64 packing; `textContent`).
See also `docs/threat-model.md`.

## ✅ Fixed (verified with automated exploit tests)

| Vuln | Severity | Where | Fix |
|---|---|---|---|
| Zero-click DOM XSS via unescaped `ch.points` in the question table — a malicious **shared exam / JSON import** ran JS in a victim teacher's builder and could exfiltrate their **AI API key + all exams** from localStorage | 🔴 Critical | `renderTable` | `escHtml`+numeric coercion at the sink |
| DOM XSS via unescaped `ch.id` (attribute + `onclick` breakout) on import/share-load | 🔴 Critical | `renderTable` | `escHtml` + `Number()` at the sink |
| No per-field validation on import / share-decode (delivery for the above) | 🟠 High | JSON import, `applyLoadedExam`, share decode | `normalizeImportedQuestion()`: id/points → finite **numbers**, all text `String()`-coerced, `type`/`codeGrade.mode` allow-listed, attachments restricted to `data:`/`blob:` |
| DOM XSS via unescaped `attachment.data` in an `href` (auto-fires on question render, in the exam **and** the blob preview which inherits the builder origin) | 🟠 High | exam runtime | `escHtml` + `data:`/`blob:` scheme guard |
| Raw `ch.id` in the results screen (`id=`/`onclick`) | 🟡 Med | exam runtime | `Number()` coercion |
| gzip **decompression bomb** on share-code import (few KB → multi-GB → tab OOM) | 🟡 Med | `decodeExamPayload` | bounded read (8 MB cap) + 6 MB input cap |
| Author **regex ReDoS** in output-match grading | 🟡 Med | grader | pattern length cap (≤1000) + input slice (20 KB) |
| CI **command injection** — unquoted heredoc evaluated backticks/`$( )` in secrets | 🟡 Med | `deploy.yml` | secrets passed as data to `node` + `JSON.stringify` |
| Live Firebase config tracked in git | 🟡 Med | `.gitignore` | `js/firebase-config.js` now ignored (also rotate/lock the DB, purge history) |
| **Author `tests`/`reference` JS ran on the student in-page** (shared malicious exam → arbitrary JS) **+ infinite-loop / ReDoS tab-freeze** | 🟠 High | grader | **JS now runs in a Web Worker** — separate thread, **no DOM / localStorage / window** (verified `undefined`), killed by `terminate()` on a 4 s timeout; **Python bounded** via `Sk.execLimit`. In-parent fallback only where Workers are unavailable |
| **HTML-question author tests/reference + the live HTML preview ran in-page** (author/student markup could reach the exam) | 🟠 High | grader + Run preview | Both now render in a `sandbox="allow-scripts"` (opaque-origin) iframe — scripts **cannot reach the exam page** (verified: cross-origin write to parent is blocked), tests run inside via `postMessage`, timeout removes the frame |
| OpenRouter OAuth: no CSRF `state`, accepted a bare unsolicited `code` | 🟡 Low | OAuth | Added a random `state` (echoed + verified) and now **refuse any exchange without the PKCE verifier this browser stored** |

## ⚠️ Residual — need an architecture/ops decision (not a client-side code fix)

- On browsers where **Web Workers are unavailable** (some `file://` contexts), the JS grader falls
  back to in-parent execution (HTML grading stays sandboxed via iframe regardless). Lower risk under
  `file://` (opaque origin, nothing sensitive to steal), but not sandboxed there.
- **All grading/passwords are client-side** (`[client-trust]`). Unsalted SHA-256 password hashes
  and the correct answers ship in the file and are recoverable/brute-forceable; scores are
  client-authored. This is inherent to a no-backend offline exam — keep it for practice/low-stakes;
  real integrity needs **server-side grading**. Needs an ATLAS ADR to accept, or a backend to fix.
- **`take.html` (live online portal) + open Firebase rules.** With `read/write: true` rules, anyone
  can `curl` `/exams.json` to read every answer key + password hash, forge/overwrite/delete scores,
  and the student **name is used as a raw DB key** (injection/overwrite). `take.html` is a packed
  blob with **no source** and embeds its own config copy (CI rotation misses it). Fix requires
  least-privilege RTDB rules + Firebase Auth + a regenerated portal from committed source, and
  server-authoritative scoring. Treat the live portal as **not production-safe** until then.
- **No CSP / security headers** (GitHub Pages can't set them; the app also relies on inline
  handlers + eval). Front with Cloudflare for CSP/HSTS/`frame-ancestors 'none'`, and migrate inline
  `onclick` to `addEventListener` to allow a strict `script-src`.
- **Supply chain:** Skulpt is fetched from a CDN and inlined into exams with integrity **warn-only**
  (`SKULPT_SHA256=''`); Firebase SDK in `take.html` has no SRI. Pin the Skulpt hashes (or vendor it)
  and add SRI/`crossorigin` to the Firebase tags.
- **OpenRouter OAuth** lacks a CSRF `state` param and will exchange a bare `code`; add/verify `state`.
- **`setup_ollama_local_ai.bat`** pipes a remote installer to exec and sets a persistent user-scope
  `OLLAMA_ORIGINS`; pin/verify the installer and refuse a wildcard origin.
