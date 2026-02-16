// UI State persistence + apply helpers
export function loadUIState(storageKey) {
  const fallback = {
    hideLeft: false,
    hideRight: false,
    toolbarPos: null,
    scale: { widthIn: 31, heightIn: 40, curveIn: 8, showGrid: false },
  };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return structuredClone ? structuredClone(fallback) : JSON.parse(JSON.stringify(fallback));
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed, scale: { ...fallback.scale, ...(parsed.scale || {}) } };
  } catch {
    return fallback;
  }
}

export function saveUIState(storageKey, uiState) {
  localStorage.setItem(storageKey, JSON.stringify(uiState));
}

// Applies state to DOM + calls callbacks for dependent redraws/readouts.
export function applyUIState(opts) {
  const {
    appRoot,
    toolbar,
    uiState,
    inputs,         // { shieldWidthIn, shieldHeightIn, shieldCurveIn, gridToggle }
    onAfterApply,    // () => void (update ppi readout, redraw guides)
  } = opts;

  if (appRoot) {
    appRoot.classList.toggle("hide-left",  !!uiState.hideLeft);
    appRoot.classList.toggle("hide-right", !!uiState.hideRight);
  }

  if (uiState.toolbarPos && toolbar) {
    toolbar.style.left = uiState.toolbarPos.left + "px";
    toolbar.style.top  = uiState.toolbarPos.top  + "px";
    toolbar.style.bottom = "auto";
    toolbar.style.transform = "translateX(0)";
  }

  if (!uiState.scale) uiState.scale = { widthIn: 31, heightIn: 40, curveIn: 8, showGrid: false };

  const { shieldWidthIn, shieldHeightIn, shieldCurveIn, gridToggle } = inputs || {};
  if (shieldWidthIn)  shieldWidthIn.value  = uiState.scale.widthIn;
  if (shieldHeightIn) shieldHeightIn.value = uiState.scale.heightIn;
  if (shieldCurveIn)  shieldCurveIn.value  = uiState.scale.curveIn;
  if (gridToggle)     gridToggle.checked   = !!uiState.scale.showGrid;

  if (onAfterApply) onAfterApply();
}

// Wires the four sidebar buttons to update + persist state.
// Pass null/undefined buttons safely.
export function wireSidebarButtons({ storageKey, uiState, buttons, apply }) {
  const { minLeftBtn, minRightBtn, restoreLeftBtn, restoreRightBtn } = buttons || {};
  const persist = () => saveUIState(storageKey, uiState);

  minLeftBtn?.addEventListener("click", () => { uiState.hideLeft = true;  persist(); apply(); });
  minRightBtn?.addEventListener("click", () => { uiState.hideRight = true; persist(); apply(); });
  restoreLeftBtn?.addEventListener("click", () => { uiState.hideLeft = false;  persist(); apply(); });
  restoreRightBtn?.addEventListener("click", () => { uiState.hideRight = false; persist(); apply(); });
}
