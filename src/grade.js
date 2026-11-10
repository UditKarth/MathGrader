/**
 * grade.js — which grade this browser is grading, decided once at startup.
 *
 * A teacher picks Kindergarten or Grade 1 the first time they open the app.
 * The choice is remembered in this browser, so every later visit opens
 * straight into that grade's class with nothing to click. Each grade keeps
 * its own roster and scores under its own storage key, so a Kindergarten
 * teacher never sees Grade 1 data and vice versa.
 *
 * This module has no imports and runs before any data module, because the
 * rest of the app reads the chosen grade's questions at load time. That is
 * also why switching grade reloads the page instead of re-rendering.
 */

/**
 * @typedef {{id:"1"|"K", rank:number, label:string, appTitle:string,
 *   studentNoun:string, storageKey:string, fileTag:string, domainOrder:string[]}} Grade
 */

/** @type {Record<string, Grade>} */
export const GRADES = {
  K: {
    id: "K",
    rank: 0,
    label: "Kindergarten",
    appTitle: "Kindergarten Standards Grader",
    studentNoun: "kindergartner",
    storageKey: "desmos-grader:k:v1",
    fileTag: "kindergarten",
    // Counting & Cardinality is the heart of Kindergarten, so it leads.
    domainOrder: ["CC", "OA", "NBT", "MD", "G"],
  },
  1: {
    id: "1",
    rank: 1,
    label: "Grade 1",
    appTitle: "Grade 1 Standards Grader",
    studentNoun: "first grader",
    // The original key from before Kindergarten existed — kept so existing
    // Grade 1 teachers keep their data without any migration.
    storageKey: "desmos-grader:v1",
    fileTag: "grade1",
    domainOrder: ["OA", "NBT", "MD", "G", "CC"],
  },
};

/** Display order for the grade picker. */
export const GRADE_IDS = ["K", "1"];

const CHOICE_KEY = "desmos-grader:grade";

function storage() {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function readChoice() {
  // The check scripts in tools/ pick a grade this way.
  const env = globalThis.process?.env?.MATHGRADER_GRADE;
  if (env && GRADES[env]) return env;

  // Fallback for browsers that block storage (private windows): the choice
  // rides in the address instead, so picking a grade still works.
  try {
    const fromUrl = new URLSearchParams(globalThis.location?.search || "").get("grade");
    if (fromUrl && GRADES[fromUrl.toUpperCase()]) return fromUrl.toUpperCase();
  } catch { /* no location outside a browser */ }

  const store = storage();
  if (!store) return null;
  try {
    const saved = store.getItem(CHOICE_KEY);
    if (saved && GRADES[saved]) return saved;
    // Someone who used the app before it supported Kindergarten has Grade 1
    // data saved and no choice recorded. They are a Grade 1 teacher; don't
    // make them answer a question about it.
    if (store.getItem(GRADES[1].storageKey)) {
      store.setItem(CHOICE_KEY, "1");
      return "1";
    }
  } catch { /* storage blocked mid-read */ }
  return null;
}

/** The grade the teacher picked, or null if they have never picked one. */
export const CHOSEN_GRADE_ID = readChoice();

/** The grade the app runs as. Before a choice is made this is a placeholder. */
export const GRADE = GRADES[CHOSEN_GRADE_ID || "1"];

/** Look up a grade by the id stored in a backup file. Old files have none: Grade 1. */
export function gradeOf(id) {
  return GRADES[id ?? "1"] || null;
}

/** Remember a grade for this browser and reopen the app in it. */
export function chooseGrade(id) {
  if (!GRADES[id]) return;
  let saved = false;
  const store = storage();
  try {
    if (store) { store.setItem(CHOICE_KEY, id); saved = store.getItem(CHOICE_KEY) === id; }
  } catch { /* fall through to the URL */ }

  const url = new URL(window.location.href);
  if (saved) url.searchParams.delete("grade");
  else url.searchParams.set("grade", id);
  // assign() rather than reload(): the address may have changed.
  window.location.assign(url.toString());
}
