/**
 * Minimal static server for the Stage B demo. Serves the repo root so
 * module imports (../../src/...) and vendor assets resolve. Local only;
 * no writes, no dependencies.
 *
 *   node scripts/serve-stage-b.mjs            → http://127.0.0.1:8734
 *   HOST=0.0.0.0 node scripts/serve-stage-b.mjs → LAN (geolocation denied:
 *                                                 insecure origin)
 *   HTTPS=1 HOST=0.0.0.0 node scripts/serve-stage-b.mjs → secure LAN pilot
 *                                          (run scripts/gen-dev-cert.mjs first)
 */
import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveListenConfig } from "../src/stage-b/serve-config.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const cfg = resolveListenConfig(process.env, { rootDir: ROOT });

if (!cfg.ok) {
  for (const e of cfg.errors) console.error(`config error: ${e}`);
  process.exit(1);
}
for (const w of cfg.warnings) console.warn(`note: ${w}`);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const handler = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (path === "" || path === "stage-b" || path === "stage-b/") path = "web/stage-b/index.html";
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
};

const server = cfg.secure
  ? https.createServer({
      key: await readFile(cfg.keyPath),
      cert: await readFile(cfg.certPath),
    }, handler)
  : http.createServer(handler);

server.listen(cfg.port, cfg.host, () => {
  console.log(`Stage B demo: ${cfg.urlHint}`);
  console.log(`geolocation on this origin: ${cfg.geolocation}`);
});
