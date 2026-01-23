import os
import json
from datetime import datetime, timezone
import hashlib
from typing import Dict, Tuple

import requests
from flask import Flask, render_template, Response, request, jsonify
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

# ============================================================
# CACHING ADDITION #1 (Server RAM cache + ETag helper)
# ============================================================
LayerKey = Tuple[str, int]
_layer_png_cache: Dict[LayerKey, Tuple[bytes, str]] = {}  # (png_bytes, etag)

def _make_etag(data: bytes) -> str:
    # Strong ETag (content hash). Browser sends it back as If-None-Match.
    return '"' + hashlib.sha1(data).hexdigest() + '"'


# ---------- Config exposed to browser (SAFE) ----------
@app.get("/config.js")
def config_js():
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_anon = os.getenv("SUPABASE_ANON_KEY", "").strip()
    bucket = os.getenv("SUPABASE_BUCKET", "ShieldBucket").strip()

    js = f"""window.__APP_CONFIG__ = {{
  SUPABASE_URL: {json.dumps(supabase_url)},
  SUPABASE_ANON_KEY: {json.dumps(supabase_anon)},
  SUPABASE_BUCKET: {json.dumps(bucket)}
}};\n"""
    return Response(js, mimetype="application/javascript")


# ---------- Internal Supabase helpers (SERVER ONLY) ----------
def _sb_url() -> str:
    url = os.getenv("SUPABASE_URL", "").strip()
    if not url.startswith("http"):
        raise RuntimeError("SUPABASE_URL missing/invalid in .env")
    return url

def _service_key() -> str:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY missing in .env (server-only key)")
    return key

def _bucket() -> str:
    return os.getenv("SUPABASE_BUCKET", "ShieldBucket").strip()

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def sb_headers_json():
    key = _service_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

def sb_headers_storage(content_type: str = "application/octet-stream"):
    key = _service_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }

def rest_url(path: str) -> str:
    return f"{_sb_url()}/rest/v1/{path.lstrip('/')}"

def storage_object_url(bucket: str, object_path: str) -> str:
    # Authenticated Storage endpoint (service role)
    return f"{_sb_url()}/storage/v1/object/{bucket}/{object_path}"

def rest_get(path: str, params=None):
    r = requests.get(rest_url(path), headers=sb_headers_json(), params=params, timeout=(5, 25))
    if not r.ok:
        raise RuntimeError(f"Supabase REST GET failed: {r.status_code} {r.text}")
    return r.json()

def rest_post(path: str, payload, params=None, prefer_return="representation"):
    headers = sb_headers_json()
    headers["Prefer"] = f"return={prefer_return}"
    r = requests.post(
        rest_url(path),
        headers=headers,
        params=params,
        data=json.dumps(payload),
        timeout=(5, 25),
    )
    if not r.ok:
        raise RuntimeError(f"Supabase REST POST failed: {r.status_code} {r.text}")
    return r.json() if prefer_return == "representation" else None

def rest_patch(path: str, payload, params=None):
    headers = sb_headers_json()
    headers["Prefer"] = "return=minimal"
    r = requests.patch(
        rest_url(path),
        headers=headers,
        params=params,
        data=json.dumps(payload),
        timeout=(5, 25),
    )
    if not r.ok:
        raise RuntimeError(f"Supabase REST PATCH failed: {r.status_code} {r.text}")
    return None

def rest_delete(path: str, params=None):
    headers = sb_headers_json()
    headers["Prefer"] = "return=minimal"
    r = requests.delete(
        rest_url(path),
        headers=headers,
        params=params,
        timeout=(5, 25),
    )
    if not r.ok:
        raise RuntimeError(f"Supabase REST DELETE failed: {r.status_code} {r.text}")
    return None

def storage_delete_object(bucket: str, object_path: str):
    # For deletes, we don't need x-upsert or a specific content type.
    key = _service_key()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    r = requests.delete(
        storage_object_url(bucket, object_path),
        headers=headers,
        timeout=(5, 25),
    )
    # Treat missing objects as success (idempotent delete)
    if r.status_code in (200, 204, 404):
        return
    raise RuntimeError(f"Supabase Storage DELETE failed: {r.status_code} {r.text}")


