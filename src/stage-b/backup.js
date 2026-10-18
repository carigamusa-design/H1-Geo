/**
 * GEO-011 local backup & restore for H1-Geo working records.
 *
 * Reuse survey: no existing H1 backup engine was found — SnapN'Talk's
 * package-v1 is an evidence package, HomeVault's legacy-intake is an
 * import archive, VNN persists intake sessions server-side. This module
 * is the bounded local equivalent: a versioned JSON document carrying
 * every record (with store ids preserved where the store supports it),
 * sealed by a SHA-256 digest over the canonical serialization — the same
 * integrity idiom the GEO-008 package uses.
 *
 * Restore is all-or-nothing: the whole document is validated (structure,
 * per-record validation, digest, and cross-store relationships) BEFORE
 * anything is written, then parents restore before dependents.
 *
 * Spec shape per store:
 *   { name, store, validate, save(record, id), refs? }
 * refs entry:
 *   { field: "a.b", into: ["assertions"] }            — id must exist
 *   { field: "targetId", intoBy: (record) => [names] } — type-dependent
 *   { field: "signedHash", valuesFrom: {store:"packages", path:"sha256"} }
 * Null/undefined field values are skipped.
 */

import { canonicalJson } from "./fingerprint.js";

export const BACKUP_SCHEMA_VERSION = "h1-geo/working-records-backup-v0";

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dig(obj, path) {
  return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

/**
 * Capture every record into a backup document.
 */
export async function createBackup(specs, { now = new Date().toISOString() } = {}) {
  const data = {};
  const counts = {};
  for (const { name, store } of specs) {
    data[name] = store.list().map((e) => ({ id: e.id, record: e.record }));
    counts[name] = data[name].length;
  }
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: now,
    generator: "h1-geo stage-b",
    recordCounts: counts,
    records: data,
    sha256: await sha256Hex(canonicalJson(data)),
  };
}

/**
 * Validate a backup document: structure, digest, per-record validation,
 * and cross-store relationship integrity. Pure — no writes.
 */
export async function validateBackup(doc, specs) {
  const errors = [];
  const counts = {};
  const fail = (field, message) => errors.push({ field, message });
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    fail("", "must be an object");
    return { valid: false, errors, counts };
  }
  if (doc.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    fail("schemaVersion", `must equal "${BACKUP_SCHEMA_VERSION}"`);
  }
  if (typeof doc.records !== "object" || doc.records === null) {
    fail("records", "must be an object");
    return { valid: false, errors, counts };
  }
  if (typeof doc.sha256 !== "string" ||
      (await sha256Hex(canonicalJson(doc.records))) !== doc.sha256) {
    fail("sha256", "digest mismatch — backup contents were modified");
  }

  const idSets = {};
  const valueSets = {};
  for (const spec of specs) {
    const entries = doc.records[spec.name];
    idSets[spec.name] = new Set();
    counts[spec.name] = 0;
    if (!Array.isArray(entries)) {
      fail(`records.${spec.name}`, "must be an array");
      continue;
    }
    counts[spec.name] = entries.length;
    for (const [i, e] of entries.entries()) {
      if (typeof e !== "object" || e === null || typeof e.id !== "string" || !e.id) {
        fail(`records.${spec.name}[${i}]`, "each entry needs a non-empty id");
        continue;
      }
      if (idSets[spec.name].has(e.id)) {
        fail(`records.${spec.name}[${i}].id`, "duplicate id");
      }
      idSets[spec.name].add(e.id);
      const check = spec.validate(e.record);
      if (!check.valid) {
        for (const err of check.errors) {
          fail(`records.${spec.name}[${i}].record.${err.field}`, err.message);
        }
      }
    }
    valueSets[spec.name] = new Set(
      entries.filter((e) => e && typeof e === "object")
        .map((e) => ({ id: e.id, record: e.record })));
  }

  for (const spec of specs) {
    for (const ref of spec.refs || []) {
      const entries = doc.records[spec.name] || [];
      for (const [i, e] of entries.entries()) {
        const v = e && e.record ? dig(e.record, ref.field) : undefined;
        if (v === null || v === undefined) continue;
        if (ref.intoBy) {
          const targets = ref.intoBy(e.record);
          if (!targets.some((n) => idSets[n] && idSets[n].has(v))) {
            fail(`records.${spec.name}[${i}].record.${ref.field}`, `dangling reference "${v}"`);
          }
        } else if (ref.into) {
          if (!ref.into.some((n) => idSets[n] && idSets[n].has(v))) {
            fail(`records.${spec.name}[${i}].record.${ref.field}`, `dangling reference "${v}"`);
          }
        } else if (ref.valuesFrom) {
          const pool = valueSets[ref.valuesFrom.store] || new Set();
          const hit = [...pool].some((p) => dig(p.record, ref.valuesFrom.path) === v);
          if (!hit) {
            fail(`records.${spec.name}[${i}].record.${ref.field}`, `no package carries that digest`);
          }
        }
      }
    }
  }
  return { valid: errors.length === 0, errors, counts };
}

/**
 * Restore a validated backup — clears every specced store, then re-saves
 * in spec order (parents before dependents). Re-validates first and
 * refuses to write on failure.
 */
export async function restoreBackup(doc, specs) {
  const check = await validateBackup(doc, specs);
  if (!check.valid) return { ok: false, errors: check.errors };
  for (const spec of specs) {
    for (const e of spec.store.list()) spec.store.remove(e.id);
  }
  const errors = [];
  for (const spec of specs) {
    for (const e of doc.records[spec.name]) {
      const result = spec.save(e.record, e.id);
      if (!result.ok) {
        errors.push({ field: spec.name, message: `restore save failed for ${e.id}: ${(result.errors || []).map((x) => x.message).join("; ")}` });
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, counts: check.counts };
}
