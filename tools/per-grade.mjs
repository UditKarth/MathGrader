/**
 * per-grade.mjs — run a check script once for each grade.
 *
 * The app reads its grade once at startup (src/grade.js), so a script can only
 * see one grade per process. Called at the top of a check with no
 * MATHGRADER_GRADE set, this re-runs that script for every grade in a child
 * process and exits with the combined result. In the child it returns the
 * grade id and the script carries on.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GRADE_IDS = ["1", "K"];

export function perGrade(scriptUrl) {
  const current = process.env.MATHGRADER_GRADE;
  if (current) {
    console.log(`\n=== ${current === "K" ? "Kindergarten" : `Grade ${current}`} ===\n`);
    return current;
  }
  let failed = 0;
  for (const id of GRADE_IDS) {
    const r = spawnSync(process.execPath, [fileURLToPath(scriptUrl)], {
      env: { ...process.env, MATHGRADER_GRADE: id },
      stdio: "inherit",
    });
    if (r.status !== 0) failed++;
  }
  console.log(failed ? `\n${failed} grade(s) FAILED` : `\nPassed for every grade (${GRADE_IDS.join(", ")}).`);
  process.exit(failed ? 1 : 0);
}