# ---------- Pages ----------
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/projector")
def projector():
    return render_template("projector.html")


# ---------- API: Designs ----------
@app.get("/api/designs")
def api_list_designs():
    designs = rest_get("designs", params={"select": "id,name,updated_at", "order": "updated_at.desc"})
    out = []
    for d in designs:
        updated = d.get("updated_at")
        ms = 0
        if updated:
            dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            ms = int(dt.timestamp() * 1000)
        out.append({"id": d.get("id"), "name": d.get("name"), "updated": ms})
    return jsonify(out)

@app.post("/api/designs")
def api_create_design():
    body = request.get_json(force=True, silent=False) or {}
    name = (body.get("name") or "Untitled").strip()

    rows = rest_post(
        "designs",
        payload={"name": name, "stamps_json": [], "updated_at": _now_iso()},
        prefer_return="representation",
    )
    if not rows:
        return jsonify({"error": "failed to create design"}), 500

    d = rows[0]
    dt = datetime.fromisoformat(d["updated_at"].replace("Z", "+00:00"))
    return jsonify({"id": d.get("id"), "name": d.get("name"), "updated": int(dt.timestamp() * 1000)})

@app.get("/api/designs/<design_id>")
def api_load_design(design_id):
    d = rest_get("designs", params={"select": "id,name,updated_at,stamps_json", "id": f"eq.{design_id}"})
    if not d:
        return jsonify({"error": "design not found"}), 404
    design = d[0]

    layers = rest_get(
        "layers",
        params={
            "select": "layer_index,name,visible,png_path",
            "design_id": f"eq.{design_id}",
            "order": "layer_index.asc",
        },
    )

    # ============================================================
    # CACHING ADDITION #2 (Cache-busting version token for URLs)
    # ============================================================
    updated = design.get("updated_at")
    ms = 0
    if updated:
        dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        ms = int(dt.timestamp() * 1000)

    out_layers = []
    for l in layers:
        png_path = l.get("png_path")
        idx = l.get("layer_index")
        out_layers.append({
            "layer_index": idx,
            "name": l.get("name"),
            "visible": l.get("visible"),
            # SAME-ORIGIN PNG proxy (avoids canvas taint/CORS entirely)
            # + version token for safe long-term browser caching
            "png_url": (f"/api/designs/{design_id}/layers/{idx}.png?v={ms}" if png_path else None),
        })

    return jsonify({
        "id": design.get("id"),
        "name": design.get("name"),
        "updated": ms,
        "stamps": design.get("stamps_json") or [],
        "layers": out_layers,
    })

@app.get("/api/designs/<design_id>/layers/<int:layer_index>.png")
def api_layer_png(design_id, layer_index: int):
    # ============================================================
    # CACHING ADDITION #3 (Browser caching + conditional GET + RAM cache)
    # ============================================================
    key: LayerKey = (design_id, int(layer_index))

    cached = _layer_png_cache.get(key)
    if cached:
        data, etag = cached
    else:
        bucket = _bucket()
        png_path = f"layers/{design_id}/layer_{layer_index}.png"
        r = requests.get(
            storage_object_url(bucket, png_path),
            headers=sb_headers_storage("image/png"),
            timeout=(5, 25),
        )
        if not r.ok:
            return jsonify({"error": "layer fetch failed", "status": r.status_code, "details": r.text}), 404
        data = r.content
        etag = _make_etag(data)
        _layer_png_cache[key] = (data, etag)

    # Conditional GET: If browser already has this exact bytes, return 304 (no body).
    inm = request.headers.get("If-None-Match")
    if inm and inm == etag:
        resp = Response(status=304)
        resp.headers["ETag"] = etag
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp

    resp = Response(data, mimetype="image/png")
    resp.headers["ETag"] = etag
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


