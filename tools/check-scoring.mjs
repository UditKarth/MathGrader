#!/usr/bin/env node
/**
 * check-scoring.mjs — exercises the scoring rules headlessly against a stubbed
 * localStorage, so the "a blank is not a zero" rule can't regress silently.
 *   node tools/check-scoring.mjs
 */
const store = new Map();
globalThis.window = { localStorage: {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k,v)=>store.set(k,v), removeItem: k=>store.delete(k) } };

const S = await import("../src/state.js");
const C = await import("../src/scoring.js");
const { ASSESSMENTS, QUESTIONS_BY_ID } = await import("../src/data/standards.js");

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok?"PASS":"FAIL"}  ${label}${ok?"":`  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

S.loadState();
const a = S.addStudent("Ana R.");
const b = S.addStudent("Ben T.");
const blank = S.addStudent("Cleo Q."); // never scored

// --- student with no scores at all ---
const none = C.overallFor(blank.id);
eq("no scores → pct is null (not 0, not NaN)", none.pct, null);
eq("no scores → band is Not yet assessed", C.bandFor(none.pct).label, "Not yet assessed");
eq("no scores → no standard rows", C.standardsBreakdown(blank.id).length, 0);
eq("no scores → no assessment rows", C.assessmentsBreakdown(blank.id).length, 0);

// --- Unit 3 End Unit Assessment: partial data with a real 0 and blanks ---
const g = ASSESSMENTS.find(x => x.unit === 3 && x.assessmentKey === "END_UNIT_ASSESSMENT");
console.log(`\nUnit 3 End Unit Assessment: ${g.questionIds.length} questions`);
const q = g.questionIds;

S.setScore(a.id, q[0], 1);   // full
S.setScore(a.id, q[1], 0);   // a REAL zero
S.setScore(a.id, q[2], 1);
// q[3..] left blank

const t = C.tally(a.id, q);
eq("3 assessed of the whole assessment", t.assessed, 3);
eq("earned 2 of 3 possible", [t.earned, t.possible], [2, 3]);
eq("pct = 66.67 (blanks excluded from denominator)", Number(t.pct.toFixed(2)), 66.67);
eq("blanks are NOT zeros (denominator is 3, not " + q.length + ")", t.possible, 3);
eq("the real 0 IS counted", S.getScore(a.id, q[1]), 0);
eq("a blank reads as undefined", S.getScore(a.id, q[3]), undefined);

// overall == this assessment only, since nothing else is entered
eq("overall matches the single assessment", Number(C.overallFor(a.id).pct.toFixed(4)), Number(t.pct.toFixed(4)));

// --- max points is per-question, class-wide ---
S.setPointsPossible(q[0], 2);
S.setScore(b.id, q[0], 2);
eq("max points applies to the other student too", S.getPointsPossible(q[0]), 2);
eq("Ben: 2/2 = 100%", C.tally(b.id, q).pct, 100);
eq("Ana's denominator grew with the max change", C.tally(a.id, q).possible, 4);
eq("Ana now 2/4 = 50%", C.tally(a.id, q).pct, 50);
S.setPointsPossible(q[0], 1); // back to 1 for the hand check below

// --- hand-check one standard's math ---
console.log("\nHand check — Ana's scored questions and their standards:");
const scored = [q[0], q[1], q[2]];
for (const qid of scored) {
  const qq = QUESTIONS_BY_ID[qid];
  console.log(`  Q${qq.questionNumber}  earned=${S.getScore(a.id,qid)}/${S.getPointsPossible(qid)}  standards=${qq.standards.join(", ")}`);
}
const rows = C.standardsBreakdown(a.id);
console.log("Computed per-standard rows:");
for (const r of rows) console.log(`  ${r.code}  ${r.earned}/${r.possible} = ${r.pct.toFixed(1)}%  ${r.band.label}  [${r.assessments.join("; ")}]`);

// Independently recompute per-standard totals from raw data.
const manual = {};
for (const qid of scored) {
  for (const code of QUESTIONS_BY_ID[qid].standards) {
    manual[code] ??= { e: 0, p: 0 };
    manual[code].e += S.getScore(a.id, qid);
    manual[code].p += S.getPointsPossible(qid);
  }
}
const computed = Object.fromEntries(rows.map(r => [r.code, { e: r.earned, p: r.possible }]));
eq("per-standard totals match an independent recomputation", computed, manual);

// Double counting is expected: standard points exceed the overall total.
const stdPoints = rows.reduce((n, r) => n + r.possible, 0);
console.log(`\nSum of standard possibles = ${stdPoints}, overall possible = ${C.overallFor(a.id).possible} (double-counting is expected)`);
eq("footnote exists to explain that", C.DOUBLE_COUNT_FOOTNOTE.length > 60, true);

// --- multi-standard question: full credit to EACH standard ---
const multi = Object.values(QUESTIONS_BY_ID).find(x => x.standards.length > 1);
const d = S.addStudent("Dev P.");
S.setScore(d.id, multi.id, 0.5);
S.setPointsPossible(multi.id, 2);
const mrows = C.standardsBreakdown(d.id);
console.log(`\nMulti-standard question ${multi.id} -> ${multi.standards.join(", ")}, scored 0.5/2`);
for (const r of mrows) console.log(`  ${r.code}  ${r.earned}/${r.possible} = ${r.pct.toFixed(1)}%`);
eq("one row per aligned standard", mrows.map(r=>r.code).sort(), [...multi.standards].sort());
eq("each standard gets the FULL earned/possible", mrows.every(r => r.earned===0.5 && r.possible===2), true);
eq("overall counts the question once", [C.overallFor(d.id).earned, C.overallFor(d.id).possible], [0.5, 2]);
eq("standard possibles sum above the overall (the footnote case)",
   mrows.reduce((n,r)=>n+r.possible,0) > C.overallFor(d.id).possible, true);
S.deleteStudent(d.id);
S.setPointsPossible(multi.id, 1);

// --- bands ---
eq("90 → Exceeding", C.bandFor(90).label, "Exceeding");
eq("89.9 → Meeting", C.bandFor(89.9).label, "Meeting");
eq("75 → Meeting", C.bandFor(75).label, "Meeting");
eq("74.9 → Approaching", C.bandFor(74.9).label, "Approaching");
eq("60 → Approaching", C.bandFor(60).label, "Approaching");
eq("59.9 → Needs Support", C.bandFor(59.9).label, "Needs Support");
eq("0 → Needs Support", C.bandFor(0).label, "Needs Support");
eq("null → Not yet assessed", C.bandFor(null).label, "Not yet assessed");

// --- no rounding of intermediates ---
eq("1/3 keeps full precision internally", C.percentage(1,3), (1/3)*100);
eq("...and is not pre-rounded", C.percentage(1,3).toFixed(6), "33.333333");
eq("formatPercent rounds for display only", C.formatPercent(100/3), "33%");

// --- persistence round trip ---
S.saveNow();
const raw = JSON.parse(store.get("desmos-grader:v1"));
eq("persisted under desmos-grader:v1", typeof raw, "object");
eq("real 0 survives serialization", raw.scores[a.id][q[1]], 0);
eq("blank stays absent after serialization", q[3] in raw.scores[a.id], false);
const reloaded = S.normalizeState(raw);
eq("reload keeps the 0", reloaded.scores[a.id][q[1]], 0);
eq("reload keeps blanks blank", q[3] in reloaded.scores[a.id], false);
eq("clearing a score removes the key, not sets 0", (S.setScore(a.id,q[0],null), S.getScore(a.id,q[0])), undefined);

// --- markAllCorrect / CSV ---
S.markAllCorrect(b.id, q);
eq("mark all correct → 100%", C.tally(b.id, q).pct, 100);
const csv = C.gradebookCsv(S.getState().roster).split("\r\n");
eq("CSV has a header + 151 rows per student", csv.length, 1 + 151 * S.getState().roster.length);
const anaZero = csv.find(l => l.startsWith("Ana R.") && l.includes(",0,1,assessed"));
eq("CSV writes a real 0 as 0", Boolean(anaZero), true);
const blankRow = csv.find(l => l.startsWith("Cleo Q."));
eq("CSV writes an unassessed cell as empty + 'not assessed'", blankRow.endsWith(",,,not assessed"), true);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nAll scoring checks passed.");
process.exit(fails ? 1 : 0);
