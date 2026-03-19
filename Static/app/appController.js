// ============================================================
// Shield Designer — appController.js
// ============================================================

import { listDesigns, createDesign, saveDesign, loadDesign, deleteDesign, renameDesign } from "../Storage/repo.js";
import { createRenderScheduler } from "./core/renderScheduler.js";
import { loadUIState, saveUIState as saveUIStateMod, applyUIState as applyUIStateMod, wireSidebarButtons } from "./ui/uiState.js";
import { createShieldMask } from "./canvas/shieldMask.js";
import { SHIELD_SHAPES, getShape } from "./canvas/shapeRegistry.js";
import { renderBackground, createBackgroundSelector, getBackground } from "./canvas/backgroundSystem.js";
import { getSymmetryPoints as getSymmetryPointsPure } from "./tools/symmetry.js";
import { createAppContext } from "./core/ctx.js";
import { DEFAULT_STAMP_SIZE } from "./core/constants.js";
import { initReadouts } from "./ui/readouts.js";
import { createLayersSystem } from "./features/layers/layersSystem.js";
import { createDesignsController } from "./designs/designsController.js";
import { createSaveManager } from "./core/saveManager.js";
import { loadDesignIntoCanvas } from "./designs/loadIntoCanvas.js";
import { createStampSystem } from "./features/stamps/stampSystem.js";
import { createInputController } from "./input/inputController.js";
import { createHistoryManager } from "./core/history.js";
import { showToast } from "./ui/toast.js";
import { initShortcutsOverlay } from "./ui/shortcutsOverlay.js";
import { initBrushCursor } from "./ui/brushCursor.js";

const UI_KEY = "roman_shield_ui_v1";

const ctx = createAppContext({
  uiKey: UI_KEY,
  storage: { listDesigns, createDesign, saveDesign, loadDesign, deleteDesign, renameDesign },
});

const appRoot = ctx.appRoot;
const { displayCanvas, guidesCanvas, dctx, gctx } = ctx.canvas;

// ── Render scheduler ──────────────────────────────────────────
const render = createRenderScheduler(() => compositeToDisplay());
function requestRender() { render.invalidate(); }

guidesCanvas.style.pointerEvents = "none";
displayCanvas.style.pointerEvents = "auto";

// ── DOM refs ──────────────────────────────────────────────────
const colorPicker      = ctx.dom.colorPicker;
const brushSize        = ctx.dom.brushSize;
const brushSizeVal     = ctx.dom.brushSizeVal;
const brushOpacity     = ctx.dom.brushOpacity;
const brushOpacityVal  = ctx.dom.brushOpacityVal;
const modeSelect       = ctx.dom.modeSelect;
const symmetrySelect   = ctx.dom.symmetrySelect;
const guidesToggle     = ctx.dom.guidesToggle;
const fillTolerance    = ctx.dom.fillTolerance;
const fillToleranceVal = ctx.dom.fillToleranceVal;
const stampSize        = ctx.dom.stampSize;
const stampSizeVal     = ctx.dom.stampSizeVal;
const stampRot         = ctx.dom.stampRot;
const stampRotVal      = ctx.dom.stampRotVal;
const shieldWidthIn    = ctx.dom.shieldWidthIn;
const shieldHeightIn   = ctx.dom.shieldHeightIn;
const shieldCurveIn    = ctx.dom.shieldCurveIn;
const gridToggle       = ctx.dom.gridToggle;
const ppiReadout       = ctx.dom.ppiReadout;
const stampListEl      = ctx.dom.stampListEl;

const drawBtn    = ctx.dom.drawBtn;
const eraseBtn   = ctx.dom.eraseBtn;
const fillBtn    = ctx.dom.fillBtn;
const unfillBtn  = ctx.dom.unfillBtn;
const stampBtn   = ctx.dom.stampBtn;
const undoBtn    = ctx.dom.undoBtn;
const redoBtn    = ctx.dom.redoBtn;
const exportBtn  = ctx.dom.exportBtn;

