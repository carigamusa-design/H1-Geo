/**
 * GEO-019: generate a local self-signed development certificate for the
 * Stage B HTTPS pilot. Local-network only — NOT a production cert.
 *
 *   node scripts/gen-dev-cert.mjs [LAN_IP]
 *
 * Writes dev-cert/key.pem + dev-cert/cert.pem (gitignored) with SANs for
 * localhost/127.0.0.1 and the optional LAN IP, so a phone on the same
 * network can open https://<LAN_IP>:8734/stage-b with a trusted origin
 * after the operator installs the cert on the phone. Requires openssl.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, "dev-cert");
const lanIp = process.argv[2] || null;

if (lanIp && !/^\d{1,3}(\.\d{1,3}){3}$/.test(lanIp)) {
  console.error(`Not an IPv4 address: "${lanIp}" — pass e.g. node scripts/gen-dev-cert.mjs 192.168.1.42`);
  process.exit(1);
}
try {
  execFileSync("openssl", ["version"], { stdio: "ignore" });
} catch {
  console.error("openssl not found. Install it or use the Git-bundled copy " +
    "(Git for Windows ships openssl.exe — run this from Git Bash).");
  process.exit(1);
}

if (existsSync(join(DIR, "cert.pem")) && !process.argv.includes("--force")) {
  console.error("dev-cert/cert.pem already exists — pass --force to regenerate. " +
    "(Regenerating means re-installing the cert on the phone.)");
  process.exit(1);
}
mkdirSync(DIR, { recursive: true });

const sans = ["DNS:localhost", "IP:127.0.0.1", "IP:::1"];
if (lanIp) sans.push(`IP:${lanIp}`);
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes",
  "-keyout", join(DIR, "key.pem"),
  "-out", join(DIR, "cert.pem"),
  "-days", "180",
  "-subj", "/CN=H1-Geo dev pilot",
  "-addext", `subjectAltName=${sans.join(",")}`,
], { stdio: "inherit" });

console.log(`\nWrote dev-cert/cert.pem + key.pem (gitignored).`);
console.log(`Start HTTPS:  HTTPS=1 HOST=0.0.0.0 node scripts/serve-stage-b.mjs`);
if (lanIp) console.log(`Phone URL:    https://${lanIp}:8734/stage-b`);
else console.log(`Re-run with your LAN IP so the phone trusts the cert: node scripts/gen-dev-cert.mjs <lan-ip>`);
