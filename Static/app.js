// ============================================================
// Roman Shield Designer (v3 + UI controls)
// - Sidebar hide/restore (state persisted)
// - Draggable floating toolbar (state persisted + reset)
// - Imperial-ish scutum mask
// - Layers (draw/erase isolated)
// - Fill/unfill enclosed only
// ============================================================

const STORE_KEY = "roman_shield_designs_v3";
const UI_KEY    = "roman_shield_ui_v1";

const appRoot = document.getElementById("appRoot");

// Canvases
const displayCanvas = document.getElementById("displayCanvas");
const guidesCanvas  = document.getElementById("guidesCanvas");
const dctx = displayCanvas.getContext("2d", { willReadFrequently: true });
const gctx = guidesCanvas.getContext("2d");

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

// ============================================================
// UI State (sidebars + toolbar position)
// ============================================================
const uiState = loadUIState();
applyUIState();

minLeftBtn.addEventListener("click", () => {
  uiState.hideLeft = true;
  saveUIState();
  applyUIState();
});
minRightBtn.addEventListener("click", () => {
  uiState.hideRight = true;
  saveUIState();
  applyUIState();
});
restoreLeftBtn.addEventListener("click", () => {
  uiState.hideLeft = false;
  saveUIState();
  applyUIState();
});
restoreRightBtn.addEventListener("click", () => {
  uiState.hideRight = false;
  saveUIState();
  applyUIState();
});

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
function saveUIState(){
  localStorage.setItem(UI_KEY, JSON.stringify(uiState));
}
function applyUIState(){
  appRoot.classList.toggle("hide-left",  !!uiState.hideLeft);
  appRoot.classList.toggle("hide-right", !!uiState.hideRight);

  // restore toolbar position if saved
  if (uiState.toolbarPos && toolbar) {
    toolbar.style.left = uiState.toolbarPos.left + "px";
    toolbar.style.top  = uiState.toolbarPos.top  + "px";
    toolbar.style.bottom = "auto";
    toolbar.style.transform = "translateX(0)";
  }

  // Apply scale UI
if (!uiState.scale) uiState.scale = { widthIn:31, heightIn:40, curveIn:8, showGrid:false };

shieldWidthIn.value  = uiState.scale.widthIn;
shieldHeightIn.value = uiState.scale.heightIn;
shieldCurveIn.value  = uiState.scale.curveIn;
gridToggle.checked   = !!uiState.scale.showGrid;

updatePpiReadout();
drawGuides(); // re-render guides + optional grid

}

// ============================================================
// Draggable toolbar (mouse)
// ============================================================
let draggingToolbar = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

