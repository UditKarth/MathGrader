/**
 * Gradebook screen: students (rows) × the selected assessment's questions
 * (columns). All 62 questions at once would be unusable, so the teacher picks
 * a unit first. The app is scoped to End Unit Assessments, so that is normally
 * the only choice per unit and the assessment selector stays hidden; it appears
 * automatically if the data build is ever widened to include more assessments.
 *
 * Keyboard model (this is the primary data-entry surface):
 *   ArrowUp/Down/Left/Right — move between cells
 *   Enter                   — move down (Shift+Enter moves up)
 *   Tab                     — native, moves right
 *   typing a digit          — replaces the cell contents
 *   Backspace/Delete on an empty selection — clears back to "not assessed"
 */

import { el, clear } from "../dom.js";
import { ASSESSMENTS, UNITS } from "../data/standards.js";
import { QUESTIONS_BY_ID } from "../data/standards.js";
import {
  getState, getPointsPossible, setPointsPossible, getScore, setScore,
  markAllCorrect, clearRow,
} from "../state.js";
import { tally, formatPercent, bandFor } from "../scoring.js";
import { standardChip } from "./chips.js";

/** Screen-local selection, kept across re-renders. */
const ui = { unit: UNITS[0], assessmentKey: null };

function groupsForUnit(unit) {
  return ASSESSMENTS.filter((a) => a.unit === unit);
}

function currentGroup() {
  const groups = groupsForUnit(ui.unit);
  if (!groups.length) return null;
  return groups.find((g) => g.assessmentKey === ui.assessmentKey) || groups[0];
}

export function renderGradebook(root, ctx) {
  clear(root);
  const state = getState();
  const group = currentGroup();
  if (group) ui.assessmentKey = group.assessmentKey;

  root.append(
    el("header", { class: "screen-head" },
      el("h2", { text: "Gradebook" }),
      el("p", { class: "muted small", text: "Type the points each student earned. Blank means not assessed yet — it is not a zero." })
    ),
    renderSelector(ctx, group)
  );

  if (!state.roster.length) {
    root.append(el("section", { class: "card empty" },
      el("h3", { text: "Add students first" }),
      el("p", { text: "The gradebook needs a roster before you can enter scores." }),
      el("button", { type: "button", class: "btn btn-primary", text: "Go to the roster", onclick: () => ctx.navigate("roster") })
    ));
    return;
  }
  if (!group) {
    root.append(el("section", { class: "card empty" }, el("p", { text: "No assessments found for this unit." })));
    return;
  }

  root.append(renderGrid(state, group, ctx));
}

function renderSelector(ctx, group) {
  const unitSelect = el("select", {
    class: "input select", id: "unit-select",
    onchange: (e) => {
      ui.unit = Number(e.target.value);
      ui.assessmentKey = null;
      ctx.rerender();
    },
  }, UNITS.map((u) => el("option", { value: String(u), selected: u === ui.unit, text: `Unit ${u}` })));

  const groups = groupsForUnit(ui.unit);

  // With one assessment per unit there is nothing to choose, so show the name
  // instead of a single-option dropdown the teacher would have to click through.
  const assessmentField =
    groups.length > 1
      ? el("label", { class: "field", for: "assessment-select" },
          el("span", { class: "field-label", text: "Assessment" }),
          el("select", {
            class: "input select", id: "assessment-select",
            onchange: (e) => { ui.assessmentKey = e.target.value; ctx.rerender(); },
          }, groups.map((g) => el("option", {
            value: g.assessmentKey,
            selected: group && g.assessmentKey === group.assessmentKey,
            text: `${g.assessment} (${g.questionIds.length} question${g.questionIds.length === 1 ? "" : "s"})`,
          }))))
      : el("div", { class: "field" },
          el("span", { class: "field-label", text: "Assessment" }),
          el("p", { class: "selector-static", id: "assessment-static" },
            group ? `${group.assessment} · ${group.questionIds.length} questions` : "—"));

  return el("section", { class: "card selector" },
    el("label", { class: "field", for: "unit-select" },
      el("span", { class: "field-label", text: "Unit" }), unitSelect),
    assessmentField
  );
}