const newDesignBtn    = ctx.dom.newDesignBtn;
const designListEl    = ctx.dom.designListEl;
const addLayerBtn     = ctx.dom.addLayerBtn;
const deleteLayerBtn  = ctx.dom.deleteLayerBtn;
const layersListEl    = ctx.dom.layersListEl;
const minLeftBtn      = ctx.dom.minLeftBtn;
const minRightBtn     = ctx.dom.minRightBtn;
const restoreLeftBtn  = ctx.dom.restoreLeftBtn;
const restoreRightBtn = ctx.dom.restoreRightBtn;
const toolbar         = ctx.dom.toolbar;
const toolbarHandle   = ctx.dom.toolbarHandle;

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ── UI State ──────────────────────────────────────────────────
const uiState = loadUIState(UI_KEY);
function saveUIState() { saveUIStateMod(UI_KEY, uiState); }
function applyUIState() {
  applyUIStateMod({
    appRoot, toolbar, uiState,
    inputs: { shieldWidthIn, shieldHeightIn, shieldCurveIn, gridToggle },
    onAfterApply: () => { updatePpiReadout(); }
  });
}

// ── Shape + Background state ──────────────────────────────────
let activeShapeId = uiState.shapeId || "scutum";
let activeBgDef   = getBackground(uiState.bgId || "dark_wood");

// ── Draggable toolbar ─────────────────────────────────────────
let draggingToolbar = false, dragOffsetX = 0, dragOffsetY = 0;

toolbarHandle?.addEventListener("mousedown", (e) => {
  if (!toolbar) return;
  draggingToolbar = true;
  const rect = toolbar.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  toolbar.style.left = rect.left + "px";
  toolbar.style.top = rect.top + "px";
  toolbar.style.bottom = "auto";
  toolbar.style.transform = "translateX(0)";
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!draggingToolbar || !toolbar) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = toolbar.getBoundingClientRect();
  const x = Math.max(8, Math.min(vw - rect.width - 8, e.clientX - dragOffsetX));
  const y = Math.max(8, Math.min(vh - rect.height - 8, e.clientY - dragOffsetY));
  toolbar.style.left = x + "px";
  toolbar.style.top = y + "px";
});

window.addEventListener("mouseup", () => {
  if (!draggingToolbar || !toolbar) return;
  draggingToolbar = false;
  const rect = toolbar.getBoundingClientRect();
  uiState.toolbarPos = { left: rect.left, top: rect.top };
  saveUIState();
});

toolbarHandle?.addEventListener("dblclick", () => {
  uiState.toolbarPos = null;
  saveUIState();
  if (!toolbar) return;
  toolbar.style.left = "50%";
  toolbar.style.top = "auto";
  toolbar.style.bottom = "16px";
  toolbar.style.transform = "translateX(-50%)";
});

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function updateScaleFromUI() {
  if (!uiState.scale) uiState.scale = { widthIn: 31, heightIn: 40, curveIn: 8, showGrid: false };
  if (shieldWidthIn)  uiState.scale.widthIn  = clampNum(shieldWidthIn.value, 10, 80, 31);
  if (shieldHeightIn) uiState.scale.heightIn = clampNum(shieldHeightIn.value, 10, 100, 40);
  if (shieldCurveIn)  uiState.scale.curveIn  = clampNum(shieldCurveIn.value, 0, 24, 8);
  if (gridToggle)     uiState.scale.showGrid = !!gridToggle.checked;
  saveUIState();
  updatePpiReadout();
  drawGuides();
}

shieldWidthIn?.addEventListener("input",  updateScaleFromUI);
shieldHeightIn?.addEventListener("input", updateScaleFromUI);
shieldCurveIn?.addEventListener("input",  updateScaleFromUI);
gridToggle?.addEventListener("change",    updateScaleFromUI);

