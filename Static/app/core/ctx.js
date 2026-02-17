// AppContext builder
// Centralizes DOM lookups and shared handles so modules don't import globals.
// Phase 2 refactor: app.js still destructures out the old variable names.

export function createAppContext({ uiKey, storage } = {}) {
  const UI_KEY = uiKey || "roman_shield_ui_v1";

  const appRoot = document.getElementById("appRoot");

  // Canvases
  const displayCanvas = document.getElementById("displayCanvas");
  const guidesCanvas  = document.getElementById("guidesCanvas");
  const dctx = displayCanvas?.getContext("2d", { willReadFrequently: true }) || null;
  const gctx = guidesCanvas?.getContext("2d") || null;

  // Central DOM ref cache (one lookup per element id)
  const dom = {
    // Right panel controls
    colorPicker: document.getElementById("colorPicker"),
    brushSize: document.getElementById("brushSize"),
    brushSizeVal: document.getElementById("brushSizeVal"),
    brushOpacity: document.getElementById("brushOpacity"),
    brushOpacityVal: document.getElementById("brushOpacityVal"),
    modeSelect: document.getElementById("modeSelect"),
    symmetrySelect: document.getElementById("symmetrySelect"),
    guidesToggle: document.getElementById("guidesToggle"),
    fillTolerance: document.getElementById("fillTolerance"),
    fillToleranceVal: document.getElementById("fillToleranceVal"),
    stampSize: document.getElementById("stampSize"),
    stampSizeVal: document.getElementById("stampSizeVal"),
    stampRot: document.getElementById("stampRot"),
    stampRotVal: document.getElementById("stampRotVal"),
    shieldWidthIn: document.getElementById("shieldWidthIn"),
    shieldHeightIn: document.getElementById("shieldHeightIn"),
    shieldCurveIn: document.getElementById("shieldCurveIn"),
    gridToggle: document.getElementById("gridToggle"),
    ppiReadout: document.getElementById("ppiReadout"),
    clearStampBtn: document.getElementById("clearStampBtn"),
    stampListEl: document.getElementById("stampList"),

    // Toolbar buttons
    drawBtn: document.getElementById("drawBtn"),
    eraseBtn: document.getElementById("eraseBtn"),
    fillBtn: document.getElementById("fillBtn"),
    unfillBtn: document.getElementById("unfillBtn"),
    stampBtn: document.getElementById("stampBtn"),
    undoBtn: document.getElementById("undoBtn"),
    redoBtn: document.getElementById("redoBtn"),
    exportBtn: document.getElementById("exportBtn"),

    // Library
    newDesignBtn: document.getElementById("newDesignBtn"),
    designListEl: document.getElementById("designList"),

    // Layers UI
    addLayerBtn: document.getElementById("addLayerBtn"),
    deleteLayerBtn: document.getElementById("deleteLayerBtn"),
    layersListEl: document.getElementById("layersList"),

    // Floating toolbar panel + sidebar buttons (used by uiState module)
    toolbar: document.getElementById("toolbar"),
    toolbarTitleBar: document.getElementById("toolbarTitleBar"),
    toolbarResetBtn: document.getElementById("toolbarResetBtn"),
    leftPanel: document.getElementById("leftPanel"),
    rightPanel: document.getElementById("rightPanel"),
    hideLeftBtn: document.getElementById("hideLeftBtn"),
    showLeftBtn: document.getElementById("showLeftBtn"),
    hideRightBtn: document.getElementById("hideRightBtn"),
    showRightBtn: document.getElementById("showRightBtn"),

    // Legacy sidebar controls (used by app.js)
    minLeftBtn: document.getElementById("minLeftBtn"),
    minRightBtn: document.getElementById("minRightBtn"),
    restoreLeftBtn: document.getElementById("restoreLeftBtn"),
    restoreRightBtn: document.getElementById("restoreRightBtn"),

    // Legacy toolbar handle (used by app.js)
    toolbarHandle: document.getElementById("toolbarHandle"),
  };

  return {
    UI_KEY,
    appRoot,
    canvas: { displayCanvas, guidesCanvas, dctx, gctx },
    dom,
    storage: storage || {},
  };
}
