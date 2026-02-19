import { STAMPS } from "./stampsData.js";
import { DEFAULT_STAMP_SIZE } from "../../core/constants.js";

// Behavior-preserving Stamp system extracted from appController.
// Owns: stampObjects, selection, caching images/tints, hit-testing, pointer pipeline, list UI, selection overlay.

export function createStampSystem({
  displayCanvas,
  gctx,
  modeSelect,
  stampSize,
  stampRot,
  colorPicker,
  stampListEl,
  requestRender,
  saveActiveToDesignsDebounced,
  setMode,          // (mode) => void
  getHandleSizePx,  // () => number in canvas px (optional)
  getRotateHandleDistPx, // () => number in canvas px (optional)
  drawGuides,       // () => void (used to ensure handles computed before hit test)
  isInsideShield,   // (x,y) => bool (for spawn jitter safety)
  history,         // { pushUndo, clearRedo } (optional)
}) {
  let stampObjects = [];
  let selectedStampUid = null;
  let historyRef = null;

  const stampImgCache = new Map(); // stampId -> Image
  const stampLoaded   = new Map(); // stampId -> boolean
  const tintedCache   = new Map(); // `${stampId}|${color}` -> canvas

  historyRef = history || null;

  const HANDLE_SIZE = (typeof getHandleSizePx === "function") ? getHandleSizePx() : 10;
  const ROTATE_HANDLE_DIST = (typeof getRotateHandleDistPx === "function") ? getRotateHandleDistPx() : 30;

  function uiPxToCanvas(px){
    const r = displayCanvas.getBoundingClientRect();
    return px * (displayCanvas.width / r.width);
  }
  function getHandleHitRadius(){ return uiPxToCanvas(18); }
  function getRotateHitRadius(){ return uiPxToCanvas(22); }

  function loadStampImage(stampId){
    if (stampImgCache.has(stampId)) return stampImgCache.get(stampId);

    const meta = STAMPS.find(s => s.id === stampId);
    if (!meta) return null;

    const img = new Image();
    img.crossOrigin = "anonymous";

    stampLoaded.set(stampId, false);
    img.onload = () => { stampLoaded.set(stampId, true); requestRender(); };
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

    cctx.drawImage(img, 0, 0);
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

  function clearSelection(){
    selectedStampUid = null;
  }

  function setStampObjects(arr){
    stampObjects = Array.isArray(arr) ? arr : [];
    selectedStampUid = null;
  }
  function getStampObjects(){ return stampObjects; }
  function getSelectedUid(){ return selectedStampUid; }

    function setHistory(h){ historyRef = h || null; }

  function deleteSelectedStamp(pushUndo){
    if (!selectedStampUid) return;
    if (typeof pushUndo === "function") pushUndo();
    stampObjects = stampObjects.filter(s => s.uid !== selectedStampUid);
    selectedStampUid = null;
    requestRender();
    saveActiveToDesignsDebounced();
  }

  // Delete/backspace while in stamp mode
  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const el = document.activeElement;
      const isTyping = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!isTyping && modeSelect?.value === "stamp") {
        e.preventDefault();
        if (historyRef?.pushUndo) historyRef.pushUndo();
        if (historyRef?.clearRedo) historyRef.clearRedo();
        deleteSelectedStamp();
      }
    }
  }, { passive: false });

  // Folder UI state
  const STAMP_FOLDERS = [
    { id: "General", label: "General"},
    { id: "republic", label: "Republic" },
    { id: "imperial", label: "Imperial" },
    { id: "anime", label: "Anime" },
  ];

  const STAMP_FOLDER_STATE_KEY = "stamp_folders_open_v1";
  let openFolders = new Set(JSON.parse(localStorage.getItem(STAMP_FOLDER_STATE_KEY) || "[]"));
  function saveFolderState(){ localStorage.setItem(STAMP_FOLDER_STATE_KEY, JSON.stringify([...openFolders])); }

  const STAMP_SUBFOLDER_STATE_KEY = "stamp_subfolders_open_v1";
  let openSubfolders = new Set(JSON.parse(localStorage.getItem(STAMP_SUBFOLDER_STATE_KEY) || "[]"));
  function saveSubfolderState(){ localStorage.setItem(STAMP_SUBFOLDER_STATE_KEY, JSON.stringify([...openSubfolders])); }
  function subKey(folderId, subId){ return `${folderId}::${subId}`; }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  // Spawn helpers (copied behavior)
  function isPointTooCloseToExistingStamps(x, y) {
    const minDist = 70;
    for (const s of stampObjects) {
      const dx = s.x - x;
      const dy = s.y - y;
      if ((dx*dx + dy*dy) < (minDist*minDist)) return true;
    }
    return false;
  }

  function findSpawnPos() {
    const cx = displayCanvas.width / 2;
    const cy = displayCanvas.height / 2;
    const step = 18;
    const maxR = 260;

    for (let r = 0; r <= maxR; r += step) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (!isPointTooCloseToExistingStamps(x, y)) return { x, y };
      }
    }
    return { x: cx + (Math.random() - 0.5) * 80, y: cy + (Math.random() - 0.5) * 80 };
  }

  function addStampToCanvas(s) {
    const uid = crypto.randomUUID();
    const base = Number(stampSize?.value || DEFAULT_STAMP_SIZE);
    const { x, y } = findSpawnPos();

    stampObjects.push({
      uid,
      stampId: s.id,
      x, y,
      rot: (Number(stampRot?.value || 0) * Math.PI) / 180,
      sx: 1, sy: 1,
      flipX: false, flipY: false,
      baseSize: base,
      color: colorPicker?.value || "#ffffff",
      opacity: 1,
    });

    selectedStampUid = uid;
    setMode?.("stamp");
    requestRender();
    saveActiveToDesignsDebounced();
  }

  function renderStampList() {
    if (!stampListEl) return;
    stampListEl.innerHTML = "";

    for (const folder of STAMP_FOLDERS) {
      const items = STAMPS.filter(s => (s.category || "imperial") === folder.id);

      const header = document.createElement("button");
      header.type = "button";
      header.className = "stamp-folder";
      header.dataset.folder = folder.id;

      const isOpen = openFolders.has(folder.id);
      header.dataset.open = String(isOpen);

      header.innerHTML = `
        <span class="chev">▸</span>
        <span class="folder-title">${folder.label}</span>
        <span class="folder-count">${items.length}</span>
      `;

      const children = document.createElement("div");
      children.className = "stamp-folder-children";
      children.hidden = !isOpen;

      const groups = new Map();
      for (const s of items) {
        const sub = (s.subfolder || "__default").toString();
        if (!groups.has(sub)) groups.set(sub, []);
        groups.get(sub).push(s);
      }

      const groupKeys = [...groups.keys()];
      if (groupKeys.length === 1 && groupKeys[0] === "__default") {
        for (const s of items) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "stamp-item";
          btn.innerHTML = `
            <div class="stamp-thumb">
              <img src="${s.src}" alt="" draggable="false" />
            </div>
            <div>
              <div class="stamp-name">${s.name}</div>
              <div class="stamp-desc">${folder.label}</div>
            </div>
          `;
          btn.addEventListener("click", () => addStampToCanvas(s));
          children.appendChild(btn);
        }
      } else {
        for (const sub of groupKeys) {
          const subItems = groups.get(sub) || [];
          const key = subKey(folder.id, sub);
          const subOpen = openSubfolders.has(key);

          const subHeader = document.createElement("button");
          subHeader.type = "button";
          subHeader.className = "stamp-subfolder";
          subHeader.dataset.open = String(subOpen);
          subHeader.innerHTML = `
            <span class="chev">▸</span>
            <span class="folder-title">${escapeHtml(sub)}</span>
            <span class="folder-count">${subItems.length}</span>
          `;

          const subChildren = document.createElement("div");
          subChildren.className = "stamp-subfolder-children";
          subChildren.hidden = !subOpen;

          for (const s of subItems) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "stamp-item";
            btn.innerHTML = `
              <div class="stamp-thumb">
                <img src="${s.src}" alt="" draggable="false" />
              </div>
              <div>
                <div class="stamp-name">${s.name}</div>
                <div class="stamp-desc">${escapeHtml(sub)}</div>
              </div>
            `;
            btn.addEventListener("click", () => addStampToCanvas(s));
            subChildren.appendChild(btn);
          }

          subHeader.addEventListener("click", (e) => {
            e.preventDefault();
            const nowOpen = !openSubfolders.has(key);
            if (nowOpen) openSubfolders.add(key); else openSubfolders.delete(key);
            subHeader.dataset.open = String(nowOpen);
            subChildren.hidden = !nowOpen;
            saveSubfolderState();
          });

          children.appendChild(subHeader);
          children.appendChild(subChildren);
        }
      }

      header.addEventListener("click", () => {
        const nowOpen = !openFolders.has(folder.id);
        if (nowOpen) openFolders.add(folder.id); else openFolders.delete(folder.id);
        header.dataset.open = String(nowOpen);
        children.hidden = !nowOpen;
        saveFolderState();
      });

      stampListEl.appendChild(header);
      stampListEl.appendChild(children);
    }
  }

  // Selection overlay and handle storage
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

  function drawStampSelectionOverlay() {
    if (modeSelect?.value !== "stamp") return;

    const obj = getSelectedStamp();
    if (!obj) return;

    const img = loadStampImage(obj.stampId);
    if (!img) return;
    if (!stampLoaded.get(obj.stampId)) return;

    const target = Number(obj.baseSize || stampSize?.value || DEFAULT_STAMP_SIZE);
    const naturalW = img.width || 1;
    const naturalH = img.height || 1;
    const scaleToTarget = target / Math.max(naturalW, naturalH);
    const w = naturalW * scaleToTarget;
    const h = naturalH * scaleToTarget;

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

    gctx.beginPath();
    gctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) gctx.lineTo(corners[i].x, corners[i].y);
    gctx.closePath();
    gctx.stroke();

    const handlePts = [corners[0], corners[1], corners[2], corners[3], ...mids];
    for (const hp of handlePts) {
      gctx.beginPath();
      gctx.rect(hp.x - HANDLE_SIZE / 2, hp.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      gctx.fill();
      gctx.stroke();
    }

    const topMid = mids[0];
    const ex = corners[1].x - corners[0].x;
    const ey = corners[1].y - corners[0].y;
    const len = Math.hypot(ex, ey) || 1;
    const nx = -ey / len;
    const ny =  ex / len;

    const rotHandle = { x: topMid.x + nx * ROTATE_HANDLE_DIST, y: topMid.y + ny * ROTATE_HANDLE_DIST };

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
      const r = h.type === "rotate" ? getRotateHitRadius() : getHandleHitRadius();
      if (dist(p, h.pt) <= r) return h;
    }
    return null;
  }

  function hitTestStampObject(worldP){
    for (let i = stampObjects.length - 1; i >= 0; i--) {
      const obj = stampObjects[i];
      const img = loadStampImage(obj.stampId);
      if (!img || !stampLoaded.get(obj.stampId)) continue;

      const target = Number(obj.baseSize || stampSize?.value || DEFAULT_STAMP_SIZE);
      const naturalW = img.width || 1;
      const naturalH = img.height || 1;
      const scaleToTarget = target / Math.max(naturalW, naturalH);
      const w = naturalW * scaleToTarget;
      const h = naturalH * scaleToTarget;

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
    setMode?.("stamp");
    requestRender();
    return true;
  }

  // Pointer pipeline
  let stampDragging = false;
  let stampDragMode = null; // "move" | "scale" | "rotate"
  let stampStart = null;

  function pointerDown(p){
    const cur = getSelectedStamp();

    if (cur){
      if (typeof drawGuides === "function") drawGuides();
      const h = hitTestHandle(p);
      if (h){
        stampDragging = true;
        stampDragMode = h.type === "rotate" ? "rotate" : "scale";
        stampStart = {
          p0: { ...p },
          x0: cur.x, y0: cur.y,
          rot0: cur.rot,
          sx0: cur.sx, sy0: cur.sy,
          base0: cur.baseSize,
        };
        return;
      }
    }

    const hit = hitTestStampObject(p);
    if (hit){
      selectedStampUid = hit.uid;
      requestRender();
    }

    const obj = getSelectedStamp();
    if (!obj) return;

    stampDragging = true;
    stampDragMode = "move";
    stampStart = {
      p0: { ...p },
      x0: obj.x, y0: obj.y,
      rot0: obj.rot,
      sx0: obj.sx, sy0: obj.sy,
      base0: obj.baseSize,
    };
  }

  function pointerMove(p){
    if (!stampDragging) return;
    const obj = getSelectedStamp();
    if (!obj || !stampStart) return;

    const dx = p.x - stampStart.p0.x;
    const dy = p.y - stampStart.p0.y;

    if (stampDragMode === "move"){
      obj.x = stampStart.x0 + dx;
      obj.y = stampStart.y0 + dy;
    } else if (stampDragMode === "rotate"){
      const a0 = Math.atan2(stampStart.p0.y - stampStart.y0, stampStart.p0.x - stampStart.x0);
      const a1 = Math.atan2(p.y - stampStart.y0, p.x - stampStart.x0);
      obj.rot = stampStart.rot0 + (a1 - a0);
    } else if (stampDragMode === "scale"){
      const d0 = Math.hypot(stampStart.p0.x - stampStart.x0, stampStart.p0.y - stampStart.y0) || 1;
      const d1 = Math.hypot(p.x - stampStart.x0, p.y - stampStart.y0) || 1;
      const s = d1 / d0;
      obj.sx = stampStart.sx0 * s;
      obj.sy = stampStart.sy0 * s;
    }
    requestRender();
  }

  function pointerUp(){
    if (!stampDragging) return;
    stampDragging = false;
    stampDragMode = null;
    stampStart = null;
    saveActiveToDesignsDebounced();
  }

  function isDragging(){ return stampDragging; }

  // Render stamps to composited ctx (display)
  function renderTo(ctx){
    if (!Array.isArray(stampObjects) || stampObjects.length === 0) return;

    for (const obj of stampObjects) {
      if (!obj || !obj.stampId) continue;

      const meta = STAMPS.find(s => s.id === obj.stampId);
      if (!meta) continue;

      const img = loadStampImage(obj.stampId);
      if (!img || !stampLoaded.get(obj.stampId)) continue;

      const target = Number(obj.baseSize || stampSize?.value || DEFAULT_STAMP_SIZE);

      const naturalW = img.width || 1;
      const naturalH = img.height || 1;

      const scaleToTarget = target / Math.max(naturalW, naturalH);
      const w = naturalW * scaleToTarget;
      const h = naturalH * scaleToTarget;

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

  return {
    setHistory,
    deleteSelectedStamp,

    // state
    setStampObjects,
    getStampObjects,
    clearSelection,
    getSelectedUid,

    // UI
    renderStampList,

    // overlay
    drawSelectionOverlay: drawStampSelectionOverlay,

    // interactions
    selectIfClicked: selectStampIfClicked,
    pointerDown,
    pointerMove,
    pointerUp,
    isDragging,

    // rendering
    renderTo,

    // internal helpers (rarely needed)
    loadStampImage,
  };
}
