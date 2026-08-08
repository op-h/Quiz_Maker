# Exam runtime — visual spec (MUSE)

Scope: two additions to the **exported offline exam** runtime, whose CSS lives in
`admin.js → getEmbeddedCss()` and whose markup lives in `admin.js → buildExamHtml()` and the
answer-area injection (`admin.js` ~line 2734). Owner of implementation: **CIRCUIT**. This file is
a paste-ready contract — it does not change tokens, only consumes the ones already defined.

Concept: keep the HackTheBox terminal mood (near-black, blue + neon-green accents, mono type),
but make it feel *alive and low-key* — a room with a quiet monitor glow, and a real terminal
cursor in the answer box. Nothing here may cost the student a millisecond of reading time.

## Tokens consumed (already defined, do not redefine)

Effective set is the v3 `:root` at `admin.js` ~line 2294 and `body.light` ~line 2295:

| Property | Dark | Light |
|---|---|---|
| `--bg-color` | `#0a0c12` | `#eef1f6` |
| `--accent-primary` | `#4d9dff` | `#2f6fe0` |
| `--htb-green` | `#9fef00` | `#2da44e` |
| `--accent-success` | `#3fd06a` | `#1f9d4d` |
| `--font-mono` | JetBrains Mono / Fira Code / mono | same |
| `--input-bg` | `rgba(9,13,19,.72)` | `#fff` |

`body` already paints a faint 46px grid via `background-image` (line 2296). Both features below sit
**behind** or **inside** existing chrome and must not touch that grid, the glass panels, or contrast.

New tokens (add once, at the end of the v3 `:root` / `body.light` blocks). Keep them here so they
are visible and tunable in one place:

```css
/* add to the dark :root (line ~2294) */
--fx-glow-a: color-mix(in oklab, var(--accent-primary) 20%, transparent);
--fx-glow-b: color-mix(in oklab, var(--htb-green)     12%, transparent);
--fx-opacity: .42;   /* whole background-FX layer */
--fx-drift:   52s;   /* one slow breath */

/* add to body.light (line ~2295) — much fainter on paper so text keeps 4.5:1 */
--fx-glow-a: color-mix(in oklab, var(--accent-primary) 10%, transparent);
--fx-glow-b: color-mix(in oklab, var(--htb-green)      7%, transparent);
--fx-opacity: .22;
```

---

## 1) Subtle animated background — "monitor glow"

One fixed, oversized layer holding two soft radial blobs (blue top-left, green bottom-right) that
drift and gently breathe. Transform/opacity only, composited on its own layer, fully behind
content, `pointer-events:none`. The existing grid stays exactly as is — this glow renders *above*
the grid but *below* all content, so the grid reads as texture in front of the glow.

Zero markup change: use the currently-unused `body::before` (body has no `::before`/`::after` in
the exam CSS; the pseudo-elements in use belong to `.modal-box` / `.challenge-card`).

Paste into `getEmbeddedCss()` (anywhere after the v3 block, before the reduced-motion query):

```css
body::before{
  content:'';
  position:fixed;
  inset:-20%;                 /* oversize: drift/scale never exposes an edge */
  z-index:-1;                 /* behind content (unpositioned, z 0), above body bg + grid */
  pointer-events:none;
  opacity:var(--fx-opacity);
  background:
    radial-gradient(38vmax 38vmax at 22% 18%, var(--fx-glow-a), transparent 60%),
    radial-gradient(30vmax 30vmax at 82% 86%, var(--fx-glow-b), transparent 62%);
  filter:blur(8px);           /* rasterized once; the animation only translates the layer */
  will-change:transform;      /* promote to its own compositor layer */
  transform:translateZ(0);
  transition:opacity .2s;     /* matches body theme transition */
}
@media (prefers-reduced-motion:no-preference){
  body::before{animation:fx-drift var(--fx-drift) ease-in-out infinite alternate}
}
@keyframes fx-drift{
  from{transform:translate3d(-1.5%,-1%,0) scale(1)}
  to  {transform:translate3d( 2%,  2%, 0) scale(1.05)}
}
```