function renderGrid(state, group, ctx) {
  const qids = group.questionIds;

  // --- header ---------------------------------------------------------
  const headRow = el("tr",
    el("th", { scope: "col", class: "sticky-col corner", text: "Student" }),
    qids.map((qid) => {
      const q = QUESTIONS_BY_ID[qid];
      const maxInput = el("input", {
        type: "number", min: "0.5", step: "0.5", class: "input max-input",
        value: String(getPointsPossible(qid)),
        "aria-label": `Points possible for question ${q.questionNumber} (applies to the whole class)`,
        title: "Max points for this question — applies to the whole class",
        onchange: (e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v) || v <= 0) { e.target.value = String(getPointsPossible(qid)); return; }
          setPointsPossible(qid, v);
          ctx.announce(`Question ${q.questionNumber} is now worth ${v} point${v === 1 ? "" : "s"} for the whole class.`);
          ctx.rerender();
        },
      });
      // Q number and max points share a line; the chips wrap underneath. Two
      // stacked rows here instead of three keeps the sticky header short.
      return el("th", { scope: "col", class: "q-head" },
        el("div", { class: "q-top" },
          el("span", { class: "q-num", text: `Q${q.questionNumber}` }),
          // "/" reads as "out of" and costs a third of the width the word
          // "max" did; the input keeps a full aria-label and tooltip.
          el("label", { class: "max-field" },
            el("span", { class: "max-label", "aria-hidden": "true", text: "/" }), maxInput)
        ),
        el("div", { class: "chips" }, q.standards.map((code) => standardChip(code, ctx)))
      );
    }),
    el("th", { scope: "col", class: "sticky-right", text: "Score" }),
    el("th", { scope: "col", class: "sticky-right-2", text: "" })
  );

  // --- body -----------------------------------------------------------
  const body = el("tbody");
  state.roster.forEach((student, rowIndex) => {
    const cells = qids.map((qid, colIndex) => {
      const max = getPointsPossible(qid);
      const score = getScore(student.id, qid);
      const over = score !== undefined && score > max;
      const input = el("input", {
        type: "number", min: "0", step: "0.5", class: `cell-input${over ? " over-max" : ""}`,
        value: score === undefined ? "" : String(score),
        placeholder: "",
        inputmode: "decimal",
        "aria-label": `${student.name}, question ${QUESTIONS_BY_ID[qid].questionNumber}, out of ${max}`,
        "aria-invalid": over ? "true" : null,
        title: over ? `Above the ${max}-point maximum for this question.` : null,
        dataset: { row: String(rowIndex), col: String(colIndex) },
        oninput: (e) => {
          const raw = e.target.value;
          setScore(student.id, qid, raw === "" ? null : raw);
          updateRowTotal(student.id, qids, rowIndex);
          const n = Number(raw);
          e.target.classList.toggle("over-max", raw !== "" && Number.isFinite(n) && n > max);
        },
        onfocus: (e) => e.target.select(),
        onkeydown: (e) => handleKey(e, rowIndex, colIndex, student.id, qid),
      });
      return el("td", { class: "cell" }, input,
        over ? el("span", { class: "over-flag", title: `Over the ${max}-point maximum`, text: "!" }) : null);
    });

    const t = tally(student.id, qids);
    const totalCell = el("td", {
      class: "sticky-right num", dataset: { totalFor: student.id },
    }, rowTotalContent(t));

    body.append(el("tr", {},
      el("th", { scope: "row", class: "sticky-col name-cell" },
        el("button", {
          type: "button", class: "linklike", text: student.name,
          title: "Open this student's report",
          onclick: () => ctx.openReport(student.id),
        })
      ),
      cells,
      totalCell,
      el("td", { class: "sticky-right-2 row-actions" },
        el("button", {
          type: "button", class: "btn btn-small", text: "All correct",
          title: `Give ${student.name} full marks on every question in this assessment`,
          onclick: () => { markAllCorrect(student.id, qids); ctx.rerender(); ctx.announce(`Marked all correct for ${student.name}.`); },
        }),
        el("button", {
          type: "button", class: "btn btn-small btn-quiet", text: "Clear",
          title: `Clear ${student.name}'s scores for this assessment`,
          onclick: () => { clearRow(student.id, qids); ctx.rerender(); ctx.announce(`Cleared ${student.name}'s scores for this assessment.`); },
        })
      )
    ));
  });

  const table = el("table", { class: "grade-grid" },
    el("caption", { class: "sr-only", text: `Unit ${group.unit} ${group.assessment}. Arrow keys move between cells, Enter moves down.` }),
    el("thead", headRow), body);

  return el("section", { class: "card grid-card" },
    el("div", { class: "grid-scroll" }, table),
    el("p", { class: "muted small grid-hint", text: "Arrow keys move between cells · Enter moves down · Tab moves right · every question is worth 1 point unless you change its max · blank cells are left out of every percentage." })
  );
}

function rowTotalContent(t) {
  if (t.assessed === 0) return el("span", { class: "muted", text: "—" });
  const band = bandFor(t.pct);
  return el("span", { class: `pct band-${band.key}`, title: `${round(t.earned)} of ${round(t.possible)} points on ${t.assessed} assessed question${t.assessed === 1 ? "" : "s"}` },
    formatPercent(t.pct));
}

function updateRowTotal(studentId, qids) {
  const cell = document.querySelector(`[data-total-for="${CSS.escape(studentId)}"]`);
  if (!cell) return;
  clear(cell).append(rowTotalContent(tally(studentId, qids)));
}

function handleKey(e, row, col, studentId, qid) {
  const move = (dr, dc) => {
    const next = document.querySelector(
      `.cell-input[data-row="${row + dr}"][data-col="${col + dc}"]`
    );
    if (next) { e.preventDefault(); next.focus(); next.select(); }
  };

  switch (e.key) {
    case "ArrowDown": return move(1, 0);
    case "ArrowUp": return move(-1, 0);
    case "Enter": return move(e.shiftKey ? -1 : 1, 0);
    case "ArrowRight":
      // Only leave the cell when the caret is already at the end.
      if (e.target.selectionStart === null || e.target.selectionStart === e.target.value.length) return move(0, 1);
      return;
    case "ArrowLeft":
      if (e.target.selectionStart === null || e.target.selectionStart === 0) return move(0, -1);
      return;
    case "Backspace":
    case "Delete":
      if (e.target.value === "") {
        e.preventDefault();
        setScore(studentId, qid, null);
      }
      return;
    default:
      // Typing a digit on a focused cell replaces its contents (the input is
      // auto-selected on focus, so the browser already does this) — nothing to do.
      return;
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}
