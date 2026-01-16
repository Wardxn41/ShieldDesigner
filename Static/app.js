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

import { listDesigns, createDesign, saveDesign, loadDesign } from "./Storage/repo.js";

const UI_KEY = "roman_shield_ui_v1";
const appRoot = document.getElementById("appRoot");

// Canvases
const displayCanvas = document.getElementById("displayCanvas");
const guidesCanvas  = document.getElementById("guidesCanvas");
const dctx = displayCanvas.getContext("2d", { willReadFrequently: true });
const gctx = guidesCanvas.getContext("2d");

// Critical: overlay must never intercept input
guidesCanvas.style.pointerEvents = "none";
displayCanvas.style.pointerEvents = "auto";

// Right panel controls
const colorPicker = document.getElementById("colorPicker");
const brushSize = document.getElementById("brushSize");
const brushSizeVal = document.getElementById("brushSizeVal");
const brushOpacity = document.getElementById("brushOpacity");
const brushOpacityVal = document.getElementById("brushOpacityVal");

const modeSelect = document.getElementById("modeSelect");
const symmetrySelect = document.getElementById("symmetrySelect");
const guidesToggle = document.getElementById("guidesToggle");

const fillTolerance = document.getElementById("fillTolerance");
const fillToleranceVal = document.getElementById("fillToleranceVal");

const stampSize = document.getElementById("stampSize");
const stampSizeVal = document.getElementById("stampSizeVal");
const stampRot = document.getElementById("stampRot");
const stampRotVal = document.getElementById("stampRotVal");

const shieldWidthIn  = document.getElementById("shieldWidthIn");
const shieldHeightIn = document.getElementById("shieldHeightIn");
const shieldCurveIn  = document.getElementById("shieldCurveIn");
const gridToggle     = document.getElementById("gridToggle");
const ppiReadout     = document.getElementById("ppiReadout");

const clearStampBtn = document.getElementById("clearStampBtn");
const stampListEl = document.getElementById("stampList");

// Toolbar buttons
const drawBtn = document.getElementById("drawBtn");
const eraseBtn = document.getElementById("eraseBtn");
const fillBtn = document.getElementById("fillBtn");
const unfillBtn = document.getElementById("unfillBtn");
const stampBtn = document.getElementById("stampBtn");

const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const exportBtn = document.getElementById("exportBtn");

// Library
const newDesignBtn = document.getElementById("newDesignBtn");
const designListEl = document.getElementById("designList");

// Layers UI
const addLayerBtn = document.getElementById("addLayerBtn");
const deleteLayerBtn = document.getElementById("deleteLayerBtn");
const layersListEl = document.getElementById("layersList");

// Sidebar controls
const minLeftBtn = document.getElementById("minLeftBtn");
const minRightBtn = document.getElementById("minRightBtn");
const restoreLeftBtn = document.getElementById("restoreLeftBtn");
const restoreRightBtn = document.getElementById("restoreRightBtn");

// Toolbar drag
const toolbar = document.getElementById("toolbar");
const toolbarHandle = document.getElementById("toolbarHandle");

// Collapsible panels
document.querySelectorAll(".panel.collapsible .panel-head").forEach(btn => {
  btn.addEventListener("click", () => btn.closest(".panel").classList.toggle("collapsed"));
});

// UI readouts
brushSizeVal.textContent = brushSize.value;
brushOpacityVal.textContent = Number(brushOpacity.value).toFixed(2);
fillToleranceVal.textContent = fillTolerance.value;
stampSizeVal.textContent = stampSize.value;
stampRotVal.textContent = `${stampRot.value}°`;

brushSize.addEventListener("input", () => brushSizeVal.textContent = brushSize.value);
brushOpacity.addEventListener("input", () => brushOpacityVal.textContent = Number(brushOpacity.value).toFixed(2));
fillTolerance.addEventListener("input", () => fillToleranceVal.textContent = fillTolerance.value);
stampSize.addEventListener("input", () => stampSizeVal.textContent = stampSize.value);
stampRot.addEventListener("input", () => stampRotVal.textContent = `${stampRot.value}°`);

