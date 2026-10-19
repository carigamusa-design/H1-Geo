import test from "node:test";
import assert from "node:assert/strict";
import { lanIPv4s, sanIPs, uncoveredLanIps, lanAccessCheck }
  from "../../src/stage-b/lan-check.js";

const IFACES = {
  "Wi-Fi": [{ family: "IPv4", address: "192.168.1.42", internal: false },
            { family: "IPv6", address: "fe80::1", internal: false }],
  "Loopback": [{ family: "IPv4", address: "127.0.0.1", internal: true }],
};
const SAN_TEXT = `    X509v3 Subject Alternative Name: 
        DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1, IP Address:192.168.1.42`;

test("lanIPv4s: non-internal IPv4s only", () => {
  assert.deepEqual(lanIPv4s(IFACES), ["192.168.1.42"]);
  assert.deepEqual(lanIPv4s({}), []);
});

test("sanIPs: parses openssl SAN output", () => {
  assert.deepEqual(sanIPs(SAN_TEXT), ["127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.42"]);
  assert.deepEqual(sanIPs("DNS:localhost"), []);
});

test("uncovered + full check: covered LAN IP → ok with URL", () => {
  const r = lanAccessCheck({ interfaces: IFACES, certText: SAN_TEXT });
  assert.equal(r.ok, true);
  assert.equal(r.url, "https://192.168.1.42:8734/stage-b");
  assert.equal(r.uncovered.length, 0);
  assert.ok(r.instructions.some((s) => /trusted CA|Install/i.test(s)));
});

test("cert without LAN IP → not ok, regenerate instruction names the IP", () => {
  const r = lanAccessCheck({ interfaces: IFACES,
    certText: SAN_TEXT.replace(", IP Address:192.168.1.42", "") });
  assert.equal(r.ok, false);
  assert.deepEqual(r.uncovered, ["192.168.1.42"]);
  assert.ok(r.instructions.some((s) => s.includes("gen-dev-cert.mjs 192.168.1.42")));
});

test("no LAN → not ok, no URL, Wi-Fi instruction", () => {
  const r = lanAccessCheck({ interfaces: { Loopback: IFACES.Loopback }, certText: SAN_TEXT });
  assert.equal(r.ok, false);
  assert.equal(r.url, null);
  assert.ok(r.instructions.some((s) => /Wi-Fi|LAN/i.test(s)));
});
