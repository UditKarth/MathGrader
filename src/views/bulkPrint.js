/**
 * Bulk report printing — one page per student, in a single print job.
 *
 * A browser cannot write several files from one print action: window.print()
 * produces one document. So "a report for every student" is one print job
 * whose pages are one-per-student, which the teacher saves as a single PDF or
 * sends straight to a printer. Doing it any other way would mean either N
 * print dialogs or a JS PDF library, and the whole app is deliberately
 * dependency-free.
 *
 * The layout here is deliberately NOT the on-screen individual report. That
 * one carries a full plain-English sentence per standard and runs to two pages
 * for a full-year scope. This is a condensed variant — short labels instead of
 * sentences, no "assessed on" column — so a page holds every standard even at
 * full-year scope. tools/check-print.mjs guards the one-page promise.
 */

import { el, clear, todayLong } from "../dom.js";
import { getState } from "../state.js";
import {
  overallFor, standardsBreakdown, groupByDomain, narrative,
  formatPercent, bandFor, DOUBLE_COUNT_FOOTNOTE,
} from "../scoring.js";
import { masteryBar } from "./mastery.js";

/** Students with at least one score inside this scope. */
export function studentsWithData(roster, scope) {
  return roster.filter((s) => overallFor(s.id, scope.questionIds).assessed > 0);
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/** One student, condensed to a single page. */
function onePageReport(student, scope, teacherName) {
  const overall = overallFor(student.id, scope.questionIds);
  const rows = standardsBreakdown(student.id, scope.questionIds);
  const { strengths, focus } = narrative(rows);
  const band = overall.assessed ? bandFor(overall.pct) : null;

  const page = el("article", { class: "bulk-report" });

  page.append(
    el("header", { class: "bulk-head" },
      el("div", { class: "bulk-titles" },
        el("h2", { class: "bulk-name", text: student.name }),
        el("p", { class: "bulk-scope", text: scope.title })
      ),
      el("div", { class: "bulk-meta" },
        el("div", { text: teacherName || "Desmos Math · Grade 1" }),
        el("div", { text: todayLong() })
      )
    )
  );

  if (overall.assessed === 0) {
    page.append(el("p", { class: "bulk-empty", text: "No scores have been entered for this student in this report's range." }));
    return page;
  }

  page.append(
    el("section", { class: "bulk-overall" },
      el("div", { class: "bulk-stat" },
        el("span", { class: "bulk-pct", text: formatPercent(overall.pct) }),
        el("span", { class: "bulk-band", text: band.label })
      ),
      el("div", { class: "bulk-stat-meta" },
        el("div", { text: `${round(overall.earned)} of ${round(overall.possible)} points` }),
        el("div", { text: `${overall.assessed} of ${overall.total} questions assessed` })
      ),
      el("div", { class: "bulk-overall-bar" }, masteryBar(overall.pct))
    )
  );

  // By standard, grouped by domain, one compact row each.
  const body = el("tbody");
  for (const domain of groupByDomain(rows)) {
    body.append(el("tr", { class: "bulk-domain-row" },
      el("th", { colspan: "5", scope: "colgroup", text: domain.label })));
    for (const r of domain.items) {
      body.append(el("tr", { class: "bulk-std-row" },
        el("th", { scope: "row" },
          el("span", { class: "bulk-code", text: r.code }),
          r.isPrerequisite ? el("span", { class: "bulk-tag", text: "K" }) : null,
          el("span", { class: "bulk-label", text: r.info.shortLabel })
        ),
        el("td", { class: "num", text: `${round(r.earned)}/${round(r.possible)}` }),
        el("td", { class: "num", text: formatPercent(r.pct) }),
        el("td", { class: "bulk-bar-cell" }, masteryBar(r.pct)),
        el("td", { class: "bulk-band-cell", text: r.band.label })
      ));
    }
  }

  page.append(
    el("section", { class: "bulk-standards" },
      el("h3", { text: "By standard" }),
      el("table", { class: "bulk-table" },
        el("thead", el("tr",
          el("th", { scope: "col", text: "Standard" }),
          el("th", { scope: "col", class: "num", text: "Points" }),
          el("th", { scope: "col", class: "num", text: "%" }),
          el("th", { scope: "col", text: "Mastery" }),
          el("th", { scope: "col", text: "Proficiency" })
        )),
        body
      )
    )
  );

  const names = (list) => list.map((r) => `${r.info.shortLabel} (${r.code})`).join("; ");
  page.append(
    el("section", { class: "bulk-narrative" },
      el("p", {}, el("strong", { text: "Strengths: " }),
        strengths.length ? names(strengths.slice(0, 3)) : "None at Meeting or above yet."),
      el("p", {}, el("strong", { text: "Focus areas: " }),
        focus.length ? names(focus.slice(0, 3)) : "None below Meeting with enough evidence to flag.")
    ),
    el("footer", { class: "bulk-foot" },
      el("p", { text: DOUBLE_COUNT_FOOTNOTE }),
      el("p", { text: "Percentages use only questions that have been scored; blank questions are not counted as zeros." })
    )
  );

  return page;
}

/**
 * Fill the print sheet and open the print dialog.
 * @returns {number} how many pages were queued
 */
export function printAllReports(scope, { includeUnassessed = false } = {}) {
  const state = getState();
  const roster = includeUnassessed ? state.roster : studentsWithData(state.roster, scope);
  if (!roster.length) return 0;

  const sheet = document.getElementById("bulk-print");
  clear(sheet);
  for (const student of roster) {
    sheet.append(onePageReport(student, scope, state.teacherName));
  }

  document.body.classList.add("bulk-printing");

  const cleanup = () => {
    document.body.classList.remove("bulk-printing");
    clear(sheet);
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Safari has historically not fired afterprint reliably; a timed sweep means
  // the app can never be left stuck in the printing state.
  setTimeout(() => { if (document.body.classList.contains("bulk-printing")) cleanup(); }, 60000);

  window.print();
  return roster.length;
}

/** Build the sheet without printing — used by the one-page check. */
export function buildSheetForTest(scope, { includeUnassessed = false } = {}) {
  const state = getState();
  const roster = includeUnassessed ? state.roster : studentsWithData(state.roster, scope);
  const sheet = document.getElementById("bulk-print");
  clear(sheet);
  for (const student of roster) sheet.append(onePageReport(student, scope, state.teacherName));
  return roster.length;
}