function getPpi() {
  const pxW = displayCanvas.width, pxH = displayCanvas.height;
  return {
    ppiX: pxW / (uiState.scale?.widthIn  ?? 31),
    ppiY: pxH / (uiState.scale?.heightIn ?? 40),
  };
}

function updatePpiReadout() {
  if (!ppiReadout) return;
  const { ppiX, ppiY } = getPpi();
  ppiReadout.textContent = `${ppiX.toFixed(2)} · ${ppiY.toFixed(2)}`;
}

// ── Shield mask ───────────────────────────────────────────────
const shield = createShieldMask(displayCanvas);
const { shieldPath, buildShieldMask, isInsideShield, isOnShieldBoundary, clipToShield, unclip } = shield;

// ── Shape selector ────────────────────────────────────────────
function buildShapeSelector() {
  const container = document.getElementById("shapeSelector");
  if (!container) return;
  container.innerHTML = "";

  for (const shape of SHIELD_SHAPES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shape-btn" + (shape.id === activeShapeId ? " active" : "");
    btn.dataset.shapeId = shape.id;
    btn.title = shape.description;

    const preview = document.createElement("canvas");
    preview.width = 44; preview.height = 44;
    preview.style.cssText = "display:block;";
    const pctx = preview.getContext("2d");
    pctx.save();
    pctx.scale(44 / displayCanvas.width, 44 / displayCanvas.height);
    shape.path(pctx, displayCanvas.width, displayCanvas.height);
    pctx.restore();
    pctx.fillStyle = "rgba(212,155,60,0.2)";
    pctx.fill();
    pctx.strokeStyle = "rgba(212,155,60,0.75)";
    pctx.lineWidth = 2.5;
    pctx.stroke();

    const label = document.createElement("span");
    label.textContent = shape.label;

    btn.appendChild(preview);
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      activeShapeId = shape.id;
      uiState.shapeId = shape.id;
      saveUIState();
      shield.setShape(shape);
      buildShieldMask();
      layersSys.warmBaseFill();
      layersSys.markAllLayersDirty();
      requestRender();
      drawGuides();
      container.querySelectorAll(".shape-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.shapeId === shape.id);
      });
      showToast(`Shape: ${shape.label}`, "info", 1600);
    });

    container.appendChild(btn);
  }
}

// ── Layers ────────────────────────────────────────────────────
const layersSys = createLayersSystem({
  displayCanvas, clipToShield, unclip,
  layersListEl, addLayerBtn, deleteLayerBtn,
  requestRender, saveActiveToDesignsDebounced, escapeHtml,
});

// ── Stamps ────────────────────────────────────────────────────
const stamps = createStampSystem({
  displayCanvas, gctx, modeSelect, stampSize, stampRot, colorPicker,
  stampListEl, requestRender, saveActiveToDesignsDebounced,
  setMode: (m) => setMode(m),
  drawGuides: () => drawGuides(),
  history: null,
});

stamps.renderStampList();
initReadouts(ctx.dom);

// ── Expose stamp import hooks for drag-drop in index.html ─────
// These are called by the drag-drop script in index.html.
window.__sdToast    = (msg, type) => showToast(msg, type ?? "info");
window.__sdImportPng = (dataUrl, name) => stamps.addCustomStampFromDataUrl(dataUrl, name);

// ── History ───────────────────────────────────────────────────
const history = createHistoryManager({
  displayCanvas, layersSys, stamps, requestRender, saveActiveToDesignsDebounced,
});
stamps.setHistory(history);

undoBtn?.addEventListener("click", () => history.undo());
redoBtn?.addEventListener("click", () => history.redo());

applyUIState();
requestRender();

wireSidebarButtons({
  storageKey: UI_KEY, uiState,
  buttons: { minLeftBtn, minRightBtn, restoreLeftBtn, restoreRightBtn },
  apply: applyUIState,
});

