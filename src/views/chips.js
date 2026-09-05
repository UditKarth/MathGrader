/** Shared standard chip: the code, plus a `?` that reveals its description. */

import { el } from "../dom.js";

export function standardChip(code, ctx) {
  return el("button", {
    type: "button", class: "chip",
    "aria-label": `Standard ${code}. Show description.`,
    onclick: (e) => { e.stopPropagation(); ctx.showStandard(code); },
  },
    el("span", { class: "chip-code", text: code }),
    el("span", { class: "chip-q", "aria-hidden": "true", text: "?" })
  );
}
