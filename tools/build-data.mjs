#!/usr/bin/env node
/**
 * build-data.mjs — parse each grade's CSV into its own data module:
 *
 *     "Grade 1 Standards.csv"  ->  src/data/grade1.js
 *     "Kinder Standards.csv"   ->  src/data/gradeK.js
 *
 * src/data/standards.js (hand-written) picks one of them at startup based on
 * the grade the teacher chose. This is the ONLY build step in the project,
 * and it is not required to run the app: its output is committed. Re-run it
 * only when a CSV changes:
 *
 *     node tools/build-data.mjs
 *
 * We generate a static ES module instead of fetching the CSV at runtime
 * because fetch() fails under file:// and is fragile on GitHub Pages subpaths.
 *
 * SCOPE: the app grades End Unit Assessments (see INCLUDED_ASSESSMENT_KEYS
 * below). Pre-Unit Checks and Sub Unit Quizzes are parsed and normalized, then
 * filtered out — except in a unit that has no End Unit Assessment at all
 * (Kindergarten Unit 1). There, the unit's Sub Unit Quizzes are folded into a
 * single "Sub Unit Quizzes" assessment, so every unit still has exactly one
 * assessment and the rest of the app needs no special case.
 *
 * The full CSV stays in the repo, so widening the scope again is a one-line
 * change here plus a re-run of this script.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which assessments the app grades. Add "PRE_UNIT_CHECK" and/or
 * "SUB_UNIT_1_QUIZ" etc. here and re-run to widen the scope.
 */
export const INCLUDED_ASSESSMENT_KEYS = ["END_UNIT_ASSESSMENT"];

/** The combined assessment for a unit with no End Unit Assessment. */
const FALLBACK = { key: "SUB_UNIT_QUIZZES", name: "Sub Unit Quizzes", order: 98 };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** One entry per grade. `id` matches the keys of GRADES in src/grade.js. */
export const GRADE_SOURCES = [
  { id: "1", csv: "Grade 1 Standards.csv", out: join("src", "data", "grade1.js") },
  { id: "K", csv: "Kinder Standards.csv", out: join("src", "data", "gradeK.js") },
];

/** Minimal RFC4180-ish CSV parser: handles quoted fields, "" escapes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Assessment names arrive with inconsistent trailing whitespace, so
 * "SUB UNIT 3 QUIZ" and "SUB UNIT 3 QUIZ " must collapse to one assessment.
 * We key off a normalized form and derive both the display name and a stable
 * machine key from it.
 */
export function normalizeAssessment(raw) {
  const norm = raw.trim().replace(/\s+/g, " ").toUpperCase();

  if (norm === "PRE-UNIT CHECK") {
    return { key: "PRE_UNIT_CHECK", name: "Pre-Unit Check", order: 0 };
  }
  if (norm === "END UNIT ASSESSMENT") {
    return { key: "END_UNIT_ASSESSMENT", name: "End Unit Assessment", order: 99 };
  }
  const sub = norm.match(/^SUB UNIT (\d+) QUIZ$/);
  if (sub) {
    const n = Number(sub[1]);
    return { key: `SUB_UNIT_${n}_QUIZ`, name: `Sub Unit ${n} Quiz`, order: n };
  }

  // Unknown shape: still produce something stable rather than dropping data.
  return {
    key: norm.replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
    name: norm.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()),
    order: 50,
  };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Every standard code in a grade's CSV, in or out of scope. */
export function allCsvCodes(source) {
  return [...new Set(parseGrade(source).allQuestions.flatMap((q) => q.standards))].sort();
}

function parseGrade(source) {
  const rows = parseCsv(readFileSync(join(ROOT, source.csv), "utf8"));
  const header = rows.shift().map((h) => h.trim().toUpperCase());

  const iUnit = header.indexOf("UNIT");
  const iAssessment = header.indexOf("ASSESSMENT");
  const iQuestion = header.indexOf("QUESTION #");
  const iStandards = header.indexOf("STANDARDS ALIGNMENT");
  if ([iUnit, iAssessment, iQuestion, iStandards].some((i) => i < 0)) {
    throw new Error(`Unexpected CSV header: ${JSON.stringify(header)}`);
  }

  const allQuestions = rows.map((r, idx) => {
    const unit = Number(r[iUnit].trim());
    const questionNumber = Number(r[iQuestion].trim());
    const a = normalizeAssessment(r[iAssessment]);
    if (!Number.isInteger(unit) || !Number.isInteger(questionNumber)) {
      throw new Error(`Bad numeric field on CSV row ${idx + 2}: ${JSON.stringify(r)}`);
    }
    const standards = r[iStandards]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!standards.length) {
      throw new Error(`No standards on CSV row ${idx + 2}: ${JSON.stringify(r)}`);
    }
    return {
      id: `u${unit}-${slug(a.name)}-q${questionNumber}`,
      unit,
      assessment: a.name,
      assessmentKey: a.key,
      assessmentOrder: a.order,
      questionNumber,
      label: `Q${questionNumber}`,
      standards,
    };
  });
  return { allQuestions };
}

