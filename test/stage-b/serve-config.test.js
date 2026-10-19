import test from "node:test";
import assert from "node:assert/strict";
import { resolveListenConfig } from "../../src/stage-b/serve-config.js";

const exists = () => true;
const missing = () => false;

test("default: loopback HTTP, geolocation available (localhost is secure)", () => {
  const c = resolveListenConfig({}, { fileExists: exists });
  assert.equal(c.ok, true);
  assert.equal(c.secure, false);
  assert.equal(c.host, "127.0.0.1");
  assert.equal(c.geolocation, "available");
  assert.equal(c.urlHint, "http://127.0.0.1:8734/stage-b");
});

test("LAN over plain HTTP warns and reports geolocation denied", () => {
  const c = resolveListenConfig({ HOST: "0.0.0.0" }, { fileExists: exists });
  assert.equal(c.ok, true);
  assert.equal(c.geolocation, "denied (insecure origin)");
  assert.ok(c.warnings.some((w) => /insecure origin/i.test(w)));
  assert.equal(c.urlHint, "http://<lan-ip>:8734/stage-b");
});

test("HTTPS on LAN: geolocation available, cert files required and read from disk", () => {
  const c = resolveListenConfig({ HOST: "0.0.0.0", HTTPS: "1" }, { fileExists: exists });
  assert.equal(c.ok, true);
  assert.equal(c.secure, true);
  assert.equal(c.geolocation, "available");
  assert.match(c.keyPath, /dev-cert[\\/]key\.pem$/);
  assert.match(c.certPath, /dev-cert[\\/]cert\.pem$/);
  assert.equal(c.urlHint, "https://<lan-ip>:8734/stage-b");
  assert.ok(c.warnings.some((w) => /SANs/i.test(w))); // SAN must carry LAN IP
});

test("HTTPS with missing cert files fails closed — server must not start", () => {
  const c = resolveListenConfig({ HTTPS: "1" }, { fileExists: missing });
  assert.equal(c.ok, false);
  assert.equal(c.errors.length, 2);
  assert.ok(c.errors.every((e) => /gen-dev-cert/.test(e)));
});

test("bad port rejected; custom cert dir honored", () => {
  const bad = resolveListenConfig({ PORT: "99999" }, { fileExists: exists });
  assert.equal(bad.ok, false);
  const c = resolveListenConfig({ HTTPS: "true", DEV_CERT_DIR: "certs" }, { fileExists: exists });
  assert.match(c.keyPath, /certs[\\/]key\.pem$/);
});