Rules honored:
- **Reduced motion** — gated behind `no-preference`; under `reduce` the layer is a static glow
  (and the existing global `prefers-reduced-motion` rule at line 2313 also neutralizes it). No
  stuck mid-frame because the base rule holds the `from` transform.
- **Theme-aware** — colors and opacity come from tokens; light mode is deliberately ~half as
  strong. Verify by eye that body text and the glass cards keep their contrast in both themes; if
  the light glow is ever perceptible under text, drop `--fx-opacity` to `.16`, do not recolor.
- **GPU-cheap** — no per-frame paint: `blur()` rasterizes once, animation is transform-only on a
  promoted layer. `vmax` sizing means no reflow on resize.
- **Behind content** — `z-index:-1` + `pointer-events:none`; never intercepts clicks or focus.

Do **not** raise opacity or add a third blob. If it becomes noticeable during a timed question,
it is wrong.

---

## 2) TryHackMe-style answer input — blinking underscore caret

Target: `.flag-input-wrapper > #flag-input` (short-answer / flag questions, injected at
`admin.js` ~line 2734). The `>` prompt is the wrapper's `::before`; the wrapper is already
`position:relative`. Goal: hide the native caret and render a mono `_` that blinks and rides the
end of the typed text, exactly after the last character.

### Markup change (CIRCUIT, at line ~2734)
Add one `aria-hidden` span as the last child of the wrapper:

```html
<div class="flag-input-wrapper">
  <input type="text" id="flag-input" autocomplete="off" spellcheck="false" placeholder="...">
  <span class="flag-caret" aria-hidden="true">_</span>
</div>
```

`aria-hidden` keeps it out of the a11y tree — the real `<input>` and its native caret semantics
are untouched for screen readers and keyboard.

### CSS (append in `getEmbeddedCss()`)

```css
/* Hide the native caret; monospace so 1 char == 1ch exactly.
   letter-spacing MUST be 0 here for the ch math to line up (v3 currently sets .5px). */
.flag-input-wrapper #flag-input{caret-color:transparent;letter-spacing:0}

.flag-caret{
  position:absolute;
  top:0;bottom:0;                 /* span the input's height... */
  display:flex;align-items:center;/* ...and center the glyph to match the input's centered text */
  left:calc(var(--caret-x,0) * 1px + var(--caret-len,0) * 1ch);
  font-family:var(--font-mono);
  font-size:16px;                 /* == #flag-input font-size, so 1ch matches */
  line-height:1;
  color:var(--htb-green);         /* same ink as the typed answer */
  pointer-events:none;
  transform:translateX(-.05ch);   /* tuck the underscore snug under the last glyph */
}
.flag-input-wrapper:focus-within::before{color:var(--accent-primary)} /* existing */

/* Caret is a real cursor: only present while the field has focus. */
.flag-input-wrapper:not(:focus-within) .flag-caret{display:none}

/* Overflow fallback: once the value scrolls the field, ch math is wrong — hand the caret
   back to the browser and hide the fake one. JS toggles .is-overflowing (see below). */
.flag-input-wrapper.is-overflowing #flag-input{caret-color:var(--htb-green)}
.flag-input-wrapper.is-overflowing .flag-caret{display:none}

@media (prefers-reduced-motion:no-preference){
  .flag-caret{animation:flag-blink 1.06s step-end infinite}
}
@keyframes flag-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
```

States:
- **Focus** — caret appears (`:focus-within`), prompt `>` turns blue (existing rule), caret blinks.
- **Empty / placeholder** — `--caret-len` is `0`, so the underscore sits right after the `>` prompt
  at the text-start position; the existing dim mono placeholder (the format hint, `--text-muted`)
  stays visible behind it. This reads as "cursor waiting, hint dimmed" — the THM pattern. No change
  to placeholder styling needed.
- **Solved / disabled** — field is disabled and unfocused (`admin.js` line 2737), so
  `:not(:focus-within)` hides the caret automatically. Nothing extra to do.
