// Static/app/designs/loadIntoCanvas.js
// Behavior-preserving extraction of the old loadDesignIntoCanvas() logic.

/**
 * Load a design via the provided storage API and apply it to stamps + layers.
 * Dependencies are injected to avoid globals.
 */
export async function loadDesignIntoCanvas(designId, {
  storage,            // { loadDesign }
  layersSys,
  setActiveDesignId,  // (id) => void
  setStampObjects,    // (arr) => void
  clearSelectedStamp, // () => void
  requestRender,
  resetHistory,       // () => void
  displayCanvas,      // for sizing
} = {}) {
  const d = await storage.loadDesign(designId);
  if (!d) return null;

  setActiveDesignId?.(d.id);

  // stamps
  setStampObjects?.(Array.isArray(d.stamps) ? d.stamps : []);
  clearSelectedStamp?.();

  // layers
  if (!Array.isArray(d.layers) || d.layers.length === 0) {
    layersSys.initDefaultLayers();
    layersSys.warmBaseFill();
    layersSys.renderLayersList();
    requestRender?.();
    resetHistory?.();
    return d;
  }

  // Rebuild layers from meta
  layersSys.layers = d.layers.map((l) => {
    const layer = layersSys.createLayer(l.name);
    layer.visible = l.visible;
    return layer;
  });

  // Load each layer PNG (best-effort)
  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });

  await Promise.all(
    d.layers.map(async (l, i) => {
      if (!l.png_url) return;
      try {
        const img = await loadImage(l.png_url);
        const layer = layersSys.layers[i];
        if (!layer?.ctx) return;
        layer.ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
        layer.ctx.drawImage(img, 0, 0);
      } catch (err) {
        console.warn(err);
      }
    })
  );

  layersSys.clearDirtyFlags();
  layersSys.activeLayerIndex = Math.min(1, layersSys.layers.length - 1);
  layersSys.renderLayersList();

  requestRender?.();
  resetHistory?.();
  return d;
}
