// ============================================================
// Roman Shield Designer (v3 + UI controls)
// - Sidebar hide/restore (state persisted)
// - Draggable floating toolbar (state persisted + reset)
// - Imperial-ish scutum mask
// - Layers (draw/erase isolated)
// - Fill/unfill enclosed only
// - PNG Stamps (non-destructive objects; minimal + robust)
// - Server-backed designs via ./Storage/repo.js
// ============================================================
import { listDesigns, createDesign, saveDesign, loadDesign, deleteDesign, renameDesign } from "../Storage/repo.js";
import { createRenderScheduler } from "./core/renderScheduler.js";
import { loadUIState, saveUIState as saveUIStateMod, applyUIState as applyUIStateMod, wireSidebarButtons } from "./ui/uiState.js";
import { createShieldMask } from "./canvas/shieldMask.js";
import { getSymmetryPoints as getSymmetryPointsPure } from "./tools/symmetry.js";
import { createAppContext } from "./core/ctx.js";
//phase 3 adds
import { DEFAULT_STAMP_SIZE } from "./core/constants.js";
import { initReadouts } from "./ui/readouts.js";
//phase 4 adds
import { createLayersSystem } from "./features/layers/layersSystem.js";
import { createDesignsController } from "./designs/designsController.js";
import { createSaveManager } from "./core/saveManager.js";
import { loadDesignIntoCanvas } from "./designs/loadIntoCanvas.js";

import { createStampSystem } from "./features/stamps/stampSystem.js";
import { createInputController } from "./input/inputController.js";
import { createHistoryManager } from "./core/history.js";
const UI_KEY = "roman_shield_ui_v1";

// ============================================================
// AppContext (Phase 2 refactor)
// - Centralizes DOM + canvas lookups into one object
// - app.js still destructures out the old variable names for now
// ============================================================
const ctx = createAppContext({
  uiKey: UI_KEY,
  storage: { listDesigns, createDesign, saveDesign, loadDesign, deleteDesign, renameDesign },
});

const appRoot = ctx.appRoot;

// Canvases
const { displayCanvas, guidesCanvas, dctx, gctx } = ctx.canvas;

// ============================================================
// Render scheduler (RAF-coalesced)
// - Use requestRender() for high-frequency updates (pointermove, drag, draw)
// - Coalesces many state changes into a single composite per animation frame
// ============================================================
const render = createRenderScheduler(() => compositeToDisplay());
function requestRender(){ render.invalidate(); }

// Critical: overlay must never intercept input
guidesCanvas.style.pointerEvents = "none";
displayCanvas.style.pointerEvents = "auto";

// Right panel controls
const colorPicker = ctx.dom.colorPicker;
const brushSize = ctx.dom.brushSize;
const brushSizeVal = ctx.dom.brushSizeVal;
const brushOpacity = ctx.dom.brushOpacity;
const brushOpacityVal = ctx.dom.brushOpacityVal;
const modeSelect = ctx.dom.modeSelect;

let lastNonStampMode = "draw";
const symmetrySelect = ctx.dom.symmetrySelect;
const guidesToggle = ctx.dom.guidesToggle;
const fillTolerance = ctx.dom.fillTolerance;
const fillToleranceVal = ctx.dom.fillToleranceVal;
const stampSize = ctx.dom.stampSize;
const stampSizeVal = ctx.dom.stampSizeVal;
const stampRot = ctx.dom.stampRot;
const stampRotVal = ctx.dom.stampRotVal;
const shieldWidthIn  = ctx.dom.shieldWidthIn;
const shieldHeightIn = ctx.dom.shieldHeightIn;
const shieldCurveIn = ctx.dom.shieldCurveIn;
const gridToggle = ctx.dom.gridToggle;
const ppiReadout = ctx.dom.ppiReadout;
const clearStampBtn = ctx.dom.clearStampBtn;
const stampListEl = ctx.dom.stampListEl;

