// ============================================================
// Projector Export Page (Integrated)
// - Loads last shield export from localStorage (roman_shield_last_export)
// - Applies cylindrical curvature pre-warp (using widthIn + curveIn from UI_KEY)
// - 4-corner keystone mapping (interactive)
// - Drag inside quad to move, wheel to scale, Shift+drag to rotate (optional)
// - Scutum outline overlay (matches designer silhouette) and is warp-aware
// - Physical mapping tools:
//    * Projector px/in
//    * Auto-fit 31×40×8 (sizes the quad to real inches in projector pixels)
// - Persists mapping in localStorage
// - Exports final projector-ready PNG
// ============================================================

const EXPORT_KEY = "roman_shield_last_export";
const UI_KEY = "roman_shield_ui_v1";
const PROJ_KEY = "roman_projector_cal_v1";

const backBtn = document.getElementById("backBtn");
const warpToggle = document.getElementById("warpToggle");
const gridToggle2 = document.getElementById("gridToggle2");
const outlineToggle = document.getElementById("outlineToggle");
const subdiv = document.getElementById("subdiv");
const subdivVal = document.getElementById("subdivVal");
const resetBtn = document.getElementById("resetBtn");
const downloadBtn = document.getElementById("downloadBtn");

const projPpi = document.getElementById("projPpi");
const autoFitBtn = document.getElementById("autoFitBtn");

const canvas = document.getElementById("projCanvas");
const ctx = canvas.getContext("2d");

subdivVal.textContent = subdiv.value;

backBtn.addEventListener("click", () => {
  if (window.history.length > 1) window.history.back();
  else window.location.href = "/";
});

// --- Load the design image from localStorage (saved by designer export)
const imgDataUrl = localStorage.getItem(EXPORT_KEY);
const designImg = new Image();
let designReady = false;

// Internal source canvas holding the shield PNG at native res
let baseSrcCanvas = null;

// Projection quad (TL, TR, BR, BL) in projector-canvas coordinates
let quad = null;

// Drag state
const HANDLE_R = 14;
let dragging = false;
let dragMode = "none"; // "corner" | "move"
let cornerIndex = -1;
let lastMouse = { x: 0, y: 0 };

// Optional rotate while shift-drag
let enableRotateWhileShift = true;

