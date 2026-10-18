/**
 * GEO-012 (international) — coordinate reference system and axis-order
 * handling, per the EPSG registry's actual axis conventions:
 *
 *   EPSG:4326  — WGS 84 geographic, axis order (lat, lon). The OGC/EPSG
 *                definition puts latitude FIRST; GeoJSON-style tooling
 *                that writes (lon, lat) under the label "EPSG:4326" is
 *                technically violating the registry's axis order.
 *   CRS:84     — WGS 84 with the axis order REVERSED to (lon, lat) —
 *                this is what GeoJSON (RFC 7946) actually means.
 *   EPSG:3857  — Web Mercator, metres, axis order (x=easting, y=northing).
 *
 * H1-Geo's stored contract stays EPSG:4326 {latitude, longitude} — this
 * module converts external/entered CRS forms into it explicitly and
 * never guesses axis order.
 */

export const SUPPORTED_CRS = Object.freeze(["EPSG:4326", "CRS:84", "EPSG:3857"]);

export const CRS_AXIS_ORDER = Object.freeze({
  "EPSG:4326": Object.freeze({ first: "latitude", second: "longitude", unit: "degree" }),
  "CRS:84": Object.freeze({ first: "longitude", second: "latitude", unit: "degree" }),
  "EPSG:3857": Object.freeze({ first: "easting", second: "northing", unit: "metre" }),
});

const WEBMERC_RADIUS = 6_378_137; // WGS 84 semi-major axis, metres
const WEBMERC_MAX = WEBMERC_RADIUS * Math.PI; // ≈ ±20.04M m (web mercator edge)

function fail(errors, field, message) {
  errors.push({ field, message });
}

/**
 * Convert a two-axis coordinate expressed in `crs` into WGS 84
 * {latitude, longitude} degrees. Never reorders silently — the caller
 * must state which CRS the pair is in. Returns { ok, latitude,
 * longitude, errors }.
 */
export function toWgs84({ crs, first, second }) {
  const errors = [];
  if (!SUPPORTED_CRS.includes(crs)) {
    fail(errors, "crs", `must be one of ${SUPPORTED_CRS.join(", ")}`);
    return { ok: false, errors };
  }
  for (const [name, v] of [["first", first], ["second", second]]) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      fail(errors, name, "must be a finite number");
    }
  }
  if (errors.length) return { ok: false, errors };
  let latitude, longitude;
  if (crs === "EPSG:3857") {
    if (Math.abs(first) > WEBMERC_MAX * 1.000001 || Math.abs(second) > WEBMERC_MAX * 1.000001) {
      fail(errors, "first/second", `Web Mercator bounds are ±${WEBMERC_MAX.toFixed(3)} m`);
      return { ok: false, errors };
    }
    longitude = (first / WEBMERC_RADIUS) * (180 / Math.PI);
    latitude = Math.atan(Math.sinh(second / WEBMERC_RADIUS)) * (180 / Math.PI);
  } else if (crs === "CRS:84") {
    longitude = first;
    latitude = second;
  } else {
    latitude = first;
    longitude = second;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    fail(errors, "first/second",
      `converted point (${latitude}, ${longitude}) is outside WGS 84 bounds — check axis order`);
    return { ok: false, errors };
  }
  return { ok: true, latitude, longitude, errors };
}

/** Convert WGS 84 degrees back into `crs` axis order. */
export function fromWgs84({ latitude, longitude, crs }) {
  const errors = [];
  if (!SUPPORTED_CRS.includes(crs)) {
    fail(errors, "crs", `must be one of ${SUPPORTED_CRS.join(", ")}`);
    return { ok: false, errors };
  }
  if (typeof latitude !== "number" || !Number.isFinite(latitude) ||
      typeof longitude !== "number" || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    fail(errors, "latitude/longitude", "must be finite numbers inside WGS 84 bounds");
    return { ok: false, errors };
  }
  if (crs === "EPSG:3857") {
    const x = WEBMERC_RADIUS * longitude * (Math.PI / 180);
    const y = WEBMERC_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitude * (Math.PI / 360)));
    return { ok: true, first: x, second: y, errors };
  }
  return crs === "CRS:84"
    ? { ok: true, first: longitude, second: latitude, errors }
    : { ok: true, first: latitude, second: longitude, errors };
}
