/**
 * Bulk report printing — every student's report in a single print job.
 *
 * A browser cannot write several files from one print action: window.print()
 * produces one document. So "a report for every student" is one print job with
 * a page break between students, which the teacher saves as a single PDF or
 * sends straight to a printer. Doing it any other way would mean either N
 * print dialogs or a JS PDF library, and the whole app is deliberately
 * dependency-free.
 *
 * The pages are built by buildReportArticle() in report.js — the very same
 * function that draws the on-screen report. This file used to render its own
 * condensed variant, which drifted out of step and quietly shipped printed
 * reports missing the "By assessment" section, the standard descriptions and
 * "Assessed on" column, the mastery legend, and three footnotes. Sharing one
 * builder is what stops that happening again, so resist adding report markup
 * here: put it in buildReportArticle and both paths get it.
 */

import { el, clear } from "../dom.js";
import { getState } from "../state.js";
import { overallFor } from "../scoring.js";
import { buildReportArticle } from "./report.js";

/** Students with at least one score inside this scope. */
export function studentsWithData(roster, scope) {
  return roster.filter((s) => overallFor(s.id, scope.questionIds).assessed > 0);
}

/** One student's page: the shared report, wrapped as a print page unit. */
function reportPage(student, scope, state) {
  return el("div", { class: "bulk-report" },
    buildReportArticle(student, scope, state, null, { interactive: false })
  );
}

/**
 * Fill the print sheet and open the print dialog.
 * @returns {number} how many pages were queued
 */
export function printAllReports(scope, { includeUnassessed = false, compact = false } = {}) {
  const state = getState();
  const roster = includeUnassessed ? state.roster : studentsWithData(state.roster, scope);
  if (!roster.length) return 0;

  const sheet = document.getElementById("bulk-print");
  clear(sheet);
  // Compact is purely presentational: the SAME markup with the per-standard
  // descriptions and the "Assessed on" column hidden in print. It is not a
  // second renderer — that is exactly the mistake this file used to make.
  sheet.classList.toggle("compact", compact);
  for (const student of roster) sheet.append(reportPage(student, scope, state));

  document.body.classList.add("bulk-printing");

  const cleanup = () => {
    document.body.classList.remove("bulk-printing");
    sheet.classList.remove("compact");
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
export function buildSheetForTest(scope, { includeUnassessed = false, compact = false } = {}) {
  const state = getState();
  const roster = includeUnassessed ? state.roster : studentsWithData(state.roster, scope);
  const sheet = document.getElementById("bulk-print");
  clear(sheet);
  sheet.classList.toggle("compact", compact);
  for (const student of roster) sheet.append(reportPage(student, scope, state));
  return roster.length;
}
