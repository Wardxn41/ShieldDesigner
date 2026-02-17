// app/features/layers/layersSystem.js
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

  function createLayer(name) {
    const c = document.createElement("canvas");
    c.width = displayCanvas.width;
    c.height = displayCanvas.height;
    const cctx = c.getContext("2d", { willReadFrequently: true });
    return { id: crypto.randomUUID(), name, visible: true, dirty: true, canvas: c, ctx: cctx };
  }

  function initDefaultLayers() {
    layers = [createLayer("Base"), createLayer("Details"), createLayer("Highlights")];
    activeLayerIndex = 1;
  }

  function markLayerDirty(idx = activeLayerIndex) {
    if (layers[idx]) layers[idx].dirty = true;
  }
  function markAllLayersDirty() { layers.forEach(l => (l.dirty = true)); }
  function clearDirtyFlags() { layers.forEach(l => (l.dirty = false)); forceFullUploadNextSave = false; }

  function warmBaseFill() {
    const base = layers[0]?.ctx;
    if (!base) return;
    base.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    clipToShield(base);
    base.fillStyle = "rgba(43,31,23,1)";
    base.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    unclip(base);
  }

  function renderLayersList() {
    if (!layersListEl) return;
    layersListEl.innerHTML = "";
    for (let i = layers.length - 1; i >= 0; i--) {
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
    const name = prompt("Layer name?", `Layer ${layers.length + 1}`);
    if (!name) return;
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

  // API the rest of app uses:
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
