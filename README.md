# ShieldDesigner — Setup Guide

## Quick Start

### Windows
Double-click `setup.bat`  
That's it. It will install everything and launch the app.

### Mac / Linux
```bash
chmod +x setup.sh
./setup.sh
```

---

## What the setup script does

1. Checks that Python 3 is installed
2. Creates a `.env` file template if one doesn't exist
3. Creates a Python virtual environment (`venv/`) so dependencies don't conflict with your system
4. Installs all required packages from `requirements.txt`
5. Launches the app on **port 8080**

---

## Accessing from another device on your network

The app binds to `0.0.0.0:8080`, which means it's reachable from any device on your local network.

Find your machine's local IP:
- **Windows**: run `ipconfig` → look for IPv4 Address (e.g. `192.168.1.42`)
- **Mac/Linux**: run `ifconfig` or `ip a` → look for `inet` on your wifi adapter

Then open on any device: `http://192.168.1.42:8080`

### Firewall (most common reason network access fails)

**Windows Firewall** often blocks inbound connections on custom ports.
To allow port 8080:
1. Open **Windows Defender Firewall** → Advanced Settings
2. Inbound Rules → New Rule → Port → TCP → 8080 → Allow

Or run this in an **Admin** PowerShell:
```powershell
New-NetFirewallRule -DisplayName "ShieldDesigner" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

**macOS**: When you first run the app, macOS will ask if you want to allow incoming connections — click **Allow**.

---

## Browser Auth Issues

The app uses Flask sessions. If you're hitting auth/cookie errors when accessing from another machine:

### Problem: Session cookie not being set
The app has `SESSION_COOKIE_SECURE=False` which is correct for HTTP (non-HTTPS) use.
If you're accessing over plain `http://` and cookies still don't work, try:

1. **Use the exact IP**, not a hostname — e.g. `http://192.168.1.42:8080`, not `http://mypc:8080`
2. **Don't use incognito/private mode** on first access — some browsers block cookies in private mode for local IPs
3. **Chrome fix**: Go to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add your IP+port (`http://192.168.1.42:8080`), and enable it

### Problem: FLASK_SECRET_KEY changes between restarts
If your `.env` has an empty or missing `FLASK_SECRET_KEY`, a new random key is generated every restart — invalidating all sessions.

**Fix**: Set a permanent secret key in `.env`:
```
FLASK_SECRET_KEY=any-long-random-string-you-choose
```

---

## Dependencies (requirements.txt)

| Package | Purpose |
|---|---|
| `flask` | Web framework |
| `python-dotenv` | Loads `.env` variables |
| `requests` | HTTP calls to Supabase REST API |
| `waitress` | Production-grade WSGI server (replaces Flask dev server) |
| `werkzeug` | Password hashing, security utilities |

---

## .env reference

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_BUCKET=ShieldBucket
SUPABASE_SERVICE_ROLE_KEY=...
FLASK_SECRET_KEY=pick-something-long-and-random
ADMIN_USER=henry
ADMIN_PASS_HASH=...
```

To regenerate `ADMIN_PASS_HASH`, run:
```bash
python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('your_password'))"
```
