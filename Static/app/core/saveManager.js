// Static/app/core/saveManager.js
// Owns: save debouncing / coalescing + designs list refresh throttling.

export function createSaveManager({
  getActiveDesignId,
  getLayersForSave,
  getStampsForSave,
  getForceFull,
  clearDirtyFlags,
  saveDesign,
  touchDesignLocal,
  refreshDesignListThrottled,
  debounceMs = 500,
}) {
  let saveTimer = null;
  let saveInFlight = null;
  let pendingSave = false;

  async function runSaveOnce() {
    if (saveInFlight) return;

    const id = getActiveDesignId();
    if (!id) return;

    touchDesignLocal?.(id);

    saveInFlight = (async () => {
      try {
        await saveDesign(
          id,
          getLayersForSave(),
          getStampsForSave(),
          { forceFull: !!getForceFull?.() }
        );
        clearDirtyFlags?.();
        refreshDesignListThrottled?.();
      } finally {
        saveInFlight = null;
      }
    })();

    await saveInFlight;

    if (pendingSave) {
      pendingSave = false;
      await runSaveOnce();
    }
  }

  function saveDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    if (saveInFlight) {
      pendingSave = true;
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      runSaveOnce();
    }, debounceMs);
  }

  return { saveDebounced, runSaveOnce };
}
