import os
import json
from datetime import datetime, timezone
import hashlib
from typing import Dict, Tuple, Optional
import time
import requests
from flask import Flask, render_template, Response, request, jsonify, g
from dotenv import load_dotenv

# ============================================================
# LOGIN IMPORTS (kept, but login is disabled below)
# ============================================================
from functools import wraps
from flask import session, redirect, url_for, flash
from werkzeug.security import check_password_hash, generate_password_hash
import secrets


load_dotenv()
app = Flask(__name__)

# --- LOGIN DISABLED (optional prints) ---
# print("Login configured:", bool(os.getenv("ADMIN_USER")) and bool(os.getenv("ADMIN_PASS_HASH")))
# from werkzeug.security import generate_password_hash
# print(generate_password_hash("PerseusAndromeda"))

# IMPORTANT: set this in .env as a long random string
app.secret_key = os.getenv("FLASK_SECRET_KEY", "") or secrets.token_hex(32)

# Harden cookies
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",   # "Strict" is safer but can annoy some flows
    SESSION_COOKIE_SECURE=False,     # set True when behind HTTPS / reverse proxy
)

# ============================================================
# Global HTTP Session (connection reuse)
# ============================================================
SESSION = requests.Session()

# ============================================================
# Server RAM cache for layer PNGs
#   key: (design_id, layer_index)
#   value: (png_bytes, etag)
# ============================================================
LayerKey = Tuple[str, int]
_layer_png_cache: Dict[LayerKey, Tuple[bytes, str]] = {}

def _make_etag(data: bytes) -> str:
    # Strong ETag (content hash). Browser sends it back as If-None-Match.
    return '"' + hashlib.sha1(data).hexdigest() + '"'

# ============================================================
# Timing helpers
# ============================================================
def timed(label: str, fn):
    t0 = time.perf_counter()
    out = fn()
    dt = (time.perf_counter() - t0) * 1000
    print(f"  {label}: {dt:.1f}ms")
    return out

@app.before_request
def _t0():
    g._t0 = time.perf_counter()

@app.after_request
def _t1(resp):
    dt = (time.perf_counter() - g._t0) * 1000
    print(f"{request.method} {request.path} -> {resp.status_code} in {dt:.1f}ms")
    return resp

# ============================================================
# Config exposed to browser (SAFE)
# ============================================================
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

# ============================================================
# Internal Supabase helpers (SERVER ONLY)
# ============================================================
_SB_JSON_HEADERS: Optional[dict] = None
_SB_STORAGE_HEADERS: Dict[str, dict] = {}

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

def sb_headers_json_cached():
    global _SB_JSON_HEADERS
    if _SB_JSON_HEADERS is None:
        key = _service_key()
        _SB_JSON_HEADERS = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
    return _SB_JSON_HEADERS

def sb_headers_storage_cached(content_type: str = "application/octet-stream"):
    # Cache per content_type
    if content_type in _SB_STORAGE_HEADERS:
        return _SB_STORAGE_HEADERS[content_type]
    key = _service_key()
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    _SB_STORAGE_HEADERS[content_type] = h
    return h

def sb_headers_storage_delete_cached():
    # Deletes don't need x-upsert or content-type
    if "__delete__" in _SB_STORAGE_HEADERS:
        return _SB_STORAGE_HEADERS["__delete__"]
    key = _service_key()
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    _SB_STORAGE_HEADERS["__delete__"] = h
    return h

def rest_url(path: str) -> str:
    return f"{_sb_url()}/rest/v1/{path.lstrip('/')}"

def storage_object_url(bucket: str, object_path: str) -> str:
    return f"{_sb_url()}/storage/v1/object/{bucket}/{object_path}"

def rest_get(path: str, params=None):
    def _do():
        r = SESSION.get(
            rest_url(path),
            headers=sb_headers_json_cached(),
            params=params,
            timeout=(5, 25),
        )
        if not r.ok:
            raise RuntimeError(f"Supabase REST GET failed: {r.status_code} {r.text}")
        return r.json()
    return timed(f"REST GET {path}", _do)

