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

/**
 * @param {string} studentId
 * @param {string[]|null} questionIds limit to these questions (a report scope);
 *   null means the whole year.
 */
export function overallFor(studentId, questionIds = null) {
  return tally(studentId, questionIds || ALL_QUESTION_IDS);
}

export function assessmentTally(studentId, assessmentGroup) {
  return tally(studentId, assessmentGroup.questionIds);
}

/**
 * Per-standard breakdown for one student.
 * A multi-standard question credits its full earned/possible to EACH standard
 * (see DOUBLE_COUNT_FOOTNOTE).
 */
export function standardsBreakdown(studentId, questionIds = null) {
  /** @type {Map<string, {code:string, earned:number, possible:number, questions:number, assessments:Set<string>}>} */
  const acc = new Map();

  const inScope = questionIds ? new Set(questionIds) : null;
  for (const q of QUESTIONS) {
    if (inScope && !inScope.has(q.id)) continue;
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
export function assessmentsBreakdown(studentId, unit = null) {
  return ASSESSMENTS.filter((g) => unit === null || g.unit === unit).map((group) => ({
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

/**
 * The scopes a report can be run at: one per unit (an end-of-unit report) plus
 * the whole year (an end-of-year report).
 */
export function reportScopes() {
  return [
    ...ASSESSMENTS.map((g) => ({
      key: `unit-${g.unit}`,
      type: "unit",
      unit: g.unit,
      shortLabel: `${g.unit}`,
      label: `Unit ${g.unit}`,
      title: `Unit ${g.unit} · ${g.assessment}`,
      questionIds: g.questionIds,
    })),
    {
      key: "year",
      type: "year",
      unit: null,
      shortLabel: "Full year",
      label: "Full year",
      title: "Full year · all End Unit Assessments",
      questionIds: ALL_QUESTION_IDS,
    },
  ];
}

export function findScope(key) {
  const scopes = reportScopes();
  return scopes.find((s) => s.key === key) || null;
}

/**
 * The unit a report should open on: the last one the student has any scores
 * for, so an end-of-unit report lands on the unit just graded. Falls back to
 * the first unit when nothing has been entered.
 */
export function defaultScopeKey(studentId) {
  const scored = ASSESSMENTS.filter((g) =>
    g.questionIds.some((qid) => getScore(studentId, qid) !== undefined)
  );
  const g = scored.length ? scored[scored.length - 1] : ASSESSMENTS[0];
  return `unit-${g.unit}`;
}

/**
 * Hue for the grey -> red -> green mastery ramp, or null when not assessed
 * (the views render that as grey). The ramp is piecewise so that colour and
 * proficiency band always agree: red below Approaching, amber through
 * Approaching, yellow-green through Meeting, green at Exceeding.
 */
export function masteryHue(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  const p = Math.max(0, Math.min(100, pct));
  const ramp = [
    [0, 4], [60, 22],    // Needs Support: red
    [75, 45],            // Approaching:   orange -> amber
    [90, 95],            // Meeting:       amber -> yellow-green
    [100, 140],          // Exceeding:     green
  ];
  for (let i = 1; i < ramp.length; i++) {
    const [x0, h0] = ramp[i - 1];
    const [x1, h1] = ramp[i];
    if (p <= x1) return h0 + ((p - x0) / (x1 - x0)) * (h1 - h0);
  }
  return 140;
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
