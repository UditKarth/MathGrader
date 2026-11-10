# Kindergarten & Grade 1 Standards Grader

A single-page web app that turns **Desmos Math** Kindergarten and Grade 1 **End Unit
Assessment** scores into
a **per-standard report** for each student — the view report cards and parent conferences
actually need.

Enter per-question scores in a gradebook, then open any student's report to see how they
are doing against each California / Common Core standard, with plain-English descriptions
and a printable PDF.

No server, no build step, no dependencies, no accounts. All data stays in the teacher's
own browser.

---

## Two grades, one app

The first time a teacher opens the app it asks one question — **"Which grade do you
teach?"** — with a big button for each grade. The answer is remembered in that browser, so
every later visit opens straight into that grade's class with nothing to click.

- **Each grade is its own gradebook.** Kindergarten and Grade 1 keep separate rosters,
  max points and scores, under separate storage keys. A Kindergarten teacher never sees
  Grade 1 data and vice versa.
- **Switching is tucked away**, under **Data ▾ → Switch grade…**, with a confirmation
  that explains the other grade's class is kept. Switching also changes the remembered
  default.
- **Existing Grade 1 teachers are never asked.** A browser that already has Grade 1 data
  from before Kindergarten support existed is treated as a Grade 1 browser automatically.
- **Updating is safe for existing data.** Grade 1 keeps its storage key and every
  question id from before, and `tools/check-scoring.mjs` loads a save written by the
  previous version and asserts every score survives. If saved data ever cannot be read,
  the app copies it to a `…:unreadable:<time>` key before anything can overwrite it.
- **Backups are labelled with their grade.** Export file names include it
  (`desmos-grader-kindergarten-2026-11-09.json`), and the file records it. Importing a
  backup into the wrong grade is refused with plain instructions, and nothing changes. Old
  backups with no grade are Grade 1.
- If the browser blocks storage (some private windows), the choice is carried in the
  address instead (`?grade=K`), so picking a grade still works for that visit.

Everything else — roster, quick edit, gradebook, reports, bulk printing, bands, backups —
is identical for both grades. The app reads the chosen grade once at startup
(`src/grade.js`), which is why switching reloads the page.

## Scope: End Unit Assessments

The app grades **End Unit Assessments only**. The CSVs' Pre-Unit Checks and Sub Unit
Quizzes are parsed and normalized by the build script, then filtered out.

| Grade | Questions | End Unit Assessments | Standards |
| --- | --- | --- | --- |
| Kindergarten | 44 | 6 + Unit 1's quizzes (Units 1–7) | 17 |
| Grade 1 | 62 | 7 (Units 1–7) | 23 |

Two consequences worth knowing:

- **Kindergarten Unit 1 uses its quizzes.** Kindergarten Unit 1 has no End Unit
  Assessment, only two one-question Sub Unit Quizzes. The build script folds those into a
  single **"Sub Unit Quizzes"** assessment for Unit 1, with columns labelled *Quiz 1* and
  *Quiz 2*. Every unit therefore still has exactly one assessment, and unit reports, quick
  edit and bulk printing work for it unchanged. The rule is general: any unit with no End
  Unit Assessment is graded from its Sub Unit Quizzes. The CSV export lists those
  questions under their original quiz names.
- **Grade 1 reports cover Grade 1 standards only.** Every `K.*` readiness standard in the
  Grade 1 CSV appears *only* on Pre-Unit Checks, so scoping to End Unit Assessments drops
  all eight of them, along with `1.NBT.2.c`.

Widening the scope is a one-line change — add to `INCLUDED_ASSESSMENT_KEYS` in
`tools/build-data.mjs` and re-run it. Nothing else needs to change: the gradebook grows an
assessment selector automatically, hand-authored descriptions for every code in both CSVs
are already committed, and the Grade 1 report re-enables its Kindergarten explainer on its
own.

## What it does

- **Roster** — add students one at a time or paste a whole class; rename, delete, and see
  each student's overall percentage and how many questions they've been assessed on.
- **Quick edit** — every roster row has a *Quick edit* button that expands an inline panel
  for entering and updating that student's points **without leaving the home page**. Pick a
  unit, type the scores. It is the other axis from the gradebook: one student across their
  whole year, rather than one assessment across the whole class — which is what you want for
  a make-up test, a re-take, or a single corrected answer.