def rest_post(path: str, payload, params=None, prefer_return="representation"):
    def _do():
        headers = dict(sb_headers_json_cached())
        headers["Prefer"] = f"return={prefer_return}"
        r = SESSION.post(
            rest_url(path),
            headers=headers,
            params=params,
            data=json.dumps(payload),
            timeout=(5, 25),
        )
        if not r.ok:
            raise RuntimeError(f"Supabase REST POST failed: {r.status_code} {r.text}")
        return r.json() if prefer_return == "representation" else None
    return timed(f"REST POST {path}", _do)

def rest_patch(path: str, payload, params=None):
    def _do():
        headers = dict(sb_headers_json_cached())
        headers["Prefer"] = "return=minimal"
        r = SESSION.patch(
            rest_url(path),
            headers=headers,
            params=params,
            data=json.dumps(payload),
            timeout=(5, 25),
        )
        if not r.ok:
            raise RuntimeError(f"Supabase REST PATCH failed: {r.status_code} {r.text}")
        return None
    return timed(f"REST PATCH {path}", _do)

def rest_delete(path: str, params=None):
    def _do():
        headers = dict(sb_headers_json_cached())
        headers["Prefer"] = "return=minimal"
        r = SESSION.delete(
            rest_url(path),
            headers=headers,
            params=params,
            timeout=(5, 25),
        )
        if not r.ok:
            raise RuntimeError(f"Supabase REST DELETE failed: {r.status_code} {r.text}")
        return None
    return timed(f"REST DELETE {path}", _do)

def storage_get_object(bucket: str, object_path: str, content_type="application/octet-stream"):
    def _do():
        r = SESSION.get(
            storage_object_url(bucket, object_path),
            headers=sb_headers_storage_cached(content_type),
            timeout=(5, 25),
        )
        return r
    return timed("STORAGE GET object", _do)

def storage_put_object(bucket: str, object_path: str, data: bytes, content_type: str):
    def _do():
        r = SESSION.put(
            storage_object_url(bucket, object_path),
            headers=sb_headers_storage_cached(content_type),
            data=data,
            timeout=(5, 25),
        )
        return r
    return timed("STORAGE PUT object", _do)

def storage_delete_object(bucket: str, object_path: str):
    def _do():
        r = SESSION.delete(
            storage_object_url(bucket, object_path),
            headers=sb_headers_storage_delete_cached(),
            timeout=(5, 25),
        )
        return r
    r = timed("STORAGE DELETE object", _do)
    # Treat missing objects as success (idempotent delete)
    if r.status_code in (200, 204, 404):
        return
    raise RuntimeError(f"Supabase Storage DELETE failed: {r.status_code} {r.text}")


# ============================================================
# -------- Auth + CSRF (DISABLED FOR NOW) --------
# ============================================================

# # In-memory rate-limit (per IP)
# _login_attempts = {}  # ip -> {"count": int, "reset_at": float}
#
# def _client_ip():
#     # If you add a reverse proxy later, handle X-Forwarded-For carefully.
#     return request.remote_addr or "unknown"
#
# def _rate_limit_login(max_attempts=8, window_seconds=300):
#     ip = _client_ip()
#     now = time.time()
#     rec = _login_attempts.get(ip)
#
#     if not rec or now > rec["reset_at"]:
#         _login_attempts[ip] = {"count": 0, "reset_at": now + window_seconds}
#         rec = _login_attempts[ip]
#
#     if rec["count"] >= max_attempts:
#         return False, int(rec["reset_at"] - now)
#     return True, 0
#
# def _record_failed_login():
#     ip = _client_ip()
#     rec = _login_attempts.get(ip)
#     if not rec:
#         _login_attempts[ip] = {"count": 1, "reset_at": time.time() + 300}
#     else:
#         rec["count"] += 1
#
# def _get_csrf():
#     token = session.get("csrf_token")
#     if not token:
#         token = secrets.token_urlsafe(32)
#         session["csrf_token"] = token
#     return token
#
# def _check_csrf(form_token: str) -> bool:
#     return bool(form_token) and secrets.compare_digest(form_token, session.get("csrf_token", ""))
#
# def is_logged_in() -> bool:
#     return session.get("auth", False) is True
#
# def login_required(fn):
#     @wraps(fn)
#     def wrapper(*args, **kwargs):
#         if not is_logged_in():
#             return redirect(url_for("login", next=request.path))
#         return fn(*args, **kwargs)
#     return wrapper


