# Field Trial Record — GEO-020

**Status: FIELD TRIAL BLOCKED — no physical device/operator in the
execution environment.** This document records what *was* verified
(machine-side) and the exact remaining operator action. Nothing below
was simulated.

## Environment verification (performed 2026-10-19, this machine)

| Check | Result |
|---|---|
| LAN IPv4 (Wi-Fi) | `192.168.254.122` — **changed** from `172.20.17.239`; always re-run `verify-mobile-access.mjs` first |
| Dev cert SANs | `localhost, 127.0.0.1, ::1, 192.168.254.122` — **LAN IP covered** |
| HTTPS listener | `HTTPS=1 HOST=0.0.0.0` → `TCP 0.0.0.0:8734 LISTENING` |
| LAN self-request | `curl -k https://192.168.254.122:8734/stage-b` → **HTTP 200** |
| Geolocation context | `available` (secure origin) |
| Windows firewall | No explicit inbound rule found for 8734 — may prompt on bind; if the phone can't connect, allow inbound TCP 8734 while the pilot runs |
| `scripts/verify-mobile-access.mjs` | PASS (exit 0) — re-run anytime; it regenerates these facts |

A successful LAN request from this machine does **not** prove a phone can
connect — Wi-Fi client isolation, the cert-install step, and firewall
filtering are all phone-side and unverified.

## Exact remaining operator actions (≈15 min + field time)

1. **On this machine (Git Bash, repo root):**
   ```bash
   node scripts/verify-mobile-access.mjs          # confirms IP + cert —
                                                  # re-run EVERY session:
                                                  # the LAN IP changes
   HTTPS=1 HOST=0.0.0.0 node scripts/serve-stage-b.mjs
   ```
   Approve the Windows firewall prompt if it appears (private network).
2. **On the phone (same Wi-Fi — not guest, not cellular):**
   - Get `dev-cert/cert.pem` onto it (USB/email/AirDrop — the cert only,
     never `key.pem`). **If the cert was regenerated since the phone last
     trusted it, reinstall — the old one is stale.**
   - Android: Settings → Security → Encryption & credentials → Install a
     certificate → CA. iOS: Settings → Profile Downloaded → Install →
     then General → About → Certificate Trust → enable.
   - Open `https://192.168.254.122:8734/stage-b` — should load with **no
     cert warning**.
3. **In the field**, per `docs/NEIGHBOR_TRIAL.md`:
   - Grant location permission → 3c "Collect 5 readings" → pick a real one.
   - 3b: confirm/correct the intended property; note the verdict.
   - Establish the reference **independently of the app** (you're
     standing at the known property).
   - Save the measurement **with "real" checked**, measuredBy + region +
     session labels.
   - Record an observation, draft the opportunity, review → package;
     refresh once mid-flow to prove recovery.
4. **Report back:** the 3d dashboard numbers + any problems → append a
   dated entry below.

## Field trial log (fill in per session — do not backfill)

| Date | Operator | Sites | real n | Notes |
|---|---|---|---|---|
| *(none yet — blocked)* | | | | |

## Current evidence position

`real n = 0`. No GPS reading, field observation, operator action, or
reference location has been fabricated to fill this gap. The controlled-
pilot acceptance bar (`docs/PILOT_ACCEPTANCE.md`) is **not met**.