- **Gradebook** — bulk entry for a whole class. Pick a unit, then type scores into a
  students × questions grid. Every End Unit Assessment — including the 13-question Unit 4 —
  fits a full class on one screen with no scrolling. Each question column shows its number
  and an editable max-points field; the standards it aligns to appear in a tooltip on hover
  or keyboard focus, and clicking the question number opens their full descriptions.
  **Every question defaults to 1 point**, and a teacher can change any question's max on the
  fly; percentages, proficiency bands, and the report all recalculate immediately, for the
  whole class. Fully keyboard-driven.
- **Print all reports** — from the Gradebook, every student's report in one print job, each
  starting on a new page. Choose the current unit or the full year, whether to include
  students with no scores yet, and the detail level. Browsers cannot write several files from
  one print action, so this is one document — choose *Save as PDF* in the print dialog to keep
  it as a single file.

  The pages are drawn by the **same function as the on-screen report**
  (`buildReportArticle` in `src/views/report.js`), so they carry exactly the same content.
  Two densities are offered, and they differ only in CSS — never in what is rendered:

  | Detail | Shows | Pages per student |
  | --- | --- | --- |
  | **Full** (default) | everything the on-screen report shows, including the plain-English sentence per standard and the *Assessed on* column | ~2 at unit scope, ~4 at full year |
  | **Compact** | the same report with those two hidden and the spacing tightened | **1** at unit scope, ~2 at full year |

  `tools/check-print.mjs` guards the compact one-page-per-unit promise against a row budget
  fitted to real browser measurements.
- **Individual Report** — overall mastery, a by-standard breakdown with proficiency bands,
  a by-assessment breakdown, strengths and focus areas, and **Export as PDF**.

### The one rule that matters most

**A blank cell is not a zero.** An unentered score means "not assessed yet" and is excluded
from every numerator *and* denominator. A `0` is a real, deliberate score and counts fully.
The two render differently everywhere (blank vs. a visible `0`), and one never silently
becomes the other. A student who has taken one quiz reads as "80% on what they've done",
not "3% for the year".

---

## Running it locally

The app is plain HTML, CSS, and ES modules — there is nothing to install and nothing to build.

Serve the folder over HTTP and open it:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000/>.

> **Why a local server rather than double-clicking `index.html`?**
> The app never `fetch()`es anything, so nothing about *its* design needs a server. But
> Chrome applies CORS to `<script type="module">` and refuses to load module scripts from a
> `file://` page, so double-clicking `index.html` shows a blank page in Chrome. Safari and
> Firefox are more permissive. Any static host — including GitHub Pages — works fine, as
> does the one-line command above.

---

## Deploying to GitHub Pages

The repo is already a deployable site: no build output, no Actions workflow, no
dependencies. Everything is served exactly as committed.

### Before you deploy

```bash
node tools/check-deploy.mjs
```

This asserts the things that break *only* in production and are invisible locally:

- **Case-sensitive paths.** Pages serves from Linux; macOS is case-insensitive. An import
  written `./Chips.js` when the file is `chips.js` works on your laptop and 404s on Pages.
  The check compares every path against the real directory entry.
- **Root-relative paths** (`/src/app.js`), which break under a repo subpath.
- **External/CDN references** and **runtime `fetch()`**, neither of which this app uses.
- A missing `.nojekyll`, and stale generated data.

### Steps

1. Create a GitHub repository and push this folder to `main`:

   ```bash
   git remote add origin https://github.com/<your-user>/<your-repo>.git
   git push -u origin main
   ```

   The repo must be **public** for Pages on a free account (GitHub Pro or an
   organization plan is required to serve a private repo).

2. In the repository: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to **`/ (root)`**. Click **Save**.
5. Wait for the deployment to finish, then open
   `https://<your-user>.github.io/<your-repo>/`.

No workflow file is needed. Branch deploys publish on every push to `main`.

### Why it works under a subpath

Pages serves a project site from `https://<user>.github.io/<repo>/`, not from a domain root.
Every asset here is referenced relatively (`./src/app.js`, `./src/styles.css`) and the app
never `fetch()`es anything, so it resolves correctly at any depth. `.nojekyll` is committed
so Pages serves paths as-is instead of running Jekyll, which would ignore
underscore-prefixed files.

### After you deploy: the 10-minute cache

GitHub Pages serves assets with `Cache-Control: max-age=600` (verified against a live
`github.io` site). After you push a change, browsers may keep the old files for up to ten
minutes. Because this app ships several ES modules, a reload inside that window can briefly
mix old and new files.