// ============================================================
// Stamp System (de-monolithed)
// ============================================================
const stamps = createStampSystem({
  displayCanvas,
  gctx,
  modeSelect,
  stampSize,
  stampRot,
  colorPicker,
  stampListEl,
  requestRender,
  saveActiveToDesignsDebounced,
  setMode: (m) => setMode(m),
  drawGuides: () => drawGuides(),
  history: null, // wired after history manager is created
});

// Stamp system owns its own stamp list UI.
stamps.renderStampList();

initReadouts(ctx.dom);

// Toolbar buttons
const drawBtn = ctx.dom.drawBtn;
const eraseBtn = ctx.dom.eraseBtn;
const fillBtn = ctx.dom.fillBtn;
const unfillBtn = ctx.dom.unfillBtn;
const stampBtn = ctx.dom.stampBtn;
const undoBtn = ctx.dom.undoBtn;
const redoBtn = ctx.dom.redoBtn;
const exportBtn = ctx.dom.exportBtn;

// Library
const newDesignBtn = ctx.dom.newDesignBtn;
//const delDesignBtn = document.getElementById("delDesignBtn");
const designListEl = ctx.dom.designListEl;

// Layers UI
const addLayerBtn = ctx.dom.addLayerBtn;
const deleteLayerBtn = ctx.dom.deleteLayerBtn;
const layersListEl = ctx.dom.layersListEl;

// Sidebar controls
const minLeftBtn = ctx.dom.minLeftBtn;
const minRightBtn = ctx.dom.minRightBtn;
const restoreLeftBtn = ctx.dom.restoreLeftBtn;
const restoreRightBtn = ctx.dom.restoreRightBtn;

// Toolbar drag
const toolbar = ctx.dom.toolbar;
const toolbarHandle = ctx.dom.toolbarHandle;

// Collapsible panels
document.querySelectorAll(".panel.collapsible .panel-head").forEach(btn => {
  btn.addEventListener("click", () => btn.closest(".panel").classList.toggle("collapsed"));
});



