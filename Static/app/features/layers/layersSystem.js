// app/features/layers/layersSystem.js
// UPGRADED: inline rename, per-layer opacity slider, drag-to-reorder, undo push on add/delete

export function createLayersSystem({
  displayCanvas,
  clipToShield,
  unclip,
  layersListEl,
  addLayerBtn,
  deleteLayerBtn,
  requestRender,
  saveActiveToDesignsDebounced,
  escapeHtml,
}) {
  let layers = [];
  let activeLayerIndex = 0;
  let forceFullUploadNextSave = true;

  // Drag-to-reorder state
  let dragSrcIdx = null;

  function createLayer(name) {
    const c = document.createElement("canvas");
    c.width = displayCanvas.width;
    c.height = displayCanvas.height;
    const cctx = c.getContext("2d", { willReadFrequently: true });
    return {
      id: crypto.randomUUID(),
      name,
      visible: true,
      dirty: true,
      opacity: 1,
      canvas: c,
      ctx: cctx,
    };
  }

  function initDefaultLayers() {
    layers = [createLayer("Base"), createLayer("Details"), createLayer("Highlights")];
    activeLayerIndex = 1;
  }

  function markLayerDirty(idx = activeLayerIndex) {
    if (layers[idx]) layers[idx].dirty = true;
  }

  function markAllLayersDirty() { layers.forEach(l => (l.dirty = true)); }

  function clearDirtyFlags() {
    layers.forEach(l => (l.dirty = false));
    forceFullUploadNextSave = false;
  }

  function warmBaseFill() {
    const base = layers[0]?.ctx;
    if (!base) return;
    base.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    clipToShield(base);
    base.fillStyle = "rgba(43,31,23,1)";
    base.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    unclip(base);
  }

  // ── Inline rename ──────────────────────────────────────────────────────────
  function startRename(idx, nameEl, currentName) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "layer-rename-input";
    input.value = currentName;
    input.style.cssText = `
      width: 100%;
      font: inherit;
      padding: 2px 6px;
      border-radius: 8px;
      border: 1px solid rgba(214,168,75,0.5);
      background: rgba(0,0,0,0.28);
      color: #f2e7d6;
      outline: none;
      font-size: 13px;
      font-weight: 800;
    `;

    nameEl.replaceWith(input);
    input.focus();
    input.select();

    function commit() {
      const newName = input.value.trim() || currentName;
      if (layers[idx]) {
        layers[idx].name = newName;
        markLayerDirty(idx);
        saveActiveToDesignsDebounced();
      }
      renderLayersList();
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { renderLayersList(); }
    });
    input.addEventListener("blur", commit);
  }

  // ── Render layers list ─────────────────────────────────────────────────────
  function renderLayersList() {
    if (!layersListEl) return;
    layersListEl.innerHTML = "";

    // Layers shown top=highest index (front), bottom=0 (back)
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const el = document.createElement("div");
      el.className = "layer-item" + (i === activeLayerIndex ? " active" : "");
      el.draggable = true;
      el.dataset.layerIdx = i;

      // Visibility eye
      const eye = document.createElement("div");
      eye.className = "layer-eye";
      eye.dataset.eye = i;
      eye.title = layer.visible ? "Hide layer" : "Show layer";
      eye.textContent = layer.visible ? "👁" : "–";

      // Name
      const nameEl = document.createElement("div");
      nameEl.className = "layer-name";
      nameEl.textContent = escapeHtml(layer.name);
      nameEl.title = "Double-click to rename";

      // Active tag
      const tagEl = document.createElement("div");
      tagEl.className = "layer-tag";
      tagEl.textContent = i === activeLayerIndex ? "Active" : "";

      // Drag handle
      const dragHandle = document.createElement("div");
      dragHandle.className = "layer-drag-handle";
      dragHandle.title = "Drag to reorder";
      dragHandle.innerHTML = "⠿";
      dragHandle.style.cssText = `
        cursor: grab;
        font-size: 16px;
        opacity: 0.45;
        padding: 0 4px;
        user-select: none;
        color: #c9b79c;
        align-self: center;
      `;

      // Opacity slider row (shown only when this layer is active)
      const opacityRow = document.createElement("div");
      opacityRow.className = "layer-opacity-row";
      opacityRow.style.cssText = `
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0 0 0;
      `;

      const opLabel = document.createElement("span");
      opLabel.style.cssText = "font-size:11px; color: #c9b79c; white-space:nowrap; min-width: 40px;";
      opLabel.textContent = "Opacity";

      const opSlider = document.createElement("input");
      opSlider.type = "range";
      opSlider.min = "0";
      opSlider.max = "1";
      opSlider.step = "0.01";
      opSlider.value = layer.opacity ?? 1;
      opSlider.style.cssText = "flex:1; accent-color: #d6a84b; cursor: pointer;";

      const opVal = document.createElement("span");
      opVal.className = "pill";
      opVal.style.cssText = "min-width: 38px; text-align: center; font-size: 11px;";
      opVal.textContent = Number(layer.opacity ?? 1).toFixed(2);

      opSlider.addEventListener("input", () => {
        const v = Number(opSlider.value);
        layers[i].opacity = v;
        opVal.textContent = v.toFixed(2);
        markLayerDirty(i);
        requestRender();
        saveActiveToDesignsDebounced();
      });

      opacityRow.appendChild(opLabel);
      opacityRow.appendChild(opSlider);
      opacityRow.appendChild(opVal);

      // Layout: grid with 5 cols: drag | eye | name | tag | (opacity row spans all)
      el.style.cssText = `
        display: grid;
        grid-template-columns: 24px 36px 1fr 60px;
        grid-template-rows: auto auto;
        align-items: center;
        gap: 8px 10px;
        padding: 10px;
        border-radius: 16px;
        border: 1px solid ${i === activeLayerIndex ? "rgba(214,168,75,0.75)" : "rgba(255,255,255,0.08)"};
        background: linear-gradient(180deg, rgba(36,26,20,1), rgba(28,20,16,1));
        cursor: pointer;
        user-select: none;
        transition: border-color 0.15s ease;
      `;

      el.appendChild(dragHandle);
      el.appendChild(eye);
      el.appendChild(nameEl);
      el.appendChild(tagEl);
      el.appendChild(opacityRow);

      // ── Events ──
      eye.addEventListener("click", (e) => {
        e.stopPropagation();
        layers[i].visible = !layers[i].visible;
        renderLayersList();
        requestRender();
      });

      nameEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startRename(i, nameEl, layer.name);
      });

      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-eye]") || e.target === opSlider) return;
        activeLayerIndex = i;
        renderLayersList();
      });

      // ── Drag-to-reorder ──
      el.addEventListener("dragstart", (e) => {
        dragSrcIdx = i;
        el.style.opacity = "0.45";
        e.dataTransfer.effectAllowed = "move";
      });

      el.addEventListener("dragend", () => {
        el.style.opacity = "";
        document.querySelectorAll(".layer-item").forEach(li => li.style.outline = "");
      });

      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        el.style.outline = "2px solid rgba(214,168,75,0.6)";
      });

      el.addEventListener("dragleave", () => {
        el.style.outline = "";
      });

      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.style.outline = "";
        const targetIdx = i;
        if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;

        // Reorder
        const moved = layers.splice(dragSrcIdx, 1)[0];
        layers.splice(targetIdx, 0, moved);
        activeLayerIndex = targetIdx;
        forceFullUploadNextSave = true;
        dragSrcIdx = null;
        renderLayersList();
        requestRender();
        saveActiveToDesignsDebounced();
      });

      layersListEl.appendChild(el);
    }
  }

  addLayerBtn?.addEventListener("click", () => {
    const name = `Layer ${layers.length + 1}`;
    layers.push(createLayer(name));
    activeLayerIndex = layers.length - 1;
    forceFullUploadNextSave = true;
    renderLayersList();
    requestRender();
    saveActiveToDesignsDebounced();
  });

  deleteLayerBtn?.addEventListener("click", () => {
    if (layers.length <= 1) return;
    layers.splice(activeLayerIndex, 1);
    activeLayerIndex = Math.max(0, activeLayerIndex - 1);
    forceFullUploadNextSave = true;
    renderLayersList();
    requestRender();
    saveActiveToDesignsDebounced();
  });

  return {
    get layers() { return layers; },
    set layers(v) { layers = v; },
    get activeLayerIndex() { return activeLayerIndex; },
    set activeLayerIndex(v) { activeLayerIndex = v; },
    get forceFullUploadNextSave() { return forceFullUploadNextSave; },
    set forceFullUploadNextSave(v) { forceFullUploadNextSave = v; },
    createLayer,
    initDefaultLayers,
    renderLayersList,
    warmBaseFill,
    markLayerDirty,
    markAllLayersDirty,
    clearDirtyFlags,
  };
}
