#!/usr/bin/env node
/**
 * check-data.mjs — assertions over the generated data.
 *   node tools/check-data.mjs
 * Exits non-zero and prints every miss if anything is wrong.
 */
import { QUESTIONS, ASSESSMENTS, ALL_STANDARD_CODES, INCLUDED_ASSESSMENT_KEYS } from "../src/data/standards.js";
import { STANDARD_DESCRIPTIONS, isPrerequisite } from "../src/data/standardDescriptions.js";
import { normalizeAssessment, GRADE_SOURCES, allCsvCodes } from "./build-data.mjs";
import { perGrade } from "./per-grade.mjs";

const GRADE_ID = perGrade(import.meta.url);

// Expected shape per grade. Kindergarten Unit 1 has no End Unit Assessment,
// so its two one-question Sub Unit Quizzes stand in for it (42 + 2 questions).
const EXPECTED = {
  1: { questions: 62, assessments: 7, standards: 23, rows: 151 },
  K: { questions: 44, assessments: 7, standards: 17, rows: 75 },
}[GRADE_ID];

const failures = [];
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures.push(label);
};

// Scope: End Unit Assessments only.
ok(`${EXPECTED.questions} questions`, QUESTIONS.length === EXPECTED.questions, `got ${QUESTIONS.length}`);
ok(`${EXPECTED.assessments} end-unit assessments`, ASSESSMENTS.length === EXPECTED.assessments, `got ${ASSESSMENTS.length}`);
ok(`${EXPECTED.standards} distinct standards`, ALL_STANDARD_CODES.length === EXPECTED.standards, `got ${ALL_STANDARD_CODES.length}`);
ok("one assessment per unit", new Set(ASSESSMENTS.map((a) => a.unit)).size === ASSESSMENTS.length);
ok("every unit 1–7 has an assessment",
   JSON.stringify(ASSESSMENTS.map((a) => a.unit)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7]),
   ASSESSMENTS.map((a) => a.unit).join(", "));
const dupLabels = ASSESSMENTS.filter((a) => {
  const labels = a.questionIds.map((id) => QUESTIONS.find((q) => q.id === id).label);
  return new Set(labels).size !== labels.length;
});
ok("question labels are unique within each assessment", dupLabels.length === 0,
   dupLabels.map((a) => `unit ${a.unit}`).join(", "));
if (GRADE_ID === "K") {
  const u1 = ASSESSMENTS.find((a) => a.unit === 1);
  ok("Kindergarten Unit 1 is its Sub Unit Quizzes, labelled Quiz 1 / Quiz 2",
     u1?.assessment === "Sub Unit Quizzes" &&
     JSON.stringify(u1.questionIds) === JSON.stringify(["u1-subunit1quiz-q1", "u1-subunit2quiz-q1"]) &&
     JSON.stringify(u1.questionIds.map((id) => QUESTIONS.find((q) => q.id === id).label)) === JSON.stringify(["Quiz 1", "Quiz 2"]),
     u1 ? `${u1.assessment}: ${u1.questionIds.join(", ")}` : "missing");
}
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

// Descriptions intentionally cover every code in every grade's CSV, including
// those only on out-of-scope assessments — so widening the scope needs no new prose.
const csvCodes = [...new Set(GRADE_SOURCES.flatMap(allCsvCodes))].sort();
const undescribed = csvCodes.filter((c) => !STANDARD_DESCRIPTIONS[c]);
ok("every standard in every CSV is described", undescribed.length === 0,
   undescribed.length ? `missing: ${undescribed.join(", ")}` : `${csvCodes.length} codes`);
const unused = Object.keys(STANDARD_DESCRIPTIONS).filter((c) => !used.includes(c));
console.log(`INFO  ${unused.length} description(s) not used by this grade's End Unit Assessments`);

// "Readiness" means an earlier grade's standard: Grade 1 flags its K codes,
// Kindergarten flags nothing.
const flagged = used.filter(isPrerequisite);
const wantFlagged = GRADE_ID === "K" ? [] : used.filter((c) => c.startsWith("K."));
ok("readiness labels match the grade", JSON.stringify(flagged) === JSON.stringify(wantFlagged),
   `flagged: ${flagged.join(", ") || "(none)"}`);

// Descriptions are actually plain-English sentences, not placeholders.
const thin = Object.values(STANDARD_DESCRIPTIONS).filter(
  (d) => !d.description || d.description.length < 40 || !d.shortLabel || !d.domain
);
ok("descriptions are populated", thin.length === 0, thin.map((d) => d.code).join(", "));

console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
