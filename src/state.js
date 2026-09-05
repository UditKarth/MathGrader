/**
 * state.js — the single source of runtime truth, persisted to localStorage.
 *
 * Shape (see README):
 *   { version, teacherName, roster[], pointsPossible{}, scores{} }
 *
 * Two rules this module exists to protect:
 *   1. A missing score is NOT a zero. Absent keys mean "not assessed yet".
 *      Nothing in here ever writes a 0 to stand in for "no entry".
 *   2. Max points belong to the question, not the student.
 */

const STORAGE_KEY = "desmos-grader:v1";
export const STATE_VERSION = 1;
export const DEFAULT_POINTS_POSSIBLE = 1;

/** @typedef {{id:string, name:string, createdAt:string}} Student */

export function emptyState() {
  return {
    version: STATE_VERSION,
    teacherName: "",
    // When the teacher last downloaded a JSON backup. Browser storage is the
    // only copy this app has, and on GitHub Pages it lives on an origin whose
    // data can be cleared or evicted, so we track this to nudge for a backup.
    lastExportedAt: null,
    roster: [],
    pointsPossible: {},
    scores: {},
  };
}

let state = emptyState();
let storageAvailable = true;
let storageWarning = null;
const listeners = new Set();

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function safeGetStorage() {
  try {
    const probe = "__desmos_grader_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Coerce anything loaded from disk into a valid, non-lossy state object. */
export function normalizeState(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Not a state object.");
  if (raw.version !== STATE_VERSION) {
    // Only one version exists so far; this is where a migration would go.
    throw new Error(
      `Unsupported data version ${JSON.stringify(raw.version)} (expected ${STATE_VERSION}).`
    );
  }

  const roster = Array.isArray(raw.roster) ? raw.roster : [];
  const next = {
    version: STATE_VERSION,
    teacherName: typeof raw.teacherName === "string" ? raw.teacherName : "",
    lastExportedAt: typeof raw.lastExportedAt === "string" ? raw.lastExportedAt : null,
    roster: roster
      .filter((s) => s && typeof s.id === "string" && typeof s.name === "string")
      .map((s) => ({
        id: s.id,
        name: s.name,
        createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString(),
      })),
    pointsPossible: {},
    scores: {},
  };

  const pp = raw.pointsPossible && typeof raw.pointsPossible === "object" ? raw.pointsPossible : {};
  for (const [qid, v] of Object.entries(pp)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) next.pointsPossible[qid] = n;
  }

  const sc = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
  const validIds = new Set(next.roster.map((s) => s.id));
  for (const [sid, row] of Object.entries(sc)) {
    if (!validIds.has(sid) || !row || typeof row !== "object") continue;
    const clean = {};
    for (const [qid, v] of Object.entries(row)) {
      // null/undefined/"" all mean "not assessed" and are dropped, but a real 0 survives.
      if (v === null || v === undefined || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) clean[qid] = n;
    }
    if (Object.keys(clean).length) next.scores[sid] = clean;
  }
  return next;
}

export function loadState() {
  const store = safeGetStorage();
  if (!store) {
    storageAvailable = false;
    storageWarning =
      "This browser is blocking local storage (private browsing?). The app still works, but your data will be lost when you close this tab — use Export All (JSON) before you leave.";
    return state;
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw) state = normalizeState(JSON.parse(raw));
  } catch (err) {
    storageWarning = `Saved data could not be read (${err.message}). Starting with an empty gradebook; your old data has not been overwritten yet.`;
  }
  return state;
}

let saveTimer = null;
let saveStatus = "idle"; // idle | saving | saved | error

function flushSave() {
  const store = safeGetStorage();
  if (!store) {
    storageAvailable = false;
    setSaveStatus("error");
    return;
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    setSaveStatus("saved");
  } catch (err) {
    storageAvailable = false;
    storageWarning = `Could not save to this browser's storage (${err.name}). Export your data to avoid losing it.`;
    setSaveStatus("error");
    emit();
  }
}

function setSaveStatus(s) {
  saveStatus = s;
  for (const fn of saveStatusListeners) fn(s);
}

const saveStatusListeners = new Set();
export function onSaveStatus(fn) {
  saveStatusListeners.add(fn);
  fn(saveStatus);
  return () => saveStatusListeners.delete(fn);
}
export function getSaveStatus() {
  return saveStatus;
}

