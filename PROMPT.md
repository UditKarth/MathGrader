# Build: Desmos Math Grade 1 Standards Grader

You are building a complete, working, single-page web app from scratch in this directory. It must be deployable to GitHub Pages with zero build step.

## Context

A first-grade teacher uses the **Desmos Math** curriculum. Each unit has assessments (Pre-Unit Check, Sub Unit quizzes, End Unit Assessment), and every question on those assessments is aligned to one or more **California / Common Core math standards**. The teacher wants to enter raw per-question scores and get back a per-student report showing how that student is doing **against each standard**, which is the thing report cards and parent conferences actually need.

The source of truth is `Grade 1 Standards.csv` in this directory:

```
UNIT,ASSESSMENT,QUESTION #,STANDARDS ALIGNMENT
1,PRE-UNIT CHECK ,1,"K.CC.3, K.CC.5"
1,SUB UNIT 1 QUIZ ,2,1.MD.4
3,SUB UNIT 3 QUIZ,1,"1.OA.6, 1.OA.3"
```

151 data rows, 7 units, 31 unit/assessment combinations, 32 distinct standards. Note the data hygiene issues you must normalize: **trailing spaces** on assessment names (`"PRE-UNIT CHECK "`, `"SUB UNIT 1 QUIZ "`) which make `"SUB UNIT 3 QUIZ"` and `"SUB UNIT 3 QUIZ "` look like different assessments, and the multi-standard cells that are comma-separated inside quotes.

## Non-negotiable technical constraints

1. **Static only.** GitHub Pages serves static files. No server, no database, no build step, no npm install, no bundler, no framework. Plain HTML + CSS + ES modules (`<script type="module">`). It must work by opening `index.html` from the filesystem *and* from a Pages subpath like `https://user.github.io/repo/` — so **use only relative paths** and never assume a root-relative `/`.
2. **Do not `fetch()` the CSV at runtime.** `fetch` fails on `file://` and breaks on subpath deploys. Instead write a small Node script `tools/build-data.mjs` that parses `Grade 1 Standards.csv` and emits `src/data/standards.js` as a checked-in ES module exporting a plain array. Run it, commit the output, and document that re-running it is the only step needed if the CSV changes. Keep the CSV in the repo for provenance.
3. **No CDN dependencies.** Everything vendored or hand-written. The app must work offline.

## Data model

Generated `src/data/standards.js` exports:

```js
export const QUESTIONS = [
  { id: "u1-preunit-q1", unit: 1, assessment: "Pre-Unit Check",
    assessmentKey: "PRE_UNIT_CHECK", questionNumber: 1,
    standards: ["K.CC.3", "K.CC.5"] },
  ...
];
```

Normalize assessment names to trimmed Title Case for display, and give each a stable machine key. Preserve the curriculum's natural order: unit ascending, then Pre-Unit Check → Sub Unit 1 → Sub Unit 2 → Sub Unit 3 → End Unit Assessment, then question number ascending. Do not sort assessments alphabetically.

Runtime state, persisted as one JSON blob:

```js
{
  version: 1,
  roster: [ { id, name, createdAt } ],
  // Max points is a property of the QUESTION, not the student — the teacher
  // sets "question 3 is worth 2 points" once and it applies to the whole class.
  pointsPossible: { [questionId]: number },   // sparse; absent means default 1
  // Earned points are per student per question.
  scores: { [studentId]: { [questionId]: number } }  // sparse
}
```

**A missing score is not a zero.** An unentered cell means "not assessed yet" and must be excluded from every denominator. A zero is a real, deliberate score. Render these differently (blank vs. a visible `0`) and never let one silently become the other. This is the single most important correctness rule in the app — a student who has taken one quiz should not read as failing the year.

## Persistence

Use **`localStorage`**, not cookies. Cookies cap at ~4KB, get sent on every request, and a class of 30 students × 151 questions blows past that immediately. Write under one namespaced key (e.g. `desmos-grader:v1`). Save on every mutation, debounced ~300ms. Wrap all reads in try/catch and degrade to in-memory state if storage is unavailable (private browsing) — show a dismissible warning banner in that case, don't crash.

Because localStorage is per-browser and can be cleared, also provide:
- **Export All (JSON)** — downloads the full state blob via a `Blob` + object URL.
- **Import (JSON)** — file input, validates `version`, then replaces or merges state after a confirm.
- **Export CSV** — the gradebook as a flat CSV for Excel/Sheets.

Keep the `version` field and write the load path so a future migration is possible.

## Screens

### 1. Home / Roster (default)

- List of students entered this session, with each student's overall percentage and a count of questions assessed.
- Add student: a single text input + Enter, plus a **bulk paste** textarea (one name per line) — teachers have the roster in another tab and pasting 25 names beats typing them.
- Rename (click the name) and delete (with confirm).
- **Double-clicking a student name opens their Individual Report.** Also give a visible "Report" button/row-click affordance — double-click alone is undiscoverable and inaccessible; make it an accelerator, not the only path.
- Empty state that explains what the app does and offers a "load sample class" button for trying it out.

### 2. Gradebook (spreadsheet view)

A 151-column-wide grid is unusable. Instead: a **Unit + Assessment selector** at the top, then a grid of **students (rows) × that assessment's questions (columns)**.

- Header row per question shows `Q1`, the aligned standard codes as small chips, and an **editable max-points field** (defaults to 1) that applies to the whole column.
- Cells are direct-edit number inputs. Constrain earned ≤ possible; flag over-max instead of silently clamping.
- **Keyboard navigation is essential** — this is the primary data-entry surface and the teacher is entering hundreds of numbers. Arrow keys move between cells, Enter moves down, Tab moves right, typing a digit replaces the cell contents. Do not make them reach for the mouse.
- A right-hand frozen column with each student's percentage for the selected assessment.
- Sticky student-name column and sticky header while scrolling horizontally.
- A "mark all correct" convenience action per row (fills the row to full marks), since most cells are full credit.