// ── Background selector ───────────────────────────────────────
const bgSelector = createBackgroundSelector({
  containerId: "backgroundSelector",
  onChange(bgDef) {
    activeBgDef = bgDef;
    uiState.bgId = bgDef.id;
    saveUIState();
    layersSys.markAllLayersDirty();
    requestRender();
    showToast(`Background: ${bgDef.label}`, "info", 1600);
  }
});

// ── Guides ────────────────────────────────────────────────────
function drawGuides() {
  gctx.clearRect(0, 0, guidesCanvas.width, guidesCanvas.height);

  gctx.lineWidth = 5;
  gctx.strokeStyle = "rgba(212,155,60,0.3)";
  shieldPath(gctx); gctx.stroke();

  gctx.lineWidth = 1.5;
  gctx.strokeStyle = "rgba(0,0,0,0.1)";
  shieldPath(gctx); gctx.stroke();

  if (guidesToggle && !guidesToggle.checked) {
    stamps.drawSelectionOverlay();
    return;
  }

  const w = guidesCanvas.width, h = guidesCanvas.height;
  gctx.lineWidth = 1;
  gctx.strokeStyle = "rgba(0,0,0,0.1)";
  gctx.beginPath();
  gctx.moveTo(w / 2, 0); gctx.lineTo(w / 2, h);
  gctx.moveTo(0, h / 2); gctx.lineTo(w, h / 2);
  gctx.stroke();

  if (uiState.scale?.showGrid) {
    const { ppiX, ppiY } = getPpi();
    gctx.save();
    shieldPath(gctx); gctx.clip();
    gctx.lineWidth = 0.5;
    gctx.strokeStyle = "rgba(0,0,0,0.07)";
    for (let x = 0; x <= w; x += ppiX) {
      gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, h); gctx.stroke();
    }
    for (let y = 0; y <= h; y += ppiY) {
      gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(w, y); gctx.stroke();
    }
    gctx.restore();
  }
  stamps.drawSelectionOverlay();
}

guidesToggle?.addEventListener("change", drawGuides);

// ── Symmetry ──────────────────────────────────────────────────
function getSymmetryPoints(p) {
  return getSymmetryPointsPure(
    p, { w: displayCanvas.width, h: displayCanvas.height },
    symmetrySelect?.value || "none"
  );
}

// ── Fill / Unfill ─────────────────────────────────────────────
function parseHexColor(hex) {
  return {
    r: parseInt(hex.slice(1,3),16),
    g: parseInt(hex.slice(3,5),16),
    b: parseInt(hex.slice(5,7),16),
    a: 255,
  };
}
function colorDist(r1,g1,b1,a1,r2,g2,b2,a2) {
  return Math.abs(r1-r2)+Math.abs(g1-g2)+Math.abs(b1-b2)+Math.abs(a1-a2);
}

function getCompositeImageData() {
  const w = displayCanvas.width, h = displayCanvas.height;
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const o = off.getContext("2d", { willReadFrequently: true });
  renderBackground(o, w, h, activeBgDef, (c) => shieldPath(c));
  o.save(); shieldPath(o); o.clip();
  for (const layer of layersSys.layers) {
    if (layer.visible) { o.globalAlpha = layer.opacity ?? 1; o.drawImage(layer.canvas, 0, 0); }
  }
  o.globalAlpha = 1;
  stamps.renderTo(o);
  o.restore();
  return o.getImageData(0, 0, w, h);
}

