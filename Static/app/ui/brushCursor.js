// app/ui/brushCursor.js
// Shows a live brush-size circle cursor on the canvas while in draw/erase mode.

export function initBrushCursor({ displayCanvas, modeSelect, brushSize }) {
  const cursor = document.createElement("div");
  cursor.id = "brush-cursor";
  cursor.style.cssText = `
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    z-index: 500;
    opacity: 0;
    transform: translate(-50%, -50%);
    transition: opacity 0.1s ease, width 0.08s ease, height 0.08s ease;
    mix-blend-mode: difference;
  `;
  document.body.appendChild(cursor);

  function isDrawOrErase() {
    const m = modeSelect?.value;
    return m === "draw" || m === "erase";
  }

  function updateCursorStyle() {
    const mode = modeSelect?.value;
    if (mode === "erase") {
      cursor.style.border = "2px solid rgba(255,255,255,0.85)";
      cursor.style.background = "rgba(255,255,255,0.08)";
    } else {
      cursor.style.border = "2px solid rgba(214,168,75,0.9)";
      cursor.style.background = "rgba(214,168,75,0.10)";
    }
  }

  function getSizePx(evt) {
    const rect = displayCanvas.getBoundingClientRect();
    const canvasW = displayCanvas.width;
    const displayW = rect.width;
    const scaleFactor = displayW / canvasW;
    return Number(brushSize?.value || 8) * scaleFactor;
  }

  displayCanvas.addEventListener("mousemove", (e) => {
    if (!isDrawOrErase()) { cursor.style.opacity = "0"; return; }
    const sizePx = getSizePx(e);
    cursor.style.width = sizePx + "px";
    cursor.style.height = sizePx + "px";
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
    cursor.style.opacity = "1";
    updateCursorStyle();
    displayCanvas.style.cursor = "none";
  });

  displayCanvas.addEventListener("mouseleave", () => {
    cursor.style.opacity = "0";
    displayCanvas.style.cursor = "";
  });

  // Also hide when mode changes away from draw/erase
  modeSelect?.addEventListener("change", () => {
    if (!isDrawOrErase()) {
      cursor.style.opacity = "0";
      displayCanvas.style.cursor = "";
    }
  });

  // Update size live when brush slider changes
  brushSize?.addEventListener("input", () => {
    if (cursor.style.opacity === "0") return;
    const rect = displayCanvas.getBoundingClientRect();
    const canvasW = displayCanvas.width;
    const displayW = rect.width;
    const scaleFactor = displayW / canvasW;
    const sizePx = Number(brushSize.value) * scaleFactor;
    cursor.style.width = sizePx + "px";
    cursor.style.height = sizePx + "px";
  });
}
