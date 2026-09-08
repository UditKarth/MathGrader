/**
 * app.js — shell: navigation, data import/export, the standard-description
 * dialog, and the save indicator.
 */

import { el, clear, confirmAction, downloadBlob } from "./dom.js";
import {
  loadState, getState, subscribe, onSaveStatus, replaceState, mergeState,
  clearAll, getStorageWarning, clearStorageWarning, saveNow, STATE_VERSION,
  markExported, daysSinceExport, backupIsStale,
} from "./state.js";
import { gradebookCsv } from "./scoring.js";
import { describeStandard, isPrerequisite, DOMAINS } from "./data/standardDescriptions.js";
import { renderRoster } from "./views/roster.js";
import { renderGradebook } from "./views/gradebook.js";
import { renderReport } from "./views/report.js";
import { printAllReports, studentsWithData } from "./views/bulkPrint.js";
import { findScope, reportScopes } from "./scoring.js";

const route = { name: "roster", studentId: null };

const main = document.getElementById("main");
const liveRegion = document.getElementById("live-region");
const saveIndicator = document.getElementById("save-indicator");
const bannerHost = document.getElementById("banner-host");
const dialog = document.getElementById("standard-dialog");

const ctx = {
  rerender: render,
  navigate(name) { route.name = name; route.studentId = null; render(); focusMain(); },
  openReport(studentId) { route.name = "report"; route.studentId = studentId; render(); focusMain(); },
  announce(msg) { liveRegion.textContent = msg; },
  showStandard,
  showStandards,
  printAllReports: openBulkDialog,
};

function focusMain() {
  window.scrollTo({ top: 0 });
  main.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  syncNav();
  if (route.name === "gradebook") renderGradebook(main, ctx);
  else if (route.name === "report" && route.studentId) renderReport(main, ctx, route.studentId);
  else renderRoster(main, ctx);
}

function syncNav() {
  for (const btn of document.querySelectorAll("[data-route]")) {
    const active = btn.dataset.route === route.name ||
      (route.name === "report" && btn.dataset.route === "roster");
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-current", active ? "page" : "false");
  }
}

// ---------------------------------------------------------------------------
// Save indicator
// ---------------------------------------------------------------------------

onSaveStatus((status) => {
  const text = {
    idle: "All changes saved locally",
    saving: "Saving…",
    saved: "All changes saved locally",
    error: "Not saved — storage unavailable",
  }[status];
  saveIndicator.textContent = text;
  saveIndicator.classList.toggle("save-error", status === "error");
});

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

function showBanner(message, tone = "warn", extra = {}) {
  const banner = el("div", { class: `banner banner-${tone} ${extra.className || ""}`, role: "status" },
    el("p", {}, message,
      extra.action
        ? el("button", { type: "button", class: "linklike banner-action", text: extra.action.label, onclick: extra.action.onClick })
        : null),
    el("button", {
      type: "button", class: "btn btn-small", text: "Dismiss",
      onclick: () => { banner.remove(); extra.onDismiss ? extra.onDismiss() : clearStorageWarning(); },
    })
  );
  bannerHost.append(banner);
}

// ---------------------------------------------------------------------------
// Backup nudge
//
// Browser storage is this app's only copy. On GitHub Pages it lives on the
// shared https://<user>.github.io origin, where clearing site data — or
// Safari's eviction of script-writable storage for sites left alone for a
// while — takes the gradebook with it. So once there are real scores, we say
// so until the teacher has downloaded a backup.
// ---------------------------------------------------------------------------

let backupNudgeDismissed = false;

function backupLabel() {
  const days = daysSinceExport();
  if (days === null) return "Last backup: never";
  if (days === 0) return "Last backup: today";
  if (days === 1) return "Last backup: yesterday";
  return `Last backup: ${days} days ago`;
}

function refreshBackupLabel() {
  const node = document.getElementById("backup-status");
  if (node) node.textContent = backupLabel();
}

function maybeNudgeBackup() {
  refreshBackupLabel();
  if (backupNudgeDismissed) return;
  if (!backupIsStale()) return;
  if (document.querySelector(".banner-backup")) return;
  const days = daysSinceExport();
  showBanner(
    days === null
      ? "You have scores saved in this browser and no backup file yet. If this browser's data is cleared, they are gone. "
      : `Your last backup was ${days} days ago. `,
    "info",
    {
      className: "banner-backup",
      action: { label: "Export a backup now", onClick: () => document.getElementById("export-json").click() },
      onDismiss: () => { backupNudgeDismissed = true; },
    }
  );
}

// ---------------------------------------------------------------------------
// Standard description dialog
// ---------------------------------------------------------------------------

function standardBlock(code) {
  const info = describeStandard(code);
  return el("section", { class: "dialog-standard" },
    el("h3", { class: "dialog-title", text: info.code },
      isPrerequisite(code) ? el("span", { class: "tag", text: "Kindergarten readiness" }) : null),
    el("p", { class: "dialog-domain", text: DOMAINS[info.domain] || info.domain }),
    el("p", { class: "dialog-short", text: info.shortLabel }),
    el("p", { class: "dialog-desc", text: info.description })
  );
}

function openDialog() {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function showStandard(code) {
  clear(dialog.querySelector(".dialog-body")).append(standardBlock(code));
  openDialog();
}

/**
 * Several standards at once — a gradebook question may align to more than one,
 * and its header now opens all of them together instead of one chip at a time.
 */
function showStandards(codes, heading) {
  const body = dialog.querySelector(".dialog-body");
  clear(body).append(
    heading ? el("p", { class: "dialog-eyebrow", text: heading }) : null,
    ...codes.map(standardBlock)
  );
  openDialog();
}

dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());

