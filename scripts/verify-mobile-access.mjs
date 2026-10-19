/**
 * GEO-020: verify this machine is actually phone-reachable before a field
 * session — LAN IP, cert SAN coverage, listener state, exact next steps.
 *   node scripts/verify-mobile-access.mjs
 * Exits 0 when the LAN IP is covered by the dev cert's SANs; 1 otherwise.
 */
import os from "node:os";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lanAccessCheck } from "../src/stage-b/lan-check.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const certFile = join(ROOT, "dev-cert", "cert.pem");

let certText = "";
if (existsSync(certFile)) {
  try {
    certText = execFileSync("openssl", ["x509", "-in", certFile, "-noout", "-text"],
      { encoding: "utf8" });
  } catch {
    console.error("openssl unavailable — cannot inspect cert SANs.");
    process.exit(1);
  }
} else {
  console.error("dev-cert/cert.pem missing — run scripts/gen-dev-cert.mjs first.");
  process.exit(1);
}

const r = lanAccessCheck({
  interfaces: os.networkInterfaces(), certText, port: Number(process.env.PORT || 8734) });

console.log(`LAN IPv4s:  ${r.lanIps.join(", ") || "(none)"}`);
console.log(`Cert SANs:  ${r.sanIps.join(", ") || "(none)"}`);
if (r.url) console.log(`Phone URL:  ${r.url}`);
console.log(`Cert covers all LAN IPs: ${r.ok ? "yes" : "NO — " + r.uncovered.join(", ")}`);
console.log("\nOperator steps:");
for (const s of r.instructions) console.log(`  - ${s}`);
process.exit(r.ok ? 0 : 1);
