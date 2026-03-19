#!/usr/bin/env bash
set -e

echo "============================================"
echo " ShieldDesigner - Setup and Launch"
echo "============================================"
echo

# ── Python check ──────────────────────────────
PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        VER=$("$cmd" -c "import sys; print(sys.version_info[:2])")
        PYTHON="$cmd"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "[ERROR] Python 3 not found. Install it from https://www.python.org/downloads/"
    exit 1
fi

echo "[OK] Using $($PYTHON --version)"

# ── .env check ────────────────────────────────
if [ ! -f ".env" ]; then
    echo
    echo "[WARNING] .env file not found — creating a template."
    cat > .env <<'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_BUCKET=ShieldBucket
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
FLASK_SECRET_KEY=change_this_to_a_random_string
ADMIN_USER=admin
ADMIN_PASS_HASH=
EOF
    echo "[!] Edit .env with your Supabase credentials, then re-run this script."
    echo "    Run: nano .env  (or open in any text editor)"
    exit 1
fi
echo "[OK] .env file found"

# ── Virtual environment ───────────────────────
if [ ! -d "venv" ]; then
    echo
    echo "[SETUP] Creating virtual environment..."
    $PYTHON -m venv venv
    echo "[OK] Virtual environment created"
else
    echo "[OK] Virtual environment already exists"
fi

# shellcheck disable=SC1091
source venv/bin/activate

# ── Dependencies ──────────────────────────────
echo
echo "[SETUP] Updating pip..."
pip install --upgrade pip --quiet

echo "[SETUP] Installing dependencies from requirements.txt..."
pip install -r requirements.txt --quiet
echo "[OK] All dependencies installed"

# ── Show network address for easy LAN access ──
echo
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "unknown")
echo "============================================"
echo " Launching ShieldDesigner on port 8080"
echo " Local:   http://localhost:8080"
echo " Network: http://${LOCAL_IP}:8080"
echo " Press Ctrl+C to stop"
echo "============================================"
echo

python app.py
