#!/usr/bin/env node
/**
 * build-data.mjs — parse "Grade 1 Standards.csv" into src/data/standards.js
 *
 * This is the ONLY build step in the project, and it is not required to run
 * the app: its output (src/data/standards.js) is committed. Re-run it only
 * when the CSV changes:
 *
 *     node tools/build-data.mjs
 *
 * We generate a static ES module instead of fetching the CSV at runtime
 * because fetch() fails under file:// and is fragile on GitHub Pages subpaths.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = join(ROOT, "Grade 1 Standards.csv");
const OUT_PATH = join(ROOT, "src", "data", "standards.js");

/** Minimal RFC4180-ish CSV parser: handles quoted fields, "" escapes, CRLF. */
function parseCsv(text) {
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
function normalizeAssessment(raw) {
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

function main() {
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const header = rows.shift().map((h) => h.trim().toUpperCase());

  const iUnit = header.indexOf("UNIT");
  const iAssessment = header.indexOf("ASSESSMENT");
  const iQuestion = header.indexOf("QUESTION #");
  const iStandards = header.indexOf("STANDARDS ALIGNMENT");
  if ([iUnit, iAssessment, iQuestion, iStandards].some((i) => i < 0)) {
    throw new Error(`Unexpected CSV header: ${JSON.stringify(header)}`);
  }

  const questions = rows.map((r, idx) => {
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
      standards,
    };
  });

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
// Source: Grade 1 Standards.csv
// Regenerate with: node tools/build-data.mjs
//
// ${questions.length} questions across ${groups.length} unit/assessment groups,
// covering ${allStandards.length} distinct standards.

/** @typedef {{id:string, unit:number, assessment:string, assessmentKey:string, assessmentOrder:number, questionNumber:number, standards:string[]}} Question */

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

/** Fast lookup by question id. */
export const QUESTIONS_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
`;

  writeFileSync(OUT_PATH, body, "utf8");

  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  questions:          ${questions.length}`);
  console.log(`  assessment groups:  ${groups.length}`);
  console.log(`  units:              ${units.length} (${units.join(", ")})`);
  console.log(`  distinct standards: ${allStandards.length}`);
}

main();