function buildGrade(source) {
  const { allQuestions } = parseGrade(source);
  const OUT_PATH = join(ROOT, source.out);

  // Scope filter. Everything above is parsed and normalized first, so the
  // trailing-space collapse still happens for rows we are about to drop.
  const questions = allQuestions.filter((q) =>
    INCLUDED_ASSESSMENT_KEYS.includes(q.assessmentKey)
  );

  // A unit with nothing in scope would vanish from the app. Grade it from its
  // Sub Unit Quizzes instead, folded into one assessment. Question ids keep
  // their source form (u1-subunit2quiz-q1), so scores stay attached even if
  // this rule changes later; `source` records where each question came from.
  const coveredUnits = new Set(questions.map((q) => q.unit));
  const effectiveKeys = [...INCLUDED_ASSESSMENT_KEYS];
  const uncovered = [...new Set(allQuestions.map((q) => q.unit))].filter((u) => !coveredUnits.has(u));
  for (const unit of uncovered) {
    const quizzes = allQuestions
      .filter((q) => q.unit === unit && /^SUB_UNIT_\d+_QUIZ$/.test(q.assessmentKey))
      .sort((a, b) => a.assessmentOrder - b.assessmentOrder || a.questionNumber - b.questionNumber);
    if (!quizzes.length) continue;
    if (!effectiveKeys.includes(FALLBACK.key)) effectiveKeys.push(FALLBACK.key);
    const perQuiz = new Map();
    for (const q of quizzes) perQuiz.set(q.assessmentOrder, (perQuiz.get(q.assessmentOrder) || 0) + 1);
    quizzes.forEach((q, i) => {
      questions.push({
        ...q,
        assessment: FALLBACK.name,
        assessmentKey: FALLBACK.key,
        assessmentOrder: FALLBACK.order,
        questionNumber: i + 1,
        // "Quiz 2" when the quiz is one question, "Quiz 2 Q3" otherwise.
        label: perQuiz.get(q.assessmentOrder) === 1
          ? `Quiz ${q.assessmentOrder}`
          : `Quiz ${q.assessmentOrder} Q${q.questionNumber}`,
        source: { assessment: q.assessment, questionNumber: q.questionNumber },
      });
    });
    console.log(`  note: Unit ${unit} has no End Unit Assessment — using its ${quizzes.length} Sub Unit Quiz question(s)`);
  }

  if (!questions.length) {
    throw new Error(
      `No rows matched INCLUDED_ASSESSMENT_KEYS (${INCLUDED_ASSESSMENT_KEYS.join(", ")}).`
    );
  }

  // Curriculum order: unit, then Pre-Unit -> Sub Unit N -> End Unit, then Q#.
  questions.sort(
    (a, b) =>
      a.unit - b.unit ||
      a.assessmentOrder - b.assessmentOrder ||
      a.questionNumber - b.questionNumber
  );

  const ids = new Set();
  for (const q of questions) {
    if (ids.has(q.id)) throw new Error(`Duplicate question id: ${q.id}`);
    ids.add(q.id);
  }

  // Assessment groups, in the same curriculum order.
  const groups = [];
  const seen = new Map();
  for (const q of questions) {
    const key = `${q.unit}::${q.assessmentKey}`;
    if (!seen.has(key)) {
      const g = {
        key,
        unit: q.unit,
        assessment: q.assessment,
        assessmentKey: q.assessmentKey,
        questionIds: [],
      };
      seen.set(key, g);
      groups.push(g);
    }
    seen.get(key).questionIds.push(q.id);
  }

  const allStandards = [...new Set(questions.flatMap((q) => q.standards))].sort();
  const units = [...new Set(questions.map((q) => q.unit))].sort((a, b) => a - b);

  const body = `// GENERATED FILE — do not edit by hand.
// Source: ${source.csv}
// Regenerate with: node tools/build-data.mjs
//
// Scope: ${effectiveKeys.join(", ")}
// ${questions.length} questions across ${groups.length} unit/assessment groups,
// covering ${allStandards.length} distinct standards.
// (${allQuestions.length - questions.length} of ${allQuestions.length} CSV rows are out of scope.)

/** @typedef {{id:string, unit:number, assessment:string, assessmentKey:string, assessmentOrder:number, questionNumber:number, label:string, standards:string[], source?:{assessment:string, questionNumber:number}}} Question */

/** @type {Question[]} — in curriculum order. */
export const QUESTIONS = ${JSON.stringify(questions, null, 2)};

/** Assessment groups, in curriculum order. */
export const ASSESSMENTS = ${JSON.stringify(
    groups.map(({ key, unit, assessment, assessmentKey, questionIds }) => ({
      key, unit, assessment, assessmentKey, questionIds,
    })),
    null,
    2
  )};

/** Every unit number present in the data, ascending. */
export const UNITS = ${JSON.stringify(units)};

/** Every distinct standard code present in the data. */
export const ALL_STANDARD_CODES = ${JSON.stringify(allStandards, null, 2)};

/** The assessments this build includes. */
export const INCLUDED_ASSESSMENT_KEYS = ${JSON.stringify(effectiveKeys)};

/** Fast lookup by question id. */
export const QUESTIONS_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
`;

  writeFileSync(OUT_PATH, body, "utf8");

  console.log(`Wrote ${source.out}  (from ${source.csv})`);
  console.log(`  scope:              ${effectiveKeys.join(", ")}`);
  console.log(`  questions:          ${questions.length} (of ${allQuestions.length} CSV rows)`);
  console.log(`  assessment groups:  ${groups.length}`);
  console.log(`  units:              ${units.length} (${units.join(", ")})`);
  console.log(`  distinct standards: ${allStandards.length}`);
}

function main() {
  for (const source of GRADE_SOURCES) buildGrade(source);
}

// Only run when executed directly, so tools/check-data.mjs can import the
// normalizer without regenerating anything.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
