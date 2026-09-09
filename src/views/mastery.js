/**
 * Mastery bar and scale legend.
 *
 * The fill is coloured on a grey -> red -> green ramp (see masteryHue), and
 * its LENGTH carries the same information as its colour — so the bar still
 * reads correctly in greyscale, on a black-and-white printout, or to someone
 * who cannot distinguish red from green. The band label always appears in text
 * beside it; colour is never the only signal.
 */

import { el } from "../dom.js";
import { masteryHue, bandFor, formatPercent, BANDS, bandRange } from "../scoring.js";

/**
 * @param {number|null} pct
 * @param {{width?:string, showLabel?:boolean}} [opts]
 */
export function masteryBar(pct, opts = {}) {
  const assessed = pct !== null && pct !== undefined && Number.isFinite(pct);
  const hue = masteryHue(pct);
  const band = bandFor(pct);

  const fill = el("span", {
    class: `mastery-fill${assessed ? "" : " is-empty"}`,
    style: assessed
      ? `width:${Math.max(2, Math.min(100, pct))}%;--mastery-hue:${hue.toFixed(1)}`
      : "width:100%",
  });

  const bar = el("span", {
    class: "mastery-bar",
    role: "img",
    "aria-label": assessed
      ? `${formatPercent(pct)}, ${band.label}`
      : "Not yet assessed",
    title: assessed ? `${formatPercent(pct)} · ${band.label}` : "Not yet assessed",
  }, fill);

  if (!opts.showLabel) return bar;

  return el("span", { class: "mastery-with-label" },
    bar,
    el("span", { class: "mastery-label", text: assessed ? band.label : "Not yet assessed" })
  );
}

/**
 * The legend that explains the ramp. Printed on the report so a parent reading
 * it on paper knows what the colours mean.
 */
export function masteryScale() {
  return el("div", { class: "mastery-scale" },
    el("span", { class: "mastery-scale-end muted small", text: "Not assessed" }),
    el("span", { class: "mastery-swatch is-empty", "aria-hidden": "true" }),
    el("span", { class: "mastery-scale-track", "aria-hidden": "true" }),
    el("ul", { class: "mastery-scale-keys" },
      BANDS.slice().reverse().map((b) => {
        // Colour each key at the midpoint of its band so the swatch matches
        // what a score in that band actually looks like.
        const upper = BANDS.slice().reverse().find((x) => x.min > b.min);
        const mid = (b.min + (upper ? upper.min : 100)) / 2;
        return el("li", {},
          el("span", {
            class: "mastery-swatch",
            style: `--mastery-hue:${masteryHue(mid).toFixed(1)}`,
            "aria-hidden": "true",
          }),
          el("span", { class: "small", text: `${b.label} ${bandRange(b)}` })
        );
      })
    )
  );
}
