// Reproducible property-identification evaluation over the vendored OSM
// pilot dataset. Deterministic (seeded RNG) — prints a report; writes
// nothing to stores.
//
//   node scripts/eval-property.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assessAmbiguity, distanceMeters, pointInRing } from "../src/geo/property.js";
import { osmCandidates, containingFootprints } from "../src/geo/sources.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(readFileSync(join(root, "data/osm-pilot-areas.json"), "utf8"));

// mulberry32 — seeded PRNG for reproducible drift samples.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const rand = rng(20261018);
const jitter = (p, meters) => {
  const ang = rand() * 2 * Math.PI;
  const d = rand() * meters;
  return {
    latitude: p.latitude + (d * Math.sin(ang)) / 111_320,
    longitude: p.longitude + (d * Math.cos(ang)) / (111_320 * Math.cos(p.latitude * Math.PI / 180)),
  };
};

const count = {};
const bump = (key, v) => { count[key] = count[key] || {}; count[key][v] = (count[key][v] || 0) + 1; };

for (const region of dataset.regions) {
  const cands = osmCandidates(region);
  const [w, s, e, n] = region.bbox;
  const midLat = (s + n) / 2, midLng = (w + e) / 2;

  // 1. Point at each building centroid: what verdict?
  for (const c of cands) {
    const amb = assessAmbiguity({ point: c, candidates: cands, accuracyMeters: 10 });
    bump(`${region.id}/centroid`, amb.verdict);
    // did we name the right building?
    if (amb.within[0]) bump(`${region.id}/centroid-top`, amb.within[0].id === c.id ? "correct" : "other");
  }

  // 2. Neighbor confusion: midpoint of every pair < 25m apart
  let pairs = 0;
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    if (distanceMeters(cands[i], cands[j]) > 25) continue;
    pairs++;
    if (pairs > 200) break;
    const mid = { latitude: (cands[i].latitude + cands[j].latitude) / 2,
      longitude: (cands[i].longitude + cands[j].longitude) / 2 };
    bump(`${region.id}/neighbor-midpoint`,
      assessAmbiguity({ point: mid, candidates: cands, accuracyMeters: 20 }).verdict);
  }
  bump(`${region.id}/neighbor-pairs`, `${pairs} pairs <25m`);

  // 3. Open ground: points at bbox center + corners offset inside
  for (const [la, ln] of [[midLat, midLng], [midLat, midLng + 0.0005], [midLat - 0.0005, midLng]]) {
    const p = { latitude: la, longitude: ln };
    const inside = containingFootprints(p, cands).length;
    bump(`${region.id}/open-ground`, inside ? `${inside} footprints` :
      assessAmbiguity({ point: p, candidates: cands, accuracyMeters: 15 }).verdict);
  }

  // 4. GPS drift: for 20 sampled buildings, a reading drifted up to ±20m
  const sample = cands.slice(0, 20);
  for (const c of sample) {
    for (let k = 0; k < 10; k++) {
      const drifted = jitter(c, 20);
      const amb = assessAmbiguity({ point: drifted, candidates: cands, accuracyMeters: 20 });
      // is the true building still the top candidate?
      const topTrue = amb.within[0]?.id === c.id;
      bump(`${region.id}/drift-20m`, `${amb.verdict}${topTrue ? "/true-top" : ""}`);
    }
  }
}

console.log("GEO-014 property-identification evaluation (deterministic seed 20261018)");
console.log("OSM pilot dataset:", dataset.downloadedAt, "·", dataset.provider, "·", dataset.license, "\n");
for (const [k, v] of Object.entries(count)) console.log(k.padEnd(48), JSON.stringify(v));
console.log("\nReading: verdicts describe whether available source data can " +
  "distinguish the destination — not whether the destination is 'right'. " +
  "inside_footprint/single_unverified are leads; ambiguous/none_in_range/" +
  "no_source_data are honest refusals to guess.");
