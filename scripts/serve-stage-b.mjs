/**
 * Minimal static server for the Stage B demo. Serves the repo root so
 * module imports (../../src/...) and vendor assets resolve. Local only;
 * no writes, no dependencies.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 8734);
// Loopback by default. HOST=0.0.0.0 exposes the demo on the LAN so a phone
// on the same network can reach it — note geolocation still needs a secure
// context, so device GPS is unavailable over plain http://LAN-IP (see
// docs/OPERATOR_GUIDE.md and GEO-018 launch notes).
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer(async (req, res) => {
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
  })
  .listen(PORT, HOST, () => {
    console.log(`Stage B demo: http://${HOST === "0.0.0.0" ? "<lan-ip>" : HOST}:${PORT}/stage-b`);
  });
