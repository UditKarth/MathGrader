#!/usr/bin/env node
/**
 * check-print.mjs — guard what bulk printing promises about paper.
 *   node tools/check-print.mjs
 *
 * Bulk printing has two densities, both rendered from the SAME markup as the
 * on-screen report (buildReportArticle in src/views/report.js):
 *
 *   Full     — everything the on-screen report shows, including the
 *              plain-English sentence per standard and the "Assessed on"
 *              column. Deliberately NOT limited to one page: a unit report
 *              runs to about two pages and a full-year report to about four.
 *              Parity with the screen is the point; paper length follows.
 *
 *   Compact  — the same report with the per-standard sentences and the
 *              "Assessed on" column hidden, and the furniture tightened.
 *              This one DOES promise a single page per student at unit scope,
 *              and that promise is what this check defends. (At full-year
 *              scope even compact needs about two pages — 23 standards will
 *              not fit on one sheet legibly, and shrinking type further would
 *              make a parent-facing document worse.)
 *
 * Layout cannot be measured in Node, so this is a row-budget model fitted to
 * real browser measurements of the compact layout at Letter with 0.5in
 * margins (7.5in x 10in = 720 x 960 CSS px), one student scored on every
 * question of the unit:
 *
 *   unit 1  6 rows -> 734px      unit 5   6 rows -> 740px
 *   unit 2  6 rows -> 770px      unit 6  11 rows -> 940px
 *   unit 3  9 rows -> 902px      unit 7   6 rows -> 696px
 *   unit 4  7 rows -> 714px
 *
 * Least squares over those points gives px = 457 + 45 * rows, residuals within
 * +/-58px. "Rows" is the standards a unit covers plus one heading per domain
 * they fall into. Eleven rows is the ceiling; unit 6 sits exactly on it, which
 * is why the thin-headroom warning below exists.
 */

import { ASSESSMENTS, QUESTIONS_BY_ID, ALL_STANDARD_CODES } from "../src/data/standards.js";
import { STANDARD_DESCRIPTIONS } from "../src/data/standardDescriptions.js";
import { perGrade } from "./per-grade.mjs";

perGrade(import.meta.url);

const PAGE_HEIGHT_PX = 960;   // Letter, 0.5in margins
const FIXED_CHROME_PX = 457;  // fitted
const PX_PER_ROW = 45;        // fitted
const THIN_HEADROOM_PX = 60;  // about the size of the fit's own error

const failures = [];
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures.push(label);
};

function rowsFor(questionIds) {
  const codes = [...new Set(questionIds.flatMap((id) => QUESTIONS_BY_ID[id].standards))];
  const domains = new Set(codes.map((c) => STANDARD_DESCRIPTIONS[c]?.domain).filter(Boolean));
  return { codes: codes.length, domains: domains.size, rows: codes.length + domains.size };
}

const estimate = (rows) => Math.round(FIXED_CHROME_PX + rows * PX_PER_ROW);

console.log("Compact bulk report, per unit (Letter, 0.5in margins):\n");
console.log("  unit  standards  domains  rows  est. height  headroom");

const tight = [];
const over = [];
for (const group of ASSESSMENTS) {
  const { codes, domains, rows } = rowsFor(group.questionIds);
  const px = estimate(rows);
  const headroom = PAGE_HEIGHT_PX - px;
  if (headroom < 0) over.push(`unit ${group.unit} (${px}px)`);
  else if (headroom < THIN_HEADROOM_PX) tight.push(`unit ${group.unit} (${headroom}px spare)`);
  console.log(
    `  ${String(group.unit).padStart(4)}  ${String(codes).padStart(9)}  ${String(domains).padStart(7)}` +
    `  ${String(rows).padStart(4)}  ${String(px).padStart(11)}  ${String(headroom).padStart(8)}`
  );
}
console.log("");

ok(
  "every unit's compact report fits one printed page",
  over.length === 0,
  over.length ? `over the page: ${over.join(", ")}` : `${ASSESSMENTS.length} units`
);

if (tight.length) {
  console.log(`NOTE  thin headroom, within the fit's own margin of error: ${tight.join(", ")}`);
}

// Inline code + label in compact means a long label wraps and costs a whole row.
const LABEL_MAX = 42;
const longLabels = ALL_STANDARD_CODES
  .map((c) => STANDARD_DESCRIPTIONS[c])
  .filter((d) => d && d.shortLabel.length > LABEL_MAX);
ok(
  `short labels stay under ${LABEL_MAX} characters (they sit inline in compact and wrap if longer)`,
  longLabels.length === 0,
  longLabels.map((d) => `${d.code} (${d.shortLabel.length})`).join(", ")
);

const missingLabels = ALL_STANDARD_CODES.filter((c) => !STANDARD_DESCRIPTIONS[c]?.shortLabel);
ok("every standard has a short label", missingLabels.length === 0, missingLabels.join(", "));

// Full-year compact is expected to need a second sheet; assert we still know it,
// so nobody reads the per-unit pass above as a promise about the year report.
const yearRows = rowsFor(ASSESSMENTS.flatMap((g) => g.questionIds));
console.log(
  `\nINFO  full-year compact: ${yearRows.rows} rows, est. ${estimate(yearRows.rows)}px ` +
  `— about ${Math.ceil(estimate(yearRows.rows) / PAGE_HEIGHT_PX)} pages per student, as designed.`
);

console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nPrint budget OK.");
process.exit(failures.length ? 1 : 0);
