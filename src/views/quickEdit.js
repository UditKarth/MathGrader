/**
 * Quick edit — the inline score-entry panel on the roster.
 *
 * The gradebook is one assessment across the whole class. This is the other
 * axis: one student across their whole year, so a late test, a re-take, or a
 * single corrected answer can be fixed where the teacher already is, without
 * navigating anywhere.
 *
 * It edits exactly the same state as the gradebook, so the same rules hold:
 * a blank cell is "not assessed" and never a zero, and a question's max points
 * belong to the question — changing one here changes it for the whole class,
 * which the panel says out loud.
 */

import { el, clear } from "../dom.js";
import { ASSESSMENTS, UNITS, QUESTIONS_BY_ID } from "../data/standards.js";
import {
  getPointsPossible, setPointsPossible, getScore, setScore,
  markAllCorrect, clearRow,
} from "../state.js";
import { tally, formatPercent, bandFor } from "../scoring.js";
import { standardChip } from "./chips.js";

function groupFor(unit) {
  return ASSESSMENTS.find((a) => a.unit === unit) || ASSESSMENTS[0];
}

/**
 * @param {{id:string,name:string}} student
 * @param {number} unit currently selected unit
 * @param {object} ctx app context (showStandard, announce, …)
 * @param {{onUnitChange:(u:number)=>void, onScoreChange:()=>void, onClose:()=>void}} handlers
 */
