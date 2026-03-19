// app/features/stamps/stampSystem.js
// UPGRADED: User-imported PNG stamps
//
// How custom stamps work:
//   - User picks a PNG via file input → read as dataURL via FileReader
//   - Stored in customStamps[] (in-memory + localStorage for persistence)
//   - Stamp ID format: "custom__<uuid>" — detected by loadStampImage()
//     which checks custom registry first, then falls back to STAMPS[]
//   - dataURL stored directly in stampObjects[].stampId is NOT done;
//     instead stampId stays as the UUID key, and the actual dataURL
//     lives in customStampRegistry Map.  On save, getStampObjects()
//     returns objects whose stampId starts with "custom__".
//     On load, setStampObjects() restores them — but the image data
//     needs to be in the registry. We solve this by embedding the
//     dataURL in the stampObject as `customSrc`, which loadIntoCanvas
//     passes back through setStampObjects → we re-register it.
//   - No backend changes needed: everything rides in stamps_json.

import { STAMPS } from "./stampsData.js";
import { DEFAULT_STAMP_SIZE } from "../../core/constants.js";

const CUSTOM_STAMPS_KEY = "sd_custom_stamps_v1";

// ── Custom stamp registry ─────────────────────────────────────
// Persisted to localStorage so custom stamps survive page refresh.
// Format: [{ id, name, src (dataURL), tintable }]
let customStamps = [];

function loadCustomStampsFromStorage() {
  try {
    const raw = localStorage.getItem(CUSTOM_STAMPS_KEY);
    if (raw) customStamps = JSON.parse(raw);
  } catch { customStamps = []; }
}

function saveCustomStampsToStorage() {
  try {
    localStorage.setItem(CUSTOM_STAMPS_KEY, JSON.stringify(customStamps));
  } catch (e) {
    // Storage quota — silently ignore; stamps still work in-session
    console.warn("Could not persist custom stamps:", e.message);
  }
}

function registerCustomStamp(id, name, dataUrl, tintable = false) {
  // Remove any existing entry with same id
  customStamps = customStamps.filter(s => s.id !== id);
  customStamps.push({ id, name, src: dataUrl, tintable, category: "custom" });
  saveCustomStampsToStorage();
}

function unregisterCustomStamp(id) {
  customStamps = customStamps.filter(s => s.id !== id);
  saveCustomStampsToStorage();
}

function findStampMeta(stampId) {
  if (stampId.startsWith("custom__")) {
    return customStamps.find(s => s.id === stampId) || null;
  }
  return STAMPS.find(s => s.id === stampId) || null;
}

// Init on module load
loadCustomStampsFromStorage();

