/**
 * Regenerate data/territories.json + src/stage-b/territory-data.js from
 * the Natural Earth-derived world.geo.json countries file.
 *
 *   node scripts/build-territories.mjs <path-to-countries.geo.json>
 *
 * Coordinates round to 3 decimals (~111m at the equator) — matching the
 * honest "country-level only" 1:110m resolution claim.
 */
import { readFileSync, writeFileSync } from "node:fs";

const WANT = {
  "United States of America": { iso: "US", admin: "country" },
  "Puerto Rico": { iso: "PR", admin: "territory" },
  Mexico: { iso: "MX", admin: "country" },
  Canada: { iso: "CA", admin: "country" },
  "Costa Rica": { iso: "CR", admin: "country" },
  Panama: { iso: "PA", admin: "country" },
  Guatemala: { iso: "GT", admin: "country" },
  Belize: { iso: "BZ", admin: "country" },
  Honduras: { iso: "HN", admin: "country" },
  "El Salvador": { iso: "SV", admin: "country" },
  Nicaragua: { iso: "NI", admin: "country" },
  Cuba: { iso: "CU", admin: "country" },
  "Dominican Republic": { iso: "DO", admin: "country" },
  Haiti: { iso: "HT", admin: "country" },
  Jamaica: { iso: "JM", admin: "country" },
  Colombia: { iso: "CO", admin: "country" },
};

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const round = (n) => Math.round(n * 1000) / 1000;
const simp = (poly) => poly.map((ring) => ring.map(([x, y]) => [round(x), round(y)]));
const features = [];
for (const f of input.features) {
  const meta = WANT[f.properties.name];
  if (!meta) continue;
  const g = f.geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: simp(f.geometry.coordinates) }
    : { type: "MultiPolygon", coordinates: f.geometry.coordinates.map(simp) };
  features.push({ iso: meta.iso, name: f.properties.name, admin: meta.admin, geometry: g });
}
features.sort((a, b) => a.iso.localeCompare(b.iso));

const out = {
  schemaVersion: "h1-geo/territory-dataset-v0",
  source: "Natural Earth 1:110m cultural boundaries (via johan/world.geo.json)",
  sourceUrl: "https://github.com/johan/world.geo.json",
  license: "public domain (Natural Earth)",
  resolution: "1:110m — country-level only, not parcel or street",
  coordinateRounding: 3,
  generatedAt: new Date().toISOString().slice(0, 10),
  features,
};
writeFileSync("data/territories.json", JSON.stringify(out));
writeFileSync("src/stage-b/territory-data.js",
  "// Vendored Natural Earth 1:110m territory subset — see data/territories.json\n" +
  "// for provenance. Inlined as a module so the browser demo needs no fetch\n" +
  "// and tests run without IO. Regenerate via scripts/build-territories.mjs.\n\n" +
  `export const TERRITORY_DATASET = ${JSON.stringify(out)};\n`);
console.log(`wrote ${features.length} features`);
