/**
 * Deterministic draft fingerprints for staleness detection.
 * Canonical JSON (sorted keys) + FNV-1a 64-bit hash — stable across
 * Node and browser, no async crypto needed. This is a change detector,
 * not a security primitive.
 */

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

export function fingerprint(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  let hash = FNV_OFFSET;
  for (const b of bytes) {
    hash = (hash ^ BigInt(b)) * FNV_PRIME & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}
