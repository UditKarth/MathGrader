#!/usr/bin/env node
/**
 * check-deploy.mjs — assert this repo is safe to serve from GitHub Pages.
 *   node tools/check-deploy.mjs
 *
 * Pages is a static, case-sensitive, subpath-hosted environment. The failures
 * it produces are silent and only happen in production, so we check for them
 * here instead of finding out after deploying:
 *
 *   - Case-sensitive paths. macOS is case-insensitive, so `./Src/App.js`
 *     resolves locally and 404s on Pages. Every path is compared against the
 *     real directory entry, not just existsSync.
 *   - Root-relative paths (`/src/app.js`), which break under the repo subpath
 *     https://user.github.io/<repo>/.
 *   - Absolute URLs / CDN references, which break the offline requirement.
 *   - runtime fetch(), which we deliberately avoid.
 *   - A missing .nojekyll, which makes Pages skip underscore-prefixed paths.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve, relative, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
const notes = [];
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures.push(label);
};

/** Walk the shipped app (everything the browser can request). */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

/**
 * Resolve a relative reference the way a browser would, and confirm every path
 * segment matches the real filesystem entry EXACTLY (case included).
 */
function resolveExact(fromFile, ref) {
  const target = resolve(dirname(fromFile), ref);
  const rel = relative(ROOT, target);
  if (rel.startsWith("..")) return { ok: false, reason: "escapes the repo root" };

  let cursor = ROOT;
  for (const segment of rel.split(/[\\/]/)) {
    if (!segment) continue;
    const entries = readdirSync(cursor);
    if (!entries.includes(segment)) {
      const insensitive = entries.find((e) => e.toLowerCase() === segment.toLowerCase());
      return {
        ok: false,
        reason: insensitive
          ? `case mismatch: referenced "${segment}", on disk it is "${insensitive}" (works on macOS, 404s on Pages)`
          : `no such file: ${segment}`,
      };
    }
    cursor = join(cursor, segment);
  }
  return { ok: true, path: cursor };
}

const files = walk(ROOT);
const jsFiles = files.filter((f) => f.endsWith(".js") && relative(ROOT, f).startsWith("src"));
const htmlFiles = files.filter((f) => f.endsWith(".html"));

// --- 1. Every import/href/src resolves, with exact case ---------------------
const IMPORT_RE = /(?:^|[\s;])(?:import|export)[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const HTML_REF_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/g;

const refs = [];
for (const file of jsFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    if (spec) refs.push({ file, spec });
  }
}
for (const file of htmlFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(HTML_REF_RE)) refs.push({ file, spec: m[1] });
}

const localRefs = refs.filter(
  ({ spec }) => !/^(https?:)?\/\//.test(spec) && !spec.startsWith("data:") && !spec.startsWith("#")
);

const broken = [];
for (const { file, spec } of localRefs) {
  const r = resolveExact(file, spec);
  if (!r.ok) broken.push(`${relative(ROOT, file)} -> "${spec}" (${r.reason})`);
}
ok(
  `every local reference resolves with exact case (${localRefs.length} checked)`,
  broken.length === 0,
  broken.join("; ")
);

// --- 2. No root-relative paths ---------------------------------------------
const rootRelative = localRefs.filter(({ spec }) => spec.startsWith("/"));
ok(
  "no root-relative paths (they break under the /<repo>/ subpath)",
  rootRelative.length === 0,
  rootRelative.map((r) => `${relative(ROOT, r.file)} -> ${r.spec}`).join("; ")
);

// --- 3. No external/CDN references -----------------------------------------
const external = refs.filter(({ spec }) => /^(https?:)?\/\//.test(spec));
ok(
  "no external or CDN references (app must work offline)",
  external.length === 0,
  external.map((r) => r.spec).join("; ")
);

// --- 4. No runtime fetch/XHR -----------------------------------------------
const fetchers = [];
for (const file of [...jsFiles, ...htmlFiles]) {
  const text = readFileSync(file, "utf8");
  // Ignore the word inside comments explaining why we don't use it.
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/\bfetch\s*\(|XMLHttpRequest/.test(stripped)) fetchers.push(relative(ROOT, file));
}
ok(
  "no runtime fetch()/XHR (would break on file:// and subpaths)",
  fetchers.length === 0,
  fetchers.join(", ")
);

// --- 5. Pages hygiene -------------------------------------------------------
ok(".nojekyll present", existsSync(join(ROOT, ".nojekyll")));
ok("index.html present at repo root", existsSync(join(ROOT, "index.html")));

// --- 6. The generated data module is committed and current ------------------
const dataPath = join(ROOT, "src", "data", "standards.js");
ok("generated src/data/standards.js is committed", existsSync(dataPath));
if (existsSync(dataPath)) {
  const csv = statSync(join(ROOT, "Grade 1 Standards.csv")).mtimeMs;
  const gen = statSync(dataPath).mtimeMs;
  if (csv > gen) {
    notes.push("Grade 1 Standards.csv is newer than src/data/standards.js — re-run node tools/build-data.mjs");
  }
}

// --- 7. No exported student data staged for commit --------------------------
const dataLeaks = files
  .map((f) => relative(ROOT, f))
  .filter((f) => /^desmos-(grader|gradebook)-.*\.(json|csv)$/.test(f));
ok(
  "no exported student data in the repo",
  dataLeaks.length === 0,
  dataLeaks.join(", ")
);

// --- 8. Case-collision check (two files differing only by case) -------------
const byLower = new Map();
for (const f of files) {
  const key = relative(ROOT, f).toLowerCase();
  byLower.set(key, [...(byLower.get(key) || []), relative(ROOT, f)]);
}
const collisions = [...byLower.values()].filter((v) => v.length > 1);
ok("no filenames differing only by case", collisions.length === 0, collisions.map((c) => c.join(" vs ")).join("; "));

for (const n of notes) console.log(`NOTE  ${n}`);
console.log(failures.length ? `\n${failures.length} check(s) FAILED` : "\nDeploy checks passed.");
process.exit(failures.length ? 1 : 0);