# ---------- API: Delete Design (design row + layers rows + storage pngs + cache) ----------
@app.route("/api/designs/<design_id>", methods = ["DELETE"])
def api_delete_design(design_id):
    """
    Deletes:
      - Storage objects for each layer PNG under layers/<design_id>/layer_<idx>.png
      - Rows in layers table where design_id = <design_id>
      - Row in designs table where id = <design_id>
    Also clears server RAM cache entries for this design.
    """
    try:
        # Grab layer rows so we know which storage objects to delete
        layer_rows = rest_get(
            "layers",
            params={"select": "layer_index,png_path", "design_id": f"eq.{design_id}"}
        )
    except Exception as e:
        return jsonify({"error": "failed reading layers", "details": str(e)}), 500

    bucket = _bucket()

    # Delete storage objects first (so DB delete doesn't orphan files)
    for row in (layer_rows or []):
        png_path = row.get("png_path")
        if png_path:
            try:
                storage_delete_object(bucket, png_path)
            except Exception as e:
                return jsonify({
                    "error": "failed deleting storage object",
                    "png_path": png_path,
                    "details": str(e)
                }), 500

        idx = row.get("layer_index")
        if idx is not None:
            _layer_png_cache.pop((design_id, int(idx)), None)

    # Delete DB rows
    try:
        rest_delete("layers", params={"design_id": f"eq.{design_id}"})
        rest_delete("designs", params={"id": f"eq.{design_id}"})
    except Exception as e:
        return jsonify({"error": "failed deleting db rows", "details": str(e)}), 500

    # Extra cache purge safety
    for k in list(_layer_png_cache.keys()):
        if k[0] == design_id:
            _layer_png_cache.pop(k, None)

    return jsonify({"ok": True})


# ---------- API: Save (layers + stamps) ----------
@app.post("/api/designs/<design_id>/save")
def api_save_design(design_id):
    """
    Expects multipart/form-data:
      - meta: JSON string { layers: [{layer_index,name,visible}, ...], stamps: [...] }
      - layer files: one file per layer with field name: layer_<index>
    """
    try:
        meta_raw = request.form.get("meta", "")
        meta = json.loads(meta_raw) if meta_raw else {}
    except Exception:
        return jsonify({"error": "invalid meta json"}), 400

    layers_meta = meta.get("layers") or []
    stamps = meta.get("stamps") or []
    bucket = _bucket()

    uploaded_rows = []

    for lm in layers_meta:
        idx = int(lm.get("layer_index"))
        f = request.files.get(f"layer_{idx}")
        png_path = f"layers/{design_id}/layer_{idx}.png"

        if f:
            r = requests.put(
                storage_object_url(bucket, png_path),
                headers=sb_headers_storage("image/png"),
                data=f.read(),
                timeout=(5, 25),
            )
            if not r.ok:
                return jsonify({"error": "storage upload failed", "status": r.status_code, "details": r.text}), 500

        # ============================================================
        # CACHING ADDITION #4 (Invalidate server RAM cache on save)
        # ============================================================
        _layer_png_cache.pop((design_id, idx), None)

        uploaded_rows.append({
            "design_id": design_id,
            "layer_index": idx,
            "name": lm.get("name") or f"Layer {idx + 1}",
            "visible": bool(lm.get("visible", True)),
            "png_path": png_path,
        })

    # Upsert layers table via PostgREST
    headers = sb_headers_json()
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
    r = requests.post(
        rest_url("layers"),
        headers=headers,
        params={"on_conflict": "design_id,layer_index"},
        data=json.dumps(uploaded_rows),
        timeout=(5, 25),
    )
    if not r.ok:
        return jsonify({"error": "layers upsert failed", "status": r.status_code, "details": r.text}), 500

    # Update design stamps_json + updated_at
    rest_patch(
        "designs",
        payload={"stamps_json": stamps, "updated_at": _now_iso()},
        params={"id": f"eq.{design_id}"},
    )

    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8080, debug=True, use_reloader=False)
