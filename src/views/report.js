/**
 * Individual Report — the screen the teacher actually hands to a parent.
 * Print-friendly: everything here is styled by the @media print block in
 * styles.css, and "Export as PDF" is window.print().
 */

import { el, clear, todayLong } from "../dom.js";
import { getState, setTeacherName } from "../state.js";
import {
  overallFor, standardsBreakdown, assessmentsBreakdown, groupByDomain,
  narrative, formatPercent, bandFor, DOUBLE_COUNT_FOOTNOTE, BANDS,
} from "../scoring.js";
import { standardChip } from "./gradebook.js";

export function renderReport(root, ctx, studentId) {
  clear(root);
  const state = getState();
  const student = state.roster.find((s) => s.id === studentId);

  if (!student) {
    root.append(el("section", { class: "card empty" },
      el("h3", { text: "Student not found" }),
      el("button", { type: "button", class: "btn btn-primary", text: "Back to roster", onclick: () => ctx.navigate("roster") })
    ));
    return;
  }

  const overall = overallFor(student.id);
  const rows = standardsBreakdown(student.id);
  const assessments = assessmentsBreakdown(student.id);
  const { strengths, focus, thinEvidence } = narrative(rows);

  // --- toolbar (hidden in print) --------------------------------------
  root.append(el("div", { class: "report-toolbar no-print" },
    el("button", { type: "button", class: "btn", text: "← Back to roster", onclick: () => ctx.navigate("roster") }),
    el("button", { type: "button", class: "btn btn-primary", text: "Export as PDF", onclick: () => window.print() })
  ));

  const teacherInput = el("input", {
    type: "text", class: "input teacher-input", id: "teacher-name",
    value: state.teacherName, placeholder: "e.g. Ms. Rivera — Room 12",
    onchange: (e) => { setTeacherName(e.target.value); ctx.rerender(); },
  });

  const report = el("article", { class: "report" },
    el("header", { class: "report-head" },
      el("h2", { class: "report-name", text: student.name }),
      el("div", { class: "report-meta" },
        el("div", { class: "print-only", text: state.teacherName || "Desmos Math · Grade 1" }),
        el("label", { class: "field no-print", for: "teacher-name" },
          el("span", { class: "field-label", text: "Class / teacher" }), teacherInput),
        el("div", { class: "muted", text: `Report generated ${todayLong()}` })
      )
    ),
    renderOverall(overall),
    renderStandards(rows, ctx),
    renderAssessments(assessments),
    renderNarrative(strengths, focus, thinEvidence),
    el("footer", { class: "report-foot" },
      el("p", { class: "footnote", text: DOUBLE_COUNT_FOOTNOTE }),
      el("p", { class: "footnote", text: "Percentages use only questions that have been scored. Questions left blank are not counted as zeros." }),
      el("p", { class: "footnote", text: "Kindergarten (K.*) standards are readiness standards the Grade 1 curriculum revisits early in the year." })
    )
  );

  root.append(report);
}

function renderOverall(overall) {
  const band = overall.assessed ? bandFor(overall.pct) : null;
  return el("section", { class: "report-section overall" },
    el("h3", { text: "Overall mastery" }),
    overall.assessed === 0
      ? el("p", { class: "big-note", text: "Not yet assessed — no scores have been entered for this student." })
      : el("div", { class: "overall-grid" },
          el("div", { class: "stat" },
            el("div", { class: `stat-value band-${band.key}`, text: formatPercent(overall.pct) }),
            el("div", { class: "stat-label", text: band.label })
          ),
          el("div", { class: "stat" },
            el("div", { class: "stat-value", text: `${round(overall.earned)} / ${round(overall.possible)}` }),
            el("div", { class: "stat-label", text: "points earned" })
          ),
          el("div", { class: "stat" },
            el("div", { class: "stat-value", text: `${overall.assessed}` }),
            el("div", { class: "stat-label", text: `of ${overall.total} questions assessed` })
          )
        )
  );
}