It resolves itself within ten minutes. To see a change immediately, hard-reload
(<kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>). Avoid deploying in the middle of a
grading session.

## Saving on GitHub Pages

**Saving works on Pages exactly as it does locally** — `localStorage` needs no server, and
Pages serves over HTTPS, which is a normal, persistent storage context. A fully-scored class
of 30 students across all 62 questions is about **55 KB**, against a typical 5 MB per-origin
quota — roughly 90× headroom. (The same data in cookies would have been 14× *over* the 4 KB
cookie limit, which is why this app does not use them.)

What changes on Pages is not *whether* it saves, but *where* that storage lives. Browser
storage is scoped to the **origin** — `https://<your-user>.github.io` — and **not** to the
repo path. Verified behavior, and its consequences:

| Situation | What happens to the data |
| --- | --- |
| Rename the repo | **Survives.** The path changes, the origin doesn't. |
| Deploy an updated version | **Survives.** Storage is independent of the files. |
| Move to a custom domain (`grader.school.org`) | **Lost.** New origin. Export first, then import. |
| Move to an organization account | **Lost.** New origin. Export first, then import. |
| Teacher switches browser or device | Not there — storage is per-browser. |
| Teacher clears browsing data | **Gone.** |

Two consequences worth taking seriously:

- **Every Pages project on `https://<your-user>.github.io` shares one storage area.** This
  app namespaces its key (`desmos-grader:v1`) so it will not collide, but any other page you
  host on that same user account *can read this data*, student names included. If that
  matters, host it on a dedicated account or an organization — and follow the app's advice to
  use first names or initials.
- **Safari** evicts script-writable storage for sites left un-visited for an extended period.
  A gradebook untouched over a long break may not be there when school resumes.

### So the backup is the real save

Because of all of the above, the JSON export is not a nice-to-have — it is the only copy that
survives a cleared browser, a new device, or an origin change. The app now tracks this:

- The **Data ▾** menu shows **Last backup: never / today / N days ago**.
- Once there are real scores and no backup within 7 days, a banner offers
  **Export a backup now**. It is dismissible, and disappears as soon as you export.

Encourage the teacher to export at the end of each grading session and keep the file
somewhere backed up. Import restores it on any browser, device, or origin.

**Never commit an export into the repo.** On a public Pages repo that publishes student
names. `.gitignore` already excludes `desmos-grader-*.json` and `desmos-gradebook-*.csv`,
and `tools/check-deploy.mjs` fails if one is present.

## Regenerating the data from the CSV

Each grade's CSV is its source of truth and is kept in the repo for provenance. Neither is
read at runtime — `tools/build-data.mjs` parses both and emits one committed ES module per
grade:

| CSV | Generated module |
| --- | --- |
| `Kinder Standards.csv` | `src/data/gradeK.js` |
| `Grade 1 Standards.csv` | `src/data/grade1.js` |

`src/data/standards.js` is a small hand-written file that picks one of them based on the
chosen grade, so no view needs to know which grade it is showing.

If a CSV changes, that is the only step needed:

```bash
node tools/build-data.mjs
```

Then commit the regenerated files.

The build script normalizes the CSV's data-hygiene problems:

- **Trailing spaces on assessment names** (`"PRE-UNIT CHECK "`, `"SUB UNIT 1 QUIZ "`).
  Without this, `"SUB UNIT 3 QUIZ"` and `"SUB UNIT 3 QUIZ "` would look like two different
  assessments. They are collapsed into one.
- **Multi-standard cells** quoted and comma-separated (`"1.OA.6, 1.OA.3"`) are split into
  a real array.
- **Assessment order** is the curriculum's own — unit ascending, then
  Pre-Unit Check → Sub Unit 1 → Sub Unit 2 → Sub Unit 3 → End Unit Assessment, then
  question number. Never alphabetical.

- **Scope filtering** happens after normalization, so the collapse above still applies to
  rows that are about to be dropped.