- **Reduced motion** — caret is rendered static (visible, no blink); the global reduce rule at
  line 2313 also flattens the animation. A steady underscore is a valid, calm cursor.

### The tiny JS (CIRCUIT — attach where `#flag-input` is wired, ~line 2736)

Two CSS custom properties drive position: `--caret-len` (character count) and `--caret-x`
(the input's left offset inside the wrapper, in px, which already includes the `>` prompt and its
gap because the input follows the prompt in the flex row).

```js
var fi   = document.getElementById('flag-input');
var wrap = fi.parentElement;                 // .flag-input-wrapper
function syncCaret(){
  wrap.style.setProperty('--caret-x', fi.offsetLeft);      // px number, unit added in CSS calc
  wrap.style.setProperty('--caret-len', fi.value.length);
  wrap.classList.toggle('is-overflowing', fi.scrollWidth > fi.clientWidth + 1);
}
fi.addEventListener('input', syncCaret);
fi.addEventListener('focus', syncCaret);
syncCaret();                                 // also call after setting fi.value on restore (line 2738)
```

Notes:
- `fi.offsetLeft` is measured from the wrapper's border box (wrapper is `position:relative`), and
  the input's horizontal padding is `0` (`12px 0`), so text starts exactly at `offsetLeft` — the
  prompt width and 12px gap are captured for free. Re-read it in `syncCaret` in case the prompt
  glyph width differs per installed mono font.
- The `letter-spacing:0` override above is required — v3 sets `.5px` on the input, which would
  desync the `1ch` step. If that spacing must stay for taste, instead compute width in JS with a
  hidden mirror span and set `--caret-x` to the full pixel offset; the `ch` term then drops to `0`.
- Only ~8 lines, no dependency, progressive: with JS off the native `<input>` (and native caret)
  still works, satisfying the JS-disabled clause of Definition of Done.

---

## Contrast / readability guardrails
- Background-FX opacity is tuned so foreground text and glass panels keep AA in both themes; if in
  doubt, lower `--fx-opacity`, never restyle content.
- Caret ink is `--htb-green` — the same color already used for typed answers, so it introduces no
  new color and no new contrast surface.
- Neither feature adds a dependency, a font, or a raster asset. No QUARTZ cost, no ATLAS routing.

---
---

# 2026-07-30 — Exam runtime v4: slotted answer box, pointer-reactive glow, question-nav redesign

Scope: three CIRCUIT changes to the exported exam runtime. All CSS goes in
`admin.js → getEmbeddedCss()` (currently lines ~2823–2970); markup in `buildExamHtml()`
(~2568–2772); runtime JS in `getEmbeddedScript()` (starts ~2973). **The runtime JS is emitted
inside a JS template literal** — the implementer must write strings with single quotes and `+`
concatenation, **never a backtick**, or the outer literal breaks. Everything below consumes the v4
`:root` / `body.light` token blocks (lines ~2936–2937) already in place; no token is redefined.

