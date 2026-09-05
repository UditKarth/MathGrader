/** Home / Roster screen. */

import { el, clear, confirmAction } from "../dom.js";
import {
  getState, addStudent, addStudents, renameStudent, deleteStudent,
} from "../state.js";
import { overallFor, formatPercent, bandFor } from "../scoring.js";
import { QUESTIONS, UNITS, ASSESSMENTS } from "../data/standards.js";
import { renderQuickEdit } from "./quickEdit.js";

/**
 * Which student's quick-edit panel is open, and which unit it is showing.
 * Module-level so it survives a re-render of the roster.
 */
const ui = { openStudentId: null, unit: UNITS[0] };

const SAMPLE_CLASS = [
  "Ana R.", "Ben T.", "Camila S.", "Dev P.", "Elena M.",
  "Femi A.", "Grace L.", "Hugo N.",
];

export function renderRoster(root, ctx) {
  clear(root);
  const state = getState();

  root.append(
    el("header", { class: "screen-head" },
      el("h2", { text: "Class roster" }),
      el("p", { class: "muted", text: `${state.roster.length} student${state.roster.length === 1 ? "" : "s"} · ${ASSESSMENTS.length} End Unit Assessments · ${QUESTIONS.length} questions across ${UNITS.length} units` })
    )
  );

  root.append(renderAddPanel(ctx));

  if (!state.roster.length) {
    root.append(renderEmptyState(ctx));
    return;
  }

  root.append(renderTable(state, ctx));
}

function renderAddPanel(ctx) {
  const single = el("input", {
    type: "text", id: "add-student-name", class: "input",
    placeholder: "e.g. Ana R.", autocomplete: "off",
  });

  const form = el("form", {
    class: "add-form",
    onsubmit: (e) => {
      e.preventDefault();
      if (addStudent(single.value)) {
        single.value = "";
        ctx.rerender();
        document.getElementById("add-student-name")?.focus();
      }
    },
  },
    el("label", { class: "field" },
      el("span", { class: "field-label", text: "Add a student" }),
      single
    ),
    el("button", { type: "submit", class: "btn btn-primary", text: "Add" })
  );

  const bulk = el("textarea", {
    class: "input textarea", id: "bulk-names", rows: 4,
    placeholder: "Paste one name per line…",
  });

  const bulkBlock = el("details", { class: "bulk" },
    el("summary", { text: "Paste a whole class at once" }),
    el("div", { class: "bulk-body" },
      el("label", { class: "field" },
        el("span", { class: "field-label", text: "One name per line" }),
        bulk
      ),
      el("button", {
        type: "button", class: "btn", text: "Add all names",
        onclick: () => {
          const names = bulk.value.split(/\r?\n/);
          const added = addStudents(names);
          bulk.value = "";
          ctx.announce(`Added ${added.length} student${added.length === 1 ? "" : "s"}.`);
          ctx.rerender();
        },
      })
    )
  );

  return el("section", { class: "card" }, form, bulkBlock);
}

function renderEmptyState(ctx) {
  return el("section", { class: "card empty" },
    el("h3", { text: "No students yet" }),
    el("p", {
      text: "This app turns Desmos Math End Unit Assessment scores into a per-standard report for each first grader — the view you actually need for report cards and conferences.",
    }),
    el("ol", { class: "steps" },
      el("li", { text: "Add your students above (or paste the whole roster)." }),
      el("li", { text: "Enter scores: use Quick edit on a student's row here, or the Gradebook to do the whole class at once. Each question is worth 1 point unless you change it." }),
      el("li", { text: "Open a student's report to see how they are doing on each standard." })
    ),
    el("button", {
      type: "button", class: "btn btn-primary", text: "Load a sample class",
      onclick: () => {
        addStudents(SAMPLE_CLASS);
        ctx.announce("Loaded a sample class of 8 students.");
        ctx.rerender();
      },
    }),
    el("p", { class: "muted small", text: "Sample names are made up — delete them any time." })
  );
}

