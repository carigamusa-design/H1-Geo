/**
 * Property-candidate source adapters (GEO-014).
 *
 * Normalizes vendored reference data (OSM pilot extracts, synthetic
 * fixtures) into a common candidate shape. Every candidate carries its
 * provenance so downstream records can state WHERE a lead came from —
 * a footprint outline is never a parcel boundary or a verified address.
 */
import { distanceMeters, pointInRing } from "./property.js";

/**
 * Convert an OSM pilot-dataset region into normalized candidates.
 * Each candidate keeps its polygon (footprint), centroid, optional addr
 * tags (unverified), and source provenance.
 */
export function osmCandidates(region) {
  if (!region || !Array.isArray(region.features)) return [];
  const src = {
    provider: "OpenStreetMap contributors",
    license: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    region: region.id,
    regionName: region.name,
    downloadedAt: "2026-10-18",
  };
  return region.features.map((f) => ({
    id: f.id,
    label: f.addr?.housenumber && f.addr?.street
      ? `${f.addr.housenumber} ${f.addr.street} (OSM tag, unverified)`
      : f.addr?.street
        ? `${f.addr.street} — no housenumber (OSM)`
        : `OSM building #${f.id.replace(/\D/g, "")}`,
    kind: f.addr ? "address_tagged_footprint" : "building_footprint",
    buildingType: f.building ?? null,
    latitude: f.centroid.latitude,
    longitude: f.centroid.longitude,
    polygon: f.polygon,
    source: { ...src },
    fixture: false,
  }));
}

/**
 * Merge candidates from multiple sources: OSM regions near the point and
 * synthetic fixtures. Each source keeps its own provenance; missing
 * coverage simply contributes nothing (never fabricated).
 */
export function candidatesNear({ point, radiusMeters = 500, osmDataset = null,
  fixtureCandidates = [], extra = [] }) {
  const out = [];
  if (osmDataset?.regions) {
    for (const region of osmDataset.regions) {
      const all = osmCandidates(region);
      // include the region only if anything in it is within reach —
      // avoids pretending coverage exists where the extract doesn't.
      if (all.some((c) => distanceMeters(point, c) <= radiusMeters)) {
        out.push(...all);
      }
    }
  }
  out.push(...fixtureCandidates.filter((f) =>
    Number.isFinite(f.latitude) && Number.isFinite(f.longitude)));
  out.push(...extra);
  return out;
}

/** Which of the given candidates' polygons contain the point. */
export function containingFootprints(point, candidates) {
  return candidates.filter((c) =>
    Array.isArray(c.polygon) && c.polygon.length >= 3 &&
    pointInRing(point.latitude, point.longitude, c.polygon));
}
