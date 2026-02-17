// Static/app/ui/readouts.js
import { DEFAULT_STAMP_SIZE } from "../core/constants.js";

/**
 * Initializes UI readouts + basic listeners safely.
 * This is defensive: it won't crash if any element is missing.
 */
export function initReadouts(dom) {
  if (!dom) return;

  const {
    brushSize,
    brushSizeVal,
    brushOpacity,
    brushOpacityVal,
    fillTolerance,
    fillToleranceVal,
    stampSize,
    stampSizeVal,
    stampRot,
    stampRotVal,
  } = dom;

  // Initial text
  if (brushSizeVal && brushSize) brushSizeVal.textContent = brushSize.value;
  if (brushOpacityVal && brushOpacity) brushOpacityVal.textContent = Number(brushOpacity.value).toFixed(2);
  if (fillToleranceVal && fillTolerance) fillToleranceVal.textContent = fillTolerance.value;

  // Stamp size init (ensure a sane default)
  if (stampSize && (!stampSize.value || Number(stampSize.value) <= 0)) {
    stampSize.value = DEFAULT_STAMP_SIZE;
  }
  if (stampSizeVal) stampSizeVal.textContent = String(stampSize?.value || DEFAULT_STAMP_SIZE);

  if (stampRotVal && stampRot) stampRotVal.textContent = `${stampRot.value}°`;

  // Live updates
  brushSize?.addEventListener("input", () => {
    if (brushSizeVal) brushSizeVal.textContent = brushSize.value;
  });

  brushOpacity?.addEventListener("input", () => {
    if (brushOpacityVal) brushOpacityVal.textContent = Number(brushOpacity.value).toFixed(2);
  });

  fillTolerance?.addEventListener("input", () => {
    if (fillToleranceVal) fillToleranceVal.textContent = fillTolerance.value;
  });

  stampSize?.addEventListener("input", () => {
    if (stampSizeVal) stampSizeVal.textContent = stampSize.value;
  });

  stampRot?.addEventListener("input", () => {
    if (stampRotVal) stampRotVal.textContent = `${stampRot.value}°`;
  });
}
