/** Home / Roster screen. */

import { el, clear, confirmAction } from "../dom.js";
import {
  getState, addStudent, addStudents, renameStudent, deleteStudent,
} from "../state.js";
import { overallFor, formatPercent, bandFor } from "../scoring.js";
import { QUESTIONS } from "../data/standards.js";

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
      el("p", { class: "muted", text: `${state.roster.length} student${state.roster.length === 1 ? "" : "s"} · ${QUESTIONS.length} questions across 7 units` })
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
      text: "This app turns raw Desmos Math assessment scores into a per-standard report for each first grader — the view you actually need for report cards and conferences.",
    }),
    el("ol", { class: "steps" },
      el("li", { text: "Add your students above (or paste the whole roster)." }),
      el("li", { text: "Open the Gradebook, pick a unit and assessment, and type the scores." }),
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

    const row = el("tr", {
      dataset: { studentId: student.id },
      ondblclick: () => ctx.openReport(student.id),
    },
      nameCell,
      el("td", { class: "num" },
        assessed === 0
          ? el("span", { class: "muted", text: "Not yet assessed" })
          : el("span", { class: `pct band-${band.key}` }, formatPercent(pct))
      ),
      el("td", { class: "num" },
        assessed === 0 ? el("span", { class: "muted", text: "—" }) : `${assessed} of ${QUESTIONS.length}`
      ),
      el("td", { class: "num" },
        assessed === 0 ? el("span", { class: "muted", text: "—" }) : `${round(earned)} / ${round(possible)}`
      ),
      el("td", { class: "row-actions" },
        el("button", {
          type: "button", class: "btn btn-small", text: "Report",
          onclick: () => ctx.openReport(student.id),
        }),
        el("button", {
          type: "button", class: "btn btn-small btn-danger", text: "Delete",
          onclick: () => {
            if (confirmAction(`Delete ${student.name} and all of their scores? This cannot be undone.`)) {
              deleteStudent(student.id);
              ctx.announce(`Deleted ${student.name}.`);
              ctx.rerender();
            }
          },
        })
      )
    );
    body.append(row);
  }

  return el("section", { class: "card" },
    el("div", { class: "table-wrap" },
      el("table", { class: "roster-table" },
        el("caption", { class: "sr-only", text: "Students, with overall progress. Double-click a row to open that student's report." }),
        el("thead",
          el("tr",
            el("th", { scope: "col", text: "Student" }),
            el("th", { scope: "col", class: "num", text: "Overall" }),
            el("th", { scope: "col", class: "num", text: "Questions assessed" }),
            el("th", { scope: "col", class: "num", text: "Points" }),
            el("th", { scope: "col", text: "Actions" })
          )
        ),
        body
      )
    ),
    el("p", { class: "muted small", text: "Tip: click a name to rename, double-click a name or row to open the report." })
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

function round(n) {
  return Math.round(n * 100) / 100;
}
