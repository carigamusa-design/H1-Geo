/**
 * Stage B UI wiring. All DOM access lives here; logic modules stay DOM-free
 * so they remain testable under Node.
 */

import { SCHEMA_VERSION, CRS } from "../coordinate-assertion.js";
import { createAssertionStore } from "./assertion-store.js";
import { createRecordStore } from "./record-store.js";
import { createObservation, validateObservation, OBSERVATION_STORE_KEY } from "./observation.js";
import { createEvidenceLink } from "./evidence.js";
import { createEvidenceStore } from "./evidence-store.js";
import { createHandoffRecord, resolveReviewState } from "./handoff.js";
import { createHandoffStore } from "./handoff-store.js";
import { fingerprint } from "./fingerprint.js";
import {
  createHandoffPackage,
  exportPackageJson,
  importAndVerifyPackage,
  validatePackageStructure,
  PACKAGE_STORE_KEY,
} from "./handoff-package.js";
import { createCandidate, transitionCandidateStatus } from "./candidate.js";
import { createCandidateStore } from "./candidate-store.js";
import { buildVnnDryRunPayload, validateVnnDryRunPayload } from "./vnn-dryrun.js";
import { describeGeolocationError, TILE_FAILURE_MESSAGE, QUARANTINE_MESSAGE } from "./geo-errors.js";
import { createLeafletAdapter } from "./map-adapter.js";

const $ = (id) => document.getElementById(id);

const assertionStore = createAssertionStore(window.localStorage);
const observationStore = createRecordStore({
  storage: window.localStorage,
  key: OBSERVATION_STORE_KEY,
  validate: validateObservation,
  idPrefix: "obs",
});
const candidateStore = createCandidateStore(window.localStorage);
const evidenceStore = createEvidenceStore(window.localStorage, { assertionStore, observationStore });
const handoffStore = createHandoffStore(window.localStorage, { candidateStore });
const packageStore = createRecordStore({
  storage: window.localStorage,
  key: PACKAGE_STORE_KEY,
  validate: validatePackageStructure,
  idPrefix: "pkg",
});

let draft = null; // { latitude, longitude, source, accuracyMeters }
let selectedId = null;
let accuracyCircle = null;

function notice(message, kind = "info") {
  const el = $("notice");
  el.textContent = message;
  el.className = `notice ${kind}`;
  el.hidden = !message;
}

function fmt(n) {
  return typeof n === "number" ? n.toFixed(6) : "—";
}

function setDraft(next) {
  draft = next;
  $("f-lat").value = draft ? draft.latitude.toFixed(6) : "";
  $("f-lng").value = draft ? draft.longitude.toFixed(6) : "";
  $("f-accuracy").value = draft && draft.accuracyMeters != null ? draft.accuracyMeters : "";
  $("f-source").value = draft ? draft.source : "manual_target_pin";
  if (draft) adapter.showDraft(draft);
}

function defaultProvenanceRef() {
  return `h1geo://pin/${Date.now().toString(36)}`;
}

const adapter = createLeafletAdapter({
  L: window.L,
  elementId: "map",
  center: [33.749, -84.388], // Atlanta — dev default, not a data claim
  zoom: 12,
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  onTileError: () => notice(TILE_FAILURE_MESSAGE, "warn"),
});

adapter.onMapClick(({ latitude, longitude }) => {
  selectedId = null;
  renderDetail(null);
  setDraft({ latitude, longitude, source: "manual_target_pin", accuracyMeters: null });
  $("f-provenance").value = defaultProvenanceRef();
  notice("");
});

$("btn-device").addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    notice(describeGeolocationError(null), "warn");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setDraft({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        source: "device_position",
        accuracyMeters: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
      });
      adapter.panTo(pos.coords.latitude, pos.coords.longitude);
      $("f-provenance").value = defaultProvenanceRef();
      notice("");
    },
    (err) => notice(describeGeolocationError(err), "warn"),
    { enableHighAccuracy: false, timeout: 10000 },
  );
});
$("btn-manual-coords").addEventListener("click", () => {
  const latitude = Number($("f-lat").value);
  const longitude = Number($("f-lng").value);
  setDraft({ latitude, longitude, source: "manual_target_pin", accuracyMeters: null });
  $("f-provenance").value = defaultProvenanceRef();
});

