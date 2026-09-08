#!/usr/bin/env node
/**
 * check-print.mjs — guard the "one page per student" promise of bulk export.
 *   node tools/check-print.mjs
 *
 * Layout cannot be measured in Node, so this is a ROW BUDGET check instead.
 * The two constants below were measured in a real browser with the print
 * stylesheet applied, at Letter with 0.5in margins (7.5in x 10in = 720 x 960
 * CSS px), using a class of 8 students scored on every question:
 *
 *   Unit 4 scope:    8 rows -> 390px
 *   Full-year scope: 27 rows -> 786px
 *
 * which gives ~20.8px per standard row and ~223px of fixed page furniture
 * (header, overall block, strengths/focus, footnotes).
 *
 * The number of rows on the busiest page is (standards in scope) + (domains in
 * scope). Today that is 23 + 4 = 27 against a ceiling of 35. Widening
 * INCLUDED_ASSESSMENT_KEYS in tools/build-data.mjs to the whole CSV would put
 * all 32 standards across 5 domains on the page — 37 rows — and this check is
 * what tells you the pages have started spilling onto a second sheet.
 */

import { QUESTIONS, ALL_STANDARD_CODES } from "../src/data/standards.js";
import { STANDARD_DESCRIPTIONS, DOMAIN_ORDER } from "../src/data/standardDescriptions.js";

const PAGE_HEIGHT_PX = 960;   // Letter, 0.5in margins
const FIXED_CHROME_PX = 223;  // measured
const PX_PER_ROW = 20.8;      // measured

const MAX_ROWS = Math.floor((PAGE_HEIGHT_PX - FIXED_CHROME_PX) / PX_PER_ROW);

const failures = [];
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures.push(label);
};

// Worst case is the full-year report: every standard in the data, plus one
// heading per domain those standards fall into.
const domains = new Set(
  ALL_STANDARD_CODES.map((c) => STANDARD_DESCRIPTIONS[c]?.domain).filter(Boolean)
);
const rows = ALL_STANDARD_CODES.length + domains.size;
const estimate = Math.round(FIXED_CHROME_PX + rows * PX_PER_ROW);

console.log(`Worst-case page: full-year scope`);
console.log(`  standards:        ${ALL_STANDARD_CODES.length}`);
console.log(`  domain headings:  ${domains.size} (${[...domains].sort((a, b) => DOMAIN_ORDER.indexOf(a) - DOMAIN_ORDER.indexOf(b)).join(", ")})`);
console.log(`  rows:             ${rows} of ${MAX_ROWS} that fit`);
console.log(`  estimated height: ${estimate}px of ${PAGE_HEIGHT_PX}px\n`);

ok(
  "full-year report fits one printed page",
  rows <= MAX_ROWS,
  `${rows} rows, ceiling ${MAX_ROWS}`
);

ok(
  "estimated height leaves a margin of error",
  estimate <= PAGE_HEIGHT_PX * 0.95,
  `${estimate}px vs ${Math.round(PAGE_HEIGHT_PX * 0.95)}px (95% of the page)`
);

// Every standard shown on a bulk page needs a short label; a missing one would
// render an empty cell rather than failing loudly.
const missingLabels = ALL_STANDARD_CODES.filter((c) => !STANDARD_DESCRIPTIONS[c]?.shortLabel);
ok("every standard has a short label for the compact table", missingLabels.length === 0, missingLabels.join(", "));

// Long labels wrap, and a wrapped row is taller than the measured average.
const LABEL_MAX = 42;
const longLabels = ALL_STANDARD_CODES
  .map((c) => STANDARD_DESCRIPTIONS[c])
  .filter((d) => d && d.shortLabel.length > LABEL_MAX);
ok(
  `short labels stay under ${LABEL_MAX} characters (longer ones wrap and grow the row)`,
  longLabels.length === 0,
  longLabels.map((d) => `${d.code} (${d.shortLabel.length})`).join(", ")
);

console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nPrint budget OK.");
process.exit(failures.length ? 1 : 0);
