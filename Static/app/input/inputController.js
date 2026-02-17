export function createInputController({
  displayCanvas,
  windowObj,
  getPos,
  modeSelect,
  layersSys,
  stamps,
  onRequestRender,
  onSaveDebounced,
  applyFillAtPoint, // if you later extract fill
}) {
  let isDrawing = false;
  let last = null;

  function startInput(evt) {
    evt.preventDefault();
    const p = getPos(evt);
    const mode = modeSelect?.value || "draw";

    if (mode === "stamp") {
      // stamps.pointerDown(p) later
      return;
    }
    if (mode === "fill") { applyFillAtPoint(p, false); return; }
    if (mode === "unfill") { applyFillAtPoint(p, true); return; }

    isDrawing = true;
    last = p;
  }

  function moveInput(evt) {
    if (!isDrawing) return;
    evt.preventDefault();
    // draw/erase logic can be extracted too, later
    onRequestRender();
    last = getPos(evt);
  }

  function endInput(evt) {
    if (!isDrawing) return;
    evt.preventDefault();
    isDrawing = false;
    last = null;
    onSaveDebounced();
  }

  displayCanvas.addEventListener("mousedown", startInput);
  windowObj.addEventListener("mousemove", moveInput);
  windowObj.addEventListener("mouseup", endInput);

  displayCanvas.addEventListener("touchstart", startInput, { passive:false });
  windowObj.addEventListener("touchmove", moveInput, { passive:false });
  windowObj.addEventListener("touchend", endInput, { passive:false });

  return {};
}
