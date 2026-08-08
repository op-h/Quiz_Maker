# Auto-scoring code questions — approaches & ideas

All of these run **in the student's browser** (offline, no backend), using the runners the exam
already has: JavaScript via `new Function`, Python via Skulpt, HTML via an iframe DOM.

## ✅ Implemented now
- **Expected-output matching** — run the student's program, capture its printed output, compare to
  the teacher's expected output. Match modes: **exact**, **contains**, **regex**; optional
  **normalize** (ignore case + collapse whitespace). Best for "print the answer" tasks.
- **Assertion tests (partial credit)** — the teacher writes `assert(cond, 'msg')` checks that run
  after the student's code; score = passed / total × points. Works in JS & HTML (`assert`) and
  Python (`check(cond, msg)`, since `assert` is a Python keyword). Grades behaviour, not formatting.
- **Auto-grade on submit** with a neutral message (doesn't reveal pass/fail mid-exam), status
  `solved` / `partial` / `incorrect`, and the earned points flow into the final score + receipt.
- **Reference-similarity partial credit ("ML-lite")** — the teacher pastes a correct solution; the
  student's code + its output are scored 0→1 against it by blending **token cosine + normalized
  edit-distance + gzip normalized-compression-distance**, then mapped to points (≥0.98 → full,
  ≤0.4 → 0, smooth in between). Fully offline, deterministic, embedded. Verified: identical→100%,
  same-output/renamed→92%, similar-code/wrong-output→50%, unrelated→0%.
- Manual review is still available (default) for open-ended tasks.

## 💡 More ideas (ranked by value/effort)
1. **Function I/O table** — teacher gives a function name + rows of `input → expected output`; the
   harness calls the function for each row and deep-compares. Cleaner than writing assert code;
   per-row partial credit. *(High value, low effort — great next step.)*
2. **Reference-solution diff** — teacher pastes a correct solution; run both student and reference
   on the same inputs and compare outputs. No need to hand-write expected values.
3. **Hidden + visible tests** — show a couple of example tests (formative), keep the rest hidden so
   students can't hardcode to the visible cases.
4. **DOM / structure assertions for HTML/CSS** — render the student page in an iframe, then assert on
   the DOM: `doc.querySelector('h1')`, attribute/label/alt checks, computed styles. Ideal for
   web-dev questions. *(The `assert(doc, ...)` harness is already wired for this.)*
5. **Property-based / fuzz testing** — generate random inputs and compare the student function to a
   reference oracle; catches edge cases the teacher didn't enumerate. Seed the RNG for determinism.
6. **Output canonicalization** — before comparing: trim, collapse whitespace, sort lines,
   JSON-canonicalize, round floats to a tolerance — so "correct but formatted differently" passes.
7. **Weighted rubric** — a list of named checks each worth N points ("returns correct value" 3,
   "handles empty input" 2, "uses recursion" 1); total = sum. Structured partial credit + feedback.
8. **AST / static checks** — require or forbid constructs ("must use a loop", "must not use eval",
   "defines class Stack"). Rubric hints, not full grading; cheap to add for JS.
9. **Performance/complexity signal** — run on large inputs and count ops / measure time to reward
   efficient solutions (noisy in-browser, use for gross O(n) vs O(n²) checks only).
10. **AI-assisted grading** — when AI Studio is configured, send code + rubric to the model for a
    score + written feedback ("explain the bug"). Best as a *suggestion* the teacher reviews, or to
    complement deterministic tests (non-deterministic on its own).
11. **Feedback, not just a score** — in review, show which tests failed and the expected-vs-actual
    diff. Turns grading into learning.

## ⚠️ Cautions
- **Integrity:** grading is client-side, so the tests/expected output ship in the file and a
  determined student can read them or fake the score. Auto-scoring is excellent for practice and for
  saving teacher time on low-stakes summative work — pair it with `docs/threat-model.md`.
  Tamper-proof grading needs a server.
- **Brittleness:** prefer assertions / I-O tables / normalize / regex over exact-output.
- **Safety:** all runners are wrapped in try/catch with time bounds; a crashing or looping
  submission scores 0 rather than breaking the exam.
