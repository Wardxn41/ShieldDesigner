// Undo/Redo history manager (behavior-preserving extraction from appController)

export function createHistoryManager({
  displayCanvas,
  layersSys,
  stamps,
  requestRender,
  saveActiveToDesignsDebounced,
}) {
  let undoStack = [];
  let redoStack = [];

  function snapshotState() {
    return {
      activeLayerIndex: layersSys.activeLayerIndex,
      layers: layersSys.layers.map(l => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        img: l.ctx.getImageData(0, 0, displayCanvas.width, displayCanvas.height),
      })),
      stamps: structuredClone(stamps.getStampObjects()),
    };
  }

  function restoreState(state) {
    layersSys.activeLayerIndex = state.activeLayerIndex;

    layersSys.layers = state.layers.map(s => {
      const layer = layersSys.createLayer(s.name);
      layer.id = s.id;
      layer.visible = s.visible;
      layer.ctx.putImageData(s.img, 0, 0);
      return layer;
    });

    stamps.setStampObjects(Array.isArray(state.stamps) ? state.stamps : []);
    stamps.clearSelection();

    layersSys.renderLayersList();
    requestRender();
  }

  function pushUndo() {
    try {
      undoStack.push(snapshotState());
      if (undoStack.length > 25) undoStack.shift();
    } catch {}
  }

  function clearRedo() { redoStack = []; }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshotState());
    const prev = undoStack.pop();
    restoreState(prev);
    saveActiveToDesignsDebounced();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshotState());
    const next = redoStack.pop();
    restoreState(next);
    saveActiveToDesignsDebounced();
  }

  function reset() {
    undoStack = [];
    redoStack = [];
  }

  return {
    pushUndo,
    clearRedo,
    undo,
    redo,
    reset,
  };
}