Current output: Grade 1 — **62 questions across 7 End Unit Assessments, covering 23
distinct standards**, filtered from 151 CSV rows. Kindergarten — **44 questions across 7
units (6 End Unit Assessments plus Unit 1's Sub Unit Quizzes), covering 17 distinct
standards**, filtered from 75 CSV rows.

### Checks

```bash
# Each check runs once per grade.
node tools/check-data.mjs      # data shape, ordering, and standard-description coverage
node tools/check-scoring.mjs   # the scoring rules, incl. "a blank is not a zero"
node tools/check-deploy.mjs    # GitHub Pages readiness (see Deploying, above)
node tools/check-print.mjs     # compact bulk reports still fit one page per unit
```

`check-data.mjs` asserts that every standard code appearing in `QUESTIONS` has an entry in
`src/data/standardDescriptions.js` and prints any misses.

---

## Where your data is stored, and its limits

Everything lives in **`localStorage`** in the browser you typed it into: Grade 1 under
`desmos-grader:v1` (the original key, so existing data carries over), Kindergarten under
`desmos-grader:k:v1`, and the remembered grade under `desmos-grader:grade`. Nothing is uploaded, there is no server, and there is no account.

That has real limits, so please read this part:

- **It is per-browser and per-device.** Scores typed on the classroom laptop are not on the
  home laptop, and Chrome does not see what Safari stored.
- **Clearing browsing data deletes it.** So does "reset browser", some IT policies, and
  private-browsing windows (which discard everything on close — the app detects this and
  shows a warning banner instead of pretending to save).
- **There is no undo and no server-side backup.**

So the app ships three escape hatches, under **Data ▾**:

| Action | What it does |
| --- | --- |
| **Export All (JSON)** | Downloads the complete state — roster, max points, scores. This is your backup. |
| **Import (JSON)** | Reads a previously exported file. Validates `version` first, then asks whether to **replace** everything or **merge** (students with the same name are combined). |
| **Export Gradebook (CSV)** | A flat, one-row-per-question CSV for Excel or Sheets. Unassessed questions export with empty score columns and a `not assessed` status, never as `0`. |

**Export All (JSON) at the end of each grading session.** It is the only backup that exists.

The stored blob carries a `version` field, and the load path validates it, so a future
format change can migrate old files rather than silently misreading them.

### Privacy

All data stays in the browser, so nothing is transmitted anywhere. Even so, prefer
**first names or initials** rather than full student names — it costs nothing and keeps the
export files harmless if one is ever misplaced.

---

## Scoring rules

- **Percentage** = `sum(earned) / sum(possible)`, over **assessed questions only**.
- **Every question is worth 1 point by default.**
- **Max points is a property of the question, not the student.** Setting "Q3 is worth 2
  points" applies to the whole class, and every percentage and band updates immediately.
  Changing Q1 of a 6-question assessment from 1 point to 5, for a student who got Q1 right
  and 4 of the other 5, moves them from 5/6 (83%, Proficient) to 5/10 (50%, Below Basic).
- **Over-max entries are flagged, not clamped.** Typing `5` into a 1-point question shows a
  visible warning and keeps your number, rather than silently rewriting it.
- **Multi-standard questions credit their full earned/possible to *each* aligned standard.**
  This is correct for per-standard mastery, but it means the standards' point totals add up
  to more than the overall total. The report prints a footnote saying exactly that, so a
  teacher who notices the mismatch has an answer.
- **Proficiency bands** (defined once, in `BANDS` in `src/scoring.js`):

  | Band | Range |
  | --- | --- |
  | Advanced | ≥ 90% |
  | Proficient | 75–89% |
  | Basic | 60–74% |
  | Below Basic | 40–59% |
  | Needs Help | < 40% |

  A standard with no points possible shows **"Not yet assessed"** rather than a band, and a
  student with no scores at all shows "Not yet assessed" rather than `0%` or `NaN`.

  **Proficient** is the target band: the report's "Strengths" lists standards at Proficient
  or above and "Focus areas" lists those below it, both derived from `TARGET_BAND` so the
  narrative can never disagree with the table beside it. The printed ranges are derived too
  (`bandRange`), so changing a threshold never leaves a stale "75–89%" next to a band name.
- **Rounding is for display only.** Intermediate math is never rounded.

### Report scope: unit vs. year

A report opens on a **unit**, because that is the common case — a teacher has just finished
grading a unit. The unit chosen is the last one that student has any scores in, decided per
student, so opening two reports in a row does not carry one student's unit over to the next.

| Scope | Overall mastery | By standard | By assessment |
| --- | --- | --- | --- |
| `Unit N` | that unit's questions only | standards that unit assesses | that one assessment |
| `Full year` | every scored question | every standard assessed so far | every assessment taken |

The printed page always names its scope under the student's name, and a footnote spells out
that a unit report excludes the other units. The toggle itself is hidden in print.

The roster's *Assessed* column deliberately stays year-to-date — it is a class overview, not
a report.

### The mastery scale

Percentages are shown as a bar on a **grey → red → green** ramp: grey for not assessed, deep
red through Needs Help, red through Below Basic, amber through Basic, yellow-green through
Proficient, green at Advanced. The ramp turns at the band thresholds, so the colour and the
proficiency label can never disagree — a bar that looks amber is always in the amber band.
Change a band threshold and the colours follow.

Colour is never the only signal. The bar's **length** carries the same information as its
hue, and the band name is always printed as text beside it, so the report still reads
correctly in greyscale, on a black-and-white printout, or for a red/green colour-blind
reader. A legend appears on the report, including in print.

In **Grade 1**, codes beginning `K.` (`K.CC.3`, `K.OA.2`, …) are readiness/prerequisite
standards that the curriculum revisits early in the year. They are labelled **"K
readiness"** in the report so nobody wonders why Kindergarten standards appear on a
first-grade report. In **Kindergarten** they are simply the standards, so nothing is
labelled. "Readiness" means "from an earlier grade than the one being graded"
(`isPrerequisite` in `src/data/standardDescriptions.js`).

The report groups standards by domain in a per-grade order: Kindergarten leads with
Counting & Cardinality; Grade 1 leads with Operations & Algebraic Thinking.

---

## Exporting a PDF

The **Export as PDF** button calls `window.print()` against a dedicated `@media print`
stylesheet. There is no PDF library — every browser's print dialog already offers
"Save as PDF", and this route gives real selectable text, correct pagination, and no
dependency. The print stylesheet hides all navigation and buttons, forces a light
background, sets `@page { margin: 0.5in }`, and avoids page-breaking inside a standard's row.

---

## Project layout

```
index.html                        the whole app shell
.nojekyll                         so GitHub Pages serves every path as-is
Grade 1 Standards.csv             Grade 1 source of truth, kept for provenance
Kinder Standards.csv              Kindergarten source of truth
README.md

src/
  grade.js                        which grade this browser grades; first-visit choice
  app.js                          navigation, grade picker, import/export, dialogs
  state.js                        state + localStorage persistence (debounced ~300ms)
  scoring.js                      every percentage, band, and the CSV export
  dom.js                          small element helper
  styles.css                      including the @media print stylesheet
  views/
    roster.js                     home / roster screen
    quickEdit.js                  the inline per-student score panel on the roster
    bulkPrint.js                  bulk printing; pages come from report.js's builder
    tooltip.js                    hover/focus tooltip that escapes the grid's clipping
    chips.js                      shared standard chip with its `?` description popover
    gradebook.js                  the data-entry grid
    report.js                     the individual report
  data/
    grade1.js, gradeK.js          GENERATED by tools/build-data.mjs — do not hand-edit
    standards.js                  picks the chosen grade's data
    standardDescriptions.js       hand-authored, one plain-English sentence per standard
                                  (all 43 codes in both CSVs, including out-of-scope ones)

tools/
  build-data.mjs                  each grade's CSV -> src/data/grade1.js / gradeK.js
  per-grade.mjs                   runs a check once per grade
  check-data.mjs                  data + description-coverage assertions
  check-scoring.mjs               scoring-rule assertions
  check-deploy.mjs                GitHub Pages readiness (case-sensitivity, paths, …)
  check-print.mjs                 row budget for the one-page bulk reports
```

## Two ways to enter scores

|  | Quick edit (home page) | Gradebook |
| --- | --- | --- |
| Shape | one student × all 7 units | one assessment × the whole class |
| Best for | a make-up test, a re-take, fixing one answer | grading a stack of papers after a unit |
| Reach it | *Quick edit* on any roster row | the Gradebook tab |

Both write to the same state, so a score typed in one shows up immediately in the other.

## Keyboard shortcuts

**Gradebook**

| Key | Action |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | Move between cells |
| <kbd>Enter</kbd> | Move down (<kbd>Shift</kbd>+<kbd>Enter</kbd> moves up) |
| <kbd>Tab</kbd> | Move right |
| typing a digit | Replaces the cell contents |
| <kbd>Backspace</kbd> on an empty cell | Clears it back to "not assessed" |

**Quick edit**

| Key | Action |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> | Move between questions |
| <kbd>Enter</kbd> | Next question (<kbd>Shift</kbd>+<kbd>Enter</kbd> goes back) |
| <kbd>Esc</kbd> | Close the panel and return focus to the button |

Opening Quick edit puts the cursor straight in the first score box, so the teacher can start
typing without reaching for the mouse. Every screen is operable by keyboard alone, with
visible focus rings throughout.