/** Debounced ~300ms save. */
function scheduleSave() {
  setSaveStatus("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
}

export function saveNow() {
  clearTimeout(saveTimer);
  flushSave();
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn(state);
}
function mutate(fn) {
  fn(state);
  scheduleSave();
  emit();
}

export function getState() {
  return state;
}
export function isStorageAvailable() {
  return storageAvailable;
}
export function getStorageWarning() {
  return storageWarning;
}
export function clearStorageWarning() {
  storageWarning = null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Record that the teacher just downloaded a JSON backup. */
export function markExported() {
  mutate((s) => { s.lastExportedAt = new Date().toISOString(); });
}

/** Whole days since the last JSON backup, or null if there has never been one. */
export function daysSinceExport() {
  const at = state.lastExportedAt;
  if (!at) return null;
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
}

/** True when there is real work at risk and no recent backup of it. */
export function backupIsStale(maxAgeDays = 7) {
  const hasScores = Object.values(state.scores).some((row) => Object.keys(row).length > 0);
  if (!hasScores) return false;
  const days = daysSinceExport();
  return days === null || days >= maxAgeDays;
}

export function setTeacherName(name) {
  mutate((s) => { s.teacherName = String(name); });
}

export function addStudent(name) {
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  const student = { id: newId("stu"), name: trimmed, createdAt: new Date().toISOString() };
  mutate((s) => { s.roster.push(student); });
  return student;
}

/** Add many names at once (bulk paste). Returns the students actually added. */
export function addStudents(names) {
  const added = [];
  const cleaned = names.map((n) => String(n).trim()).filter(Boolean);
  if (!cleaned.length) return added;
  mutate((s) => {
    for (const name of cleaned) {
      const student = { id: newId("stu"), name, createdAt: new Date().toISOString() };
      s.roster.push(student);
      added.push(student);
    }
  });
  return added;
}

export function renameStudent(id, name) {
  const trimmed = String(name).trim();
  if (!trimmed) return;
  mutate((s) => {
    const stu = s.roster.find((x) => x.id === id);
    if (stu) stu.name = trimmed;
  });
}

export function deleteStudent(id) {
  mutate((s) => {
    s.roster = s.roster.filter((x) => x.id !== id);
    delete s.scores[id];
  });
}

/** Points possible for a question, defaulting to 1. */
export function getPointsPossible(questionId) {
  const v = state.pointsPossible[questionId];
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_POINTS_POSSIBLE;
}

export function setPointsPossible(questionId, value) {
  const n = Number(value);
  mutate((s) => {
    if (!Number.isFinite(n) || n <= 0 || n === DEFAULT_POINTS_POSSIBLE) {
      delete s.pointsPossible[questionId]; // sparse: default stays implicit
    } else {
      s.pointsPossible[questionId] = n;
    }
  });
}

/** Earned points, or `undefined` when not assessed. Never returns 0 for blank. */
export function getScore(studentId, questionId) {
  const row = state.scores[studentId];
  if (!row) return undefined;
  const v = row[questionId];
  return Number.isFinite(v) ? v : undefined;
}

export function hasScore(studentId, questionId) {
  return getScore(studentId, questionId) !== undefined;
}

/**
 * Set or clear a score. Pass null/undefined/"" to clear it back to
 * "not assessed" — that is deliberately distinct from passing 0.
 */
export function setScore(studentId, questionId, value) {
  mutate((s) => {
    if (value === null || value === undefined || value === "") {
      if (s.scores[studentId]) {
        delete s.scores[studentId][questionId];
        if (!Object.keys(s.scores[studentId]).length) delete s.scores[studentId];
      }
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    if (!s.scores[studentId]) s.scores[studentId] = {};
    s.scores[studentId][questionId] = n;
  });
}

/** Fill a whole row of questions with full marks. */
export function markAllCorrect(studentId, questionIds) {
  mutate((s) => {
    if (!s.scores[studentId]) s.scores[studentId] = {};
    for (const qid of questionIds) {
      const max = s.pointsPossible[qid];
      s.scores[studentId][qid] =
        Number.isFinite(max) && max > 0 ? max : DEFAULT_POINTS_POSSIBLE;
    }
  });
}

/** Clear every score in a row of questions (back to not-assessed). */
export function clearRow(studentId, questionIds) {
  mutate((s) => {
    if (!s.scores[studentId]) return;
    for (const qid of questionIds) delete s.scores[studentId][qid];
    if (!Object.keys(s.scores[studentId]).length) delete s.scores[studentId];
  });
}

export function replaceState(next) {
  state = normalizeState(next);
  saveNow();
  emit();
  return state;
}

/** Merge an imported blob into the current state without dropping local work. */
export function mergeState(incoming) {
  const clean = normalizeState(incoming);
  mutate((s) => {
    const byName = new Map(s.roster.map((stu) => [stu.name.toLowerCase(), stu]));
    const idMap = new Map();
    for (const stu of clean.roster) {
      const existing = byName.get(stu.name.toLowerCase());
      if (existing) {
        idMap.set(stu.id, existing.id);
      } else {
        const copy = { ...stu };
        // Avoid colliding with an unrelated local id.
        if (s.roster.some((x) => x.id === copy.id)) copy.id = newId("stu");
        idMap.set(stu.id, copy.id);
        s.roster.push(copy);
        byName.set(copy.name.toLowerCase(), copy);
      }
    }
    Object.assign(s.pointsPossible, clean.pointsPossible);
    for (const [sid, row] of Object.entries(clean.scores)) {
      const target = idMap.get(sid) || sid;
      s.scores[target] = { ...(s.scores[target] || {}), ...row };
    }
    if (clean.teacherName && !s.teacherName) s.teacherName = clean.teacherName;
  });
  return state;
}

export function clearAll() {
  state = emptyState();
  saveNow();
  emit();
}