/* UI readouts (safe init)
if (brushSizeVal && brushSize) {
  brushSizeVal.textContent = brushSize.value;
}
if (brushOpacityVal && brushOpacity) {
  brushOpacityVal.textContent = Number(brushOpacity.value).toFixed(2);
}
if (fillToleranceVal && fillTolerance) {
  fillToleranceVal.textContent = fillTolerance.value;
}

// Stamp size standard init (keeps all stamps spawning reasonably sized)
if (stampSize && (!stampSize.value || Number(stampSize.value) <= 0)) {
  stampSize.value = DEFAULT_STAMP_SIZE;
}
if (stampSizeVal) {
  stampSizeVal.textContent = (stampSize?.value || DEFAULT_STAMP_SIZE);
}

if (stampRotVal && stampRot) {
  stampRotVal.textContent = `${stampRot.value}°`;
}


brushSize?.addEventListener("input", () => { if (brushSizeVal) brushSizeVal.textContent = brushSize.value; });
brushOpacity?.addEventListener("input", () => { if (brushOpacityVal) brushOpacityVal.textContent = Number(brushOpacity.value).toFixed(2); });
fillTolerance?.addEventListener("input", () => { if (fillToleranceVal) fillToleranceVal.textContent = fillTolerance.value; });
stampSize?.addEventListener("input", () => { if (stampSizeVal) stampSizeVal.textContent = stampSize.value; });
stampRot?.addEventListener("input", () => { if (stampRotVal) stampRotVal.textContent = `${stampRot.value}°`; });
*/
function escapeHtml(s){
  return (s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ============================================================
// UI State (sidebars + toolbar position + scale)
// ============================================================
const uiState = loadUIState(UI_KEY);

// keep existing function names so the rest of app.js doesn't care
function saveUIState(){ saveUIStateMod(UI_KEY, uiState); }
function applyUIState(){
  applyUIStateMod({
    appRoot,
    toolbar,
    uiState,
    inputs: { shieldWidthIn, shieldHeightIn, shieldCurveIn, gridToggle },
    onAfterApply: () => { updatePpiReadout(); }
  });
}



// ============================================================

// Draggable toolbar
// ============================================================
let draggingToolbar = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

toolbarHandle?.addEventListener("mousedown", (e) => {
  if (!toolbar) return;
  draggingToolbar = true;

  const rect = toolbar.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;

  toolbar.style.left = rect.left + "px";
  toolbar.style.top  = rect.top  + "px";
  toolbar.style.bottom = "auto";
  toolbar.style.transform = "translateX(0)";

  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!draggingToolbar || !toolbar) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = toolbar.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  let x = e.clientX - dragOffsetX;
  let y = e.clientY - dragOffsetY;

  x = Math.max(8, Math.min(vw - w - 8, x));
  y = Math.max(8, Math.min(vh - h - 8, y));

  toolbar.style.left = x + "px";
  toolbar.style.top  = y + "px";
});

window.addEventListener("mouseup", () => {
  if (!draggingToolbar || !toolbar) return;
  draggingToolbar = false;

  const rect = toolbar.getBoundingClientRect();
  uiState.toolbarPos = { left: rect.left, top: rect.top };
  saveUIState();
});

// dblclick handle => reset
toolbarHandle?.addEventListener("dblclick", () => {
  uiState.toolbarPos = null;
  saveUIState();

  if (!toolbar) return;
  toolbar.style.left = "50%";
  toolbar.style.top = "auto";
  toolbar.style.bottom = "16px";
  toolbar.style.transform = "translateX(-50%)";
});

function clampNum(v, min, max, fallback){
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function updateScaleFromUI(){
  if (!uiState.scale) uiState.scale = { widthIn:31, heightIn:40, curveIn:8, showGrid:false };

  if (shieldWidthIn)  uiState.scale.widthIn  = clampNum(shieldWidthIn.value, 10, 80, 31);
  if (shieldHeightIn) uiState.scale.heightIn = clampNum(shieldHeightIn.value, 10, 100, 40);
  if (shieldCurveIn)  uiState.scale.curveIn  = clampNum(shieldCurveIn.value, 0, 24, 8);
  if (gridToggle)     uiState.scale.showGrid = !!gridToggle.checked;

  saveUIState();
  updatePpiReadout();
  drawGuides();
}

shieldWidthIn?.addEventListener("input", updateScaleFromUI);
shieldHeightIn?.addEventListener("input", updateScaleFromUI);
shieldCurveIn?.addEventListener("input", updateScaleFromUI);
gridToggle?.addEventListener("change", updateScaleFromUI);

function getPpi(){
  const pxW = displayCanvas.width;
  const pxH = displayCanvas.height;
  const wIn = uiState.scale?.widthIn ?? 31;
  const hIn = uiState.scale?.heightIn ?? 40;

  const ppiX = pxW / wIn;
  const ppiY = pxH / hIn;
  return { ppiX, ppiY };
}

function updatePpiReadout(){
  if (!ppiReadout) return;
  const { ppiX, ppiY } = getPpi();
  ppiReadout.textContent = `${ppiX.toFixed(2)} · ${ppiY.toFixed(2)}`;
}

// ============================================================
// Shield mask
// ============================================================
const shield = createShieldMask(displayCanvas);

// keep existing function names used throughout app.js
const shieldPath = shield.shieldPath;
const buildShieldMask = shield.buildShieldMask;
const isInsideShield = shield.isInsideShield;
const isOnShieldBoundary = shield.isOnShieldBoundary;
const clipToShield = shield.clipToShield;
const unclip = shield.unclip;

const layersSys = createLayersSystem({
  displayCanvas,
  clipToShield,
  unclip,
  layersListEl,
  addLayerBtn,
  deleteLayerBtn,
  requestRender,
  saveActiveToDesignsDebounced,
  escapeHtml,
});

// ============================================================
// History (Undo/Redo) (de-monolithed)
// ============================================================
const history = createHistoryManager({
  displayCanvas,
  layersSys,
  stamps,
  requestRender,
  saveActiveToDesignsDebounced,
});
stamps.setHistory(history);
undoBtn?.addEventListener("click", () => history.undo());
redoBtn?.addEventListener("click", () => history.redo());

applyUIState();
requestRender();
wireSidebarButtons({
  storageKey: UI_KEY,
  uiState,
  buttons: { minLeftBtn, minRightBtn, restoreLeftBtn, restoreRightBtn },
  apply: applyUIState,
});
// ============================================================

// Guides
// ============================================================
function drawGuides() {
  gctx.clearRect(0,0,guidesCanvas.width, guidesCanvas.height);

  // outline
  gctx.lineWidth = 6;
  gctx.strokeStyle = "rgba(214,168,75,.35)";
  shieldPath(gctx);
  gctx.stroke();

  gctx.lineWidth = 2;
  gctx.strokeStyle = "rgba(0,0,0,.12)";
  shieldPath(gctx);
  gctx.stroke();

  // If guides off, still draw stamp selection overlay
  if (guidesToggle && !guidesToggle.checked){
    stamps.drawSelectionOverlay();
    return;
  }

  const w = guidesCanvas.width, h = guidesCanvas.height;
  gctx.lineWidth = 1;
  gctx.strokeStyle = "rgba(0,0,0,.12)";

  gctx.beginPath();
  gctx.moveTo(w/2, 0); gctx.lineTo(w/2, h);
  gctx.moveTo(0, h/2); gctx.lineTo(w, h/2);
  gctx.stroke();

  if (uiState.scale?.showGrid) {
    const { ppiX, ppiY } = getPpi();

    gctx.save();
    shieldPath(gctx);
    gctx.clip();

    gctx.lineWidth = 1;
    gctx.strokeStyle = "rgba(0,0,0,.08)";

    for (let x = 0; x <= guidesCanvas.width; x += ppiX) {
      gctx.beginPath();
      gctx.moveTo(x, 0);
      gctx.lineTo(x, guidesCanvas.height);
      gctx.stroke();
    }

    for (let y = 0; y <= guidesCanvas.height; y += ppiY) {
      gctx.beginPath();
      gctx.moveTo(0, y);
      gctx.lineTo(guidesCanvas.width, y);
      gctx.stroke();
    }

    gctx.restore();
  }

  stamps.drawSelectionOverlay();
}

guidesToggle?.addEventListener("change", drawGuides);

// ============================================================
// Symmetry helpers
// ============================================================
function getSymmetryPoints(p) {
  const mode = symmetrySelect?.value || "none";
  return getSymmetryPointsPure(p, { w: displayCanvas.width, h: displayCanvas.height }, mode);
}

// ============================================================

// Layers system
// ============================================================
/*
let layers = [];
let activeLayerIndex = 0;
let forceFullUploadNextSave = true; // true on boot / after load / after add/delete layer

function markLayerDirty(idx = activeLayerIndex){
    if (layers[idx]) layers[idx].dirty = true;
   }

function markAllLayersDirty(){
     layers.forEach(l => l.dirty = true);
   }

function clearDirtyFlags(){
     layers.forEach(l => l.dirty = false);
     forceFullUploadNextSave = false;
   }
function createLayer(name) {
  const c = document.createElement("canvas");
  c.width = displayCanvas.width;
  c.height = displayCanvas.height;
  const cctx = c.getContext("2d", { willReadFrequently: true });
  return { id: crypto.randomUUID(), name, visible: true, dirty:true, canvas: c, ctx: cctx };
}

function initDefaultLayers() {
  layers = [ createLayer("Base"), createLayer("Details"), createLayer("Highlights") ];
  activeLayerIndex = 1;
}

function renderLayersList(){
  if (!layersListEl) return;
  layersListEl.innerHTML = "";
  for (let i=layers.length-1; i>=0; i--) {
    const layer = layers[i];
    const el = document.createElement("div");
    el.className = "layer-item" + (i === activeLayerIndex ? " active" : "");
    el.innerHTML = `
      <div class="layer-eye" data-eye="${i}">${layer.visible ? "👁" : "–"}</div>
      <div class="layer-name">${escapeHtml(layer.name)}</div>
      <div class="layer-tag">${i === activeLayerIndex ? "Active" : ""}</div>
    `;
    el.addEventListener("click", (e) => {
      const eye = e.target.closest("[data-eye]");
      if (eye) {
        const idx = Number(eye.getAttribute("data-eye"));
        layers[idx].visible = !layers[idx].visible;
        renderLayersList();
        requestRender();
        return;
      }
      activeLayerIndex = i;
      renderLayersList();
    });
    layersListEl.appendChild(el);
  }
}

addLayerBtn?.addEventListener("click", () => {
  const name = prompt("Layer name?", `Layer ${layers.length+1}`);
  if (!name) return;
  history.pushUndo();
  history.clearRedo();
  layers.push(createLayer(name));
  activeLayerIndex = layers.length - 1;
  forceFullUploadNextSave = true;
  renderLayersList();
  requestRender();
  saveActiveToDesignsDebounced();

});

deleteLayerBtn?.addEventListener("click", () => {
  if (layers.length <= 1) return;
  history.pushUndo();
  history.clearRedo();
  layers.splice(activeLayerIndex, 1);
  activeLayerIndex = Math.max(0, activeLayerIndex - 1);
  forceFullUploadNextSave = true;
  renderLayersList();
  requestRender();
  saveActiveToDesignsDebounced();

});

// ============================================================
// Base warm fill
// ============================================================
function warmBaseFill(){
  const base = layers[0]?.ctx;
  if (!base) return;
  base.clearRect(0,0,displayCanvas.width,displayCanvas.height);
  clipToShield(base);
  base.fillStyle = "rgba(43,31,23,1)";
  base.fillRect(0,0,displayCanvas.width,displayCanvas.height);
  unclip(base);
}
*/







// ============================================================
// Stamp system (minimal but working)
// ============================================================

/**
 * Define your stamps here.
    Middle arrow meant to span the entire length of the shield length wise and width wise
    wings(left and right) meant to be flippable(up and down) - flipping could be done in the service
        but for now its just left and right
    lauralarms(left and right) they will once be put together make one full laurel wreath
    lightning bolts(left and right)
    Legiontags
    animals(several)
 */
// Compositing
// ============================================================
function compositeToDisplay() {
  dctx.clearRect(0,0,displayCanvas.width, displayCanvas.height);

  dctx.save();
  shieldPath(dctx);
  dctx.clip();

  for (const layer of layersSys.layers) {
    if (!layer.visible) continue;
    dctx.drawImage(layer.canvas, 0, 0);
  }

  stamps.renderTo(dctx);
  dctx.restore();

  drawGuides();
}

function getCompositeImageData() {
  const w = displayCanvas.width, h = displayCanvas.height;
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const o = off.getContext("2d", { willReadFrequently: true });

  o.save();
  shieldPath(o);
  o.clip();
  for (const layer of layersSys.layers) if (layer.visible) o.drawImage(layer.canvas, 0, 0);

  stamps.renderTo(o);
  o.restore();

  return o.getImageData(0,0,w,h);
}

// ============================================================
// Fill / Unfill (enclosed only)
// ============================================================
function parseHexColor(hex){
  return {
    r: parseInt(hex.slice(1,3),16),
    g: parseInt(hex.slice(3,5),16),
    b: parseInt(hex.slice(5,7),16),
    a: 255
  };
}
function colorDist(r1,g1,b1,a1, r2,g2,b2,a2){
  return Math.abs(r1-r2)+Math.abs(g1-g2)+Math.abs(b1-b2)+Math.abs(a1-a2);
}

function enclosedFloodFill(seedX, seedY, tolerance) {
  const w = displayCanvas.width, h = displayCanvas.height;

  const comp = getCompositeImageData();
  const data = comp.data;

  const sx = Math.floor(seedX), sy = Math.floor(seedY);
  if (!isInsideShield(sx,sy)) return { pixels: null, leaked: true };

  const startIdx = (sy*w + sx)*4;
  const sr = data[startIdx], sg=data[startIdx+1], sb=data[startIdx+2], sa=data[startIdx+3];

  const visited = new Uint8Array(w*h);
  const q = new Int32Array(w*h);
  let qs=0, qe=0;

  const out = new Uint32Array(w*h);
  let outN = 0;

  q[qe++] = sy*w + sx;
  visited[sy*w + sx] = 1;

  let leaked = false;

  while (qs < qe) {
    const p = q[qs++];
    const x = p % w;
    const y = (p / w) | 0;

    if (!isInsideShield(x,y)) continue;
    if (isOnShieldBoundary(x,y)) leaked = true;

    const idx = p*4;
    const r = data[idx], g=data[idx+1], b=data[idx+2], a=data[idx+3];

    if (colorDist(r,g,b,a, sr,sg,sb,sa) > tolerance) continue;

    out[outN++] = p;

    const n1 = p-1, n2=p+1, n3=p-w, n4=p+w;
    if (x>0   && !visited[n1]) { visited[n1]=1; q[qe++]=n1; }
    if (x<w-1 && !visited[n2]) { visited[n2]=1; q[qe++]=n2; }
    if (y>0   && !visited[n3]) { visited[n3]=1; q[qe++]=n3; }
    if (y<h-1 && !visited[n4]) { visited[n4]=1; q[qe++]=n4; }
  }

  return { pixels: out.subarray(0,outN), leaked };
}

function applyFillAtPoint(p, unfillMode=false) {
  const tol = Number(fillTolerance?.value || 0);
  const rep = parseHexColor(colorPicker?.value || "#ffffff");
  const pts = getSymmetryPoints(p);

  history.pushUndo();
  history.clearRedo();

  const active = layersSys.layers[layersSys.activeLayerIndex];
  const img = active.ctx.getImageData(0,0,displayCanvas.width, displayCanvas.height);
  const data = img.data;

  for (const sp of pts) {
    const x = Math.floor(sp.x), y = Math.floor(sp.y);
    if (!isInsideShield(x,y)) continue;

    const res = enclosedFloodFill(x,y,tol);
    if (!res.pixels || res.leaked) continue;

    for (let i=0;i<res.pixels.length;i++){
      const pix = res.pixels[i];
      const idx = pix*4;
      if (unfillMode) {
        data[idx]=0; data[idx+1]=0; data[idx+2]=0; data[idx+3]=0;
      } else {
        data[idx]=rep.r; data[idx+1]=rep.g; data[idx+2]=rep.b; data[idx+3]=255;
      }
    }
  }
  active.ctx.putImageData(img,0,0);
  layersSys.markLayerDirty(layersSys.activeLayerIndex);
  requestRender();
  saveActiveToDesignsDebounced();

}

// ============================================================
// ============================================================
// Input Controller (de-monolithed)
// ============================================================
createInputController({
  displayCanvas,
  windowObj: window,
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
});

function setMode(m){
  if (modeSelect) modeSelect.value = m;
  if (m !== "stamp") lastNonStampMode = m;

  drawBtn?.classList.toggle("selected", m==="draw");
  eraseBtn?.classList.toggle("selected", m==="erase");
  fillBtn?.classList.toggle("selected", m==="fill");
  unfillBtn?.classList.toggle("selected", m==="unfill");
  stampBtn?.classList.toggle("selected", m==="stamp");

  requestRender();
}

drawBtn?.addEventListener("click", () => setMode("draw"));
eraseBtn?.addEventListener("click", () => setMode("erase"));
fillBtn?.addEventListener("click", () => setMode("fill"));
unfillBtn?.addEventListener("click", () => setMode("unfill"));
stampBtn?.addEventListener("click", () => setMode("stamp"));
modeSelect?.addEventListener("change", () => setMode(modeSelect.value));

// ============================================================
// History (Undo/Redo) (de-monolithed)
// ============================================================

// ============================================================
// Export
// ============================================================
function exportPNG(){
  const dataUrl = displayCanvas.toDataURL("image/png");
  localStorage.setItem("roman_shield_last_export", dataUrl);
  window.open("/projector", "_blank");
}
exportBtn?.addEventListener("click", exportPNG);

// ============================================================
// ============================================================
// Designs + Saves (de-monolith)
// ============================================================
let activeDesignId = null;

const _designsRefresh = { timer: null, inFlight: null };

function resetHistory() {
  history.reset();
}

function refreshDesignListThrottled(ms = 1200) {
  if (_designsRefresh.timer) clearTimeout(_designsRefresh.timer);
  _designsRefresh.timer = setTimeout(async () => {
    if (_designsRefresh.inFlight) return;
    _designsRefresh.inFlight = (async () => {
      try {
        await designsCtrl.refresh();
      } finally {
        _designsRefresh.inFlight = null;
      }
    })();
  }, ms);
}

const designsCtrl = createDesignsController({
  designListEl,
  newDesignBtn,
  layersSys,
  displayCanvas,
  requestRender,
  resetHistory,
  getActiveDesignId: () => activeDesignId,
  setActiveDesignId: (id) => { activeDesignId = id; },
  setStampObjects: (arr) => { stamps.setStampObjects(arr); },
  clearSelectedStamp: () => { stamps.clearSelection(); },
  storage: { listDesigns, createDesign, loadDesign, deleteDesign, renameDesign },
  saveDebounced: () => saveActiveToDesignsDebounced(),
});

const saveMgr = createSaveManager({
  getActiveDesignId: () => activeDesignId,
  getLayersForSave: () => layersSys.layers,
  getStampsForSave: () => stamps.getStampObjects(),
  getForceFull: () => layersSys.forceFullUploadNextSave,
  clearDirtyFlags: () => {
    layersSys.clearDirtyFlags();
    layersSys.forceFullUploadNextSave = false;
  },
  saveDesign,
  touchDesignLocal: (id) => designsCtrl.touchUpdated(id),
  refreshDesignListThrottled: () => refreshDesignListThrottled(1500),
  debounceMs: 350,
});

function saveActiveToDesignsDebounced() {
  if (!activeDesignId) return;
  saveMgr.saveDebounced();
}

// ============================================================
// Init
// ============================================================
export async function boot(){
  setMode("draw");
  buildShieldMask();
  layersSys.initDefaultLayers();
  layersSys.warmBaseFill();
  layersSys.markAllLayersDirty();
  layersSys.forceFullUploadNextSave = true;
  layersSys.renderLayersList();
  stamps.renderStampList();
  drawGuides();
  requestRender();
  await designsCtrl.refresh();
  if (activeDesignId) {
    await loadDesignIntoCanvas(activeDesignId, {
      storage: { loadDesign },
      layersSys,
      setActiveDesignId: (id) => { activeDesignId = id; },
      setStampObjects: (arr) => { stamps.setStampObjects(arr); },
      clearSelectedStamp: () => { stamps.clearSelection(); },
      requestRender,
      resetHistory,
      displayCanvas,
    });
  }
}
