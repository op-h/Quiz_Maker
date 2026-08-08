# Quiz Maker — UX Audit & Improvement Plan (maker + taker)

Consolidated from two Atelier usability audits (maker flow, taker/exported-exam flow).
Severity: 🔴 Critical · 🟠 Major · 🟡 Minor. Status: ✅ done · 🔜 planned next.

## Maker (teacher building the exam) — `index.html` + `admin.js` builder
- 🔴 C2 Exam settings never persisted; silently reset on reload → **✅ persist + restore**
- 🔴 C1 No way to preview/test the exam before export → **✅ Preview button (build + open)**
- 🟠 M1 Selected-rows silently scope the exam export with no count shown → **✅ explicit scope**
- 🟠 M2 Blank first-run state, no "add your first question" CTA → **✅ empty state**
- 🟠 M6 AI Studio dies on first click under `file://` with no upfront guidance → **✅ notice**
- 🟠 M7 Misleading labels ("Online Exam only" attachment; "Brython" vs Skulpt; code type
  is manual-grading but unlabeled) → **✅ corrected**
- 🟠 M8 26 form labels not associated with controls (WCAG 1.3.1/4.1.2) → **✅ for/id**
- 🟠 M3 "Order (ID)" conflates identity+order; no reordering UI → 🔜 reorder controls
- 🟠 M4 Validation via blocking `alert()`, not inline; editor isn't a `<form>` → 🔜 inline errors
- 🟠 M5 Text/code correct answers are write-only, unrecoverable → 🔜 reveal/verify
- 🟠 M9 No unsaved-changes guard when navigating/cancel/reload → 🔜 dirty guard
- 🟡 m1 Export gives no summary of what was baked in → 🔜 post-export recap
- 🟡 m3 Browser-local data not framed as needing JSON backup → 🔜 messaging

## Taker (student sitting the exam) — exported runtime inside `admin.js`
- 🔴 C2 "Security lockdown" is a false-positive machine + accessibility trap (mouseleave/
  blur black-out, rAF poll, Escape/F11 trapping, forced-fullscreen fight, keyboard trap)
  → **✅ humane, non-obscuring, keyboard-dismissable; focus-loss logged for instructor**
- 🔴 C1 A reload/crash wipes the whole in-progress exam; no persistence, no exit guard
  → **✅ beforeunload guard**; 🔜 full autosave + resume with absolute timer deadline
- 🔴 C3 Student never told the rules before starting → 🔜 pre-exam instructions/consent
- 🔴 C5 With no teacher password, the student can self-grade (✔/✖ buttons shipped to taker)
  → **✅ grading UI never shown to the taker**
- 🔴 C4 No durable receipt; results can be locked behind a password the student can't meet
  → 🔜 "Download my answers" + always-confirm submission
- 🟠 M1/M2 Inconsistent grading models; MCQ locks on submit; text has infinite-retry oracle
  → 🔜 unify: record without oracle, editable until final submit
- 🟠 M4 Alerts/timer/question-changes not announced to screen readers → **✅ aria-live + focus**
- 🟠 M5 Placeholder contrast failure (uses `--border-color`) → **✅ readable placeholder**
- 🟡 A1 Timer warning is color-only → **✅ text + announced warning**
- 🟡 A2 `prefers-reduced-motion` ignored in exported CSS → **✅ reduced-motion block**
- 🟡 A5 `#teacher-unlock-pass` hardcoded `color:white` (invisible in light) → **✅ token**
- 🟡 A6 Bare code textarea (Tab escapes, no expected output) → 🔜
- 🟡 A9 MCQ correct answer derivable client-side (hash ships) → 🔜 instructor-side

The 🔜 items are the recommended next tranche.
