/**
 * GEO-020: mobile-access verification — pure, testable. Given this
 * machine's IPv4 addresses and a certificate's SAN IPs, decide whether a
 * phone on the same LAN can reach and trust the HTTPS pilot.
 */

/** Non-internal IPv4s from os.networkInterfaces(). */
export function lanIPv4s(interfaces) {
  const out = [];
  for (const list of Object.values(interfaces ?? {})) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}

/** IPs from openssl "X509v3 Subject Alternative Name" text. */
export function sanIPs(text) {
  const ips = [];
  const sanMatch = /Subject Alternative Name:\s*\n?\s*([^\n]+)/i.exec(text ?? "");
  const line = sanMatch?.[1] ?? text ?? "";
  for (const m of line.matchAll(/IP(?:\s*Address)?:\s*([0-9a-fA-F:.]+)/g)) {
    ips.push(m[1]);
  }
  return ips;
}

/** LAN IPs not covered by the cert's SANs. */
export function uncoveredLanIps(lanIps, sanIps) {
  const covered = new Set(sanIps);
  return lanIps.filter((ip) => !covered.has(ip));
}

/**
 * lanAccessCheck({interfaces, certText, port}) →
 *   {ok, lanIps, sanIps, uncovered, url, instructions[]}
 * ok = every LAN IPv4 is a SAN IP (the common single-NIC case: covered).
 */
export function lanAccessCheck({ interfaces = {}, certText = "", port = 8734 } = {}) {
  const lans = lanIPv4s(interfaces);
  const sans = sanIPs(certText);
  const uncovered = uncoveredLanIps(lans, sans);
  const primary = lans[0] ?? null;
  const url = primary ? `https://${primary}:${port}/stage-b` : null;
  const instructions = [];
  if (!lans.length) instructions.push("No non-internal IPv4 found — connect to Wi-Fi/LAN first.");
  if (uncovered.length) instructions.push(
    `Regenerate the dev cert for the LAN IP(s): node scripts/gen-dev-cert.mjs ${uncovered[0]} --force`);
  if (url) instructions.push(
    `Serve: HTTPS=1 HOST=0.0.0.0 node scripts/serve-stage-b.mjs — phone opens ${url}`);
  instructions.push("Install dev-cert/cert.pem on the phone (Settings → trusted CA) — see docs/MOBILE_PILOT_SETUP.md");
  if (uncovered.length === 0 && lans.length) instructions.push(
    "Windows Firewall: allow inbound TCP 8734 while the pilot runs if the phone cannot connect.");
  return {
    ok: lans.length > 0 && uncovered.length === 0,
    lanIps: lans, sanIps: sans, uncovered, url, instructions,
  };
}
