// Input controller: owns pointer/mouse/touch bindings and routes to drawing/fill/stamps.
// Behavior-preserving extraction from appController.

export function createInputController({
  displayCanvas,
  windowObj,
  modeSelect,
  brushOpacity,
  brushSize,
  colorPicker,
  getSymmetryPoints,
  layersSys,
  clipToShield,
  unclip,
  applyFillAtPoint,
  stamps,
  history,
  requestRender,
  saveActiveToDesignsDebounced,
}) {
  function getPos(evt){
    const rect = displayCanvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: (clientX - rect.left) * (displayCanvas.width / rect.width),
      y: (clientY - rect.top)  * (displayCanvas.height / rect.height),
    };
  }

  let isDrawing = false;
  let last = null;

  function startInput(evt){
    evt.preventDefault();
    const p = getPos(evt);
    const mode = modeSelect?.value || "draw";

    // If NOT in stamp mode, allow clicking a stamp to switch into stamp-edit mode.
    if (mode !== "stamp") {
      if (stamps.selectIfClicked(p)) return;
    }

    if (mode === "stamp") {
      stamps.pointerDown(p);
      return;
    }

    if (mode === "fill")   { applyFillAtPoint(p, false); return; }
    if (mode === "unfill") { applyFillAtPoint(p, true);  return; }

    if (mode !== "draw" && mode !== "erase") return;

    history.pushUndo();
    history.clearRedo();
    isDrawing = true;
    last = p;
  }

  function moveInput(evt){
    const mode = modeSelect?.value || "draw";

    if (mode === "stamp") {
      if (!stamps.isDragging()) return;
      evt.preventDefault();
      stamps.pointerMove(getPos(evt));
      return;
    }

    if (!isDrawing) return;
    evt.preventDefault();
    if (mode !== "draw" && mode !== "erase") return;

    const p = getPos(evt);
    const alpha = Number(brushOpacity?.value || 1);
    const w = Number(brushSize?.value || 8);

    const ptsA = getSymmetryPoints(last);
    const ptsB = getSymmetryPoints(p);
    const active = layersSys.layers[layersSys.activeLayerIndex];

    clipToShield(active.ctx);
    active.ctx.lineCap = "round";
    active.ctx.lineJoin = "round";
    active.ctx.lineWidth = w;
    active.ctx.globalAlpha = alpha;

    if (mode === "erase") {
      active.ctx.globalCompositeOperation = "destination-out";
      active.ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      active.ctx.globalCompositeOperation = "source-over";
      active.ctx.strokeStyle = colorPicker?.value || "#ffffff";
    }

    for (let i=0;i<Math.min(ptsA.length, ptsB.length);i++){
      active.ctx.beginPath();
      active.ctx.moveTo(ptsA[i].x, ptsA[i].y);
      active.ctx.lineTo(ptsB[i].x, ptsB[i].y);
      active.ctx.stroke();
    }

    active.ctx.globalCompositeOperation = "source-over";
    active.ctx.globalAlpha = 1;
    unclip(active.ctx);

    layersSys.markLayerDirty(layersSys.activeLayerIndex);
    requestRender();
    last = p;
  }

  function endInput(evt){
    const mode = modeSelect?.value || "draw";

    if (mode === "stamp") {
      if (!stamps.isDragging()) return;
      evt.preventDefault();
      stamps.pointerUp();
      return;
    }

    if (!isDrawing) return;
    evt.preventDefault();
    isDrawing = false;
    last = null;
    saveActiveToDesignsDebounced();
  }

  displayCanvas.addEventListener("mousedown", startInput);
  windowObj.addEventListener("mousemove", moveInput);
  windowObj.addEventListener("mouseup", endInput);

  displayCanvas.addEventListener("touchstart", startInput, { passive:false });
  windowObj.addEventListener("touchmove", moveInput, { passive:false });
  windowObj.addEventListener("touchend", endInput, { passive:false });

  return {
    getPos,
  };
}
