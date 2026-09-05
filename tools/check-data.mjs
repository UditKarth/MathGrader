#!/usr/bin/env node
/**
 * check-data.mjs — assertions over the generated data.
 *   node tools/check-data.mjs
 * Exits non-zero and prints every miss if anything is wrong.
 */
import { QUESTIONS, ASSESSMENTS, ALL_STANDARD_CODES } from "../src/data/standards.js";
import { STANDARD_DESCRIPTIONS } from "../src/data/standardDescriptions.js";

const failures = [];
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures.push(label);
};

ok("151 questions", QUESTIONS.length === 151, `got ${QUESTIONS.length}`);
ok("31 unit/assessment groups", ASSESSMENTS.length === 31, `got ${ASSESSMENTS.length}`);
ok("32 distinct standards", ALL_STANDARD_CODES.length === 32, `got ${ALL_STANDARD_CODES.length}`);

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

const sub3 = ASSESSMENTS.filter((a) => a.assessmentKey === "SUB_UNIT_3_QUIZ");
ok(
  '"SUB UNIT 3 QUIZ" / "SUB UNIT 3 QUIZ " collapsed',
  sub3.every((a) => a.assessment === "Sub Unit 3 Quiz"),
  sub3.map((a) => `U${a.unit}:${a.questionIds.length}q`).join(" ")
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

const unused = Object.keys(STANDARD_DESCRIPTIONS).filter((c) => !used.includes(c));
ok("no orphan descriptions", unused.length === 0,
   unused.length ? `unused: ${unused.join(", ")}` : "");

// Descriptions are actually plain-English sentences, not placeholders.
const thin = Object.values(STANDARD_DESCRIPTIONS).filter(
  (d) => !d.description || d.description.length < 40 || !d.shortLabel || !d.domain
);
ok("descriptions are populated", thin.length === 0, thin.map((d) => d.code).join(", "));

console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
