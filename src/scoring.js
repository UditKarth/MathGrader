/**
 * scoring.js — every percentage in the app is computed here, so the rules
 * live in exactly one place.
 *
 * Core rule: only ASSESSED questions count. A question with no entered score
 * contributes to neither the numerator nor the denominator. A score of 0 is a
 * real score and counts fully.
 */

import { QUESTIONS, QUESTIONS_BY_ID, ASSESSMENTS } from "./data/standards.js";
import { describeStandard, isPrerequisite, DOMAIN_ORDER, DOMAINS } from "./data/standardDescriptions.js";
import { getPointsPossible, getScore } from "./state.js";

/** Proficiency bands. Change them here and the whole app follows. */
export const BANDS = [
  { key: "exceeding",   label: "Exceeding",     min: 90 },
  { key: "meeting",     label: "Meeting",       min: 75 },
  { key: "approaching", label: "Approaching",   min: 60 },
  { key: "support",     label: "Needs Support", min: 0 },
];

export const NOT_ASSESSED = { key: "none", label: "Not yet assessed", min: null };

/** The footnote the report must print, kept next to the rule it explains. */
export const DOUBLE_COUNT_FOOTNOTE =
  "Note: a question aligned to more than one standard counts in full toward each of those standards. Standard totals therefore add up to more than the overall total — this is expected and does not mean a score is wrong.";

/**
 * @param {number|null} pct percentage 0-100, or null when nothing was assessed
 */
export function bandFor(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return NOT_ASSESSED;
  return BANDS.find((b) => pct >= b.min) || BANDS[BANDS.length - 1];
}

/** Percentage or null. Never rounds — rounding happens at render time only. */
export function percentage(earned, possible) {
  if (!possible || possible <= 0) return null;
  return (earned / possible) * 100;
}

export function formatPercent(pct, digits = 0) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(digits)}%`;
}

/** Sum earned/possible across a list of question ids, skipping unassessed. */
export function tally(studentId, questionIds) {
  let earned = 0;
  let possible = 0;
  let assessed = 0;
  for (const qid of questionIds) {
    const score = getScore(studentId, qid);
    if (score === undefined) continue; // not assessed — excluded from both sides
    earned += score;
    possible += getPointsPossible(qid);
    assessed += 1;
  }
  return { earned, possible, assessed, total: questionIds.length, pct: percentage(earned, possible) };
}

const ALL_QUESTION_IDS = QUESTIONS.map((q) => q.id);

export function overallFor(studentId) {
  return tally(studentId, ALL_QUESTION_IDS);
}

export function assessmentTally(studentId, assessmentGroup) {
  return tally(studentId, assessmentGroup.questionIds);
}

/**
 * Per-standard breakdown for one student.
 * A multi-standard question credits its full earned/possible to EACH standard
 * (see DOUBLE_COUNT_FOOTNOTE).
 */
export function standardsBreakdown(studentId) {
  /** @type {Map<string, {code:string, earned:number, possible:number, questions:number, assessments:Set<string>}>} */
  const acc = new Map();

  for (const q of QUESTIONS) {
    const score = getScore(studentId, q.id);
    if (score === undefined) continue;
    const possible = getPointsPossible(q.id);
    for (const code of q.standards) {
      if (!acc.has(code)) {
        acc.set(code, { code, earned: 0, possible: 0, questions: 0, assessments: new Set() });
      }
      const row = acc.get(code);
      row.earned += score;
      row.possible += possible;
      row.questions += 1;
      row.assessments.add(`Unit ${q.unit} · ${q.assessment}`);
    }
  }

  const rows = [...acc.values()].map((r) => {
    const info = describeStandard(r.code);
    const pct = percentage(r.earned, r.possible);
    return {
      ...r,
      assessments: [...r.assessments],
      info,
      domain: info.domain,
      domainLabel: DOMAINS[info.domain] || info.domain,
      isPrerequisite: isPrerequisite(r.code),
      pct: r.possible > 0 ? pct : null,
      band: r.possible > 0 ? bandFor(pct) : NOT_ASSESSED,
    };
  });

  rows.sort(
    (a, b) =>
      DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) ||
      Number(a.isPrerequisite) - Number(b.isPrerequisite) ||
      a.code.localeCompare(b.code, undefined, { numeric: true })
  );
  return rows;
}

/** Group breakdown rows by domain, preserving DOMAIN_ORDER. */
export function groupByDomain(rows) {
  const groups = [];
  for (const key of DOMAIN_ORDER) {
    const items = rows.filter((r) => r.domain === key);
    if (items.length) groups.push({ key, label: DOMAINS[key] || key, items });
  }
  return groups;
}

/** Per-assessment breakdown, only assessments the student has entries for. */
export function assessmentsBreakdown(studentId) {
  return ASSESSMENTS.map((group) => ({
    group,
    ...assessmentTally(studentId, group),
  }))
    .filter((r) => r.assessed > 0)
    .map((r) => ({ ...r, band: bandFor(r.pct) }));
}

/**
 * Strengths and focus areas, derived from the bands so the narrative can never
 * disagree with the table above it. Standards with very little evidence
 * (< 2 points possible) are excluded from focus areas to avoid calling out a
 * student over a single question.
 */
export function narrative(rows) {
  const strengths = rows
    .filter((r) => r.pct !== null && r.pct >= 75)
    .sort((a, b) => b.pct - a.pct || b.possible - a.possible)
    .slice(0, 5);

  const focus = rows
    .filter((r) => r.pct !== null && r.pct < 75 && r.possible >= 2)
    .sort((a, b) => a.pct - b.pct || b.possible - a.possible)
    .slice(0, 5);

  const thinEvidence = rows.filter((r) => r.pct !== null && r.pct < 75 && r.possible < 2);
  return { strengths, focus, thinEvidence };
}

/** Flat CSV of the whole gradebook, for Excel/Sheets. */
export function gradebookCsv(roster) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ["Student", "Unit", "Assessment", "Question", "Standards", "Earned", "Possible", "Status"]
      .map(esc)
      .join(","),
  ];
  for (const student of roster) {
    for (const q of QUESTIONS) {
      const score = getScore(student.id, q.id);
      const assessed = score !== undefined;
      lines.push(
        [
          student.name,
          q.unit,
          q.assessment,
          q.questionNumber,
          q.standards.join(" "),
          assessed ? score : "",
          assessed ? getPointsPossible(q.id) : "",
          assessed ? "assessed" : "not assessed",
        ]
          .map(esc)
          .join(",")
      );
    }
  }
  return lines.join("\r\n");
}

export { QUESTIONS_BY_ID };