function renderTable(state, ctx) {
  const body = el("tbody");

  for (const student of state.roster) {
    const { earned, possible, assessed, pct } = overallFor(student.id);
    const band = pct === null ? null : bandFor(pct);

    const nameCell = el("td", { class: "name-cell" },
      el("button", {
        type: "button", class: "linklike name-button",
        title: "Click to rename · double-click to open the report",
        text: student.name,
        onclick: (e) => startRename(e.currentTarget, student, ctx),
        ondblclick: (e) => { e.preventDefault(); ctx.openReport(student.id); },
      })
    );

    const isOpen = ui.openStudentId === student.id;

    const toggle = el("button", {
      type: "button",
      class: `btn btn-small quick-toggle${isOpen ? " active" : ""}`,
      "aria-expanded": isOpen ? "true" : "false",
      "aria-controls": `quick-${student.id}`,
      title: `Enter or update ${student.name}'s scores without leaving this page`,
      onclick: () => {
        ui.openStudentId = isOpen ? null : student.id;
        ctx.rerender();
        if (!isOpen) {
          // Land the teacher on the first score box, ready to type.
          const first = document.querySelector(`#quick-${CSS.escape(student.id)} .quick-score`);
          first?.focus();
          first?.select();
        } else {
          document.querySelector(`[data-quick-toggle="${CSS.escape(student.id)}"]`)?.focus();
        }
      },
    }, isOpen ? "Close" : "Quick edit");
    toggle.dataset.quickToggle = student.id;

    const row = el("tr", {
      class: isOpen ? "is-open" : null,
      dataset: { studentId: student.id },
      ondblclick: () => ctx.openReport(student.id),
    },
      nameCell,
      el("td", { class: "num", dataset: { summaryPct: student.id } }, pctContent(pct, assessed)),
      el("td", { class: "num", dataset: { summaryAssessed: student.id } }, assessedContent(assessed)),
      el("td", { class: "num col-points", dataset: { summaryPoints: student.id } }, pointsContent(earned, possible, assessed)),
      el("td", { class: "row-actions" },
        toggle,
        el("button", {
          type: "button", class: "btn btn-small", text: "Report",
          onclick: () => ctx.openReport(student.id),
        }),
        el("button", {
          type: "button", class: "btn btn-small btn-danger", text: "Delete",
          onclick: () => {
            if (confirmAction(`Delete ${student.name} and all of their scores? This cannot be undone.`)) {
              if (ui.openStudentId === student.id) ui.openStudentId = null;
              deleteStudent(student.id);
              ctx.announce(`Deleted ${student.name}.`);
              ctx.rerender();
            }
          },
        })
      )
    );
    body.append(row);

    if (isOpen) {
      const closePanel = () => {
        ui.openStudentId = null;
        ctx.rerender();
        document.querySelector(`[data-quick-toggle="${CSS.escape(student.id)}"]`)?.focus();
      };
      const panel = renderQuickEdit(student, ui.unit, ctx, {
        onClose: closePanel,
        onUnitChange: (u) => { ui.unit = u; ctx.rerender(); },
        // Update the summary cells in place — a full re-render on every
        // keystroke would tear the input out from under the teacher.
        onScoreChange: () => updateSummary(student.id),
      });
      body.append(
        el("tr", { class: "quick-row" }, el("td", { colspan: "5", class: "quick-cell" }, panel))
      );
    }
  }

  return el("section", { class: "card" },
    el("div", { class: "table-wrap" },
      el("table", { class: "roster-table" },
        el("caption", { class: "sr-only", text: "Students, with overall progress. Double-click a row to open that student's report." }),
        el("thead",
          el("tr",
            el("th", { scope: "col", text: "Student" }),
            el("th", { scope: "col", class: "num", text: "Overall" }),
            el("th", { scope: "col", class: "num" },
              el("span", { class: "wide-only", text: "Questions assessed" }),
              el("span", { class: "narrow-only", text: "Assessed" })),
            el("th", { scope: "col", class: "num col-points", text: "Points" }),
            el("th", { scope: "col", text: "Actions" })
          )
        ),
        body
      )
    ),
    el("p", { class: "muted small", text: "Tip: Quick edit enters scores right here · click a name to rename · double-click a name or row to open the report." })
  );
}

function startRename(button, student, ctx) {
  const input = el("input", {
    type: "text", class: "input name-input", value: student.name,
    "aria-label": `Rename ${student.name}`,
  });
  const commit = () => {
    const next = input.value.trim();
    if (next && next !== student.name) {
      renameStudent(student.id, next);
      ctx.announce(`Renamed to ${next}.`);
    }
    ctx.rerender();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); ctx.rerender(); }
  });
  input.addEventListener("blur", commit);
  button.replaceWith(input);
  input.focus();
  input.select();
}

function pctContent(pct, assessed) {
  if (assessed === 0) return el("span", { class: "muted", text: "Not yet assessed" });
  const band = bandFor(pct);
  return el("span", { class: `pct band-${band.key}` }, formatPercent(pct));
}

function assessedContent(assessed) {
  return assessed === 0
    ? el("span", { class: "muted", text: "—" })
    : document.createTextNode(`${assessed} of ${QUESTIONS.length}`);
}

function pointsContent(earned, possible, assessed) {
  return assessed === 0
    ? el("span", { class: "muted", text: "—" })
    : document.createTextNode(`${round(earned)} / ${round(possible)}`);
}

/** Repaint one student's summary cells without re-rendering the table. */
function updateSummary(studentId) {
  const { earned, possible, assessed, pct } = overallFor(studentId);
  const put = (attr, node) => {
    const cell = document.querySelector(`[data-${attr}="${CSS.escape(studentId)}"]`);
    if (cell) clear(cell).append(node);
  };
  put("summary-pct", pctContent(pct, assessed));
  put("summary-assessed", assessedContent(assessed));
  put("summary-points", pointsContent(earned, possible, assessed));
}

function round(n) {
  return Math.round(n * 100) / 100;
}