// ── Main factory ──────────────────────────────────────────────
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
  setMode,
  getHandleSizePx,
  getRotateHandleDistPx,
  drawGuides,
  isInsideShield,
  history,
}) {
  let stampObjects = [];
  let selectedStampUid = null;
  let historyRef = history || null;

  const stampImgCache = new Map();  // stampId → Image
  const stampLoaded   = new Map();  // stampId → bool
  const tintedCache   = new Map();  // "stampId|#hex" → canvas

  const HANDLE_SIZE        = (typeof getHandleSizePx         === "function") ? getHandleSizePx()         : 10;
  const ROTATE_HANDLE_DIST = (typeof getRotateHandleDistPx   === "function") ? getRotateHandleDistPx()   : 30;

  function uiPxToCanvas(px) {
    const r = displayCanvas.getBoundingClientRect();
    return px * (displayCanvas.width / r.width);
  }
  function getHandleHitRadius() { return uiPxToCanvas(18); }
  function getRotateHitRadius() { return uiPxToCanvas(22); }

  // ── Image loading — handles both built-in and custom stamps ──
  function loadStampImage(stampId) {
    if (stampImgCache.has(stampId)) return stampImgCache.get(stampId);

    const meta = findStampMeta(stampId);
    if (!meta) return null;

    const img = new Image();
    // No crossOrigin needed for dataURLs; needed for remote URLs
    if (!meta.src.startsWith("data:")) img.crossOrigin = "anonymous";

    stampLoaded.set(stampId, false);
    img.onload  = () => { stampLoaded.set(stampId, true);  requestRender(); };
    img.onerror = () => { stampLoaded.set(stampId, false); };
    img.src = meta.src;
    stampImgCache.set(stampId, img);
    return img;
  }

  function invalidateTintCache(stampId) {
    for (const key of [...tintedCache.keys()]) {
      if (key.startsWith(stampId + "|")) tintedCache.delete(key);
    }
  }

  function getTintedStampCanvas(stampId, colorHex) {
    const key = `${stampId}|${colorHex}`;
    if (tintedCache.has(key)) return tintedCache.get(key);
    const img = loadStampImage(stampId);
    if (!img || !stampLoaded.get(stampId)) return null;
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const cctx = c.getContext("2d");
    cctx.drawImage(img, 0, 0);
    cctx.globalCompositeOperation = "source-in";
    cctx.fillStyle = colorHex;
    cctx.fillRect(0, 0, c.width, c.height);
    cctx.globalCompositeOperation = "source-over";
    tintedCache.set(key, c);
    return c;
  }

  // ── Accessors ─────────────────────────────────────────────────
  function getSelectedStamp() { return stampObjects.find(s => s.uid === selectedStampUid) || null; }
  function clearSelection()   { selectedStampUid = null; }

  // When restoring stamp objects from a saved design, re-register
  // any custom stamps that carry their dataURL in customSrc.
  function setStampObjects(arr) {
    stampObjects = Array.isArray(arr) ? arr : [];
    selectedStampUid = null;

    for (const obj of stampObjects) {
      if (obj.stampId?.startsWith("custom__") && obj.customSrc) {
        // Re-register so loadStampImage can find it
        const existing = customStamps.find(s => s.id === obj.stampId);
        if (!existing) {
          registerCustomStamp(obj.stampId, obj.customName || "Custom", obj.customSrc, !!obj.customTintable);
        }
        // Bust any stale image cache entry so fresh load happens
        stampImgCache.delete(obj.stampId);
        stampLoaded.delete(obj.stampId);
        invalidateTintCache(obj.stampId);
      }
    }
  }

  function getStampObjects() { return stampObjects; }
  function getSelectedUid()  { return selectedStampUid; }
  function setHistory(h)     { historyRef = h || null; }

  function deleteSelectedStamp(pushUndo) {
    if (!selectedStampUid) return;
    if (typeof pushUndo === "function") pushUndo();
    stampObjects = stampObjects.filter(s => s.uid !== selectedStampUid);
    selectedStampUid = null;
    requestRender();
    saveActiveToDesignsDebounced();
  }

  function flipSelectedH() {
    const obj = getSelectedStamp(); if (!obj) return;
    historyRef?.pushUndo(); historyRef?.clearRedo();
    obj.flipX = !obj.flipX;
    requestRender(); saveActiveToDesignsDebounced();
  }

  function flipSelectedV() {
    const obj = getSelectedStamp(); if (!obj) return;
    historyRef?.pushUndo(); historyRef?.clearRedo();
    obj.flipY = !obj.flipY;
    requestRender(); saveActiveToDesignsDebounced();
  }

  colorPicker?.addEventListener("input", () => {
    const obj = getSelectedStamp(); if (!obj) return;
    const newColor = colorPicker.value;
    if (obj.color !== newColor) {
      invalidateTintCache(obj.stampId);
      obj.color = newColor;
      requestRender(); saveActiveToDesignsDebounced();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const el = document.activeElement;
    const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (!typing && modeSelect?.value === "stamp") {
      e.preventDefault();
      historyRef?.pushUndo(); historyRef?.clearRedo();
      deleteSelectedStamp();
    }
  }, { passive: false });

  // ── Spawn helpers ─────────────────────────────────────────────
  function isPointTooCloseToExistingStamps(x, y) {
    const minDist = 70;
    for (const s of stampObjects) {
      const dx = s.x - x, dy = s.y - y;
      if ((dx * dx + dy * dy) < (minDist * minDist)) return true;
    }
    return false;
  }

  function findSpawnPos() {
    const cx = displayCanvas.width / 2, cy = displayCanvas.height / 2;
    for (let r = 0; r <= 260; r += 18) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (!isPointTooCloseToExistingStamps(x, y)) return { x, y };
      }
    }
    return { x: cx + (Math.random() - 0.5) * 80, y: cy + (Math.random() - 0.5) * 80 };
  }

  function addStampToCanvas(s) {
    const uid  = crypto.randomUUID();
    const base = Number(stampSize?.value || DEFAULT_STAMP_SIZE);
    const { x, y } = findSpawnPos();

    const obj = {
      uid,
      stampId:  s.id,
      x, y,
      rot:      (Number(stampRot?.value || 0) * Math.PI) / 180,
      sx: 1, sy: 1,
      flipX: false, flipY: false,
      baseSize: base,
      color:    colorPicker?.value || "#ffffff",
      opacity:  1,
    };

    // Embed custom stamp data so it survives save → load round-trips
    if (s.id.startsWith("custom__")) {
      obj.customSrc      = s.src;
      obj.customName     = s.name;
      obj.customTintable = !!s.tintable;
    }

    stampObjects.push(obj);
    selectedStampUid = uid;
    setMode?.("stamp");
    requestRender();
    saveActiveToDesignsDebounced();
  }

  // ── PNG Import ────────────────────────────────────────────────
  // Creates a hidden <input type="file"> and triggers it. On success:
  //   1. Reads file as dataURL
  //   2. Registers in customStamps + localStorage
  //   3. Spawns it onto the canvas immediately
  //   4. Re-renders the stamp list panel

  function importPngStamp() {
    const input = document.createElement("input");
    input.type   = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) return;

      // Size guard — 5 MB
      if (file.size > 5 * 1024 * 1024) {
        showImportError("File too large (max 5 MB).");
        return;
      }

      const dataUrl = await readFileAsDataURL(file);
      if (!dataUrl) { showImportError("Could not read file."); return; }

      // Derive a clean display name from filename
      const rawName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);

      const id = "custom__" + crypto.randomUUID();

      registerCustomStamp(id, name, dataUrl, false);

      // Add to canvas immediately
      addStampToCanvas({ id, name, src: dataUrl, tintable: false, category: "custom" });

      // Refresh list so the Custom folder appears / updates
      renderStampList();
    });

    input.click();
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = ()  => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function showImportError(msg) {
    // Use existing toast system if available, else alert
    if (window.__sdToast) { window.__sdToast(msg, "error"); }
    else { alert(msg); }
  }

  // Delete a custom stamp from the library (not the canvas)
  function deleteCustomStamp(id) {
    unregisterCustomStamp(id);
    // Also evict from image cache
    stampImgCache.delete(id);
    stampLoaded.delete(id);
    invalidateTintCache(id);
    renderStampList();
  }

  // ── Folder / search UI state ──────────────────────────────────
  const STAMP_FOLDERS = [
    { id: "General",  label: "General"  },
    { id: "republic", label: "Republic" },
    { id: "imperial", label: "Imperial" },
    { id: "anime",    label: "Anime"    },
  ];

  const FOLDER_KEY    = "stamp_folders_open_v1";
  const SUBFOLDER_KEY = "stamp_subfolders_open_v1";
  let openFolders    = new Set(JSON.parse(localStorage.getItem(FOLDER_KEY)    || "[]"));
  let openSubfolders = new Set(JSON.parse(localStorage.getItem(SUBFOLDER_KEY) || "[]"));
  const saveFolderState    = () => localStorage.setItem(FOLDER_KEY,    JSON.stringify([...openFolders]));
  const saveSubfolderState = () => localStorage.setItem(SUBFOLDER_KEY, JSON.stringify([...openSubfolders]));
  const subKey = (f, s) => `${f}::${s}`;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // ── Stamp list renderer ───────────────────────────────────────
  let currentSearch = "";

  function renderStampList() {
    if (!stampListEl) return;
    stampListEl.innerHTML = "";

    // ── Import button ─────────────────────────────────────────
    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "stamp-import-btn";
    importBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1v8M4.5 6.5L7 9l2.5-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M1.5 10.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      Import PNG
    `;
    importBtn.addEventListener("click", importPngStamp);
    stampListEl.appendChild(importBtn);

    // ── Search bar ────────────────────────────────────────────
    const searchWrap = document.createElement("div");
    searchWrap.className = "stamp-search-wrap";

    const searchInput = document.createElement("input");
    searchInput.type        = "search";
    searchInput.placeholder = "Search stamps…";
    searchInput.value       = currentSearch;
    searchInput.className   = "stamp-search-input";

    searchInput.addEventListener("input", () => {
      currentSearch = searchInput.value;
      renderStampList();
    });

    searchWrap.appendChild(searchInput);
    stampListEl.appendChild(searchWrap);

    const query = currentSearch.trim().toLowerCase();

    // ── Custom stamps folder (user-imported) ──────────────────
    if (customStamps.length > 0) {
      const filtered = query
        ? customStamps.filter(s => s.name.toLowerCase().includes(query))
        : customStamps;

      if (query) {
        for (const s of filtered) stampListEl.appendChild(buildStampButton(s, "Custom", true));
      } else {
        stampListEl.appendChild(buildFolderSection(
          "custom",
          "Custom",
          customStamps,
          (s) => buildStampButton(s, "Custom", true)
        ));
      }
    }

    // ── Built-in stamp folders ────────────────────────────────
    for (const folder of STAMP_FOLDERS) {
      const allItems = STAMPS.filter(s => (s.category || "imperial") === folder.id);
      const items    = query ? allItems.filter(s => s.name.toLowerCase().includes(query)) : allItems;
      if (items.length === 0) continue;

      if (query) {
        for (const s of items) stampListEl.appendChild(buildStampButton(s, folder.label, false));
        continue;
      }

      stampListEl.appendChild(buildFolderSection(folder.id, folder.label, allItems, (s) => {
        // Handle subfolders
        return null; // handled inside buildFolderSection
      }, allItems));
    }
  }

  function buildFolderSection(folderId, label, items, buildItem, allItems) {
    const wrap = document.createElement("div");

    const header = document.createElement("button");
    header.type = "button";
    header.className = "stamp-folder";
    header.dataset.folder = folderId;
    const isOpen = openFolders.has(folderId);
    header.dataset.open = String(isOpen);
    header.innerHTML = `
      <span class="chev">▸</span>
      <span class="folder-title">${esc(label)}</span>
      <span class="folder-count">${items.length}</span>
    `;

    const children = document.createElement("div");
    children.className = "stamp-folder-children";
    children.hidden = !isOpen;

    // Check for subfolders
    const groups = new Map();
    for (const s of items) {
      const sub = (s.subfolder || "__default").toString();
      if (!groups.has(sub)) groups.set(sub, []);
      groups.get(sub).push(s);
    }

    const groupKeys = [...groups.keys()];
    const hasSubfolders = !(groupKeys.length === 1 && groupKeys[0] === "__default");

    if (!hasSubfolders) {
      for (const s of items) {
        const isCustom = s.id.startsWith("custom__");
        children.appendChild(buildStampButton(s, label, isCustom));
      }
    } else {
      for (const sub of groupKeys) {
        const subItems = groups.get(sub) || [];
        const key      = subKey(folderId, sub);
        const subOpen  = openSubfolders.has(key);

        const subHeader = document.createElement("button");
        subHeader.type = "button";
        subHeader.className = "stamp-subfolder";
        subHeader.dataset.open = String(subOpen);
        subHeader.innerHTML = `
          <span class="chev">▸</span>
          <span class="folder-title">${esc(sub)}</span>
          <span class="folder-count">${subItems.length}</span>
        `;

        const subChildren = document.createElement("div");
        subChildren.className = "stamp-subfolder-children";
        subChildren.hidden = !subOpen;

        for (const s of subItems) subChildren.appendChild(buildStampButton(s, esc(sub), false));

        subHeader.addEventListener("click", (e) => {
          e.preventDefault();
          const nowOpen = !openSubfolders.has(key);
          nowOpen ? openSubfolders.add(key) : openSubfolders.delete(key);
          subHeader.dataset.open = String(nowOpen);
          subChildren.hidden = !nowOpen;
          saveSubfolderState();
        });

        children.appendChild(subHeader);
        children.appendChild(subChildren);
      }
    }

    header.addEventListener("click", () => {
      const nowOpen = !openFolders.has(folderId);
      nowOpen ? openFolders.add(folderId) : openFolders.delete(folderId);
      header.dataset.open = String(nowOpen);
      children.hidden = !nowOpen;
      saveFolderState();
    });

    wrap.appendChild(header);
    wrap.appendChild(children);
    return wrap;
  }

  function buildStampButton(s, categoryLabel, isCustom = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stamp-item";

    const thumbHtml = `
      <div class="stamp-thumb">
        <img src="${s.src}" alt="" draggable="false" loading="lazy" />
      </div>
    `;

    const deleteHtml = isCustom
      ? `<button type="button" class="stamp-delete-btn" data-stamp-id="${esc(s.id)}" title="Remove from library">
           <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
             <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
           </svg>
         </button>`
      : "";

    btn.innerHTML = `
      ${thumbHtml}
      <div class="stamp-item-info">
        <div class="stamp-name">${esc(s.name)}</div>
        <div class="stamp-desc">${categoryLabel}</div>
      </div>
      ${deleteHtml}
    `;

    btn.addEventListener("click", (e) => {
      // Don't add if delete button was clicked
      if (e.target.closest(".stamp-delete-btn")) return;
      addStampToCanvas(s);
    });

    // Wire delete button for custom stamps
    if (isCustom) {
      btn.querySelector(".stamp-delete-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Remove "${s.name}" from your custom stamp library?\n\nThis won't affect designs that already use it.`)) {
          deleteCustomStamp(s.id);
        }
      });
    }

    return btn;
  }

  // ── Selection overlay ─────────────────────────────────────────
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function drawStampSelectionOverlay() {
    if (modeSelect?.value !== "stamp") return;
    const obj = getSelectedStamp(); if (!obj) return;
    const img = loadStampImage(obj.stampId);
    if (!img || !stampLoaded.get(obj.stampId)) return;

    const target     = Number(obj.baseSize || stampSize?.value || DEFAULT_STAMP_SIZE);
    const naturalW   = img.width || 1, naturalH = img.height || 1;
    const scale      = target / Math.max(naturalW, naturalH);
    const w = naturalW * scale, h = naturalH * scale;

    const cornersLocal = [
      { x: -w/2, y: -h/2 }, { x: w/2, y: -h/2 },
      { x: w/2, y:  h/2 }, { x: -w/2, y:  h/2 },
    ];

    const sx  = obj.sx * (obj.flipX ? -1 : 1);
    const sy  = obj.sy * (obj.flipY ? -1 : 1);
    const cos = Math.cos(obj.rot), sin = Math.sin(obj.rot);

    const corners = cornersLocal.map(p => {
      const x = p.x * sx, y = p.y * sy;
      return { x: obj.x + x * cos - y * sin, y: obj.y + x * sin + y * cos };
    });

    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const mids = [
      mid(corners[0], corners[1]), mid(corners[1], corners[2]),
      mid(corners[2], corners[3]), mid(corners[3], corners[0]),
    ];

    gctx.save();
    gctx.lineWidth = 1.5;
    gctx.strokeStyle = "rgba(212,155,60,0.9)";
    gctx.fillStyle   = "rgba(30,24,16,0.9)";

    gctx.beginPath();
    gctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) gctx.lineTo(corners[i].x, corners[i].y);
    gctx.closePath();
    gctx.stroke();

    for (const hp of [...corners, ...mids]) {
      gctx.beginPath();
      gctx.rect(hp.x - HANDLE_SIZE/2, hp.y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
      gctx.fill(); gctx.stroke();
    }

    const topMid = mids[0];
    const ex = corners[1].x - corners[0].x, ey = corners[1].y - corners[0].y;
    const len = Math.hypot(ex, ey) || 1;
    const rotHandle = {
      x: topMid.x + (-ey / len) * ROTATE_HANDLE_DIST,
      y: topMid.y + ( ex / len) * ROTATE_HANDLE_DIST,
    };

    gctx.beginPath();
    gctx.moveTo(topMid.x, topMid.y);
    gctx.lineTo(rotHandle.x, rotHandle.y);
    gctx.stroke();
    gctx.beginPath();
    gctx.arc(rotHandle.x, rotHandle.y, HANDLE_SIZE * 0.6, 0, Math.PI * 2);
    gctx.fill(); gctx.stroke();
    gctx.restore();

    obj.__handles = { corners, mids, rotHandle, topMid };
  }

  function hitTestHandle(p) {
    const obj = getSelectedStamp(); if (!obj || !obj.__handles) return null;
    const { corners, mids, rotHandle } = obj.__handles;
    const all = [
      ...corners.map((pt, idx) => ({ type: "corner", idx, pt })),
      ...mids.map((pt, idx)    => ({ type: "mid",    idx, pt })),
      { type: "rotate", idx: 0, pt: rotHandle },
    ];
    for (const h of all) {
      const r = h.type === "rotate" ? getRotateHitRadius() : getHandleHitRadius();
      if (dist(p, h.pt) <= r) return h;
    }
    return null;
  }

  function hitTestStampObject(worldP) {
    for (let i = stampObjects.length - 1; i >= 0; i--) {
      const obj = stampObjects[i];
      const img = loadStampImage(obj.stampId);
      if (!img || !stampLoaded.get(obj.stampId)) continue;
      const target = Number(obj.baseSize || stampSize?.value || DEFAULT_STAMP_SIZE);
      const scale  = target / Math.max(img.width || 1, img.height || 1);
      const w = (img.width  || 1) * scale;
      const h = (img.height || 1) * scale;
      const dx = worldP.x - obj.x, dy = worldP.y - obj.y;
      const cos = Math.cos(-obj.rot), sin = Math.sin(-obj.rot);
      let lx = dx * cos - dy * sin;
      let ly = dx * sin + dy * cos;
      const sx = obj.sx * (obj.flipX ? -1 : 1);
      const sy = obj.sy * (obj.flipY ? -1 : 1);
      if (sx === 0 || sy === 0) continue;
      lx /= sx; ly /= sy;
      if (lx >= -w/2 && lx <= w/2 && ly >= -h/2 && ly <= h/2) return obj;
    }
    return null;
  }

  function selectStampIfClicked(p) {
    const hit = hitTestStampObject(p); if (!hit) return false;
    selectedStampUid = hit.uid;
    setMode?.("stamp");
    requestRender();
    return true;
  }

  // ── Pointer pipeline ──────────────────────────────────────────
  let stampDragging = false, stampDragMode = null, stampStart = null;

  function pointerDown(p) {
    const cur = getSelectedStamp();
    if (cur) {
      if (typeof drawGuides === "function") drawGuides();
      const h = hitTestHandle(p);
      if (h) {
        stampDragging = true;
        stampDragMode = h.type === "rotate" ? "rotate" : "scale";
        stampStart = { p0: { ...p }, x0: cur.x, y0: cur.y, rot0: cur.rot, sx0: cur.sx, sy0: cur.sy };
        return;
      }
    }
    const hit = hitTestStampObject(p);
    if (hit) { selectedStampUid = hit.uid; requestRender(); }
    const obj = getSelectedStamp(); if (!obj) return;
    stampDragging = true;
    stampDragMode = "move";
    stampStart = { p0: { ...p }, x0: obj.x, y0: obj.y, rot0: obj.rot, sx0: obj.sx, sy0: obj.sy };
  }

  function pointerMove(p) {
    if (!stampDragging) return;
    const obj = getSelectedStamp(); if (!obj || !stampStart) return;
    const dx = p.x - stampStart.p0.x, dy = p.y - stampStart.p0.y;
    if (stampDragMode === "move") {
      obj.x = stampStart.x0 + dx;
      obj.y = stampStart.y0 + dy;
    } else if (stampDragMode === "rotate") {
      const a0 = Math.atan2(stampStart.p0.y - stampStart.y0, stampStart.p0.x - stampStart.x0);
      const a1 = Math.atan2(p.y - stampStart.y0, p.x - stampStart.x0);
      obj.rot = stampStart.rot0 + (a1 - a0);
    } else if (stampDragMode === "scale") {
      const d0 = Math.hypot(stampStart.p0.x - stampStart.x0, stampStart.p0.y - stampStart.y0) || 1;
      const d1 = Math.hypot(p.x - stampStart.x0, p.y - stampStart.y0) || 1;
      const s  = d1 / d0;
      obj.sx = stampStart.sx0 * s;
      obj.sy = stampStart.sy0 * s;
    }
    requestRender();
  }

  function pointerUp() {
    if (!stampDragging) return;
    stampDragging = false; stampDragMode = null; stampStart = null;
    saveActiveToDesignsDebounced();
  }

  function isDragging() { return stampDragging; }

  // ── Render stamps to canvas ───────────────────────────────────
  function renderTo(ctx) {
    if (!stampObjects.length) return;
    for (const obj of stampObjects) {
      if (!obj?.stampId) continue;
      const meta = findStampMeta(obj.stampId); if (!meta) continue;
      const img  = loadStampImage(obj.stampId);
      if (!img || !stampLoaded.get(obj.stampId)) continue;

      const target = Number(obj.baseSize || stampSize?.value || DEFAULT_STAMP_SIZE);
      const scale  = target / Math.max(img.width || 1, img.height || 1);
      const w = (img.width  || 1) * scale;
      const h = (img.height || 1) * scale;

      const source = meta.tintable
        ? (getTintedStampCanvas(obj.stampId, obj.color || "#ffffff") || img)
        : img;

      ctx.save();
      ctx.translate(obj.x, obj.y);
      ctx.rotate(obj.rot || 0);
      ctx.scale(
        (obj.sx ?? 1) * (obj.flipX ? -1 : 1),
        (obj.sy ?? 1) * (obj.flipY ? -1 : 1)
      );
      ctx.globalAlpha = obj.opacity ?? 1;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, -w/2, -h/2, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // ── addCustomStampFromDataUrl ─────────────────────────────────
  // Called by drag-drop handler (window.__sdImportPng) and can be
  // called directly from appController if needed.
  function addCustomStampFromDataUrl(dataUrl, name) {
    if (!dataUrl) return;
    // Rough size check on base64 string (~1.37× actual bytes)
    if (dataUrl.length > 5 * 1024 * 1024 * 1.4) {
      showImportError("File too large (max 5 MB).");
      return;
    }
    const cleanName = (name || "Custom").trim();
    const id = "custom__" + crypto.randomUUID();
    registerCustomStamp(id, cleanName, dataUrl, false);
    addStampToCanvas({ id, name: cleanName, src: dataUrl, tintable: false, category: "custom" });
    renderStampList();
  }

  return {
    setHistory,
    deleteSelectedStamp,
    flipSelectedH, flipSelectedV,
    setStampObjects, getStampObjects,
    clearSelection, getSelectedUid, getSelectedStamp,
    renderStampList,
    drawSelectionOverlay: drawStampSelectionOverlay,
    selectIfClicked: selectStampIfClicked,
    pointerDown, pointerMove, pointerUp, isDragging,
    renderTo,
    loadStampImage, invalidateTintCache,
    importPngStamp,
    addCustomStampFromDataUrl,
    getCustomStamps: () => customStamps,
  };
}
