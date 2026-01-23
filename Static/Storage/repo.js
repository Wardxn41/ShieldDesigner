// Static/Storage/repo.js
// Server-backed repo: all Supabase writes happen in Flask using SERVICE ROLE.
// The browser only talks to Flask endpoints on the same origin (http://localhost:8080).

/** Convert canvas -> Blob (PNG) */
async function canvasToPngBlob(canvas) {
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Accept": "application/json", ...(opts.headers || {}) },
    ...opts,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg = (data && (data.error || data.details)) ? (data.error || data.details) : text;
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${msg}`);
  }
  return data;
}

/** List designs (latest first) */
export async function listDesigns() {
  return await fetchJSON("/api/designs");
}

/** Create a new design and return {id,name,updated} */
export async function createDesign(name = "Untitled") {
  return await fetchJSON("/api/designs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteDesign(id) {
  const r = await fetch(`/api/designs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`deleteDesign failed: ${r.status} ${t}`);
  }
  return await r.json().catch(() => ({ ok: true }));
}


/**
 * Save everything:
 * - upload layer PNGs (via Flask -> Supabase Storage using service key)
 * - upsert layers rows (via Flask -> Supabase PostgREST using service key)
 * - update stamps_json + updated_at
 */
export async function saveDesign(designId, layers, stampObjects, opts = {}) {
  const form = new FormData();

  const forceFull = !!opts.forceFull;

  // meta JSON (always send meta)
  const meta = {
    layers: layers.map((l, i) => ({
      layer_index: i,
      name: l.name,
      visible: l.visible,
    })),
    stamps: stampObjects || [],
  };
  form.append("meta", JSON.stringify(meta));

  // layer files (ONLY dirty, unless forceFull)
  for (let i = 0; i < layers.length; i++) {
    const isDirty = !!layers[i].dirty;
    if (!forceFull && !isDirty) continue;

    const blob = await canvasToPngBlob(layers[i].canvas);
    if (!blob) throw new Error("Failed to export a layer canvas to PNG (canvas may be tainted).");
    form.append(`layer_${i}`, blob, `layer_${i}.png`);
  }

  await fetchJSON(`/api/designs/${encodeURIComponent(designId)}/save`, {
    method: "POST",
    body: form,
  });
}


/**
 * Load a design:
 * Returns:
 *  {
 *    id, name, updated,
 *    stamps: [],
 *    layers: [{layer_index,name,visible,png_url}]
 *  }
 *
 * NOTE: png_url is SAME-ORIGIN (served by Flask), so it will NOT taint canvas.
 */
export async function loadDesign(designId) {
  return await fetchJSON(`/api/designs/${encodeURIComponent(designId)}`);
}