function enclosedFloodFill(seedX, seedY, tolerance) {
  const w = displayCanvas.width, h = displayCanvas.height;
  const comp = getCompositeImageData();
  const data = comp.data;
  const sx = Math.floor(seedX), sy = Math.floor(seedY);
  if (!isInsideShield(sx, sy)) return { pixels: null, leaked: true };
  const startIdx = (sy * w + sx) * 4;
  const sr = data[startIdx], sg = data[startIdx+1], sb = data[startIdx+2], sa = data[startIdx+3];
  const visited = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qs = 0, qe = 0;
  const out = new Uint32Array(w * h);
  let outN = 0, leaked = false;
  q[qe++] = sy * w + sx;
  visited[sy * w + sx] = 1;
  while (qs < qe) {
    const p = q[qs++];
    const x = p % w, y = (p / w) | 0;
    if (!isInsideShield(x, y)) continue;
    if (isOnShieldBoundary(x, y)) leaked = true;
    const idx = p * 4;
    if (colorDist(data[idx],data[idx+1],data[idx+2],data[idx+3],sr,sg,sb,sa) > tolerance) continue;
    out[outN++] = p;
    const n1=p-1,n2=p+1,n3=p-w,n4=p+w;
    if (x>0     && !visited[n1]) { visited[n1]=1; q[qe++]=n1; }
    if (x<w-1   && !visited[n2]) { visited[n2]=1; q[qe++]=n2; }
    if (y>0     && !visited[n3]) { visited[n3]=1; q[qe++]=n3; }
    if (y<h-1   && !visited[n4]) { visited[n4]=1; q[qe++]=n4; }
  }
  return { pixels: out.subarray(0, outN), leaked };
}

function applyFillAtPoint(p, unfillMode = false) {
  const tol = Number(fillTolerance?.value || 0);
  const rep = parseHexColor(colorPicker?.value || "#ffffff");
  const pts = getSymmetryPoints(p);
  history.pushUndo();
  history.clearRedo();
  const active = layersSys.layers[layersSys.activeLayerIndex];
  const img = active.ctx.getImageData(0, 0, displayCanvas.width, displayCanvas.height);
  const imgData = img.data;
  for (const sp of pts) {
    const x = Math.floor(sp.x), y = Math.floor(sp.y);
    if (!isInsideShield(x, y)) continue;
    const res = enclosedFloodFill(x, y, tol);
    if (!res.pixels || res.leaked) continue;
    for (let i = 0; i < res.pixels.length; i++) {
      const pix = res.pixels[i], idx = pix * 4;
      if (unfillMode) {
        imgData[idx]=0; imgData[idx+1]=0; imgData[idx+2]=0; imgData[idx+3]=0;
      } else {
        imgData[idx]=rep.r; imgData[idx+1]=rep.g; imgData[idx+2]=rep.b; imgData[idx+3]=255;
      }
    }
  }
  active.ctx.putImageData(img, 0, 0);
  layersSys.markLayerDirty(layersSys.activeLayerIndex);
  requestRender();
  saveActiveToDesignsDebounced();
}

// ── Input controller ──────────────────────────────────────────
createInputController({
  displayCanvas, windowObj: window, modeSelect, brushOpacity, brushSize, colorPicker,
  getSymmetryPoints, layersSys, clipToShield, unclip,
  applyFillAtPoint, stamps, history, requestRender, saveActiveToDesignsDebounced,
});

// ── setMode ───────────────────────────────────────────────────
function setMode(m) {
  if (modeSelect) modeSelect.value = m;
  [drawBtn, eraseBtn, fillBtn, unfillBtn, stampBtn].forEach(btn => {
    if (!btn) return;
    btn.classList.remove("selected", "tool-active-glow");
  });
  const activeBtn = {
    draw: drawBtn, erase: eraseBtn, fill: fillBtn, unfill: unfillBtn, stamp: stampBtn
  }[m];
  if (activeBtn) activeBtn.classList.add("selected", "tool-active-glow");

  const stampPanel = document.getElementById("stampControlsPanel");
  if (stampPanel) stampPanel.style.display = m === "stamp" ? "" : "none";

  requestRender();
}