function escapeHtml(s){
  return (s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ============================================================
// UI State (sidebars + toolbar position + scale)
// ============================================================
const uiState = loadUIState();
applyUIState();

minLeftBtn?.addEventListener("click", () => { uiState.hideLeft = true;  saveUIState(); applyUIState(); });
minRightBtn?.addEventListener("click", () => { uiState.hideRight = true; saveUIState(); applyUIState(); });
restoreLeftBtn?.addEventListener("click", () => { uiState.hideLeft = false;  saveUIState(); applyUIState(); });
restoreRightBtn?.addEventListener("click", () => { uiState.hideRight = false; saveUIState(); applyUIState(); });

function loadUIState(){
  try{
    const raw = localStorage.getItem(UI_KEY);
    return raw ? JSON.parse(raw) : {
      hideLeft:false,
      hideRight:false,
      toolbarPos:null,
      scale: { widthIn: 31, heightIn: 40, curveIn: 8, showGrid: false }
    };
  } catch {
    return {
      hideLeft:false,
      hideRight:false,
      toolbarPos:null,
      scale: { widthIn: 31, heightIn: 40, curveIn: 8, showGrid: false }
    };
  }
}
function saveUIState(){ localStorage.setItem(UI_KEY, JSON.stringify(uiState)); }

function applyUIState(){
  if (appRoot){
    appRoot.classList.toggle("hide-left",  !!uiState.hideLeft);
    appRoot.classList.toggle("hide-right", !!uiState.hideRight);
  }

  // restore toolbar position if saved
  if (uiState.toolbarPos && toolbar) {
    toolbar.style.left = uiState.toolbarPos.left + "px";
    toolbar.style.top  = uiState.toolbarPos.top  + "px";
    toolbar.style.bottom = "auto";
    toolbar.style.transform = "translateX(0)";
  }

  if (!uiState.scale) uiState.scale = { widthIn:31, heightIn:40, curveIn:8, showGrid:false };

  if (shieldWidthIn)  shieldWidthIn.value  = uiState.scale.widthIn;
  if (shieldHeightIn) shieldHeightIn.value = uiState.scale.heightIn;
  if (shieldCurveIn)  shieldCurveIn.value  = uiState.scale.curveIn;
  if (gridToggle)     gridToggle.checked   = !!uiState.scale.showGrid;

  updatePpiReadout();
  drawGuides();
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
function shieldPath(c) {
  const w = displayCanvas.width;
  const h = displayCanvas.height;

  const left = w * 0.18;
  const right = w * 0.82;
  const top = h * 0.03;
  const bottom = h * 0.97;

  const rx = w * 0.13;
  const ry = h * 0.09;

  c.beginPath();
  c.moveTo(left + rx, top);
  c.lineTo(right - rx, top);
  c.quadraticCurveTo(right, top, right, top + ry);
  c.lineTo(right, bottom - ry);
  c.quadraticCurveTo(right, bottom, right - rx, bottom);
  c.lineTo(left + rx, bottom);
  c.quadraticCurveTo(left, bottom, left, bottom - ry);
  c.lineTo(left, top + ry);
  c.quadraticCurveTo(left, top, left + rx, top);
  c.closePath();
}

let shieldMask = null;
let shieldBoundary = null;

function buildShieldMask() {
  const w = displayCanvas.width, h = displayCanvas.height;
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const octx = off.getContext("2d", { willReadFrequently: true });

  octx.clearRect(0,0,w,h);
  octx.fillStyle = "rgba(255,255,255,1)";
  shieldPath(octx);
  octx.fill();

  const img = octx.getImageData(0,0,w,h).data;
  const m = new Uint8Array(w*h);
  for (let i=0;i<w*h;i++){
    m[i] = img[i*4+3] > 0 ? 1 : 0;
  }
  shieldMask = m;

  const b = new Uint8Array(w*h);
  for (let y=1;y<h-1;y++){
    for (let x=1;x<w-1;x++){
      const p = y*w + x;
      if (!m[p]) continue;
      if (!m[p-1] || !m[p+1] || !m[p-w] || !m[p+w]) b[p] = 1;
    }
  }
  shieldBoundary = b;
}

function isInsideShield(x,y){
  const w = displayCanvas.width, h = displayCanvas.height;
  if (x<0||y<0||x>=w||y>=h) return false;
  return shieldMask?.[y*w + x] === 1;
}
function isOnShieldBoundary(x,y){
  const w = displayCanvas.width;
  return shieldBoundary?.[y*w + x] === 1;
}

function clipToShield(c){ c.save(); shieldPath(c); c.clip(); }
function unclip(c){ c.restore(); }

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
    drawStampSelectionOverlay();
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

  drawStampSelectionOverlay();
}

guidesToggle?.addEventListener("change", drawGuides);

// ============================================================
// Symmetry helpers
// ============================================================
function getSymmetryPoints(p) {
  const w = displayCanvas.width, h = displayCanvas.height;
  const cx = w/2, cy = h/2;
  const mode = symmetrySelect?.value || "none";

  const base = { x:p.x, y:p.y };
  const mx = { x:(2*cx - p.x), y:p.y };
  const my = { x:p.x, y:(2*cy - p.y) };
  const mxy= { x:(2*cx - p.x), y:(2*cy - p.y) };

  if (mode === "none") return [base];
  if (mode === "mirrorX") return [base, mx];
  if (mode === "mirrorY") return [base, my];
  if (mode === "mirrorXY") return [base, mx, my, mxy];

  const steps = mode === "radial8" ? 8 : 4;
  const angStep = (Math.PI * 2) / steps;
  const dx = p.x - cx;
  const dy = p.y - cy;

  const pts = [];
  for (let i=0;i<steps;i++){
    const a = angStep * i;
    const rx = dx*Math.cos(a) - dy*Math.sin(a);
    const ry = dx*Math.sin(a) + dy*Math.cos(a);
    pts.push({ x: cx + rx, y: cy + ry });
  }
  return pts;
}

// ============================================================
// Layers system
// ============================================================
let layers = [];
let activeLayerIndex = 0;

function createLayer(name) {
  const c = document.createElement("canvas");
  c.width = displayCanvas.width;
  c.height = displayCanvas.height;
  const cctx = c.getContext("2d", { willReadFrequently: true });
  return { id: crypto.randomUUID(), name, visible: true, canvas: c, ctx: cctx };
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
        compositeToDisplay();
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
  pushUndo();
  redoStack = [];
  layers.push(createLayer(name));
  activeLayerIndex = layers.length - 1;
  renderLayersList();
  compositeToDisplay();
  saveActiveToDesigns();
});

deleteLayerBtn?.addEventListener("click", () => {
  if (layers.length <= 1) return;
  pushUndo();
  redoStack = [];
  layers.splice(activeLayerIndex, 1);
  activeLayerIndex = Math.max(0, activeLayerIndex - 1);
  renderLayersList();
  compositeToDisplay();
  saveActiveToDesigns();
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

// ============================================================
// Stamp system (minimal but working)
// ============================================================

/**
 * Define your stamps here.
 * Make sure the `src` paths exist under /static/...
 * If you already have a STAMPS list elsewhere, remove one (keep only one).
 */
const STAMPS = [
  // Example placeholders. Replace with your real stamp assets.
  { id: "eagle", name: "Eagle", src: "/static/stamps/eagle.png", tintable: true },
  { id: "bolt",  name: "Bolt",  src: "/static/stamps/bolt.png",  tintable: true },
  { id: "laurel",name: "Laurel",src: "/static/stamps/laurel.png",tintable: true },
];

let stampObjects = [];       // [{uid, stampId, x,y, rot, sx, sy, flipX, flipY, baseSize, color, opacity}]
let selectedStampUid = null; // uid of selected stamp

const stampImgCache = new Map();     // stampId -> Image
const stampLoaded   = new Map();     // stampId -> boolean
const tintedCache   = new Map();     // `${stampId}|${color}` -> canvas

const HANDLE_SIZE = 10;
const ROTATE_HANDLE_DIST = 30;

function loadStampImage(stampId){
  if (stampImgCache.has(stampId)) return stampImgCache.get(stampId);

  const meta = STAMPS.find(s => s.id === stampId);
  if (!meta) return null;

  const img = new Image();
  // Stamps are served from same-origin static; crossOrigin is safe anyway:
  img.crossOrigin = "anonymous";

  stampLoaded.set(stampId, false);
  img.onload = () => { stampLoaded.set(stampId, true); compositeToDisplay(); };
  img.onerror = () => { stampLoaded.set(stampId, false); };

  img.src = meta.src;
  stampImgCache.set(stampId, img);
  return img;
}

function getTintedStampCanvas(stampId, colorHex){
  const key = `${stampId}|${colorHex}`;
  if (tintedCache.has(key)) return tintedCache.get(key);

  const img = loadStampImage(stampId);
  if (!img || !stampLoaded.get(stampId)) return null;

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const cctx = c.getContext("2d");

  // draw original
  cctx.drawImage(img, 0, 0);

  // tint via source-in overlay
  cctx.globalCompositeOperation = "source-in";
  cctx.fillStyle = colorHex;
  cctx.fillRect(0, 0, c.width, c.height);
  cctx.globalCompositeOperation = "source-over";

  tintedCache.set(key, c);
  return c;
}

function getSelectedStamp(){
  return stampObjects.find(s => s.uid === selectedStampUid) || null;
}

function deleteSelectedStamp(){
  if (!selectedStampUid) return;
  pushUndo();
  redoStack = [];
  stampObjects = stampObjects.filter(s => s.uid !== selectedStampUid);
  selectedStampUid = null;
  compositeToDisplay();
  saveActiveToDesigns();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    const el = document.activeElement;
    const isTyping = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (!isTyping && modeSelect?.value === "stamp") {
      e.preventDefault();
      deleteSelectedStamp();
    }
  }
}, { passive: false });

function renderStampList(){
  if (!stampListEl) return;
  stampListEl.innerHTML = "";
  for (const s of STAMPS){
    const btn = document.createElement("button");
    btn.className = "stamp-item";
    btn.textContent = s.name;
    btn.addEventListener("click", () => {
      // add new stamp centered
      const uid = crypto.randomUUID();
      const base = Number(stampSize?.value || 64);
      stampObjects.push({
        uid,
        stampId: s.id,
        x: displayCanvas.width/2,
        y: displayCanvas.height/2,
        rot: (Number(stampRot?.value || 0) * Math.PI) / 180,
        sx: 1, sy: 1,
        flipX: false, flipY: false,
        baseSize: base,
        color: colorPicker?.value || "#ffffff",
        opacity: 1,
      });
      selectedStampUid = uid;
      setMode("stamp");
      compositeToDisplay();
      saveActiveToDesigns();
    });
    stampListEl.appendChild(btn);
  }
}

clearStampBtn?.addEventListener("click", () => {
  pushUndo();
  redoStack = [];
  stampObjects = [];
  selectedStampUid = null;
  compositeToDisplay();
  saveActiveToDesigns();
});

// ============================================================
// Stamp selection overlay (guidesCanvas)
// ============================================================
function drawStampSelectionOverlay() {
  if (modeSelect?.value !== "stamp") return;

  const obj = getSelectedStamp();
  if (!obj) return;

  const img = loadStampImage(obj.stampId);
  if (!img) return;
  if (!stampLoaded.get(obj.stampId)) return;

  const aspect = img.height / img.width;
  const w = obj.baseSize;
  const h = obj.baseSize * aspect;

  const cornersLocal = [
    { x: -w / 2, y: -h / 2 },
    { x:  w / 2, y: -h / 2 },
    { x:  w / 2, y:  h / 2 },
    { x: -w / 2, y:  h / 2 },
  ];

  const sx = obj.sx * (obj.flipX ? -1 : 1);
  const sy = obj.sy * (obj.flipY ? -1 : 1);

  const cos = Math.cos(obj.rot);
  const sin = Math.sin(obj.rot);

  const corners = cornersLocal.map(p => {
    let x = p.x * sx;
    let y = p.y * sy;
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return { x: obj.x + rx, y: obj.y + ry };
  });

  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const mids = [
    mid(corners[0], corners[1]),
    mid(corners[1], corners[2]),
    mid(corners[2], corners[3]),
    mid(corners[3], corners[0]),
  ];

  gctx.save();
  gctx.lineWidth = 2;
  gctx.strokeStyle = "rgba(214,168,75,0.95)";
  gctx.fillStyle   = "rgba(43,31,23,0.85)";

  // Box
  gctx.beginPath();
  gctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) gctx.lineTo(corners[i].x, corners[i].y);
  gctx.closePath();
  gctx.stroke();

  // Handles
  const handlePts = [corners[0], corners[1], corners[2], corners[3], ...mids];
  for (const hp of handlePts) {
    gctx.beginPath();
    gctx.rect(hp.x - HANDLE_SIZE / 2, hp.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    gctx.fill();
    gctx.stroke();
  }

  // rotate handle
  const topMid = mids[0];
  const ex = corners[1].x - corners[0].x;
  const ey = corners[1].y - corners[0].y;
  const len = Math.hypot(ex, ey) || 1;
  const nx = -ey / len;
  const ny =  ex / len;

  const rotHandle = {
    x: topMid.x + nx * ROTATE_HANDLE_DIST,
    y: topMid.y + ny * ROTATE_HANDLE_DIST
  };

  gctx.beginPath();
  gctx.moveTo(topMid.x, topMid.y);
  gctx.lineTo(rotHandle.x, rotHandle.y);
  gctx.stroke();

  gctx.beginPath();
  gctx.arc(rotHandle.x, rotHandle.y, HANDLE_SIZE * 0.6, 0, Math.PI * 2);
  gctx.fill();
  gctx.stroke();

  gctx.restore();

  obj.__handles = { corners, mids, rotHandle, topMid };
}

// Handle hit-test
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

function hitTestHandle(p){
  const obj = getSelectedStamp();
  if (!obj || !obj.__handles) return null;
  const { corners, mids, rotHandle } = obj.__handles;

  const all = [
    ...corners.map((pt, idx) => ({ type:"corner", idx, pt })),
    ...mids.map((pt, idx) => ({ type:"mid", idx, pt })),
    { type:"rotate", idx:0, pt: rotHandle },
  ];

  for (const h of all){
    if (dist(p, h.pt) <= HANDLE_SIZE) return h;
  }
  return null;
}

// Stamp hit-test on object bounds
function hitTestStampObject(worldP){
  for (let i = stampObjects.length - 1; i >= 0; i--) {
    const obj = stampObjects[i];
    const img = loadStampImage(obj.stampId);
    if (!img || !stampLoaded.get(obj.stampId)) continue;

    const aspect = img.height / img.width;
    const w = obj.baseSize;
    const h = obj.baseSize * aspect;

    // world -> local
    const dx = worldP.x - obj.x;
    const dy = worldP.y - obj.y;

    const cos = Math.cos(-obj.rot);
    const sin = Math.sin(-obj.rot);
    let lx = dx * cos - dy * sin;
    let ly = dx * sin + dy * cos;

    const sx = obj.sx * (obj.flipX ? -1 : 1);
    const sy = obj.sy * (obj.flipY ? -1 : 1);
    if (sx === 0 || sy === 0) continue;

    lx /= sx;
    ly /= sy;

    if (lx >= -w/2 && lx <= w/2 && ly >= -h/2 && ly <= h/2) return obj;
  }
  return null;
}

function selectStampIfClicked(p){
  const hit = hitTestStampObject(p);
  if (!hit) return false;
  selectedStampUid = hit.uid;
  setMode("stamp");
  compositeToDisplay();
  drawGuides();
  return true;
}

// Stamp pointer pipeline
let stampDragging = false;
let stampDragMode = null; // "move" | "scale" | "rotate"
let stampStart = null;

function stampPointerDown(p){
  const obj = getSelectedStamp();

  // If clicking on a stamp while in stamp mode, select it
  const hit = hitTestStampObject(p);
  if (hit && (!obj || hit.uid !== obj.uid)) {
    selectedStampUid = hit.uid;
    compositeToDisplay();
    drawGuides();
  }

  const cur = getSelectedStamp();
  if (!cur) return;

  // ensure overlay handles are computed
  compositeToDisplay(); // calls drawGuides -> drawStampSelectionOverlay -> __handles

  const h = hitTestHandle(p);
  stampDragging = true;

  if (h?.type === "rotate"){
    stampDragMode = "rotate";
  } else if (h){
    stampDragMode = "scale";
  } else {
    stampDragMode = "move";
  }

  stampStart = {
    p0: { ...p },
    x0: cur.x, y0: cur.y,
    rot0: cur.rot,
    sx0: cur.sx, sy0: cur.sy,
    base0: cur.baseSize,
  };
}

function stampPointerMove(p){
  if (!stampDragging) return;
  const obj = getSelectedStamp();
  if (!obj || !stampStart) return;

  const dx = p.x - stampStart.p0.x;
  const dy = p.y - stampStart.p0.y;

  if (stampDragMode === "move"){
    obj.x = stampStart.x0 + dx;
    obj.y = stampStart.y0 + dy;
  } else if (stampDragMode === "rotate"){
    // angle from center
    const a0 = Math.atan2(stampStart.p0.y - stampStart.y0, stampStart.p0.x - stampStart.x0);
    const a1 = Math.atan2(p.y - stampStart.y0, p.x - stampStart.x0);
    obj.rot = stampStart.rot0 + (a1 - a0);
  } else if (stampDragMode === "scale"){
    // basic scale by distance change
    const d0 = Math.hypot(stampStart.p0.x - stampStart.x0, stampStart.p0.y - stampStart.y0) || 1;
    const d1 = Math.hypot(p.x - stampStart.x0, p.y - stampStart.y0) || 1;
    const s = d1 / d0;
    obj.sx = stampStart.sx0 * s;
    obj.sy = stampStart.sy0 * s;
  }

  compositeToDisplay();
}

function stampPointerUp(){
  if (!stampDragging) return;
  stampDragging = false;
  stampDragMode = null;
  stampStart = null;
  saveActiveToDesigns();
}

// ============================================================
// Render stamp objects (non-destructive) on top of composited layers
// ============================================================
function renderStampObjects(ctx) {
  if (!Array.isArray(stampObjects) || stampObjects.length === 0) return;

  for (const obj of stampObjects) {
    if (!obj || !obj.stampId) continue;

    const meta = STAMPS.find(s => s.id === obj.stampId);
    if (!meta) continue;

    const img = loadStampImage(obj.stampId);
    if (!img || !stampLoaded.get(obj.stampId)) continue;

    const aspect = img.height / img.width;
    const w = obj.baseSize || Number(stampSize?.value || 64);
    const h = w * aspect;

    const source = meta.tintable
      ? (getTintedStampCanvas(obj.stampId, obj.color || "#ffffff") || img)
      : img;

    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.rotate(obj.rot || 0);

    const sx = (obj.sx ?? 1) * (obj.flipX ? -1 : 1);
    const sy = (obj.sy ?? 1) * (obj.flipY ? -1 : 1);
    ctx.scale(sx, sy);

    ctx.globalAlpha = (obj.opacity ?? 1);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(source, -w / 2, -h / 2, w, h);

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ============================================================
// Compositing
// ============================================================
function compositeToDisplay() {
  dctx.clearRect(0,0,displayCanvas.width, displayCanvas.height);

  dctx.save();
  shieldPath(dctx);
  dctx.clip();

  for (const layer of layers) {
    if (!layer.visible) continue;
    dctx.drawImage(layer.canvas, 0, 0);
  }

  renderStampObjects(dctx);
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
  for (const layer of layers) if (layer.visible) o.drawImage(layer.canvas, 0, 0);
  renderStampObjects(o);
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

  pushUndo();
  redoStack = [];

  const active = layers[activeLayerIndex];
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
  compositeToDisplay();
  saveActiveToDesigns();
}

// ============================================================
// Drawing input
// ============================================================
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
let lastNonStampMode = "draw";

function startInput(evt){
  evt.preventDefault();
  const p = getPos(evt);
  const mode = modeSelect?.value || "draw";

  // If NOT in stamp mode, allow clicking a stamp to switch into stamp-edit mode.
  if (mode !== "stamp") {
    if (selectStampIfClicked(p)) return;
  }

  if (mode === "stamp") {
    stampPointerDown(p);
    return;
  }

  if (mode === "fill")   { applyFillAtPoint(p, false); return; }
  if (mode === "unfill") { applyFillAtPoint(p, true);  return; }

  if (mode !== "draw" && mode !== "erase") return;

  pushUndo();
  redoStack = [];
  isDrawing = true;
  last = p;
}

function moveInput(evt){
  const mode = modeSelect?.value || "draw";

  if (mode === "stamp") {
    if (!stampDragging) return;
    evt.preventDefault();
    stampPointerMove(getPos(evt));
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
  const active = layers[activeLayerIndex];

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

  compositeToDisplay();
  last = p;
}

function endInput(evt){
  const mode = modeSelect?.value || "draw";

  if (mode === "stamp") {
    if (!stampDragging) return;
    evt.preventDefault();
    stampPointerUp();
    return;
  }

  if (!isDrawing) return;
  evt.preventDefault();
  isDrawing = false;
  last = null;
  saveActiveToDesigns();
}

displayCanvas.addEventListener("mousedown", startInput);
window.addEventListener("mousemove", moveInput);
window.addEventListener("mouseup", endInput);

displayCanvas.addEventListener("touchstart", startInput, { passive:false });
window.addEventListener("touchmove", moveInput, { passive:false });
window.addEventListener("touchend", endInput, { passive:false });

// Prevent browser "Back" navigation on Backspace when not typing in an input
window.addEventListener("keydown", (e) => {
  if (e.key !== "Backspace") return;
  const el = document.activeElement;
  const isTyping =
    el &&
    (el.tagName === "INPUT" ||
     el.tagName === "TEXTAREA" ||
     el.isContentEditable);

  if (!isTyping) e.preventDefault();
}, { passive: false });

// ============================================================
// Modes
// ============================================================
function setMode(m){
  if (modeSelect) modeSelect.value = m;
  if (m !== "stamp") lastNonStampMode = m;

  drawBtn?.classList.toggle("selected", m==="draw");
  eraseBtn?.classList.toggle("selected", m==="erase");
  fillBtn?.classList.toggle("selected", m==="fill");
  unfillBtn?.classList.toggle("selected", m==="unfill");
  stampBtn?.classList.toggle("selected", m==="stamp");

  compositeToDisplay();
}

drawBtn?.addEventListener("click", () => setMode("draw"));
eraseBtn?.addEventListener("click", () => setMode("erase"));
fillBtn?.addEventListener("click", () => setMode("fill"));
unfillBtn?.addEventListener("click", () => setMode("unfill"));
stampBtn?.addEventListener("click", () => setMode("stamp"));
modeSelect?.addEventListener("change", () => setMode(modeSelect.value));

// ============================================================
// Undo/Redo
// ============================================================
let undoStack = [];
let redoStack = [];

function snapshotState(){
  return {
    activeLayerIndex,
    layers: layers.map(l => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      img: l.ctx.getImageData(0,0,displayCanvas.width, displayCanvas.height)
    })),
    stamps: structuredClone(stampObjects),
  };
}

function restoreState(state){
  activeLayerIndex = state.activeLayerIndex;
  layers = state.layers.map(s => {
    const layer = createLayer(s.name);
    layer.id = s.id;
    layer.visible = s.visible;
    layer.ctx.putImageData(s.img,0,0);
    return layer;
  });
  stampObjects = Array.isArray(state.stamps) ? state.stamps : [];
  selectedStampUid = null;

  renderLayersList();
  compositeToDisplay();
}

function pushUndo(){
  try{
    undoStack.push(snapshotState());
    if (undoStack.length > 25) undoStack.shift();
  } catch {}
}

function undo(){
  if (!undoStack.length) return;
  redoStack.push(snapshotState());
  const prev = undoStack.pop();
  restoreState(prev);
  saveActiveToDesigns();
}

function redo(){
  if (!redoStack.length) return;
  undoStack.push(snapshotState());
  const next = redoStack.pop();
  restoreState(next);
  saveActiveToDesigns();
}

undoBtn?.addEventListener("click", undo);
redoBtn?.addEventListener("click", redo);

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
// Designs (repo.js)
// ============================================================
let designs = [];
let activeDesignId = null;

async function refreshDesignList() {
  designs = await listDesigns();
  if (!activeDesignId && designs[0]) activeDesignId = designs[0].id;
  renderDesignList();
}

function normalizeUpdated(d){
  return d.updated ?? d.updated_at ?? d.updatedAt ?? Date.now();
}

function renderDesignList() {
  if (!designListEl) return;
  designListEl.innerHTML = "";

  designs
    .slice()
    .sort((a,b)=> normalizeUpdated(b) - normalizeUpdated(a))
    .forEach(d => {
      const el = document.createElement("div");
      el.className = "design-card" + (d.id === activeDesignId ? " active" : "");
      el.innerHTML = `
        <div class="design-title">${escapeHtml(d.name)}</div>
        <div class="design-meta">${new Date(normalizeUpdated(d)).toLocaleString()}</div>
      `;

      el.addEventListener("click", async () => {
        activeDesignId = d.id;
        renderDesignList();
        await loadDesignIntoCanvas(d.id);
      });

      designListEl.appendChild(el);
    });
}

async function loadDesignIntoCanvas(id){
  const d = await loadDesign(id);
  if (!d) return;

  activeDesignId = d.id;

  // stamps
  stampObjects = Array.isArray(d.stamps) ? d.stamps : [];
  selectedStampUid = null;

  // layers
  if (!Array.isArray(d.layers) || d.layers.length === 0) {
    initDefaultLayers();
    warmBaseFill();
    compositeToDisplay();
    renderLayersList();
    return;
  }

  layers = d.layers.map(l => {
    const layer = createLayer(l.name);
    layer.visible = l.visible;
    return layer;
  });

  function finish(){
    activeLayerIndex = Math.min(1, layers.length - 1);
    renderLayersList();
    compositeToDisplay();
    undoStack = [];
    redoStack = [];
    renderDesignList();
  }

  // Helper: load an image URL into an HTMLImageElement (Promise-based)
  function loadImage(url){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // safe even though same-origin; MUST be before src

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

      img.src = url;
    });
  }

  // Load all layer PNGs in parallel, then draw them
  await Promise.all(
    d.layers.map(async (l, i) => {
      if (!l.png_url) return;

      try {
        const img = await loadImage(l.png_url);
        layers[i].ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
        layers[i].ctx.drawImage(img, 0, 0);
      } catch (err) {
        // If a layer fails to load, we just skip it (don’t block finishing).
        console.warn(err);
      }
    })
  );

  finish();
}


newDesignBtn?.addEventListener("click", createNewDesign);

async function createNewDesign(){
  const name = prompt("Design name?", `Design ${designs.length+1}`);
  if (!name) return;

  const created = await createDesign(name);
  activeDesignId = created.id;

  initDefaultLayers();
  warmBaseFill();
  compositeToDisplay();
  renderLayersList();

  await saveActiveToDesigns();
}

async function saveActiveToDesigns(){
  if (!activeDesignId) return;
  await saveDesign(activeDesignId, layers, stampObjects);
  await refreshDesignList();
}

// ============================================================
// Init
// ============================================================
async function boot(){
  setMode("draw");
  buildShieldMask();
  initDefaultLayers();
  warmBaseFill();
  renderLayersList();
  renderStampList();

  drawGuides();
  compositeToDisplay();

  await refreshDesignList();
  if (activeDesignId) await loadDesignIntoCanvas(activeDesignId);
}

boot();