toolbarHandle.addEventListener("mousedown", (e) => {
  if (!toolbar) return;
  draggingToolbar = true;

  const rect = toolbar.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;

  // convert from centered bottom to fixed top/left
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

// Double click handle to reset toolbar to default bottom-center
toolbarHandle.addEventListener("dblclick", () => {
  uiState.toolbarPos = null;
  saveUIState();

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

  uiState.scale.widthIn  = clampNum(shieldWidthIn.value, 10, 80, 31);
  uiState.scale.heightIn = clampNum(shieldHeightIn.value, 10, 100, 40);
  uiState.scale.curveIn  = clampNum(shieldCurveIn.value, 0, 24, 8);
  uiState.scale.showGrid = !!gridToggle.checked;

  saveUIState();
  updatePpiReadout();
  drawGuides();
}

shieldWidthIn.addEventListener("input", updateScaleFromUI);
shieldHeightIn.addEventListener("input", updateScaleFromUI);
shieldCurveIn.addEventListener("input", updateScaleFromUI);
gridToggle.addEventListener("change", updateScaleFromUI);

function getPpi(){
  // Use canvas dimensions as the drawing truth
  const pxW = displayCanvas.width;
  const pxH = displayCanvas.height;
  const wIn = uiState.scale?.widthIn ?? 31;
  const hIn = uiState.scale?.heightIn ?? 40;

  const ppiX = pxW / wIn;
  const ppiY = pxH / hIn;
  return { ppiX, ppiY };
}

function updatePpiReadout(){
  const { ppiX, ppiY } = getPpi();
  ppiReadout.textContent = `${ppiX.toFixed(2)} · ${ppiY.toFixed(2)}`;
}


// ============================================================
// Shield mask: imperial-ish scutum (rounded rectangle, flat bottom)
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

let shieldMask = null;      // Uint8Array inside=1
let shieldBoundary = null;  // Uint8Array boundary=1

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
  return shieldMask[y*w + x] === 1;
}
function isOnShieldBoundary(x,y){
  const w = displayCanvas.width;
  return shieldBoundary[y*w + x] === 1;
}

function clipToShield(c){
  c.save();
  shieldPath(c);
  c.clip();
}
function unclip(c){ c.restore(); }

// ============================================================
// Guides
// ============================================================
function drawGuides() {
  gctx.clearRect(0,0,guidesCanvas.width, guidesCanvas.height);

  gctx.lineWidth = 6;
  gctx.strokeStyle = "rgba(214,168,75,.35)";
  shieldPath(gctx);
  gctx.stroke();

  gctx.lineWidth = 2;
  gctx.strokeStyle = "rgba(0,0,0,.12)";
  shieldPath(gctx);
  gctx.stroke();

  if (!guidesToggle.checked) return;

  const w = guidesCanvas.width, h = guidesCanvas.height;
  gctx.lineWidth = 1;
  gctx.strokeStyle = "rgba(0,0,0,.12)";

  gctx.beginPath();
  gctx.moveTo(w/2, 0); gctx.lineTo(w/2, h);
  gctx.moveTo(0, h/2); gctx.lineTo(w, h/2);
  gctx.stroke();

    // Optional 1-inch grid (clipped to shield)
  if (uiState.scale?.showGrid) {
    const { ppiX, ppiY } = getPpi();

    gctx.save();
    shieldPath(gctx);
    gctx.clip();

    gctx.lineWidth = 1;
    gctx.strokeStyle = "rgba(0,0,0,.08)";

    // Vertical lines every 1 inch
    for (let x = 0; x <= guidesCanvas.width; x += ppiX) {
      gctx.beginPath();
      gctx.moveTo(x, 0);
      gctx.lineTo(x, guidesCanvas.height);
      gctx.stroke();
    }

    // Horizontal lines every 1 inch
    for (let y = 0; y <= guidesCanvas.height; y += ppiY) {
      gctx.beginPath();
      gctx.moveTo(0, y);
      gctx.lineTo(guidesCanvas.width, y);
      gctx.stroke();
    }

    gctx.restore();
  }

}

guidesToggle.addEventListener("change", drawGuides);

// ============================================================
// Symmetry helpers
// ============================================================
function getSymmetryPoints(p) {
  const w = displayCanvas.width, h = displayCanvas.height;
  const cx = w/2, cy = h/2;
  const mode = symmetrySelect.value;

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
  layers = [
    createLayer("Base"),
    createLayer("Details"),
    createLayer("Highlights"),
  ];
  activeLayerIndex = 1;
}

function renderLayersList(){
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

addLayerBtn.addEventListener("click", () => {
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

deleteLayerBtn.addEventListener("click", () => {
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
  dctx.restore();
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
  const tol = Number(fillTolerance.value);
  const rep = parseHexColor(colorPicker.value);
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
// Stamps / Patterns (apply to active layer)
// ============================================================
const STAMPS = [
  { id:"eagle", name:"Eagle", desc:"Legion emblem", draw: drawEagle },
  { id:"laurel", name:"Laurel", desc:"Victory wreath", draw: drawLaurel },
  { id:"bolt", name:"Thunderbolt", desc:"Jupiter’s mark", draw: drawBolt },
  { id:"chevrons", name:"Chevrons", desc:"Field pattern", draw: drawChevrons },
  { id:"star", name:"Starburst", desc:"Radiant burst", draw: drawStarburst },
  { id:"spqr", name:"SPQR", desc:"Curved text", draw: drawSPQRArc },
];

let activeStampId = STAMPS[0].id;

clearStampBtn.addEventListener("click", () => { activeStampId = null; renderStampList(); });

function renderStampList() {
  stampListEl.innerHTML = "";
  STAMPS.forEach(s => {
    const el = document.createElement("div");
    el.className = "stamp-item" + (s.id === activeStampId ? " active" : "");
    el.innerHTML = `
      <div class="stamp-thumb"><canvas width="64" height="64" data-thumb="${s.id}"></canvas></div>
      <div>
        <div class="stamp-name">${escapeHtml(s.name)}</div>
        <div class="stamp-desc">${escapeHtml(s.desc)}</div>
      </div>
    `;
    el.addEventListener("click", () => {
      activeStampId = s.id;
      setMode("stamp");
      renderStampList();
      drawStampThumbs();
    });
    stampListEl.appendChild(el);
  });
}

function drawStampThumbs() {
  document.querySelectorAll("canvas[data-thumb]").forEach(c => {
    const id = c.getAttribute("data-thumb");
    const stamp = STAMPS.find(x => x.id === id);
    const tctx = c.getContext("2d");

    tctx.clearRect(0,0,64,64);
    tctx.save();
    tctx.translate(32,32);
    tctx.strokeStyle = "rgba(214,168,75,0.95)";
    tctx.fillStyle = "rgba(214,168,75,0.85)";
    tctx.lineWidth = 3;
    stamp.draw(tctx, 44);
    tctx.restore();
  });
}

function placeStampAtPoint(p){
  if (!activeStampId) return;
  const stamp = STAMPS.find(s => s.id === activeStampId);
  if (!stamp) return;

  const size = Number(stampSize.value);
  const rot = (Number(stampRot.value) * Math.PI) / 180;
  const alpha = Number(brushOpacity.value);

  const pts = getSymmetryPoints(p);

  pushUndo();
  redoStack = [];

  const active = layers[activeLayerIndex];
  clipToShield(active.ctx);

  active.ctx.globalCompositeOperation = "source-over";
  active.ctx.globalAlpha = alpha;
  active.ctx.fillStyle = colorPicker.value;
  active.ctx.strokeStyle = colorPicker.value;
  active.ctx.lineWidth = Math.max(2, size * 0.03);

  for (const sp of pts) {
    const x = sp.x, y = sp.y;
    if (!isInsideShield(Math.floor(x), Math.floor(y))) continue;

    active.ctx.save();
    active.ctx.translate(x,y);
    active.ctx.rotate(rot);
    stamp.draw(active.ctx, size);
    active.ctx.restore();
  }

  active.ctx.globalAlpha = 1;
  unclip(active.ctx);

  compositeToDisplay();
  saveActiveToDesigns();
}

// Stamp drawings (vector)
function drawEagle(c, size) {
  const s = size/2;
  c.beginPath();
  c.moveTo(-s, -s*0.1);
  c.quadraticCurveTo(-s*0.5, -s*0.7, 0, -s*0.35);
  c.quadraticCurveTo(s*0.5, -s*0.7, s, -s*0.1);
  c.quadraticCurveTo(s*0.45, s*0.05, s*0.25, s*0.25);
  c.quadraticCurveTo(s*0.1, s*0.45, 0, s*0.55);
  c.quadraticCurveTo(-s*0.1, s*0.45, -s*0.25, s*0.25);
  c.quadraticCurveTo(-s*0.45, s*0.05, -s, -s*0.1);
  c.closePath();
  c.stroke();
  c.beginPath();
  c.arc(s*0.18, -s*0.25, s*0.12, 0, Math.PI*2);
  c.stroke();
}
function drawLaurel(c, size) {
  const r = size*0.38;
  c.beginPath();
  c.arc(0,0,r, Math.PI*0.15, Math.PI*0.85);
  c.arc(0,0,r, Math.PI*1.15, Math.PI*1.85);
  c.stroke();
  for (let i=0;i<8;i++){
    const a = Math.PI*0.2 + i*(Math.PI*0.6/7);
    leaf(a); leaf(Math.PI*2-a);
  }
  function leaf(a){
    const x = Math.cos(a)*r;
    const y = Math.sin(a)*r;
    c.beginPath();
    c.ellipse(x,y, size*0.06, size*0.12, a, 0, Math.PI*2);
    c.stroke();
  }
}
function drawBolt(c, size) {
  const s = size/2;
  c.beginPath();
  c.moveTo(-s*0.2, -s);
  c.lineTo(s*0.15, -s*0.25);
  c.lineTo(-s*0.05, -s*0.25);
  c.lineTo(s*0.25, s);
  c.lineTo(-s*0.15, s*0.25);
  c.lineTo(s*0.05, s*0.25);
  c.closePath();
  c.stroke();
}
function drawChevrons(c, size) {
  const s = size/2;
  for (let i=0;i<4;i++){
    const y = -s + i*(size/3);
    c.beginPath();
    c.moveTo(-s, y);
    c.lineTo(0, y + size*0.12);
    c.lineTo(s, y);
    c.stroke();
  }
}
function drawStarburst(c, size) {
  const spikes = 12;
  const r1 = size*0.15;
  const r2 = size*0.45;
  c.beginPath();
  for (let i=0;i<spikes*2;i++){
    const a = (Math.PI*2*i)/(spikes*2);
    const r = (i%2===0)? r2 : r1;
    const x = Math.cos(a)*r;
    const y = Math.sin(a)*r;
    if (i===0) c.moveTo(x,y); else c.lineTo(x,y);
  }
  c.closePath();
  c.stroke();
}
function drawSPQRArc(c, size) {
  const r = size*0.35;
  const text = "SPQR";
  c.save();
  c.font = `${Math.floor(size*0.18)}px ui-sans-serif, system-ui`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.beginPath();
  c.arc(0,0,r, Math.PI*1.15, Math.PI*1.85);
  c.stroke();

  const start = Math.PI*1.22;
  const end   = Math.PI*1.78;
  for (let i=0;i<text.length;i++){
    const t = i/(text.length-1);
    const a = start + (end-start)*t;
    const x = Math.cos(a)*r;
    const y = Math.sin(a)*r;
    c.save();
    c.translate(x,y);
    c.rotate(a + Math.PI/2);
    c.fillText(text[i], 0, 0);
    c.restore();
  }
  c.restore();
}

// ============================================================
// Drawing input (draw/erase on active layer only)
// ============================================================
let isDrawing = false;
let last = null;

function getPos(evt){
  const rect = displayCanvas.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  return {
    x: (clientX - rect.left) * (displayCanvas.width / rect.width),
    y: (clientY - rect.top)  * (displayCanvas.height / rect.height),
  };
}

function startInput(evt){
  evt.preventDefault();
  const p = getPos(evt);

  const mode = modeSelect.value;
  if (mode === "fill")   return applyFillAtPoint(p, false);
  if (mode === "unfill") return applyFillAtPoint(p, true);
  if (mode === "stamp")  return placeStampAtPoint(p);

  pushUndo();
  redoStack = [];
  isDrawing = true;
  last = p;
}

function moveInput(evt){
  if (!isDrawing) return;
  evt.preventDefault();

  const mode = modeSelect.value;
  if (mode !== "draw" && mode !== "erase") return;

  const p = getPos(evt);

  const alpha = Number(brushOpacity.value);
  const w = Number(brushSize.value);

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
    active.ctx.strokeStyle = colorPicker.value;
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

// ============================================================
// Modes / toolbar syncing
// ============================================================
function setMode(m){
  modeSelect.value = m;
  drawBtn.classList.toggle("selected", m==="draw");
  eraseBtn.classList.toggle("selected", m==="erase");
  fillBtn.classList.toggle("selected", m==="fill");
  unfillBtn.classList.toggle("selected", m==="unfill");
  stampBtn.classList.toggle("selected", m==="stamp");
}

drawBtn.addEventListener("click", () => setMode("draw"));
eraseBtn.addEventListener("click", () => setMode("erase"));
fillBtn.addEventListener("click", () => setMode("fill"));
unfillBtn.addEventListener("click", () => setMode("unfill"));
stampBtn.addEventListener("click", () => setMode("stamp"));
modeSelect.addEventListener("change", () => setMode(modeSelect.value));

// ============================================================
// Undo/Redo (snapshot all layers)
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
    }))
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

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

// ============================================================
// Export (composited view)
// ============================================================
function exportPNG(){
  const a = document.createElement("a");
  a.download = `shield-${activeDesignId ?? "design"}.png`;
  a.href = displayCanvas.toDataURL("image/png");
  a.click();
}
exportBtn.addEventListener("click", exportPNG);

// ============================================================
// Designs persistence (stores per-layer PNGs)
// ============================================================
let designs = loadDesigns();
let activeDesignId = designs[0]?.id ?? null;

function loadDesigns(){
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    const starter = [{ id: crypto.randomUUID(), name:"Design 1", updated: Date.now(), layers: null }];
    localStorage.setItem(STORE_KEY, JSON.stringify(starter));
    return starter;
  }
  try { return JSON.parse(raw); } catch { return []; }
}
function saveDesigns(){
  localStorage.setItem(STORE_KEY, JSON.stringify(designs));
  renderDesignList();
}
function renderDesignList(){
  designListEl.innerHTML = "";
  designs.sort((a,b)=>b.updated-a.updated).forEach(d => {
    const el = document.createElement("div");
    el.className = "design-card" + (d.id===activeDesignId ? " active" : "");
    el.innerHTML = `
      <div class="design-title">${escapeHtml(d.name)}</div>
      <div class="design-meta">${new Date(d.updated).toLocaleString()}</div>
    `;
    el.addEventListener("click", () => loadDesign(d.id));
    designListEl.appendChild(el);
  });
}

newDesignBtn.addEventListener("click", createNewDesign);

function createNewDesign(){
  const name = prompt("Design name?", `Design ${designs.length+1}`);
  if (!name) return;
  const d = { id: crypto.randomUUID(), name, updated: Date.now(), layers: null };
  designs.push(d);
  activeDesignId = d.id;
  initDefaultLayers();
  warmBaseFill();
  compositeToDisplay();
  renderLayersList();
  saveActiveToDesigns();
  saveDesigns();
}
function loadDesign(id){
  const d = designs.find(x=>x.id===id);
  if (!d) return;
  activeDesignId = id;

  initDefaultLayers();

  if (d.layers && Array.isArray(d.layers)) {
    layers = d.layers.map(s => {
      const layer = createLayer(s.name);
      layer.visible = s.visible;
      return layer;
    });

    let remaining = d.layers.length;
    d.layers.forEach((s, i) => {
      if (!s.png) { if(--remaining===0) finishLoad(); return; }
      const img = new Image();
      img.onload = () => {
        layers[i].ctx.clearRect(0,0,displayCanvas.width,displayCanvas.height);
        layers[i].ctx.drawImage(img,0,0);
        if(--remaining===0) finishLoad();
      };
      img.src = s.png;
    });

    function finishLoad(){
      activeLayerIndex = Math.min(1, layers.length-1);
      renderLayersList();
      compositeToDisplay();
      undoStack=[]; redoStack=[];
      saveDesigns();
    }
  } else {
    warmBaseFill();
    compositeToDisplay();
    renderLayersList();
    undoStack=[]; redoStack=[];
    saveDesigns();
  }
}
function saveActiveToDesigns(){
  if (!activeDesignId) return;
  const d = designs.find(x=>x.id===activeDesignId);
  if (!d) return;

  d.layers = layers.map(l => ({
    name: l.name,
    visible: l.visible,
    png: l.canvas.toDataURL("image/png")
  }));
  d.updated = Date.now();
  saveDesigns();
}

// ============================================================
// Helpers
// ============================================================
function escapeHtml(s){
  return (s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function warmBaseFill(){
  // fill Base layer with warm dark backing inside shield
  const base = layers[0]?.ctx;
  if (!base) return;
  base.clearRect(0,0,displayCanvas.width,displayCanvas.height);
  clipToShield(base);
  base.fillStyle = "rgba(43,31,23,1)";
  base.fillRect(0,0,displayCanvas.width,displayCanvas.height);
  unclip(base);
}

// ============================================================
// Init
// ============================================================
setMode("draw");
buildShieldMask();
initDefaultLayers();
warmBaseFill();
renderLayersList();
renderStampList();
drawStampThumbs();
renderDesignList();
drawGuides();
compositeToDisplay();
saveActiveToDesigns();
