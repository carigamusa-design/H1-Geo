/**
 * GEO-019: listen configuration for the Stage B dev server — pure,
 * testable. Resolves host/port/HTTPS from env and reports the
 * secure-context consequences honestly (geolocation needs a secure
 * origin: https or localhost/127.0.0.1).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_PORT = 8734;
export const DEFAULT_CERT_DIR = "dev-cert";

/**
 * resolveListenConfig(env, {rootDir, fileExists})
 * env keys: HOST, PORT, HTTPS, DEV_CERT_DIR.
 * Returns {ok, errors?, host, port, secure, keyPath, certPath, warnings,
 *          geolocation, urlHint}.
 */
export function resolveListenConfig(env = {}, { rootDir = ".", fileExists = existsSync } = {}) {
  const errors = [];
  const warnings = [];
  const host = env.HOST || "127.0.0.1";
  const port = Number(env.PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`PORT must be 1-65535, got "${env.PORT}"`);
  }
  const secure = /^1|true|yes$/i.test(String(env.HTTPS || ""));
  let keyPath = null, certPath = null;
  if (secure) {
    const dir = env.DEV_CERT_DIR || DEFAULT_CERT_DIR;
    keyPath = join(rootDir, dir, "key.pem");
    certPath = join(rootDir, dir, "cert.pem");
    if (!fileExists(keyPath)) errors.push(`HTTPS requested but ${keyPath} is missing — run scripts/gen-dev-cert.mjs first`);
    if (!fileExists(certPath)) errors.push(`HTTPS requested but ${certPath} is missing — run scripts/gen-dev-cert.mjs first`);
  }
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  // Secure context: https anywhere, or localhost/loopback over http.
  const geolocation = secure || loopback ? "available" : "denied (insecure origin)";
  if (!secure && !loopback) {
    warnings.push("Serving on a LAN address over plain HTTP — browser geolocation will be " +
      "denied (insecure origin). Use HTTPS=1 with a dev certificate for the mobile pilot.");
  }
  if (secure && !loopback) {
    warnings.push("HTTPS on a LAN address — the dev cert must include this machine's LAN IP " +
      "in its SANs or the phone will refuse the connection. Regenerate with the LAN IP argument.");
  }
  const hostHint = host === "0.0.0.0" ? "<lan-ip>" : host;
  return {
    ok: errors.length === 0,
    errors,
    host, port, secure, keyPath, certPath, warnings,
    geolocation,
    urlHint: `${secure ? "https" : "http"}://${hostHint}:${port}/stage-b`,
  };
}