@app.get("/favicon.ico")
def favicon():
    return ("", 204)

# ============================================================
# Pages
# ============================================================
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/projector")
def projector():
    return render_template("projector.html")

# ============================================================
# API: Designs
# ============================================================
@app.get("/api/designs")
def api_list_designs():
    designs = rest_get(
        "designs",
        params={"select": "id,name,updated_at", "order": "updated_at.desc"},
    )
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
    return jsonify(
        {"id": d.get("id"), "name": d.get("name"), "updated": int(dt.timestamp() * 1000)}
    )

@app.get("/api/designs/<design_id>")
def api_load_design(design_id):
    d = rest_get(
        "designs",
        params={"select": "id,name,updated_at,stamps_json", "id": f"eq.{design_id}"},
    )
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

    updated = design.get("updated_at")
    ms = 0
    if updated:
        dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        ms = int(dt.timestamp() * 1000)

    out_layers = []
    for l in layers:
        png_path = l.get("png_path")
        idx = l.get("layer_index")
        out_layers.append(
            {
                "layer_index": idx,
                "name": l.get("name"),
                "visible": l.get("visible"),
                # Same-origin proxy + version token for cache busting
                "png_url": (f"/api/designs/{design_id}/layers/{idx}.png?v={ms}" if png_path else None),
            }
        )

    return jsonify(
        {
            "id": design.get("id"),
            "name": design.get("name"),
            "updated": ms,
            "stamps": design.get("stamps_json") or [],
            "layers": out_layers,
        }
    )

@app.patch("/api/designs/<design_id>")
def api_rename_design(design_id):
    """Rename a design.

    Expects JSON: { "name": "New Name" }
    Returns: { id, name, updated }
    """
    body = request.get_json(force=True, silent=False) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    if len(name) > 120:
        return jsonify({"error": "name too long"}), 400

    now = _now_iso()
    rest_patch(
        "designs",
        params={"id": f"eq.{design_id}"},
        payload={"name": name, "updated_at": now},
    )

    dt = datetime.fromisoformat(now.replace("Z", "+00:00"))
    return jsonify({"id": design_id, "name": name, "updated": int(dt.timestamp() * 1000)})

# ============================================================
# LOGIN ROUTES (DISABLED FOR NOW)
# ============================================================
# @app.get("/login")
# def login():
#     if is_logged_in():
#         return redirect(url_for("home"))
#     return render_template("login.html", csrf_token=_get_csrf(), next=request.args.get("next", "/"))
#
# @app.post("/login")
# def login_post():
#     ok, wait_s = _rate_limit_login()
#     if not ok:
#         return render_template(
#             "login.html",
#             csrf_token=_get_csrf(),
#             next=request.form.get("next", "/"),
#             error=f"Too many attempts. Try again in {wait_s}s."
#         ), 429
#
#     if not _check_csrf(request.form.get("csrf_token", "")):
#         return "CSRF failed", 400
#
#     username = (request.form.get("username") or "").strip()
#     password = request.form.get("password") or ""
#
#     admin_user = (os.getenv("ADMIN_USER") or "").strip()
#     admin_hash = (os.getenv("ADMIN_PASS_HASH") or "").strip()
#
#     if not admin_user or not admin_hash:
#         return "Server not configured for login. Set ADMIN_USER and ADMIN_PASS_HASH.", 500
#
#     if username == admin_user and check_password_hash(admin_hash, password):
#         session["auth"] = True
#         session["user"] = username
#         # rotate csrf on login
#         session["csrf_token"] = secrets.token_urlsafe(32)
#
#         nxt = request.form.get("next") or "/"
#         # prevent open redirects
#         if not nxt.startswith("/"):
#             nxt = "/"
#         return redirect(nxt)
#
#     _record_failed_login()
#     return render_template(
#         "login.html",
#         csrf_token=_get_csrf(),
#         next=request.form.get("next", "/"),
#         error="Invalid username or password."
#     ), 401
#
# @app.post("/logout")
# def logout():
#     if not _check_csrf(request.form.get("csrf_token", "")):
#         return "CSRF failed", 400
#     session.clear()
#     return redirect(url_for("login"))