### 3. Individual Report

Reached by double-clicking a name. Contains:

- Student name, class/teacher name (an editable app-level setting), and generated date.
- **Overall mastery**: earned / possible across all assessed questions, as a percentage.
- **By-standard breakdown** — the heart of the report. For each standard the student has been assessed on: the standard code, a plain-English description, points earned / possible, a percentage, a proficiency band, and which assessments contributed.
- **By-assessment breakdown**: each unit/assessment taken, with score and percentage.
- A short "strengths" and "focus areas" section derived from the bands.
- An **Export as PDF** button.

## Standard descriptions

You must ship a hand-authored `src/data/standardDescriptions.js` mapping every one of the 32 codes to `{ code, domain, shortLabel, description }`, where `description` is one plain-English sentence a parent can read — not the raw legalistic standard text. Use the Common Core standard text (public domain) as your source; the IXL California Grade 1 page (https://www.ixl.com/standards/california/math/grade-1) is a useful guide for how these are phrased for a general audience, but **write your own phrasings — do not copy IXL's text**.

The complete list you must cover, no gaps:

```
1.G.1  1.G.2  1.G.3  1.MD.1  1.MD.2  1.MD.3  1.MD.4
1.NBT.1  1.NBT.2  1.NBT.2.a  1.NBT.2.b  1.NBT.2.c  1.NBT.3  1.NBT.4  1.NBT.5  1.NBT.6
1.OA.1  1.OA.2  1.OA.3  1.OA.4  1.OA.5  1.OA.6  1.OA.7  1.OA.8
K.CC.3  K.CC.5  K.CC.6  K.CC.7  K.G.1  K.G.2  K.MD.2  K.OA.2
```

Group by domain for display: OA = Operations & Algebraic Thinking, NBT = Number & Operations in Base Ten, MD = Measurement & Data, G = Geometry, CC = Counting & Cardinality. The `K.*` codes are prerequisite/readiness standards carried in from Kindergarten — label them as such in the report so a teacher isn't confused about why Kindergarten standards appear on a first-grade report.

Add a `?` affordance on each standard chip that reveals the description.

## Scoring rules — be explicit and consistent

- Percentage = `sum(earned) / sum(possible)` over **assessed questions only**.
- For a question tagged with multiple standards, credit the full earned/possible to **each** standard. This double-counts across standards, which is correct for per-standard mastery but means the standards' point totals will not sum to the overall total. **Print a one-line footnote on the report saying so** — a teacher who notices the mismatch and can't explain it will stop trusting the tool.
- Proficiency bands (make these named constants in one place, easy to change): ≥90% Exceeding, 75–89% Meeting, 60–74% Approaching, <60% Needs Support. Never render a band for a standard with fewer than 1 point possible; show "Not yet assessed."
- Round for display only; never round intermediate math.

## PDF export

Use **`window.print()` with a dedicated print stylesheet** (`@media print`), not a JS PDF library. Rationale: no dependency, real selectable text, correct pagination, and every browser's print dialog offers "Save as PDF" natively. Ensure the print stylesheet hides all navigation and buttons, forces a light background, sets `@page { margin: 0.5in }`, avoids page-breaking inside a standard's row (`break-inside: avoid`), and fits one student on one or two pages. Test that the printed output contains the student name, date, and the footnote.

## Quality bar

- **Design for the actual user.** A first-grade teacher on a laptop between classes. Large tap targets, high contrast, obvious affordances, no jargon. Do not build a dense developer-looking data grid.
- Responsive enough to be usable on a tablet; the gradebook may scroll horizontally, the page body must not.
- Semantic HTML, real `<label>`s, visible focus rings, `aria-live` on the save indicator. Keyboard-operable end to end.
- Light and dark theme via `prefers-color-scheme`, with CSS custom properties.
- Confirm before any destructive action (delete student, import-replace, clear all).
- A privacy note in the UI: all data stays in this browser, nothing is uploaded. Suggest the teacher use first names or initials.

## Deliverables

```
index.html
src/app.js, src/state.js, src/scoring.js, src/views/*.js, src/styles.css
src/data/standards.js            (generated, committed)
src/data/standardDescriptions.js (hand-authored)
tools/build-data.mjs
Grade 1 Standards.csv
README.md
.nojekyll
```

`README.md` must cover: what the app does, how to run locally, **exact GitHub Pages deploy steps** (repo settings → Pages → deploy from branch `main`, folder `/root`), how to regenerate data from the CSV, and where the data is stored plus its limits.

Include `.nojekyll` so Pages doesn't ignore any underscore-prefixed paths.

## Verification before you report done

Do not claim completion until you have actually confirmed:

1. `node tools/build-data.mjs` runs clean and `standards.js` contains **151 questions across 31 unit/assessment groups**, with `"SUB UNIT 3 QUIZ"` and `"SUB UNIT 3 QUIZ "` collapsed into one assessment.
2. Every standard code appearing in `QUESTIONS` has an entry in `standardDescriptions.js` — write a check that asserts this and prints any misses.
3. Manual pass: add 2 students → enter scores on Unit 3 End Unit Assessment including at least one `0` and several blanks → reload the page and confirm the data survived and blanks are still blank → double-click a student → verify the by-standard math by hand against one standard → print-preview the report.
4. Percentages are correct when a student has partial data, and a student with no scores shows "Not yet assessed" rather than 0% or `NaN`.

Report honestly what you verified and what you did not.