export function renderQuickEdit(student, unit, ctx, handlers) {
  const group = groupFor(unit);
  const qids = group.questionIds;

  const panel = el("div", {
    class: "quick-edit",
    id: `quick-${student.id}`,
    role: "region",
    "aria-label": `Quick edit scores for ${student.name}`,
    onkeydown: (e) => {
      // Escape closes the panel, the way any expanded region should.
      if (e.key === "Escape") { e.stopPropagation(); handlers.onClose(); }
    },
  });

  // --- unit picker -----------------------------------------------------
  const unitBar = el("div", { class: "quick-units", role: "group", "aria-label": "Unit" },
    el("span", { class: "quick-label", text: "Unit" }),
    UNITS.map((u) => {
      const t = tally(student.id, groupFor(u).questionIds);
      return el("button", {
        type: "button",
        class: `unit-pill${u === unit ? " active" : ""}${t.assessed ? " has-data" : ""}`,
        "aria-pressed": u === unit ? "true" : "false",
        title: t.assessed
          ? `Unit ${u}: ${t.assessed} of ${t.total} questions scored (${formatPercent(t.pct)})`
          : `Unit ${u}: nothing entered yet`,
        onclick: () => handlers.onUnitChange(u),
      },
        `${u}`,
        t.assessed ? el("span", { class: "pill-dot", "aria-hidden": "true" }) : null
      );
    })
  );

  // --- the score strip -------------------------------------------------
  const strip = el("div", { class: "quick-strip" });

  const totalEl = el("span", { class: "quick-total-value" });
  const refreshTotal = () => {
    const t = tally(student.id, qids);
    clear(totalEl);
    if (t.assessed === 0) {
      totalEl.append(el("span", { class: "muted", text: "nothing entered yet" }));
    } else {
      const band = bandFor(t.pct);
      totalEl.append(
        el("strong", { class: `pct band-${band.key}`, text: formatPercent(t.pct) }),
        el("span", { class: "muted", text: ` · ${round(t.earned)} of ${round(t.possible)} points · ${t.assessed} of ${t.total} questions scored` })
      );
    }
  };

  const afterChange = () => {
    refreshTotal();
    handlers.onScoreChange();
  };

  qids.forEach((qid, index) => {
    const q = QUESTIONS_BY_ID[qid];
    const max = getPointsPossible(qid);
    const score = getScore(student.id, qid);
    const over = score !== undefined && score > max;

    const scoreInput = el("input", {
      type: "number", min: "0", step: "0.5", inputmode: "decimal",
      class: `quick-score${over ? " over-max" : ""}`,
      value: score === undefined ? "" : String(score),
      "aria-label": `${student.name}, Unit ${unit} question ${q.questionNumber}, out of ${max} points`,
      "aria-invalid": over ? "true" : null,
      dataset: { qIndex: String(index) },
      onfocus: (e) => e.target.select(),
      oninput: (e) => {
        const raw = e.target.value;
        setScore(student.id, qid, raw === "" ? null : raw);
        const n = Number(raw);
        const nowOver = raw !== "" && Number.isFinite(n) && n > getPointsPossible(qid);
        e.target.classList.toggle("over-max", nowOver);
        e.target.setAttribute("aria-invalid", nowOver ? "true" : "false");
        card.classList.toggle("is-over", nowOver);
        afterChange();
      },
      onkeydown: (e) => handleKey(e, index, student.id, qid),
    });

    const maxInput = el("input", {
      type: "number", min: "0.5", step: "0.5",
      class: "quick-max",
      value: String(max),
      "aria-label": `Points possible for Unit ${unit} question ${q.questionNumber} (applies to the whole class)`,
      title: "Max points for this question — applies to the whole class",
      onchange: (e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v) || v <= 0) { e.target.value = String(getPointsPossible(qid)); return; }
        setPointsPossible(qid, v);
        ctx.announce(`Unit ${unit} question ${q.questionNumber} is now worth ${v} point${v === 1 ? "" : "s"} for the whole class.`);
        const s = getScore(student.id, qid);
        const nowOver = s !== undefined && s > v;
        scoreInput.classList.toggle("over-max", nowOver);
        scoreInput.setAttribute("aria-label", `${student.name}, Unit ${unit} question ${q.questionNumber}, out of ${v} points`);
        card.classList.toggle("is-over", nowOver);
        afterChange();
      },
    });

    const card = el("div", { class: `quick-card${over ? " is-over" : ""}` },
      el("div", { class: "quick-card-head" },
        el("span", { class: "quick-q", text: `Q${q.questionNumber}` }),
        el("div", { class: "chips" }, q.standards.map((code) => standardChip(code, ctx)))
      ),
      el("div", { class: "quick-card-entry" },
        scoreInput,
        el("span", { class: "quick-slash", "aria-hidden": "true", text: "/" }),
        maxInput
      )
    );
    strip.append(card);
  });

  refreshTotal();

  // --- footer ----------------------------------------------------------
  const footer = el("div", { class: "quick-foot" },
    el("p", { class: "quick-total" },
      el("span", { class: "quick-label", text: `Unit ${unit} total ` }), totalEl),
    el("div", { class: "quick-actions" },
      el("button", {
        type: "button", class: "btn btn-small", text: "All correct",
        title: `Give ${student.name} full marks on every question in Unit ${unit}`,
        onclick: () => {
          markAllCorrect(student.id, qids);
          ctx.announce(`Marked all correct for ${student.name} on Unit ${unit}.`);
          handlers.onUnitChange(unit); // redraw the strip with the new values
        },
      }),
      el("button", {
        type: "button", class: "btn btn-small btn-quiet", text: "Clear unit",
        title: `Clear ${student.name}'s Unit ${unit} scores`,
        onclick: () => {
          clearRow(student.id, qids);
          ctx.announce(`Cleared ${student.name}'s Unit ${unit} scores.`);
          handlers.onUnitChange(unit);
        },
      })
    )
  );

  panel.append(
    unitBar,
    strip,
    footer,
    el("p", { class: "quick-hint muted small", text: "Blank means “not assessed yet” and is left out of every percentage — a 0 is a real score. The number after the slash is the question's max points, and changing it applies to the whole class." })
  );
  return panel;
}

/** ←/→ move between questions; Enter moves right, Shift+Enter left. */
function handleKey(e, index, studentId, qid) {
  const move = (delta) => {
    const next = e.target
      .closest(".quick-edit")
      ?.querySelector(`.quick-score[data-q-index="${index + delta}"]`);
    if (next) { e.preventDefault(); next.focus(); next.select(); }
  };
  switch (e.key) {
    case "ArrowRight":
    case "Enter":
      return move(e.key === "Enter" && e.shiftKey ? -1 : 1);
    case "ArrowLeft":
      return move(-1);
    case "Backspace":
    case "Delete":
      if (e.target.value === "") { e.preventDefault(); setScore(studentId, qid, null); }
      return;
    default:
      return;
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}