function renderStandards(rows, ctx) {
  const section = el("section", { class: "report-section" },
    el("h3", { text: "By standard" }),
    el("p", { class: "muted small", text: "How this student is doing on each standard they have been assessed on." })
  );

  if (!rows.length) {
    section.append(el("p", { class: "big-note", text: "No standards assessed yet." }));
    return section;
  }

  for (const domain of groupByDomain(rows)) {
    section.append(el("h4", { class: "domain-head", text: domain.label }));
    const body = el("tbody");
    for (const r of domain.items) {
      body.append(el("tr", { class: "std-row" },
        el("th", { scope: "row", class: "std-code-cell" },
          el("div", { class: "std-code-line" },
            el("span", { class: "std-code", text: r.code }),
            r.isPrerequisite ? el("span", { class: "tag", text: "K readiness" }) : null,
            el("span", { class: "no-print" }, standardChip(r.code, ctx))
          ),
          el("div", { class: "std-label", text: r.info.shortLabel }),
          el("div", { class: "std-desc", text: r.info.description })
        ),
        el("td", { class: "num", text: `${round(r.earned)} / ${round(r.possible)}` }),
        el("td", { class: "num" },
          r.possible > 0
            ? el("span", { class: `pct band-${r.band.key}`, text: formatPercent(r.pct) })
            : el("span", { class: "muted", text: "—" })
        ),
        el("td", { class: "band-cell", text: r.band.label }),
        el("td", { class: "small src-cell", text: r.assessments.join("; ") })
      ));
    }
    section.append(el("div", { class: "table-wrap" },
      el("table", { class: "std-table" },
        el("thead", el("tr",
          el("th", { scope: "col", text: "Standard" }),
          el("th", { scope: "col", class: "num", text: "Points" }),
          el("th", { scope: "col", class: "num", text: "Percent" }),
          el("th", { scope: "col", text: "Proficiency" }),
          el("th", { scope: "col", text: "Assessed on" })
        )),
        body
      )
    ));
  }
  return section;
}

function renderAssessments(rows) {
  const section = el("section", { class: "report-section" }, el("h3", { text: "By assessment" }));
  if (!rows.length) {
    section.append(el("p", { class: "big-note", text: "No assessments taken yet." }));
    return section;
  }
  const body = el("tbody");
  for (const r of rows) {
    body.append(el("tr",
      el("th", { scope: "row", text: `Unit ${r.group.unit} · ${r.group.assessment}` }),
      el("td", { class: "num", text: `${r.assessed} of ${r.total}` }),
      el("td", { class: "num", text: `${round(r.earned)} / ${round(r.possible)}` }),
      el("td", { class: "num" }, el("span", { class: `pct band-${r.band.key}`, text: formatPercent(r.pct) })),
      el("td", { text: r.band.label })
    ));
  }
  section.append(el("div", { class: "table-wrap" },
    el("table", { class: "std-table" },
      el("thead", el("tr",
        el("th", { scope: "col", text: "Assessment" }),
        el("th", { scope: "col", class: "num", text: "Questions scored" }),
        el("th", { scope: "col", class: "num", text: "Points" }),
        el("th", { scope: "col", class: "num", text: "Percent" }),
        el("th", { scope: "col", text: "Proficiency" })
      )), body)
  ));
  return section;
}

function renderNarrative(strengths, focus, thin) {
  const list = (items, empty) =>
    items.length
      ? el("ul", { class: "narrative-list" }, items.map((r) =>
          el("li", {},
            el("strong", { text: `${r.info.shortLabel} ` }),
            el("span", { class: "muted", text: `(${r.code}) ` }),
            `— ${formatPercent(r.pct)}, ${r.band.label.toLowerCase()}`
          )))
      : el("p", { class: "muted", text: empty });

  return el("section", { class: "report-section" },
    el("h3", { text: "Strengths and focus areas" }),
    el("div", { class: "two-col" },
      el("div", {},
        el("h4", { text: "Strengths" }),
        list(strengths, "No standards are at Meeting or above yet.")
      ),
      el("div", {},
        el("h4", { text: "Focus areas" }),
        list(focus, "No standards are below Meeting with enough evidence to flag.")
      )
    ),
    thin.length
      ? el("p", { class: "muted small", text: `Watching, but too little evidence to judge yet: ${thin.map((r) => r.code).join(", ")}.` })
      : null,
    el("p", { class: "muted small", text: `Bands: ${BANDS.map((b) => `${b.label} ${b.key === "support" ? "under 60%" : `${b.min}%+`}`).join(" · ")}.` })
  );
}

function round(n) {
  return Math.round(n * 100) / 100;
}