@app.get("/api/designs/<design_id>/layers/<int:layer_index>.png")
def api_layer_png(design_id, layer_index: int):
    key: LayerKey = (design_id, int(layer_index))
    cached = _layer_png_cache.get(key)

    if cached:
        data, etag = cached
        print("LAYER PNG cache HIT", design_id, layer_index)
    else:
        print("LAYER PNG cache MISS", design_id, layer_index)
        bucket = _bucket()
        png_path = f"layers/{design_id}/layer_{layer_index}.png"

        r = storage_get_object(bucket, png_path, content_type="image/png")
        if not r.ok:
            return jsonify(
                {"error": "layer fetch failed", "status": r.status_code, "details": r.text}
            ), 404

        data = r.content
        etag = _make_etag(data)
        _layer_png_cache[key] = (data, etag)

    # Conditional GET (browser cache validation)
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

# ============================================================
# API: Delete Design (design row + layers rows + storage pngs + cache)
# ============================================================
@app.route("/api/designs/<design_id>", methods=["DELETE"])
def api_delete_design(design_id):
    try:
        layer_rows = rest_get(
            "layers",
            params={"select": "layer_index,png_path", "design_id": f"eq.{design_id}"},
        )
    except Exception as e:
        return jsonify({"error": "failed reading layers", "details": str(e)}), 500

    bucket = _bucket()

    # Delete storage objects first
    for row in (layer_rows or []):
        png_path = row.get("png_path")
        if png_path:
            try:
                storage_delete_object(bucket, png_path)
            except Exception as e:
                return jsonify(
                    {
                        "error": "failed deleting storage object",
                        "png_path": png_path,
                        "details": str(e),
                    }
                ), 500

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

# ============================================================
# API: Save (layers + stamps)
# ============================================================
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
            # Read once; upload through SESSION (connection reuse)
            blob = f.read()
            r = storage_put_object(bucket, png_path, data=blob, content_type="image/png")
            if not r.ok:
                return jsonify(
                    {
                        "error": "storage upload failed",
                        "status": r.status_code,
                        "details": r.text,
                    }
                ), 500

        # Invalidate RAM cache for that layer
        _layer_png_cache.pop((design_id, idx), None)

        uploaded_rows.append(
            {
                "design_id": design_id,
                "layer_index": idx,
                "name": lm.get("name") or f"Layer {idx + 1}",
                "visible": bool(lm.get("visible", True)),
                "png_path": png_path,
            }
        )

    # Upsert layers table
    def _upsert_layers():
        headers = dict(sb_headers_json_cached())
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        r = SESSION.post(
            rest_url("layers"),
            headers=headers,
            params={"on_conflict": "design_id,layer_index"},
            data=json.dumps(uploaded_rows),
            timeout=(5, 25),
        )
        return r

    r = timed("REST POST layers upsert", _upsert_layers)
    if not r.ok:
        return jsonify({"error": "layers upsert failed", "status": r.status_code, "details": r.text}), 500

    # Update design stamps_json + updated_at
    rest_patch(
        "designs",
        payload={"stamps_json": stamps, "updated_at": _now_iso()},
        params={"id": f"eq.{design_id}"},
    )

    return jsonify({"ok": True})

# ============================================================
# Run
# ============================================================
if __name__ == "__main__":
    # If you want to run under waitress, do:
    #   python app.py
    # (waitress is embedded below)
    from waitress import serve
    # serve(app, host="127.0.0.1", port=8080)
    serve(app, host="0.0.0.0", port=8080)