drawBtn?.addEventListener("click",   () => setMode("draw"));
eraseBtn?.addEventListener("click",  () => setMode("erase"));
fillBtn?.addEventListener("click",   () => setMode("fill"));
unfillBtn?.addEventListener("click", () => setMode("unfill"));
stampBtn?.addEventListener("click",  () => setMode("stamp"));
modeSelect?.addEventListener("change", () => setMode(modeSelect.value));

// ── Stamp controls ────────────────────────────────────────────
document.getElementById("stampFlipHBtn")?.addEventListener("click", () => stamps.flipSelectedH?.());
document.getElementById("stampFlipVBtn")?.addEventListener("click", () => stamps.flipSelectedV?.());

document.getElementById("stampOpacitySlider")?.addEventListener("input", (e) => {
  const obj = stamps.getSelectedStamp?.();
  if (!obj) return;
  obj.opacity = Number(e.target.value);
  const val = document.getElementById("stampOpacityVal");
  if (val) val.textContent = obj.opacity.toFixed(2);
  requestRender();
  saveActiveToDesignsDebounced();
});

// ── Keyboard shortcuts + brush cursor ─────────────────────────
initShortcutsOverlay();
initBrushCursor({ displayCanvas, modeSelect, brushSize });

window.addEventListener("keydown", (e) => {
  const el = document.activeElement;
  const isTyping = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  if (isTyping) return;
  switch (e.key.toLowerCase()) {
    case "d": setMode("draw"); break;
    case "e": setMode("erase"); break;
    case "f": setMode("fill"); break;
    case "u": setMode("unfill"); break;
    case "s": setMode("stamp"); break;
    case "z": e.preventDefault(); history.undo(); break;
    case "y": e.preventDefault(); history.redo(); break;
    case "[":
      if (brushSize) { brushSize.value = Math.max(1, +brushSize.value - 2); brushSize.dispatchEvent(new Event("input")); }
      break;
    case "]":
      if (brushSize) { brushSize.value = Math.min(200, +brushSize.value + 2); brushSize.dispatchEvent(new Event("input")); }
      break;
  }
});