Tokens consumed (verified in source): `--htb-green` (#9fef00 dark / #2da44e light),
`--accent-primary` (#4d9dff / #2f6fe0), `--accent-success` (#3fd06a), `--accent-warning`
(#f0b429), `--accent-danger` (#ff5b6e), `--text-muted` (#7a8592), `--text-bright`, `--input-bg`,
`--panel-bg`, `--border-color`, `--border-glow`, `--font-mono`, `--radius-md` (10px),
`--fx-glow-a`, `--fx-opacity`, `--fx-drift`.

---

## 1) Slotted "TryHackMe-style" answer box

Replaces the single trailing `.flag-caret` underscore **only for text questions that carry an
`answerMask`**. The builder stores, per text question, `answerMask` = the normalized answer with
every non-space char replaced by `_` and spaces preserved, e.g. `responsive design` →
`__________ ______`. This deliberately reveals letter count and word count. Questions **without**
`answerMask` (legacy, imported, MCQ, code) keep the existing free-length blinking-underscore caret
from the 2026 v3 spec above — that path is untouched.

### Concept
The real `<input id="flag-input">` still holds the true value and all keyboard/label/a11y
semantics, but its text and caret are made transparent. A row of decorative per-position
`.slot` spans (`aria-hidden`) sits underneath and is re-rendered from `input.value + mask` on every
`input`/`focus`/`blur`. Each slot shows: the typed char (filled), or a muted `_` (empty), or a
wider blank (space position). The next-to-type slot shows a blinking green `_`. Underscores are
**spaced apart with a gap — never a continuous rule.**

### Markup change (in the free-text branch of `loadChallenge`, `admin.js` ~line 3390)
When `ch.answerMask` exists, add the class `is-slotted` to the wrapper and swap the single
`.flag-caret` span for a slot row. Keep the exact existing wrapper otherwise so the fallback path is
byte-identical.

```html
<!-- answerMask present: -->
<div class="flag-input-wrapper is-slotted">
  <input type="text" id="flag-input" autocomplete="off" spellcheck="false" placeholder="...">
  <span class="slot-row" id="slot-row" aria-hidden="true"></span>
</div>
<!-- no answerMask: existing markup with <span class="flag-caret">_</span> — unchanged -->
```

The `<input>` still owns its label association and value; `.slot-row` is `aria-hidden` and purely
decorative, so screen readers and voice control interact only with the real field.

### CSS (append in `getEmbeddedCss()`, after the v3 `.flag-caret` block ~line 2967)

```css
/* Slotted mode: the input keeps the value but goes invisible; slots draw the answer shape. */
.flag-input-wrapper.is-slotted{position:relative}
.flag-input-wrapper.is-slotted #flag-input{
  position:absolute; inset:0; margin:0;
  padding:12px 18px 12px 42px;      /* left pad clears the '>' prompt + gap */
  color:transparent; caret-color:transparent; background:transparent;
  -webkit-text-fill-color:transparent;   /* Safari honours this, not `color` */
  letter-spacing:0; z-index:2;      /* on top so clicks/focus land on the input */
}
.flag-input-wrapper.is-slotted #flag-input::selection{background:transparent}

.slot-row{
  display:inline-flex; flex-wrap:wrap; align-items:center;
  gap:7px 9px;                       /* the space BETWEEN underscores — keeps them discrete */
  min-height:24px; padding:12px 0;
  font-family:var(--font-mono); font-size:16px; line-height:1;
  pointer-events:none; z-index:1;    /* behind the input, ignores pointer */
}
.slot{width:1ch; text-align:center; flex:0 0 auto}
.slot--space{width:14px}             /* wider gap marks a word boundary */
.slot--empty{color:var(--text-muted)}          /* the waiting "_" */
.slot--filled{color:var(--htb-green); font-weight:500}   /* typed char, same ink as v3 answer */
.slot--current{color:var(--htb-green)}         /* the next slot: green "_" */

@media (prefers-reduced-motion:no-preference){
  .flag-input-wrapper.is-slotted:focus-within .slot--current{animation:flag-blink 1.06s step-end infinite}
}
/* reuse the existing @keyframes flag-blink (0%,49%{opacity:1}50%,100%{opacity:0}) from v3 */

/* Solved / submitted: field disabled + blurred, so :focus-within is false → no blink.
   Show the entered chars steady; nothing else to add — disabled styling below just dims the prompt. */
.flag-input-wrapper.is-slotted:has(#flag-input:disabled)::before{opacity:.5}
```

States:
- **Empty** — all slots are `slot--empty` `_` except the first non-space, which is `slot--current`
  (blinks under focus). Word gaps already visible → the student sees "10 letters, space, 6 letters".
- **Typing** — filled slots show the char in `--htb-green`; `maxLength` (set in JS to `mask.length`)
  hard-caps input so the shape can't overflow.
- **Focus / blur** — blink only under `:focus-within` + no-preference; blurred, the current slot is a
  steady `_`. Matches the "caret is a cursor" rule from v3.
- **Solved / disabled** — `admin.js` line 3456 already disables `#flag-input`; blurred+disabled means
  no blink, chars stay visible, prompt dims. No new JS state needed.
- **Reduced motion** — no blink; a steady green `_` on the current slot is the calm fallback (the
  global `reduce` rule at line ~2969 also flattens it).

### JS approach (in the free-text branch, alongside the existing `syncCaret` wiring ~line 3392)
Guard on `ch.answerMask`. If absent, run the existing v3 caret path verbatim.

```
var fi = document.getElementById('flag-input');
if (ch.answerMask) {
  var mask = ch.answerMask;
  var row  = document.getElementById('slot-row');
  fi.maxLength = mask.length;                 // hard-cap to the shape
  function renderSlots(){
    var val = fi.value; row.textContent = '';  // cheap clear; <= mask.length spans
    // "current" = first index at/after val.length that is not a space
    var cur = val.length; while (cur < mask.length && mask.charAt(cur) === ' ') cur++;
    for (var i = 0; i < mask.length; i++){
      var s = document.createElement('span'); s.className = 'slot';
      if (mask.charAt(i) === ' ')      { s.className += ' slot--space'; }
      else if (i < val.length)         { s.className += ' slot--filled';  s.textContent = val.charAt(i); }
      else if (i === cur)              { s.className += ' slot--current'; s.textContent = '_'; }
      else                             { s.className += ' slot--empty';   s.textContent = '_'; }
      row.appendChild(s);
    }
  }
  fi.addEventListener('input', renderSlots);
  fi.addEventListener('focus', renderSlots);
  fi.addEventListener('blur',  renderSlots);
  renderSlots();                                // seed for restored studentAnswer / disabled state
}
```

Notes for CIRCUIT:
- Index-based mapping assumes the student types the space where the mask has one. If they omit it,
  later slots shift by one — acceptable for a hint; do **not** try to auto-insert spaces (it fights
  the caret). `maxLength` keeps the tail from overflowing regardless.
- Builder side (out of MUSE lane, flag to whoever owns the builder): derive `answerMask` from the
  plaintext answer *before* it is hashed, using the same `normalizeInput` (lowercase+trim) the runtime
  verifies with, then replace `/[^\s]/g` → `_`. Store it on the question object; it is a hint, not a
  secret (it leaks length only, which is the intended trade). MCQ/code questions get no mask.
- Progressive enhancement holds: JS off → the plain `<input>` still works; the slots simply never
  render and the native caret shows.

---

## 2) Pointer-reactive monitor glow (exam only)

Make the existing `body::before` glow (line ~2956) ease toward the cursor instead of only drifting.
Compositor-only: JS writes two eased custom properties, CSS turns them into a `translate3d` on the
already-promoted layer. No new paint, no new element, `pointer-events:none` unchanged.

### CSS (replace the drift rule; keep the static base rule and `@keyframes fx-drift` as the fallback)

```css
/* When JS is driving the pointer (no-preference only), swap the looping drift for a
   transform fed by eased --gx/--gy (px). Same promoted layer, still transform-only. */
@media (prefers-reduced-motion:no-preference){
  body.fx-pointer::before{
    animation:none;
    transform:translate3d(calc(var(--gx,0) * 1px), calc(var(--gy,0) * 1px), 0) scale(1.04);
  }
}
```

The unchanged base `body::before` rule (static glow) and the `@media (no-preference) body::before{
animation:fx-drift …}` rule both stay: if JS never runs, or the pointer never moves (touch), the
slow drift remains; under `reduce`, `.fx-pointer` is never added and the layer is static.

### JS approach (top of the runtime IIFE in `getEmbeddedScript` — remember: NO backticks)
- Bail out entirely if `matchMedia('(prefers-reduced-motion: reduce)').matches` — leave the CSS drift
  as the fallback.
- Otherwise add `document.body.classList.add('fx-pointer')`, then:
  - a `pointermove` listener (passive) computes a target offset from viewport centre:
    `tx = (e.clientX / innerWidth - 0.5) * MAX`, same for `ty` with `innerHeight`; `MAX ≈ 26` (px).
    Keep it small — the glow *leans* toward the cursor, it does not track it 1:1.
  - a `requestAnimationFrame` loop lerps current toward target: `cx += (tx - cx) * 0.06`, likewise
    `cy`, then `document.body.style.setProperty('--gx', cx.toFixed(2))` and `--gy`. Stop scheduling
    frames once `|tx-cx| < 0.1 && |ty-cy| < 0.1` to idle at 0 CPU; the `pointermove` handler restarts
    the loop.
- Register `MAX`/lerp constants as plain vars; everything is string-built with single quotes so it
  survives the template literal.

Rules honored: transform/opacity only on a `will-change:transform` layer; `z-index:-1` +
`pointer-events:none` keep it behind all content and non-interactive; disabled under reduced motion;
theme colours/opacity still come from `--fx-*`. Do not raise `--fx-opacity` or `MAX` — if the glow is
noticeable during a timed question, it is wrong.

---

## 3) Question-navigation redesign — horizontal "pill rail"

Today `renderSidebar` (line 3250) fills `#sidebar-levels` (line 2648) with full-width `.level-btn`
rows in a 240px left rail, plus a progress bar. It eats reading width and the states are colour-only
(green/blue/amber left-borders + a glow dot) — an a11y gap.

**Redesign (pick this one):** relocate the nav to a compact, glass **horizontal pill rail directly
under the `.top-bar`**, full width, one row of numbered pills with a trailing progress readout. This
frees the whole `.game-layout` width for the question, blends with the existing glass+glow chrome,
and gives every state a **shape/glyph cue in addition to colour**. Each pill stays a real `<button>`.

### Markup change (`buildExamHtml`, ~line 2646)
Move `#sidebar-levels` out of `.game-layout` and place it between the `.top-bar` and
`.game-layout`; rename its class. `renderSidebar` keeps the same element id, so wiring in `els`
(line 3082) is unchanged.

```html
<!-- was: <div class="sidebar" id="sidebar-levels"></div> inside .game-layout -->
<nav class="qnav" id="sidebar-levels" aria-label="Questions"></nav>
<div class="game-layout"> … workspace only … </div>
```

`renderSidebar` output per question becomes:

```html
<div class="qnav-track" role="list">
  <button class="qpill" role="listitem" data-state="current"
          aria-current="true" aria-label="Question 3 — current">
    <span class="qpill-num">3</span>
    <span class="qpill-mark" aria-hidden="true">•</span>   <!-- glyph per state, below -->
  </button>
  …
</div>
<p class="qnav-progress"><span class="qnav-fill" style="width:60%"></span>
  <span class="qnav-count">6 / 10 answered</span></p>
```

State → `data-state` + non-colour glyph in `.qpill-mark` + `aria-label` suffix:

| Meaning | source status (line 3255-3259) | `data-state` | glyph | colour |
|---|---|---|---|---|
| current | `idx === currentIndex` | `current` | `•` filled ring | `--accent-primary` ring |
| answered / solved | `solved` | `answered` | `✓` | `--accent-success` |
| pending review | `answered` / `pending` | `pending` | `…` | `--accent-warning` |
| not answered | `open` | `open` | (none, hollow) | `--text-muted` |
| flagged (future) | `flagged` | `flagged` | `⚑` | `--accent-danger` |

`data-state` may combine with `current` (e.g. an answered pill that is also current) — CSS below
layers the current ring on top via a separate `[aria-current="true"]` selector.

### CSS (append in `getEmbeddedCss()`; delete/replace the old `.sidebar` + `.level-btn` rules)

```css
.qnav{
  flex-shrink:0; width:100%;
  display:flex; align-items:center; gap:14px;
  padding:10px 22px; overflow-x:auto; overflow-y:hidden;
  background:var(--panel-bg);
  border-bottom:1px solid var(--border-color);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);   /* matches .top-bar glass */
  scrollbar-width:thin; scroll-snap-type:x proximity;
}
.qnav::before{                       /* keep the mono "QUESTIONS" label, now inline */
  content:'QUESTIONS'; flex-shrink:0;
  font:700 10px/1 var(--font-mono); letter-spacing:1.5px; color:var(--text-muted);
}
.qnav-track{display:flex; gap:8px; align-items:center}
.qpill{
  flex:0 0 auto; scroll-snap-align:start;
  display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  min-width:34px; min-height:34px; padding:4px 8px;   /* >=24px target incl. gap */
  border:1px solid var(--border-color); border-radius:var(--radius-md);
  background:transparent; color:var(--text-muted);
  font:600 12px/1 var(--font-mono); text-transform:none; letter-spacing:0;
  transition:border-color .15s ease, color .15s ease, background .15s ease;
}
.qpill .qpill-mark{font-size:10px; line-height:1; height:10px}
.qpill:hover{border-color:var(--border-glow); color:var(--text-bright); background:var(--panel-hover)}
.qpill:focus-visible{outline:2px solid var(--accent-primary); outline-offset:2px}

.qpill[data-state="answered"]{color:var(--accent-success); border-color:color-mix(in oklab,var(--accent-success) 45%,transparent)}
.qpill[data-state="pending"] {color:var(--accent-warning); border-color:color-mix(in oklab,var(--accent-warning) 45%,transparent)}
.qpill[data-state="flagged"] {color:var(--accent-danger);  border-color:color-mix(in oklab,var(--accent-danger) 45%,transparent)}

/* current — a glowing ring layered on top of whatever colour state the pill already has */
.qpill[aria-current="true"]{
  color:var(--accent-primary); border-color:var(--accent-primary);
  background:color-mix(in oklab,var(--accent-primary) 10%,transparent);
  box-shadow:0 0 10px color-mix(in oklab,var(--accent-primary) 40%,transparent);
}

.qnav-progress{margin-left:auto; flex-shrink:0; display:flex; align-items:center; gap:10px;
  font:500 10px/1 var(--font-mono); color:var(--text-muted)}
.qnav-fill{display:block; height:3px; width:0; border-radius:2px;
  background:linear-gradient(90deg,var(--accent-primary),var(--accent-success)); transition:width .4s ease}
/* give .qnav-fill a fixed-width track so it reads as a bar */
.qnav-progress{position:relative}
.qnav-fill{min-width:80px; background-clip:padding-box}
```

Responsive: the rail is `overflow-x:auto` with `scroll-snap`, so at 320px it becomes a swipeable
strip instead of wrapping — the current pill can be `scrollIntoView({inline:'center'})` on load
(add in `renderSidebar` after building, one line, no dependency). Drop the existing `@media
(max-width:820px)` `.sidebar` block (line 2925) — no longer needed since the rail is horizontal at
every width. On very narrow screens the `QUESTIONS` label may be hidden with
`@media (max-width:480px){.qnav::before{display:none}}` to save room.

a11y + motion: every pill is a real `<button>` (keyboard + Enter/Space free); the current pill sets
`aria-current="true"`; state is conveyed by **glyph + label**, not colour alone; focus ring is the
existing 2px accent; all transitions are ≤ .4s and covered by the global `reduce` rule (line ~2969).
Blends with theme via `--panel-bg` glass, token colours, and a `color-mix` accent glow that echoes the
monitor-glow.

---

## Guardrails (all three)
- No new dependency, font, or raster. No QUARTZ cost, no ATLAS routing.
- Contrast unchanged: slots and pills reuse `--htb-green` / accent tokens already meeting AA; the
  pointer glow keeps the same `--fx-opacity` ceiling as v3. If any effect is perceptible under body
  text, lower `--fx-opacity` — never restyle content.
- Progressive enhancement preserved: JS off → plain `<input>` + native caret, and (if the rail must
  work JS-off) `renderSidebar` output is server-free anyway, generated at load.

