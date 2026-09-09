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
  reportScopes, findScope, defaultScopeKey, bandRange, TARGET_BAND,
} from "../scoring.js";
import { standardChip } from "./chips.js";
import { masteryBar, masteryScale } from "./mastery.js";

/**
 * Which scope the report is showing, and who it was chosen for. A report is
 * usually run at the end of a unit, so we default to a unit rather than the
 * whole year — the last unit this student has scores in.
 */
const ui = { scopeKey: null, forStudent: null };

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

  // Pick a sensible scope the first time we render this student.
  if (ui.forStudent !== student.id || !findScope(ui.scopeKey)) {
    ui.forStudent = student.id;
    ui.scopeKey = defaultScopeKey(student.id);
  }
  const scope = findScope(ui.scopeKey);

  const overall = overallFor(student.id, scope.questionIds);
  const rows = standardsBreakdown(student.id, scope.questionIds);
  const assessments = assessmentsBreakdown(student.id, scope.unit);
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
      el("p", { class: "report-scope-title", text: scope.title }),
      el("div", { class: "report-meta" },
        el("div", { class: "print-only", text: state.teacherName || "Desmos Math · Grade 1" }),
        el("label", { class: "field no-print", for: "teacher-name" },
          el("span", { class: "field-label", text: "Class / teacher" }), teacherInput),
        el("div", { class: "muted", text: `Report generated ${todayLong()}` })
      )
    ),
    renderScopeToggle(scope, student, ctx),
    renderOverall(overall),
    renderStandards(rows, ctx),
    renderAssessments(assessments),
    renderNarrative(strengths, focus, thinEvidence),
    el("footer", { class: "report-foot" },
      el("p", { class: "footnote", text: DOUBLE_COUNT_FOOTNOTE }),
      el("p", { class: "footnote", text: "Percentages use only questions that have been scored. Questions left blank are not counted as zeros." }),
      el("p", { class: "footnote",
        text: scope.type === "unit"
          ? `Covers the Unit ${scope.unit} End Unit Assessment only. Other units are not included in these totals.`
          : "Covers all End Unit Assessments across the year." }),
      // Only worth explaining when a K standard actually appears on this report.
      rows.some((r) => r.isPrerequisite)
        ? el("p", { class: "footnote", text: "Kindergarten (K.*) standards are readiness standards the Grade 1 curriculum revisits early in the year." })
        : null
    )
  );

  root.append(report);
}

/**
 * End-of-unit vs end-of-year. Hidden in print — the chosen scope is stated in
 * the report heading instead, so a printed page always says what it covers.
 */
function renderScopeToggle(scope, student, ctx) {
  return el("section", { class: "scope-toggle no-print", role: "group", "aria-label": "Report covers" },
    el("span", { class: "field-label", text: "Report covers" }),
    el("div", { class: "scope-pills" },
      reportScopes().map((s) => {
        const t = overallFor(student.id, s.questionIds);
        return el("button", {
          type: "button",
          class: `unit-pill${s.key === scope.key ? " active" : ""}${s.type === "year" ? " is-year" : ""}`,
          "aria-pressed": s.key === scope.key ? "true" : "false",
          title: t.assessed
            ? `${s.label}: ${t.assessed} of ${t.total} questions scored`
            : `${s.label}: nothing entered yet`,
          onclick: () => { ui.scopeKey = s.key; ctx.rerender(); },
        },
          s.shortLabel,
          t.assessed ? el("span", { class: "pill-dot", "aria-hidden": "true" }) : null
        );
      })
    )
  );
}

function renderOverall(overall) {
  const band = overall.assessed ? bandFor(overall.pct) : null;
  return el("section", { class: "report-section overall" },
    el("h3", { text: "Overall mastery" }),
    overall.assessed === 0
      ? el("p", { class: "big-note", text: "Not yet assessed — no scores have been entered for this student." })
      : el("div", { class: "overall-grid" },
          el("div", { class: "stat stat-main" },
            el("div", { class: `stat-value band-${band.key}`, text: formatPercent(overall.pct) }),
            el("div", { class: "stat-label", text: band.label }),
            masteryBar(overall.pct)
          ),
          el("div", { class: "stat" },
            el("div", { class: "stat-value", text: `${round(overall.earned)} / ${round(overall.possible)}` }),
            el("div", { class: "stat-label", text: "points earned" })
          ),
          el("div", { class: "stat" },
            el("div", { class: "stat-value", text: `${overall.assessed}` }),
            el("div", { class: "stat-label", text: `of ${overall.total} questions assessed` })
          )
        ),
    overall.assessed ? masteryScale() : null
  );
}

function renderStandards(rows, ctx) {
  const section = el("section", { class: "report-section" },
    el("h3", { text: "By standard" }),
    el("p", { class: "muted small", text: "How this student is doing on each standard covered by this report." })
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
        el("td", { class: "std-bar" }, masteryBar(r.possible > 0 ? r.pct : null)),
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
          el("th", { scope: "col", text: "Mastery" }),
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
      el("td", { class: "std-bar" }, masteryBar(r.pct)),
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
        el("th", { scope: "col", text: "Mastery" }),
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
        list(strengths, `No standards are at ${TARGET_BAND.label} or above yet.`)
      ),
      el("div", {},
        el("h4", { text: "Focus areas" }),
        list(focus, `No standards are below ${TARGET_BAND.label} with enough evidence to flag.`)
      )
    ),
    thin.length
      ? el("p", { class: "muted small", text: `Watching, but too little evidence to judge yet: ${thin.map((r) => r.code).join(", ")}.` })
      : null,
    el("p", { class: "muted small", text: `Bands: ${BANDS.map((b) => `${b.label} ${bandRange(b)}`).join(" · ")}.` })
  );
}

function round(n) {
  return Math.round(n * 100) / 100;
}