// ---------------------------------------------------------------------------
// Bulk report printing
// ---------------------------------------------------------------------------

const bulkDialog = document.getElementById("bulk-dialog");
const bulkForm = document.getElementById("bulk-form");
let bulkUnit = null;

function bulkScopeFor(kind) {
  return kind === "year" ? findScope("year") : findScope(`unit-${bulkUnit}`);
}

function refreshBulkSummary() {
  const kind = bulkForm.elements["bulk-scope"].value;
  const scope = bulkScopeFor(kind);
  const includeEmpty = document.getElementById("bulk-include-empty").checked;
  const roster = getState().roster;
  const withData = studentsWithData(roster, scope);
  const count = includeEmpty ? roster.length : withData.length;

  document.getElementById("bulk-summary").textContent =
    `${count} page${count === 1 ? "" : "s"} — one per student. ` +
    `${withData.length} of ${roster.length} student${roster.length === 1 ? "" : "s"} have scores in this range.`;
  document.getElementById("bulk-confirm").disabled = count === 0;
}

function openBulkDialog(unit) {
  const roster = getState().roster;
  if (!roster.length) {
    window.alert("Add students to the roster before printing reports.");
    return;
  }
  bulkUnit = unit;
  const unitScope = findScope(`unit-${unit}`);
  document.getElementById("bulk-scope-unit").textContent = unitScope
    ? `${unitScope.label} — ${unitScope.questionIds.length} questions`
    : "This unit";
  bulkForm.elements["bulk-scope"].value = "unit";
  document.getElementById("bulk-include-empty").checked = false;
  refreshBulkSummary();
  if (typeof bulkDialog.showModal === "function") bulkDialog.showModal();
  else bulkDialog.setAttribute("open", "");
}

bulkForm.addEventListener("change", refreshBulkSummary);

bulkForm.addEventListener("submit", (e) => {
  // The dialog's returnValue is the submitter's value: cancel or print.
  if ((e.submitter && e.submitter.value) !== "print") return;
  const scope = bulkScopeFor(bulkForm.elements["bulk-scope"].value);
  const includeUnassessed = document.getElementById("bulk-include-empty").checked;
  // Let the dialog finish closing before the print dialog opens, otherwise the
  // modal is still in the layout when the browser snapshots the page.
  setTimeout(() => {
    const pages = printAllReports(scope, { includeUnassessed });
    ctx.announce(`Prepared ${pages} report page${pages === 1 ? "" : "s"} for printing.`);
  }, 50);
});

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

document.getElementById("export-json").addEventListener("click", () => {
  saveNow();
  downloadBlob(`desmos-grader-${stamp()}.json`, "application/json",
    JSON.stringify(getState(), null, 2));
  markExported();
  backupNudgeDismissed = true;   // they just did the thing we would nag about
  document.querySelector(".banner-backup")?.remove();
  refreshBackupLabel();
  ctx.announce("Exported all data as JSON. This file is your backup.");
});

document.getElementById("export-csv").addEventListener("click", () => {
  const state = getState();
  if (!state.roster.length) { ctx.announce("Nothing to export yet — add a student first."); return; }
  downloadBlob(`desmos-gradebook-${stamp()}.csv`, "text/csv;charset=utf-8",
    gradebookCsv(state.roster));
  ctx.announce("Exported the gradebook as CSV.");
});

const importInput = document.getElementById("import-file");
document.getElementById("import-json").addEventListener("click", () => importInput.click());

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    window.alert("That file is not valid JSON.");
    return;
  }
  if (parsed?.version !== STATE_VERSION) {
    window.alert(`This file says version ${JSON.stringify(parsed?.version)}, but this app reads version ${STATE_VERSION}. It was not imported.`);
    return;
  }
  const count = Array.isArray(parsed.roster) ? parsed.roster.length : 0;
  const replace = confirmAction(
    `Import ${count} student${count === 1 ? "" : "s"} from "${file.name}".\n\n` +
    `OK = REPLACE everything currently in this browser.\n` +
    `Cancel = choose merge instead.`
  );
  try {
    if (replace) {
      replaceState(parsed);
      ctx.announce("Imported and replaced all data.");
    } else {
      if (!confirmAction("Merge this file into the current gradebook instead? Students with the same name are combined, and imported scores win on conflicts.")) return;
      mergeState(parsed);
      ctx.announce("Merged the imported data.");
    }
    route.name = "roster";
    route.studentId = null;
    render();
  } catch (err) {
    window.alert(`Import failed: ${err.message}`);
  }
});

document.getElementById("clear-all").addEventListener("click", () => {
  if (!confirmAction("Delete every student and every score stored in this browser? This cannot be undone. Export first if you want a backup.")) return;
  if (!confirmAction("Really clear everything?")) return;
  clearAll();
  route.name = "roster";
  route.studentId = null;
  render();
  ctx.announce("Cleared all data.");
});

for (const btn of document.querySelectorAll("[data-route]")) {
  btn.addEventListener("click", () => ctx.navigate(btn.dataset.route));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

loadState();
const warning = getStorageWarning();
if (warning) showBanner(warning);
subscribe(refreshBackupLabel);
render();
maybeNudgeBackup();
