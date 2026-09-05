/** Tiny DOM helpers — keeps the views readable without a framework. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  // Allow el("thead", el("tr", ...)) — a node/string/array in the props slot
  // is a child, not a property bag.
  if (props instanceof Node || Array.isArray(props) || typeof props === "string" || typeof props === "number") {
    children.unshift(props);
    props = {};
  }
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k in node && k !== "list" && k !== "type" && k !== "size") node[k] = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Accessible confirm — uses native confirm(), which is keyboard-operable. */
export function confirmAction(message) {
  return window.confirm(message);
}

export function downloadBlob(filename, mime, contents) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayLong() {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}