$("btn-save").addEventListener("click", () => {
  if (!draft) {
    notice("Place a pin on the map, use device position, or enter coordinates first.", "warn");
    return;
  }
  const accuracyRaw = $("f-accuracy").value.trim();
  const assertion = {
    schemaVersion: SCHEMA_VERSION,
    latitude: draft.latitude,
    longitude: draft.longitude,
    crs: CRS,
    source: $("f-source").value,
    capturedAt: new Date().toISOString(),
    accuracyMeters: accuracyRaw === "" ? null : Number(accuracyRaw),
    provenanceRef: $("f-provenance").value,
    notes: $("f-notes").value.trim() || undefined,
  };
  const result = assertionStore.save(assertion);
  if (!result.ok) {
    notice(`Not saved: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
    return;
  }
  adapter.clearDraft();
  draft = null;
  notice(`Saved pin ${result.id} (${assertion.source}).`);
  refreshList();
});

$("btn-save-edit").addEventListener("click", () => {
  if (!selectedId) return;
  const entry = assertionStore.get(selectedId);
  if (!entry) return;
  const prior = entry.record;
  const latitude = Number($("e-lat").value);
  const longitude = Number($("e-lng").value);
  const coordsChanged = latitude !== prior.latitude || longitude !== prior.longitude;
  const accuracyRaw = $("e-accuracy").value.trim();
  const next = {
    ...prior,
    latitude,
    longitude,
    source: coordsChanged ? "refined_manual" : prior.source,
    accuracyMeters: accuracyRaw === "" ? null : Number(accuracyRaw),
  };
  const result = assertionStore.update(selectedId, next);
  if (!result.ok) {
    notice(`Not saved: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
    return;
  }
  notice(coordsChanged ? `Updated ${selectedId}; source marked refined_manual.` : `Updated ${selectedId}.`);
  refreshList();
  renderDetail(selectedId);
});

$("btn-obs-save").addEventListener("click", () => {
  if (!selectedId) return;
  const observation = createObservation({
    assertionId: selectedId,
    summary: $("o-summary").value.trim(),
    evidenceRef: null,
  });
  const result = observationStore.save(observation);
  if (!result.ok) {
    notice(`Observation not saved: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
    return;
  }
  notice(`Observation draft ${result.id} attached to ${selectedId}.`);
  renderDetail(selectedId);
});

let editingCandidateId = null;

function readCandidateForm(existing) {
  const num = $("c-amount").value.trim();
  return {
    ...(existing ?? {}),
    summary: $("c-summary").value.trim(),
    title: $("c-title").value.trim() || null,
    condition: $("c-condition").value.trim() || null,
    proposedWork: $("c-proposed").value.trim() || null,
    requestedTiming: $("c-timing").value.trim() || null,
    requiredCapabilities: $("c-caps").value.split(",").map((s) => s.trim()).filter(Boolean),
    evidenceRequirements: $("c-evreq").value.trim() || null,
    offeredAmount: num === "" ? null : Number(num),
    currency: $("c-currency").value.trim().toUpperCase() || null,
    amountCertainty: $("c-certainty").value || null,
  };
}

function fillCandidateForm(c) {
  $("c-summary").value = c.summary ?? "";
  $("c-title").value = c.title ?? "";
  $("c-condition").value = c.condition ?? "";
  $("c-proposed").value = c.proposedWork ?? "";
  $("c-timing").value = c.requestedTiming ?? "";
  $("c-caps").value = (c.requiredCapabilities ?? []).join(", ");
  $("c-evreq").value = c.evidenceRequirements ?? "";
  $("c-amount").value = c.offeredAmount ?? "";
  $("c-currency").value = c.currency ?? "";
  $("c-certainty").value = c.amountCertainty ?? "";
}

function clearCandidateForm() {
  editingCandidateId = null;
  fillCandidateForm({});
  $("btn-candidate").textContent = "Create draft (unverified)";
}

$("btn-candidate").addEventListener("click", () => {
  if (!selectedId) return;
  const observations = observationStore.list().filter((o) => o.record.assertionId === selectedId);
  const latest = observations.at(-1);
  if (editingCandidateId) {
    const existing = candidateStore.get(editingCandidateId)?.record;
    if (!existing) { editingCandidateId = null; return; }
    const draft = readCandidateForm(existing);
    const result = candidateStore.update(editingCandidateId, draft);
    if (!result.ok) {
      notice(`Draft not saved: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
      return;
    }
    notice(`Draft ${editingCandidateId} updated.`);
  } else {
    const base = createCandidate({
      assertionId: selectedId,
      observationId: latest ? latest.id : null,
      summary: $("c-summary").value.trim() || (latest ? latest.record.summary : ""),
    });
    const candidate = { ...base, ...readCandidateForm(), summary: base.summary };
    const result = candidateStore.save(candidate);
    if (!result.ok) {
      notice(`Candidate not created: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
      return;
    }
    notice(`Opportunity draft ${result.id} created (unverified — not a VNN mission).`);
  }
  clearCandidateForm();
  renderDetail(selectedId);
});

function refreshList() {
  const list = $("pin-list");
  list.replaceChildren();
  for (const { id, record, savedAt, updatedAt } of assertionStore.list()) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pin-item";
    btn.dataset.id = id;
    const strong = document.createElement("strong");
    strong.textContent = record.source;
    const small = document.createElement("small");
    small.textContent = `saved ${savedAt}${updatedAt !== savedAt ? " · edited" : ""}`;
    btn.append(strong, ` ${fmt(record.latitude)}, ${fmt(record.longitude)}`, small);
    li.appendChild(btn);
    list.appendChild(li);
  }
  list.querySelectorAll(".pin-item").forEach((btn) =>
    btn.addEventListener("click", () => renderDetail(btn.dataset.id)),
  );
}

function renderDetail(id) {
  selectedId = id;
  const panel = $("detail");
  panel.hidden = !id;
  if (!id) return;
  clearCandidateForm();
  const entry = assertionStore.get(id);
  if (!entry) {
    notice("Saved pin could not be loaded (missing or quarantined).", "error");
    return;
  }
  const a = entry.record;
  $("e-id").textContent = id;
  $("e-source").textContent = a.source;
  $("e-provenance").textContent = a.provenanceRef;
  $("e-captured").textContent = a.capturedAt;
  $("e-lat").value = a.latitude;
  $("e-lng").value = a.longitude;
  $("e-accuracy").value = a.accuracyMeters ?? "";

  adapter.panTo(a.latitude, a.longitude);
  adapter.showSaved({
    latitude: a.latitude,
    longitude: a.longitude,
    source: a.source,
    draggable: true,
    onDragEnd: ({ latitude, longitude }) => {
      $("e-lat").value = latitude.toFixed(6);
      $("e-lng").value = longitude.toFixed(6);
    },
  });
  if (accuracyCircle) {
    accuracyCircle.remove();
    accuracyCircle = null;
  }
  if (a.source === "device_position") {
    accuracyCircle = adapter.accuracyCircle(a);
  }

  const obsList = $("obs-list");
  obsList.replaceChildren();
  const observations = observationStore.list().filter((o) => o.record.assertionId === id);
  for (const o of observations) {
    const li = document.createElement("li");
    li.textContent = `${o.id} — ${o.record.summary}`;
    obsList.appendChild(li);
  }

  const target = $("ev-target");
  target.replaceChildren();
  const optPin = document.createElement("option");
  optPin.value = `assertion:${id}`;
  optPin.textContent = "this pin";
  target.appendChild(optPin);
  for (const o of observations) {
    const opt = document.createElement("option");
    opt.value = `observation:${o.id}`;
    opt.textContent = `observation ${o.id.slice(0, 12)}…`;
    target.appendChild(opt);
  }

  renderEvidence(id);
  renderCandidates(id);
}

function renderEvidence(id) {
  const wrap = $("ev-list");
  wrap.replaceChildren();
  for (const e of evidenceStore.linksForAssertionTree(id)) {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${e.record.kind}: `;
    li.appendChild(strong);
    li.appendChild(document.createTextNode(e.record.reference));
    const small = document.createElement("small");
    small.textContent = ` → ${e.record.targetType} ${e.record.targetId.slice(0, 14)}…${e.record.note ? ` · ${e.record.note}` : ""}`;
    li.appendChild(small);
    wrap.appendChild(li);
  }
}

$("btn-ev-add").addEventListener("click", () => {
  if (!selectedId) return;
  const [targetType, targetId] = $("ev-target").value.split(":");
  const link = createEvidenceLink({
    targetType,
    targetId,
    kind: $("ev-kind").value,
    reference: $("ev-ref").value.trim(),
    note: $("ev-note").value.trim() || null,
  });
  const result = evidenceStore.save(link);
  if (!result.ok) {
    notice(`Evidence not saved: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
    return;
  }
  $("ev-ref").value = "";
  $("ev-note").value = "";
  notice(`Evidence link ${result.id} saved (reference only — no media stored).`);
  renderEvidence(selectedId);
});

function renderCandidates(id) {
  const wrap = $("cand-list");
  wrap.replaceChildren();
  const assertion = assertionStore.get(id)?.record;
  const links = evidenceStore.linksForAssertionTree(id).map((e) => e.record);
  for (const c of candidateStore.list().filter((c) => c.record.assertionId === id)) {
    const li = document.createElement("li");
    const status = document.createElement("strong");
    status.textContent = `[${c.record.status}] `;
    li.appendChild(status);
    li.appendChild(document.createTextNode(`${c.record.title ?? c.record.summary} `));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "edit draft";
    editBtn.addEventListener("click", () => {
      editingCandidateId = c.id;
      fillCandidateForm(c.record);
      $("btn-candidate").textContent = "Save draft";
    });
    li.appendChild(editBtn);

    if (c.record.status === "unverified") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "mark needs-review";
      btn.addEventListener("click", () => {
        const t = transitionCandidateStatus(c.record, "needs_review");
        if (t.ok) {
          candidateStore.update(c.id, t.candidate);
          renderCandidates(id);
        }
      });
      li.appendChild(btn);
    }

    const payload = buildVnnDryRunPayload({ candidate: c.record, assertion, evidenceLinks: links });
    const check = validateVnnDryRunPayload(payload);
    if (payload.missing.length) {
      const warn = document.createElement("p");
      warn.className = "hint";
      warn.textContent = `Missing before handoff: ${payload.missing.join(", ")}`;
      li.appendChild(warn);
    }
    const pre = document.createElement("pre");
    pre.className = "payload";
    pre.textContent = JSON.stringify(payload, null, 2) + (check.valid ? "" : `\nINVALID: ${JSON.stringify(check.errors)}`);
    li.appendChild(pre);

    // GEO-007 review controls — approval binds to this exact draft version.
    const fp = fingerprint(c.record);
    const review = resolveReviewState(handoffStore.forDraft(c.id), fp);
    const reviewLine = document.createElement("p");
    reviewLine.className = "hint";
    reviewLine.textContent = `Review: ${review.state}${review.record ? ` — ${review.record.decision} by ${review.record.decidedBy} at ${review.record.decidedAt}` : ""}`;
    li.appendChild(reviewLine);
    if (review.state === "stale") {
      const stale = document.createElement("p");
      stale.className = "stale";
      stale.textContent = "Draft changed after the last decision — a new review is required before an updated handoff.";
      li.appendChild(stale);
    }
    for (const decision of ["approved", "declined"]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = decision === "approved" ? "Approve handoff" : "Decline handoff";
      btn.addEventListener("click", () => {
        const record = createHandoffRecord({
          draftId: c.id,
          candidate: c.record,
          payload,
          decision,
          decidedBy: $("h-decidedby").value.trim(),
        });
        const result = handoffStore.save(record);
        if (!result.ok) {
          notice(`Review not recorded: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
          return;
        }
        notice(decision === "approved"
          ? `Handoff record ${result.id} created — local, reviewable, dry-run only.`
          : `Decline recorded (${result.id}).`);
        renderCandidates(id);
      });
      li.appendChild(btn);
    }
    for (const h of handoffStore.forDraft(c.id)) {
      const hp = document.createElement("pre");
      hp.className = "payload";
      hp.textContent = `handoff ${h.id} — ${h.record.decision} by ${h.record.decidedBy}\n` +
        `decidedAt ${h.record.decidedAt} · draft fp ${h.record.draftFingerprint}` +
        `${h.record.draftFingerprint === fp ? " (current)" : " (STALE)"}` +
        (h.record.missingAtDecision.length ? `\nmissing at decision: ${h.record.missingAtDecision.join(", ")}` : "") +
        (h.record.payload ? `\n${JSON.stringify(h.record.payload.intake, null, 2)}` : "");
      li.appendChild(hp);
    }

    // GEO-008: approved drafts can produce an exportable, digest-sealed package.
    if (review.state === "approved") {
      const pkgBtn = document.createElement("button");
      pkgBtn.type = "button";
      pkgBtn.textContent = "Generate handoff package";
      pkgBtn.addEventListener("click", async () => {
        const result = await createHandoffPackage({
          draftId: c.id,
          candidateStore,
          assertionStore,
          evidenceStore,
          handoffStore,
        });
        if (!result.ok) {
          notice(`Package not created: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
          return;
        }
        packageStore.save(result.package);
        notice(`Package ${result.package.packageId} generated (sha256 ${result.package.sha256.slice(0, 12)}…, readyForIntake=${result.package.content.readyForIntake}).`);
        renderCandidates(id);
      });
      li.appendChild(pkgBtn);
    }
    for (const p of packageStore.list().filter((p) => p.record.content?.draftId === c.id)) {
      const pp = document.createElement("div");
      const title = document.createElement("p");
      title.className = "hint";
      title.textContent = `package ${p.record.packageId} — ready=${p.record.content.readyForIntake} · sha256 ${p.record.sha256.slice(0, 16)}…`;
      pp.appendChild(title);
      const dl = document.createElement("button");
      dl.type = "button";
      dl.textContent = "Export package JSON";
      dl.addEventListener("click", () => {
        const blob = new Blob([exportPackageJson(p.record)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${p.record.packageId}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
      pp.appendChild(dl);
      const pre = document.createElement("pre");
      pre.className = "payload";
      pre.textContent = JSON.stringify(p.record.content, null, 2);
      pp.appendChild(pre);
      wrap.appendChild(pp);
    }
    wrap.appendChild(li);
  }
}

$("btn-pkg-import").addEventListener("click", async () => {
  const text = $("pkg-import").value;
  const result = await importAndVerifyPackage(text, { assertionStore, candidateStore });
  if (result.ok) {
    const c = result.package.content;
    notice(`Package ${result.package.packageId} verified — digest matches, intake ${c.readyForIntake ? "complete" : `missing: ${c.missing.join(", ")}`}.`, "info");
  } else {
    notice(`Package rejected: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
  }
});

// Startup health check: corrupted storage is surfaced, never silently repaired.
for (const [name, store] of [
  ["assertions", assertionStore],
  ["observations", observationStore],
  ["candidates", candidateStore],
  ["evidence links", evidenceStore],
  ["handoff records", handoffStore],
]) {
  const h = store.health();
  if (h.corrupted) notice(`${QUARANTINE_MESSAGE} (${name}: ${h.invalidEntryCount} invalid entr${h.invalidEntryCount === 1 ? "y" : "ies"})`, "warn");
}

$("f-provenance").value = defaultProvenanceRef();
refreshList();
