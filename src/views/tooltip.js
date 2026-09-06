/**
 * A small hover/focus tooltip.
 *
 * Why not CSS-only: the gradebook lives inside `.grid-scroll`, which is an
 * overflow:auto container. Anything positioned inside it gets clipped at the
 * scroll edges, which is exactly where the interesting columns are. So the
 * tooltip is a single position:fixed node parked on <body> and moved into
 * place, escaping the clip entirely.
 *
 * It shows on hover AND on keyboard focus, so it is not a mouse-only feature.
 */

import { el } from "../dom.js";

let node = null;
let current = null;

function ensureNode() {
  if (!node) {
    node = el("div", { class: "tooltip", role: "tooltip", hidden: true });
    document.body.append(node);
  }
  return node;
}

function place(target) {
  const tip = ensureNode();
  const t = target.getBoundingClientRect();
  const r = tip.getBoundingClientRect();
  const margin = 8;

  // Prefer below; flip above when there is not room.
  let top = t.bottom + 6;
  if (top + r.height > window.innerHeight - margin) top = t.top - r.height - 6;
  top = Math.max(margin, top);

  // Centre on the target, then clamp inside the viewport.
  let left = t.left + t.width / 2 - r.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - r.width - margin));

  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
}

export function hideTooltip() {
  if (!node) return;
  node.hidden = true;
  current = null;
}

function show(target, build) {
  const tip = ensureNode();
  tip.replaceChildren(build());
  tip.hidden = false;
  current = target;
  place(target);
}

/**
 * @param {HTMLElement} target
 * @param {() => Node} build returns the tooltip's contents
 */
export function attachTooltip(target, build) {
  target.addEventListener("mouseenter", () => show(target, build));
  target.addEventListener("focus", () => show(target, build));
  target.addEventListener("mouseleave", () => { if (current === target) hideTooltip(); });
  target.addEventListener("blur", () => { if (current === target) hideTooltip(); });
  target.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTooltip(); });
}

/**
 * Follow the anchor while scrolling rather than hiding outright.
 *
 * A fixed-position tooltip does not move with its anchor, so any scroll — the
 * page, or the grid on a narrow screen — would otherwise leave it stranded.
 * Repositioning keeps it glued to its column; it still closes once the anchor
 * leaves the viewport, so it can never float over unrelated content.
 */
function followAnchor() {
  if (!node || node.hidden || !current) return;
  if (!current.isConnected) { hideTooltip(); return; }
  const r = current.getBoundingClientRect();
  const offscreen = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
  if (offscreen) hideTooltip();
  else place(current);
}

addEventListener("scroll", followAnchor, true);
addEventListener("resize", hideTooltip);
