// app/render/guides.js
export function createGuides({
  guidesCanvas,
  gctx,
  shieldPath,
  guidesToggle,
  drawStampSelectionOverlay, // placeholder for stamps module later
}) {
  function drawGuides() {
    gctx.clearRect(0, 0, guidesCanvas.width, guidesCanvas.height);

    // outline
    gctx.lineWidth = 6;
    gctx.strokeStyle = "rgba(214,168,75,.35)";
    shieldPath(gctx);
    gctx.stroke();

    gctx.lineWidth = 2;
    gctx.strokeStyle = "rgba(0,0,0,.12)";
    shieldPath(gctx);
    gctx.stroke();

    if (guidesToggle && !guidesToggle.checked) {
      drawStampSelectionOverlay?.();
      return;
    }

    drawStampSelectionOverlay?.();
  }

  return { drawGuides };
}
