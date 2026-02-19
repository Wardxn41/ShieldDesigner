// Static/app/designs/designsController.js
// Owns: design list state + list rendering + create/rename/delete/select.

import { loadDesignIntoCanvas } from "./loadIntoCanvas.js";

function normalizeUpdated(d) {
  return d.updated ?? d.updated_at ?? d.updatedAt ?? Date.now();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createDesignsController({
  designListEl,
  newDesignBtn,
  layersSys,
  displayCanvas,
  requestRender,
  resetHistory,
  getActiveDesignId,
  setActiveDesignId,
  setStampObjects,
  clearSelectedStamp,
  storage, // { listDesigns, createDesign, loadDesign, deleteDesign, renameDesign }
  saveDebounced,
}) {
  let designs = [];

  function render() {
    if (!designListEl) return;
    const activeId = getActiveDesignId();
    designListEl.innerHTML = "";

    designs
      .slice()
      .sort((a, b) => normalizeUpdated(b) - normalizeUpdated(a))
      .forEach((d) => {
        const el = document.createElement("div");
        el.className = "design-card" + (d.id === activeId ? " active" : "");

        el.innerHTML = `
          <div class="design-title-row">
            <div class="design-title" data-role="designTitle">${escapeHtml(d.name)}</div>
            <div class="design-actions">
              <button class="design-rename" type="button" title="Rename">✎</button>
              <button class="design-del" type="button" title="Delete">🗑</button>
            </div>
          </div>
          <div class="design-meta">${new Date(normalizeUpdated(d)).toLocaleString()}</div>
        `;

        el.addEventListener("click", async () => {
          if (getActiveDesignId() === d.id) return;
          setActiveDesignId(d.id);
          render();
          await loadDesignIntoCanvas(d.id, {
            storage: { loadDesign: storage.loadDesign },
            layersSys,
            setActiveDesignId,
            setStampObjects,
            clearSelectedStamp,
            requestRender,
            resetHistory,
            displayCanvas,
          });
        });

        el.querySelector(".design-rename")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          const next = prompt("Rename design:", d.name);
          if (!next) return;
          try {
            await storage.renameDesign(d.id, next);
            d.name = next;
            d.updated = Date.now();
            render();
          } catch (err) {
            console.error(err);
            alert("Rename failed. Check console/server logs.");
          }
        });

        el.querySelector(".design-del")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = confirm(`Delete "${d.name}"?\n\nThis will permanently delete the design and its layer images.`);
          if (!ok) return;
          try {
            await storage.deleteDesign(d.id);
            if (getActiveDesignId() === d.id) setActiveDesignId(null);
            await refresh();

            if (designs[0]) {
              setActiveDesignId(designs[0].id);
              await loadDesignIntoCanvas(designs[0].id, {
                storage: { loadDesign: storage.loadDesign },
                layersSys,
                setActiveDesignId,
                setStampObjects,
                clearSelectedStamp,
                requestRender,
                resetHistory,
                displayCanvas,
              });
            } else {
              layersSys.initDefaultLayers();
              layersSys.warmBaseFill();
              layersSys.renderLayersList();
              requestRender();
              resetHistory?.();
            }
          } catch (err) {
            console.error(err);
            alert("Delete failed. Check console/server logs.");
          }
        });

        designListEl.appendChild(el);
      });
  }

  async function refresh() {
    designs = await storage.listDesigns();
    if (!getActiveDesignId() && designs[0]) setActiveDesignId(designs[0].id);
    render();
    return designs;
  }

  function touchUpdated(designId) {
    const now = Date.now();
    const d = designs.find((x) => x.id === designId);
    if (d) d.updated = now;
    render();
  }

  async function createNew() {
    const name = prompt("Design name?", `Design ${designs.length + 1}`);
    if (!name) return;
    const created = await storage.createDesign(name);
    setActiveDesignId(created.id);

    layersSys.initDefaultLayers();
    layersSys.warmBaseFill();
    layersSys.markAllLayersDirty();
    layersSys.forceFullUploadNextSave = true;
    layersSys.renderLayersList();
    requestRender();
    resetHistory?.();
    touchUpdated(created.id);

    await saveDebounced?.();
    await refresh();
  }

  newDesignBtn?.addEventListener("click", () => { createNew(); });

  return { refresh, render, touchUpdated, createNew, getDesigns: () => designs };
}
