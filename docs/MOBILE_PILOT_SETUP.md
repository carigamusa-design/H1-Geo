# Mobile Pilot Setup — HTTPS on your local network

Lets a real phone open the Stage B pilot over `https://` so browser
geolocation works — **without** a public deployment, a third-party tunnel,
or disabling browser security.

How it works: a self-signed development certificate is generated on your
machine (local CA, LAN-only). You install that cert on the phone once so
the phone trusts it. Nothing leaves the building; the private key never
leaves the machine and is gitignored.

## Windows setup (Git Bash — openssl ships with Git for Windows)

```bash
# 1. Find your LAN IP  (or: ipconfig → "IPv4 Address")
ipconfig | grep "IPv4"

# 2. Generate the dev cert for this machine + your LAN IP
node scripts/gen-dev-cert.mjs 192.168.1.42        # use YOUR ip
#   → writes dev-cert/key.pem + dev-cert/cert.pem  (gitignored)

# 3. Serve over HTTPS on the LAN
HTTPS=1 HOST=0.0.0.0 node scripts/serve-stage-b.mjs
#   → Stage B demo: https://<lan-ip>:8734/stage-b
#   → geolocation on this origin: available
```

## Trusting the cert on the phone

The phone must trust `dev-cert/cert.pem` once. Transfer the **cert only**
(never key.pem) — USB, email it to yourself, or host it briefly:

- **Android:** Settings → Security → Encryption & credentials → Install a
  certificate → CA certificate → pick `cert.pem`. (Exact path varies by
  vendor/Android version.)
- **iPhone:** AirDrop/email `cert.pem` → Settings → Profile Downloaded →
  Install → then Settings → General → About → Certificate Trust Settings →
  enable full trust for `H1-Geo dev pilot`.

Then open `https://<lan-ip>:8734/stage-b` and accept nothing unusual —
the page should load without a certificate warning. If it warns, the SAN
doesn't cover your LAN IP: re-run `gen-dev-cert.mjs <correct-ip> --force`
and reinstall the new cert on the phone.

## Granting geolocation

When the page asks for location, choose **Allow** — the reading is a
genuine device fix. Denied/unavailable/timeout all surface honestly in
3c; nothing is fabricated. Readings stay in the browser — there is no
upload path.

## Known limitations

- The cert is self-signed and device-local — browsers will warn on any
  machine that hasn't installed it. That's correct behavior.
- A dev cert is not a production credential. Do not reuse it elsewhere,
  do not commit it, and regenerate (`--force`) if it may have leaked —
  `key.pem` is the sensitive file.
- Firewall may block 8734 inbound on first run — approve the Windows
  prompt or `New-NetFirewallRule` for the port while the pilot runs.

## Verifying without a phone

`node --test` covers `resolveListenConfig` (secure-origin rules,
missing-cert fail-closed, LAN warnings). A generated cert + `HTTPS=1`
server was verified serving `https://127.0.0.1:8734/stage-b` (HTTP 200).
Physical device confirmation remains BLOCKED until a person performs it.