// ── Export ────────────────────────────────────────────────────
function exportPNG() {
  const w = displayCanvas.width, h = displayCanvas.height;
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const octx = off.getContext("2d");
  renderBackground(octx, w, h, activeBgDef, (c) => shieldPath(c));
  octx.save(); shieldPath(octx); octx.clip();
  for (const layer of layersSys.layers) {
    if (layer.visible) { octx.globalAlpha = layer.opacity ?? 1; octx.drawImage(layer.canvas, 0, 0); }
  }
  octx.globalAlpha = 1;
  stamps.renderTo(octx);
  octx.restore();
  off.toBlob((blob) => {
    if (!blob) { showToast("Export failed", "error"); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shield-${Date.now()}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast("Shield exported ✓", "success");
  }, "image/png");
}

exportBtn?.addEventListener("click", exportPNG);

// ── Compositing ───────────────────────────────────────────────
function compositeToDisplay() {
  const w = displayCanvas.width, h = displayCanvas.height;
  dctx.clearRect(0, 0, w, h);

  renderBackground(dctx, w, h, activeBgDef, (c) => shieldPath(c));

  dctx.save();
  shieldPath(dctx); dctx.clip();
  for (const layer of layersSys.layers) {
    if (!layer.visible) continue;
    dctx.globalAlpha = layer.opacity ?? 1;
    dctx.drawImage(layer.canvas, 0, 0);
  }
  dctx.globalAlpha = 1;
  stamps.renderTo(dctx);
  dctx.restore();

  drawGuides();
}

// ── Designs + Saves ───────────────────────────────────────────
let activeDesignId = null;
const _dr = { timer: null, inFlight: null };

function resetHistory() { history.reset(); }

function refreshDesignListThrottled(ms = 1200) {
  if (_dr.timer) clearTimeout(_dr.timer);
  _dr.timer = setTimeout(async () => {
    if (_dr.inFlight) return;
    _dr.inFlight = (async () => {
      try { await designsCtrl.refresh(); }
      finally { _dr.inFlight = null; }
    })();
  }, ms);
}

const designsCtrl = createDesignsController({
  designListEl, newDesignBtn, layersSys, displayCanvas, requestRender, resetHistory,
  getActiveDesignId:  () => activeDesignId,
  setActiveDesignId:  (id) => { activeDesignId = id; },
  setStampObjects:    (arr) => { stamps.setStampObjects(arr); },
  clearSelectedStamp: () => { stamps.clearSelection(); },
  storage: { listDesigns, createDesign, loadDesign, deleteDesign, renameDesign },
  saveDebounced: () => saveActiveToDesignsDebounced(),
  cancelSave:    () => saveMgr.cancel(),
});

async function saveDesignWithExtras(designId, layers, stampObjects, opts) {
  try {
    const off = document.createElement("canvas");
    off.width = 128; off.height = 128;
    const octx = off.getContext("2d");
    const scale = 128 / Math.max(displayCanvas.width, displayCanvas.height);
    octx.scale(scale, scale);
    renderBackground(octx, displayCanvas.width, displayCanvas.height, activeBgDef, (c) => shieldPath(c));
    octx.save(); shieldPath(octx); octx.clip();
    for (const layer of layers) {
      if (layer.visible) { octx.globalAlpha = layer.opacity ?? 1; octx.drawImage(layer.canvas, 0, 0); }
    }
    octx.globalAlpha = 1; stamps.renderTo(octx); octx.restore();
    const thumb = off.toDataURL("image/png");
    try { sessionStorage.setItem(`thumb_${designId}`, thumb); } catch {}
    const cardThumb = document.querySelector(`[data-design-id="${designId}"] .design-thumb`);
    if (cardThumb) cardThumb.style.backgroundImage = `url(${thumb})`;
  } catch {}
  return saveDesign(designId, layers, stampObjects, opts);
}

const saveMgr = createSaveManager({
  getActiveDesignId: () => activeDesignId,
  getLayersForSave:  () => layersSys.layers,
  getStampsForSave:  () => stamps.getStampObjects(),
  getForceFull: () => layersSys.forceFullUploadNextSave,
  clearDirtyFlags: () => {
    layersSys.clearDirtyFlags();
    layersSys.forceFullUploadNextSave = false;
  },
  saveDesign: async (id, layers, stampObjs, opts) => {
    try {
      await saveDesignWithExtras(id, layers, stampObjs, opts);
      showToast("Saved ✓", "success", 1800);
    } catch (err) {
      showToast("Error saving design", "error", 3000);
      throw err;
    }
  },
  touchDesignLocal: (id) => designsCtrl.touchUpdated(id),
  refreshDesignListThrottled: () => refreshDesignListThrottled(1500),
  debounceMs: 350,
});

function saveActiveToDesignsDebounced() {
  if (!activeDesignId) return;
  saveMgr.saveDebounced();
}

// ── Boot ──────────────────────────────────────────────────────
export async function boot() {
  shield.setShape(activeShapeId);

  setMode("draw");
  buildShieldMask();
  layersSys.initDefaultLayers();
  layersSys.warmBaseFill();
  layersSys.markAllLayersDirty();
  layersSys.forceFullUploadNextSave = true;
  layersSys.renderLayersList();
  stamps.renderStampList();

  buildShapeSelector();
  bgSelector?.setActive(activeBgDef.id);

  drawGuides();
  requestRender();

  await designsCtrl.refresh();

  if (activeDesignId) {
    await loadDesignIntoCanvas(activeDesignId, {
      storage: { loadDesign },
      layersSys,
      setActiveDesignId:  (id) => { activeDesignId = id; },
      setStampObjects:    (arr) => { stamps.setStampObjects(arr); },
      clearSelectedStamp: () => { stamps.clearSelection(); },
      requestRender, resetHistory, displayCanvas,
    });
  }
}