// ============================================================
// Utilities
// ============================================================
function clampNum(n, min, max, fallback){
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function lerp(a,b,t){ return a + (b-a)*t; }
function lerpPt(p,q,t){ return { x: lerp(p.x,q.x,t), y: lerp(p.y,q.y,t) }; }

function dist(a,b){
  const dx=a.x-b.x, dy=a.y-b.y;
  return Math.hypot(dx,dy);
}

function quadCenter(q){
  return {
    x: (q[0].x + q[1].x + q[2].x + q[3].x)/4,
    y: (q[0].y + q[1].y + q[2].y + q[3].y)/4,
  };
}

function rotateQuad(q, angleRad){
  const c = quadCenter(q);
  for (const p of q){
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const rx = dx*Math.cos(angleRad) - dy*Math.sin(angleRad);
    const ry = dx*Math.sin(angleRad) + dy*Math.cos(angleRad);
    p.x = c.x + rx;
    p.y = c.y + ry;
  }
}

function scaleQuad(q, scale){
  const c = quadCenter(q);
  for (const p of q){
    p.x = c.x + (p.x - c.x) * scale;
    p.y = c.y + (p.y - c.y) * scale;
  }
}

// ============================================================
// Scale model (inches) loaded from designer UI state
// ============================================================
function loadScaleModel(){
  try{
    const raw = localStorage.getItem(UI_KEY);
    const ui = raw ? JSON.parse(raw) : null;
    const widthIn  = ui?.scale?.widthIn ?? 31;
    const heightIn = ui?.scale?.heightIn ?? 40;
    const curveIn  = ui?.scale?.curveIn ?? 8;
    return { widthIn, heightIn, curveIn };
  } catch {
    return { widthIn:31, heightIn:40, curveIn:8 };
  }
}

// R = W^2/(8d) + d/2
function curvatureRadius(W, d){
  if (!Number.isFinite(W) || !Number.isFinite(d) || d <= 0) return Infinity;
  return (W*W)/(8*d) + d/2;
}

// ============================================================
// Cylindrical warp (horizontal only) using inverse sampling
// - Treat output X as arc-length coordinate s (inches)
// - Map to chord coordinate u = R sin(s/R)
// - Sample original at xSrc
// ============================================================
function warpCylindrical(srcCanvas, widthIn, curveIn){
  const R = curvatureRadius(widthIn, curveIn);
  if (!Number.isFinite(R) || R === Infinity) return srcCanvas;

  const w = srcCanvas.width;
  const h = srcCanvas.height;

  const ppiX = w / widthIn;
  const cx = w / 2;

  const sctx = srcCanvas.getContext("2d", { willReadFrequently:true });
  const srcImg = sctx.getImageData(0,0,w,h);
  const src = srcImg.data;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;

  const octx = out.getContext("2d", { willReadFrequently:true });
  const outImg = octx.createImageData(w,h);
  const dst = outImg.data;

  for (let y=0; y<h; y++){
    for (let xOut=0; xOut<w; xOut++){
      const sIn = (xOut - cx) / ppiX;          // inches along arc
      const uIn = R * Math.sin(sIn / R);       // chord inches
      const xSrc = cx + (uIn * ppiX);          // src px

      const xs = Math.floor(xSrc);
      const xt = xs + 1;
      const t = xSrc - xs;

      const idxD = (y*w + xOut) * 4;

      if (xs < 0 || xt >= w){
        dst[idxD+0]=0; dst[idxD+1]=0; dst[idxD+2]=0; dst[idxD+3]=0;
        continue;
      }

      const idxS0 = (y*w + xs) * 4;
      const idxS1 = (y*w + xt) * 4;

      dst[idxD+0] = (src[idxS0+0]*(1-t) + src[idxS1+0]*t) | 0;
      dst[idxD+1] = (src[idxS0+1]*(1-t) + src[idxS1+1]*t) | 0;
      dst[idxD+2] = (src[idxS0+2]*(1-t) + src[idxS1+2]*t) | 0;
      dst[idxD+3] = (src[idxS0+3]*(1-t) + src[idxS1+3]*t) | 0;
    }
  }

  octx.putImageData(outImg,0,0);
  return out;
}

// Forward cylindrical mapping for a source X (chord) -> warped X (surface-unwrapped canvas)
// Inverse of the sampler mapping:
// xOut = cx + s*ppiX, where s = R*asin(u/R), u=(xSrc-cx)/ppiX
function forwardCylindricalX(xSrcPx, wPx, widthIn, curveIn){
  const R = curvatureRadius(widthIn, curveIn);
  if (!Number.isFinite(R) || R === Infinity) return xSrcPx;

  const ppiX = wPx / widthIn;
  const cx = wPx / 2;

  const uIn = (xSrcPx - cx) / ppiX;      // chord inches
  const ratio = uIn / R;

  const clamped = Math.max(-0.999999, Math.min(0.999999, ratio));
  const sIn = R * Math.asin(clamped);    // surface inches

  return cx + (sIn * ppiX);
}

// ============================================================
// Keystone mapping (approx homography via subdiv -> affine triangles)
// ============================================================

// Bilinear interpolation within quad corners (TL, TR, BR, BL)
function bilinear(quad, u, v){
  const TL = quad[0], TR = quad[1], BR = quad[2], BL = quad[3];
  const top = lerpPt(TL, TR, u);
  const bot = lerpPt(BL, BR, u);
  return lerpPt(top, bot, v);
}

// Invert 3x3 matrix
function inv3(m){
  const a=m[0], b=m[1], c=m[2],
        d=m[3], e=m[4], f=m[5],
        g=m[6], h=m[7], i=m[8];

  const A = (e*i - f*h);
  const B = -(d*i - f*g);
  const C = (d*h - e*g);
  const D = -(b*i - c*h);
  const E = (a*i - c*g);
  const F = -(a*h - b*g);
  const G = (b*f - c*e);
  const H = -(a*f - c*d);
  const I = (a*e - b*d);

  const det = a*A + b*B + c*C;
  if (Math.abs(det) < 1e-10) return null;

  const invDet = 1/det;
  return [
    A*invDet, D*invDet, G*invDet,
    B*invDet, E*invDet, H*invDet,
    C*invDet, F*invDet, I*invDet
  ];
}

// Solve affine mapping from src tri -> dst tri
function affineFromTri(src, dst){
  const S = [
    src[0].x, src[0].y, 1,
    src[1].x, src[1].y, 1,
    src[2].x, src[2].y, 1
  ];
  const invS = inv3(S);
  if (!invS) return null;

  const X = [dst[0].x, dst[1].x, dst[2].x];
  const Y = [dst[0].y, dst[1].y, dst[2].y];

  const a = invS[0]*X[0] + invS[1]*X[1] + invS[2]*X[2];
  const c = invS[3]*X[0] + invS[4]*X[1] + invS[5]*X[2];
  const e = invS[6]*X[0] + invS[7]*X[1] + invS[8]*X[2];

  const b = invS[0]*Y[0] + invS[1]*Y[1] + invS[2]*Y[2];
  const d = invS[3]*Y[0] + invS[4]*Y[1] + invS[5]*Y[2];
  const f = invS[6]*Y[0] + invS[7]*Y[1] + invS[8]*Y[2];

  return { a,b,c,d,e,f };
}

function drawTriangleImage(imgCanvas, srcTri, dstTri){
  const tf = affineFromTri(srcTri, dstTri);
  if (!tf) return;

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(dstTri[0].x, dstTri[0].y);
  ctx.lineTo(dstTri[1].x, dstTri[1].y);
  ctx.lineTo(dstTri[2].x, dstTri[2].y);
  ctx.closePath();
  ctx.clip();

  ctx.setTransform(tf.a, tf.b, tf.c, tf.d, tf.e, tf.f);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(imgCanvas, 0, 0);

  ctx.restore();
}

function drawImageToQuad(imgCanvas, quadCorners, steps){
  const w = imgCanvas.width;
  const h = imgCanvas.height;

  const nx = steps;
  const ny = Math.max(8, Math.floor(steps * (h / w)));

  for (let j=0; j<ny; j++){
    const v0 = j/ny;
    const v1 = (j+1)/ny;

    for (let i=0; i<nx; i++){
      const u0 = i/nx;
      const u1 = (i+1)/nx;

      const sx0 = u0*w, sx1 = u1*w;
      const sy0 = v0*h, sy1 = v1*h;

      const srcTL = { x:sx0, y:sy0 };
      const srcTR = { x:sx1, y:sy0 };
      const srcBR = { x:sx1, y:sy1 };
      const srcBL = { x:sx0, y:sy1 };

      const dstTL = bilinear(quadCorners, u0, v0);
      const dstTR = bilinear(quadCorners, u1, v0);
      const dstBR = bilinear(quadCorners, u1, v1);
      const dstBL = bilinear(quadCorners, u0, v1);

      drawTriangleImage(imgCanvas, [srcTL, srcTR, srcBR], [dstTL, dstTR, dstBR]);
      drawTriangleImage(imgCanvas, [srcTL, srcBR, srcBL], [dstTL, dstBR, dstBL]);
    }
  }
}

// ============================================================
// Hit testing
// ============================================================
function pointInTri(p, a,b,c){
  const v0 = { x: c.x-a.x, y: c.y-a.y };
  const v1 = { x: b.x-a.x, y: b.y-a.y };
  const v2 = { x: p.x-a.x, y: p.y-a.y };

  const dot00 = v0.x*v0.x + v0.y*v0.y;
  const dot01 = v0.x*v1.x + v0.y*v1.y;
  const dot02 = v0.x*v2.x + v0.y*v2.y;
  const dot11 = v1.x*v1.x + v1.y*v1.y;
  const dot12 = v1.x*v2.x + v1.y*v2.y;

  const invDen = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDen;
  const v = (dot00 * dot12 - dot01 * dot02) * invDen;
  return (u >= 0) && (v >= 0) && (u + v <= 1);
}

function pointInQuad(p, q){
  return pointInTri(p, q[0], q[1], q[2]) || pointInTri(p, q[0], q[2], q[3]);
}

// ============================================================
// Scutum outline overlay (matches designer proportions)
// ============================================================
function shieldParamsFor(w, h){
  return {
    left:   w * 0.18,
    right:  w * 0.82,
    top:    h * 0.03,
    bottom: h * 0.97,
    rx:     w * 0.13,
    ry:     h * 0.09,
  };
}

function buildScutumOutlinePoints(w, h, seg=24){
  const p = shieldParamsFor(w, h);
  const L = p.left, R = p.right, T = p.top, B = p.bottom, rx = p.rx, ry = p.ry;

  const pts = [];

  function addArc(cx, cy, rX, rY, a0, a1, n){
    for (let i=0;i<=n;i++){
      const t = i/n;
      const a = a0 + (a1-a0)*t;
      pts.push({ x: cx + Math.cos(a)*rX, y: cy + Math.sin(a)*rY });
    }
  }

  pts.push({ x: L+rx, y: T });
  pts.push({ x: R-rx, y: T });

  addArc(R, T+ry, rx, ry, -Math.PI/2, 0, seg);
  pts.push({ x: R, y: B-ry });
  addArc(R-rx, B, rx, ry, 0, Math.PI/2, seg);

  pts.push({ x: L+rx, y: B });
  addArc(L+rx, B, rx, ry, Math.PI/2, Math.PI, seg);

  pts.push({ x: L, y: T+ry });
  addArc(L+rx, T+ry, rx, ry, Math.PI, 1.5*Math.PI, seg);

  pts.push({ x: L+rx, y: T });

  return pts;
}

function drawScutumOutlineOnProjector(srcW, srcH, quadCorners){
  if (!outlineToggle.checked) return;
  if (!quadCorners) return;

  const { widthIn, curveIn } = loadScaleModel();
  const useWarp = !!warpToggle.checked;

  const pts = buildScutumOutlinePoints(srcW, srcH, 26);

  ctx.save();

  // Gold stroke
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(214,168,75,0.65)";
  ctx.beginPath();

  for (let i=0;i<pts.length;i++){
    let x = pts[i].x;
    const y = pts[i].y;

    if (useWarp){
      x = forwardCylindricalX(x, srcW, widthIn, curveIn);
    }

    const u = x / srcW;
    const v = y / srcH;
    const d = bilinear(quadCorners, u, v);

    if (i===0) ctx.moveTo(d.x, d.y);
    else ctx.lineTo(d.x, d.y);
  }

  ctx.closePath();
  ctx.stroke();

  // Dark subtle stroke
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.stroke();

  ctx.restore();
}

// ============================================================
// UI persistence
// ============================================================
function saveProjectorState(){
  try{
    const state = {
      quad,
      ppi: clampNum(projPpi?.value, 10, 400, 60)
    };
    localStorage.setItem(PROJ_KEY, JSON.stringify(state));
  } catch {}
}

function loadProjectorState(){
  try{
    const raw = localStorage.getItem(PROJ_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ============================================================
// Default mapping
// ============================================================
function resetMapping(){
  const w = baseSrcCanvas?.width ?? 620;
  const h = baseSrcCanvas?.height ?? 800;

  const aspect = w / h;

  const targetH = canvas.height * 0.85;
  const targetW = targetH * aspect;

  const cx = canvas.width/2;
  const cy = canvas.height/2;

  quad = [
    { x: cx - targetW/2, y: cy - targetH/2 }, // TL
    { x: cx + targetW/2, y: cy - targetH/2 }, // TR
    { x: cx + targetW/2, y: cy + targetH/2 }, // BR
    { x: cx - targetW/2, y: cy + targetH/2 }, // BL
  ];

  saveProjectorState();
  draw();
}

function autoFitToPhysicalDefaults(){
  // Force 31×40×8 into UI_KEY so warp math is deterministic
  try{
    const raw = localStorage.getItem(UI_KEY);
    const ui = raw ? JSON.parse(raw) : {};
    ui.scale = ui.scale || {};
    ui.scale.widthIn = 31;
    ui.scale.heightIn = 40;
    ui.scale.curveIn = 8;
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {}

  const ppi = clampNum(projPpi.value, 10, 400, 60);

  const targetW = 31 * ppi;
  const targetH = 40 * ppi;

  const cx = canvas.width/2;
  const cy = canvas.height/2;

  quad = [
    { x: cx - targetW/2, y: cy - targetH/2 }, // TL
    { x: cx + targetW/2, y: cy - targetH/2 }, // TR
    { x: cx + targetW/2, y: cy + targetH/2 }, // BR
    { x: cx - targetW/2, y: cy + targetH/2 }, // BL
  ];

  warpToggle.checked = true;
  outlineToggle.checked = true;
  gridToggle2.checked = true;

  saveProjectorState();
  draw();
}

// ============================================================
// Rendering
// ============================================================
function drawGrid(){
  if (!gridToggle2.checked) return;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(242,231,214,0.35)";

  // Simple visible grid for now (calibration can still use projPpi measurement)
  // Next upgrade can make this exact 1-inch spacing via projPpi.
  const step = 50;
  for (let x=0; x<=canvas.width; x+=step){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
  }
  for (let y=0; y<=canvas.height; y+=step){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
  }

  ctx.restore();
}

function drawQuadOutline(){
  if (!quad) return;

  // Make it subtle so scutum outline is the main alignment target
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  ctx.lineTo(quad[1].x, quad[1].y);
  ctx.lineTo(quad[2].x, quad[2].y);
  ctx.lineTo(quad[3].x, quad[3].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHandles(){
  if (!quad) return;

  ctx.save();
  for (let i=0;i<4;i++){
    const p = quad[i];

    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI*2);
    ctx.fillStyle = "rgba(36,26,20,0.90)";
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(214,168,75,0.85)";
    ctx.stroke();

    ctx.fillStyle = "rgba(242,231,214,0.9)";
    ctx.font = "12px ui-sans-serif, system-ui";
    const label = ["TL","TR","BR","BL"][i];
    ctx.fillText(label, p.x - 10, p.y - 18);
  }
  ctx.restore();
}

function draw(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = "#0f0b08";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  drawGrid();

  if (!designReady || !baseSrcCanvas || !quad) {
    ctx.fillStyle = "rgba(242,231,214,0.85)";
    ctx.font = "18px ui-sans-serif, system-ui";
    ctx.fillText("No export found. Go back and click Export PNG.", 40, 60);
    return;
  }

  const { widthIn, curveIn } = loadScaleModel();

  const srcForQuad = warpToggle.checked
    ? warpCylindrical(baseSrcCanvas, widthIn, curveIn)
    : baseSrcCanvas;

  const steps = clampNum(subdiv.value, 8, 40, 22);

  // Draw mapped image into quad
  drawImageToQuad(srcForQuad, quad, steps);

  // Scutum outline overlay (true silhouette)
  drawScutumOutlineOnProjector(srcForQuad.width, srcForQuad.height, quad);

  // Optional helper outline + handles
  drawQuadOutline();
  drawHandles();
}

// ============================================================
// Mouse interactions
// ============================================================
function getMouse(evt){
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / rect.width),
    y: (evt.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

canvas.addEventListener("mousedown", (evt) => {
  if (!quad) return;

  const m = getMouse(evt);
  lastMouse = m;

  for (let i=0;i<4;i++){
    if (dist(m, quad[i]) <= HANDLE_R + 6){
      dragging = true;
      dragMode = "corner";
      cornerIndex = i;
      canvas.style.cursor = "grabbing";
      return;
    }
  }

  if (pointInQuad(m, quad)){
    dragging = true;
    dragMode = "move";
    cornerIndex = -1;
    canvas.style.cursor = "grabbing";
  }
});

window.addEventListener("mousemove", (evt) => {
  if (!dragging || !quad) return;

  const m = getMouse(evt);
  const dx = m.x - lastMouse.x;
  const dy = m.y - lastMouse.y;
  lastMouse = m;

  if (dragMode === "corner" && cornerIndex >= 0){
    quad[cornerIndex].x += dx;
    quad[cornerIndex].y += dy;
    saveProjectorState();
    draw();
    return;
  }

  if (dragMode === "move"){
    if (enableRotateWhileShift && evt.shiftKey){
      const c = quadCenter(quad);
      const prev = { x: lastMouse.x - dx, y: lastMouse.y - dy };
      const a0 = Math.atan2(prev.y - c.y, prev.x - c.x);
      const a1 = Math.atan2(lastMouse.y - c.y, lastMouse.x - c.x);
      rotateQuad(quad, a1 - a0);
    } else {
      for (const p of quad){
        p.x += dx;
        p.y += dy;
      }
    }

    saveProjectorState();
    draw();
  }
});

window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  dragMode = "none";
  cornerIndex = -1;
  canvas.style.cursor = "default";
});

canvas.addEventListener("mousemove", (evt) => {
  if (!quad || dragging) return;
  const m = getMouse(evt);

  for (let i=0;i<4;i++){
    if (dist(m, quad[i]) <= HANDLE_R + 6){
      canvas.style.cursor = "grab";
      return;
    }
  }
  if (pointInQuad(m, quad)) {
    canvas.style.cursor = "move";
    return;
  }
  canvas.style.cursor = "default";
});

// Wheel scaling (only inside quad)
canvas.addEventListener("wheel", (evt) => {
  if (!quad) return;
  const m = getMouse(evt);
  if (!pointInQuad(m, quad)) return;

  evt.preventDefault();

  const delta = Math.sign(evt.deltaY);
  const s = (delta > 0) ? 0.97 : 1.03;
  scaleQuad(quad, s);

  saveProjectorState();
  draw();
}, { passive:false });

// ============================================================
// Controls
// ============================================================
subdiv.addEventListener("input", () => {
  subdivVal.textContent = subdiv.value;
  draw();
});
warpToggle.addEventListener("change", draw);
gridToggle2.addEventListener("change", draw);
outlineToggle.addEventListener("change", draw);

projPpi.addEventListener("input", () => {
  saveProjectorState();
  draw();
});

autoFitBtn.addEventListener("click", autoFitToPhysicalDefaults);

resetBtn.addEventListener("click", () => {
  localStorage.removeItem(PROJ_KEY);
  resetMapping();
});

downloadBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = "projector-ready.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
});

// ============================================================
// Init
// ============================================================
function init(){
  if (!imgDataUrl){
    designReady = false;
    draw();
    return;
  }

  designImg.onload = () => {
    designReady = true;

    baseSrcCanvas = document.createElement("canvas");
    baseSrcCanvas.width = designImg.width;
    baseSrcCanvas.height = designImg.height;
    baseSrcCanvas.getContext("2d").drawImage(designImg, 0, 0);

    const saved = loadProjectorState();
    if (saved?.ppi && projPpi) projPpi.value = saved.ppi;

    if (saved?.quad && Array.isArray(saved.quad) && saved.quad.length === 4) {
      quad = saved.quad;
    } else {
      resetMapping();
      return;
    }

    draw();
  };

  designImg.src = imgDataUrl;
}

init();
