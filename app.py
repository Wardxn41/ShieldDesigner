
import os
import json
from datetime import datetime, timezone

import requests
from flask import Flask, render_template, Response, request, jsonify
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

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
    r = requests.get(rest_url(path), headers=sb_headers_json(), params=params)
    if not r.ok:
        raise RuntimeError(f"Supabase REST GET failed: {r.status_code} {r.text}")
    return r.json()

def rest_post(path: str, payload, params=None, prefer_return="representation"):
    headers = sb_headers_json()
    headers["Prefer"] = f"return={prefer_return}"
    r = requests.post(rest_url(path), headers=headers, params=params, data=json.dumps(payload))
    if not r.ok:
        raise RuntimeError(f"Supabase REST POST failed: {r.status_code} {r.text}")
    return r.json() if prefer_return == "representation" else None

def rest_patch(path: str, payload, params=None):
    headers = sb_headers_json()
    headers["Prefer"] = "return=minimal"
    r = requests.patch(rest_url(path), headers=headers, params=params, data=json.dumps(payload))
    if not r.ok:
        raise RuntimeError(f"Supabase REST PATCH failed: {r.status_code} {r.text}")
    return None


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

    out_layers = []
    for l in layers:
        png_path = l.get("png_path")
        idx = l.get("layer_index")
        out_layers.append({
            "layer_index": idx,
            "name": l.get("name"),
            "visible": l.get("visible"),
            # SAME-ORIGIN PNG proxy (avoids canvas taint/CORS entirely)
            "png_url": f"/api/designs/{design_id}/layers/{idx}.png" if png_path else None,
        })

    updated = design.get("updated_at")
    ms = 0
    if updated:
        dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        ms = int(dt.timestamp() * 1000)

    return jsonify({
        "id": design.get("id"),
        "name": design.get("name"),
        "updated": ms,
        "stamps": design.get("stamps_json") or [],
        "layers": out_layers,
    })

@app.get("/api/designs/<design_id>/layers/<int:layer_index>.png")
def api_layer_png(design_id, layer_index: int):
    # Proxy layer PNG through Flask (same-origin) to avoid canvas taint/CORS headaches.
    bucket = _bucket()
    png_path = f"layers/{design_id}/layer_{layer_index}.png"
    r = requests.get(storage_object_url(bucket, png_path), headers=sb_headers_storage("image/png"))
    if not r.ok:
        return jsonify({"error": "layer fetch failed", "status": r.status_code, "details": r.text}), 404
    return Response(r.content, mimetype="image/png")


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
            )
            if not r.ok:
                return jsonify({"error": "storage upload failed", "status": r.status_code, "details": r.text}), 500

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
    app.run(host="127.0.0.1", port=8080, debug=True, use_reloader = False)

