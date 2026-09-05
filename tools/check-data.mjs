#!/usr/bin/env node
/**
 * check-data.mjs — assertions over the generated data.
 *   node tools/check-data.mjs
 * Exits non-zero and prints every miss if anything is wrong.
 */
import { QUESTIONS, ASSESSMENTS, ALL_STANDARD_CODES, INCLUDED_ASSESSMENT_KEYS } from "../src/data/standards.js";
import { STANDARD_DESCRIPTIONS } from "../src/data/standardDescriptions.js";
import { normalizeAssessment } from "./build-data.mjs";

const failures = [];
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures.push(label);
};

// Scope: End Unit Assessments only (62 of the CSV's 151 rows).
ok("62 questions", QUESTIONS.length === 62, `got ${QUESTIONS.length}`);
ok("7 end-unit assessments", ASSESSMENTS.length === 7, `got ${ASSESSMENTS.length}`);
ok("23 distinct standards", ALL_STANDARD_CODES.length === 23, `got ${ALL_STANDARD_CODES.length}`);
ok("one assessment per unit", new Set(ASSESSMENTS.map((a) => a.unit)).size === ASSESSMENTS.length);
ok(
  "only in-scope assessments were emitted",
  QUESTIONS.every((q) => INCLUDED_ASSESSMENT_KEYS.includes(q.assessmentKey)),
  [...new Set(QUESTIONS.map((q) => q.assessmentKey))].join(", ")
);

// The trailing-space duplicate must have collapsed: each unit has at most one
// group per assessment key.
const dupes = [];
const seen = new Set();
for (const a of ASSESSMENTS) {
  const k = `${a.unit}::${a.assessmentKey}`;
  if (seen.has(k)) dupes.push(k);
  seen.add(k);
}
ok("no duplicate unit/assessment keys", dupes.length === 0, dupes.join(", "));

// The trailing-space collapse now happens upstream of the scope filter, so
// assert it against the normalizer itself rather than the emitted data.
const withSpace = normalizeAssessment("SUB UNIT 3 QUIZ ");
const noSpace = normalizeAssessment("SUB UNIT 3 QUIZ");
ok(
  '"SUB UNIT 3 QUIZ" / "SUB UNIT 3 QUIZ " normalize identically',
  withSpace.key === noSpace.key && withSpace.name === noSpace.name,
  `${withSpace.key} vs ${noSpace.key}`
);
ok(
  'trailing spaces trimmed on every assessment name',
  ["PRE-UNIT CHECK ", "SUB UNIT 1 QUIZ ", "END UNIT ASSESSMENT"].every(
    (raw) => normalizeAssessment(raw).name === normalizeAssessment(raw).name.trim()
  )
);

// Group question counts must sum to the question total (nothing dropped).
const grouped = ASSESSMENTS.reduce((n, a) => n + a.questionIds.length, 0);
ok("groups cover every question", grouped === QUESTIONS.length, `${grouped} vs ${QUESTIONS.length}`);

// Unique ids.
const ids = new Set(QUESTIONS.map((q) => q.id));
ok("question ids unique", ids.size === QUESTIONS.length);

// Curriculum order preserved (not alphabetical).
const rank = (q) => q.unit * 1e6 + q.assessmentOrder * 1e3 + q.questionNumber;
let ordered = true;
for (let i = 1; i < QUESTIONS.length; i++) {
  if (rank(QUESTIONS[i]) < rank(QUESTIONS[i - 1])) ordered = false;
}
ok("curriculum order preserved", ordered);

// Every standard used has a hand-authored description.
const used = [...new Set(QUESTIONS.flatMap((q) => q.standards))].sort();
const missing = used.filter((c) => !STANDARD_DESCRIPTIONS[c]);
ok("every used standard is described", missing.length === 0,
   missing.length ? `missing: ${missing.join(", ")}` : `${used.length} codes`);

// Descriptions intentionally cover all 32 CSV codes, including the 9 that only
// appear on out-of-scope assessments — so widening the scope needs no new prose.
const unused = Object.keys(STANDARD_DESCRIPTIONS).filter((c) => !used.includes(c));
console.log(`INFO  ${unused.length} description(s) kept for out-of-scope standards: ${unused.join(", ") || "(none)"}`);
ok("all 32 CSV standards still described", Object.keys(STANDARD_DESCRIPTIONS).length === 32,
   `got ${Object.keys(STANDARD_DESCRIPTIONS).length}`);

// Descriptions are actually plain-English sentences, not placeholders.
const thin = Object.values(STANDARD_DESCRIPTIONS).filter(
  (d) => !d.description || d.description.length < 40 || !d.shortLabel || !d.domain
);
ok("descriptions are populated", thin.length === 0, thin.map((d) => d.code).join(", "));

console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
