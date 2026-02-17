import { STAMPS } from "./stampsData.js";
import { DEFAULT_STAMP_SIZE } from "../../core/constants.js";

export function createStampSystem({
  displayCanvas,
  gctx,
  requestRender,
  saveActiveToDesignsDebounced,
  modeSelect,
  stampSize,
  stampRot,
  colorPicker,
}) {
  let stampObjects = [];
  let selectedStampUid = null;

  function render(ctx) {
    // move renderStampObjects() here later
  }

  function renderOverlay() {
    // move drawStampSelectionOverlay() here later
  }

  function setStamps(arr) { stampObjects = Array.isArray(arr) ? arr : []; selectedStampUid = null; }
  function getStamps() { return stampObjects; }

  return {
    render,
    renderOverlay,
    setStamps,
    getStamps,
    get selectedStampUid() { return selectedStampUid; },
    set selectedStampUid(v) { selectedStampUid = v; },
  };
}
