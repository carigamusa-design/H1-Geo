import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSION, CRS } from "../../src/coordinate-assertion.js";
import { ASSERTION_STORE_KEY, createAssertionStore } from "../../src/stage-b/assertion-store.js";
import { memoryStorage } from "../../src/stage-b/record-store.js";

const BASE = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  latitude: 33.749,
  longitude: -84.388,
  crs: CRS,
  source: "manual_target_pin",
  capturedAt: "2026-10-17T12:30:00Z",
  accuracyMeters: null,
  provenanceRef: "h1geo://pin/test-001",
});

test("saves a valid assertion and lists it", () => {
  const store = createAssertionStore(memoryStorage());
  const result = store.save(BASE);
  assert.equal(result.ok, true);
  assert.match(result.id, /^asrt_/);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].record.latitude, 33.749);
  assert.equal(list[0].savedAt, list[0].updatedAt);
});

test("rejects an invalid assertion at the store boundary", () => {
  const store = createAssertionStore(memoryStorage());
  const result = store.save({ ...BASE, latitude: 91 });
  assert.equal(result.ok, false);
  assert.equal(store.list().length, 0);
});

test("persists across store instances sharing one backend (refresh survival)", () => {
  const backend = memoryStorage();
  const first = createAssertionStore(backend);
  const { id } = first.save(BASE);
  const second = createAssertionStore(backend); // simulates browser reload
  const entry = second.get(id);
  assert.equal(entry.record.provenanceRef, BASE.provenanceRef);
  assert.equal(second.list().length, 1);
});

test("edit preserves id and capture provenance; coordinate change marks refined_manual", () => {
  const store = createAssertionStore(memoryStorage());
  const { id } = store.save(BASE);
  const updated = { ...BASE, latitude: 33.75, source: "refined_manual" };
  const result = store.update(id, updated);
  assert.equal(result.ok, true);
  const entry = store.get(id);
  assert.equal(entry.record.latitude, 33.75);
  assert.equal(entry.record.source, "refined_manual");
  assert.equal(entry.record.capturedAt, BASE.capturedAt);
  assert.ok(entry.updatedAt >= entry.savedAt);
});

test("provenance guard rejects capturedAt and provenanceRef rewrites", () => {
  const store = createAssertionStore(memoryStorage());
  const { id } = store.save(BASE);
  for (const tampered of [
    { ...BASE, capturedAt: "2030-01-01T00:00:00Z" },
    { ...BASE, provenanceRef: "forged://elsewhere" },
  ]) {
    const result = store.update(id, tampered);
    assert.equal(result.ok, false, "expected provenance rewrite to be rejected");
  }
  assert.deepEqual(store.get(id).record, BASE);
});

test("update on a missing id fails honestly", () => {
  const store = createAssertionStore(memoryStorage());
  const result = store.update("asrt_missing", BASE);
  assert.equal(result.ok, false);
});

test("distinct pins never silently merge", () => {
  const store = createAssertionStore(memoryStorage());
  const a = store.save(BASE);
  const b = store.save({ ...BASE, latitude: 33.7491, provenanceRef: "h1geo://pin/test-002" });
  assert.notEqual(a.id, b.id);
  assert.equal(store.list().length, 2);
});

test("corrupted JSON is quarantined, not silently repaired", () => {
  const backend = memoryStorage();
  backend.setItem(ASSERTION_STORE_KEY, "{not json");
  const store = createAssertionStore(backend);
  assert.equal(store.list().length, 0);
  const health = store.health();
  assert.equal(health.corrupted, true);
  assert.equal(backend.getItem(`${ASSERTION_STORE_KEY}.quarantine`), "{not json");
});

test("entries failing validation on load are quarantined and reported", () => {
  const backend = memoryStorage();
  backend.setItem(
    ASSERTION_STORE_KEY,
    JSON.stringify({
      version: 1,
      records: {
        good: { record: BASE, savedAt: "2026-10-17T00:00:00Z", updatedAt: "2026-10-17T00:00:00Z" },
        bad: { record: { ...BASE, latitude: "north" }, savedAt: "x", updatedAt: "y" },
      },
    }),
  );
  const store = createAssertionStore(backend);
  assert.equal(store.list().length, 1);
  const health = store.health();
  assert.equal(health.invalidEntryCount, 1);
  assert.equal(health.corrupted, true);
});
