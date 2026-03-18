// app/ui/shortcutsOverlay.js
// Press "?" to toggle a keyboard shortcuts cheat sheet overlay.

export function initShortcutsOverlay() {
  const shortcuts = [
    { key: "D",      desc: "Draw tool" },
    { key: "E",      desc: "Erase tool" },
    { key: "F",      desc: "Fill tool" },
    { key: "U",      desc: "Unfill tool" },
    { key: "S",      desc: "Stamp tool" },
    { key: "Z",      desc: "Undo" },
    { key: "Y",      desc: "Redo" },
    { key: "Del / ⌫", desc: "Delete selected stamp" },
    { key: "?",      desc: "Toggle this cheat sheet" },
    { key: "[ ]",    desc: "Decrease / Increase brush size" },
  ];

  // Create overlay DOM
  const overlay = document.createElement("div");
  overlay.id = "shortcuts-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.62);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    background: linear-gradient(160deg, #241a14 0%, #140f0c 100%);
    border: 1px solid rgba(214,168,75,0.35);
    border-radius: 20px;
    padding: 28px 32px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.7);
    min-width: 320px;
    max-width: 420px;
  `;

  const title = document.createElement("div");
  title.textContent = "Keyboard Shortcuts";
  title.style.cssText = `
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    font-weight: 900;
    font-size: 16px;
    color: #f2e7d6;
    margin-bottom: 18px;
    letter-spacing: 0.2px;
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  const badge = document.createElement("span");
  badge.textContent = "?";
  badge.style.cssText = `
    width: 24px; height: 24px;
    border-radius: 8px;
    border: 1.5px solid rgba(214,168,75,0.6);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 900; color: #d6a84b; flex-shrink: 0;
  `;
  title.prepend(badge);

  const grid = document.createElement("div");
  grid.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  for (const s of shortcuts) {
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    `;

    const keyEl = document.createElement("kbd");
    keyEl.textContent = s.key;
    keyEl.style.cssText = `
      font-family: ui-monospace, Menlo, monospace;
      font-size: 12px;
      font-weight: 700;
      color: #d6a84b;
      background: rgba(214,168,75,0.12);
      border: 1px solid rgba(214,168,75,0.3);
      border-radius: 8px;
      padding: 4px 10px;
      min-width: 72px;
      text-align: center;
      white-space: nowrap;
    `;

    const descEl = document.createElement("span");
    descEl.textContent = s.desc;
    descEl.style.cssText = `
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      font-size: 13px;
      color: #c9b79c;
      text-align: right;
      flex: 1;
    `;

    row.appendChild(keyEl);
    row.appendChild(descEl);
    grid.appendChild(row);
  }

  const hint = document.createElement("div");
  hint.textContent = "Press ? or Esc to close";
  hint.style.cssText = `
    margin-top: 18px;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
    font-size: 11px;
    color: rgba(201,183,156,0.45);
    text-align: center;
  `;

  card.appendChild(title);
  card.appendChild(grid);
  card.appendChild(hint);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  let isOpen = false;

  function open() {
    isOpen = true;
    overlay.style.pointerEvents = "auto";
    overlay.style.opacity = "1";
    overlay.setAttribute("aria-hidden", "false");
  }

  function close() {
    isOpen = false;
    overlay.style.pointerEvents = "none";
    overlay.style.opacity = "0";
    overlay.setAttribute("aria-hidden", "true");
  }

  function toggle() {
    isOpen ? close() : open();
  }

  // Click backdrop to close
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Keyboard listener
  window.addEventListener("keydown", (e) => {
    const el = document.activeElement;
    const isTyping = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (isTyping) return;

    if (e.key === "?" || e.key === "/") { e.preventDefault(); toggle(); return; }
    if (e.key === "Escape" && isOpen) { e.preventDefault(); close(); return; }
  });

  return { open, close, toggle };
}
