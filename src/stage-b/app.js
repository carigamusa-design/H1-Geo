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
import { verifyPackage } from "./handoff-package.js";
import {
  ed25519Available,
  generateSignerKey,
  createSignatureRecord,
  verifySignatureRecord,
  assessTrust,
  validateSignatureRecord,
  SIGNATURE_STORE_KEY,
} from "./signature.js";
import {
  buildVnnIntakeExport,
  validateVnnIntakeExport,
  VNN_EXPORT_STORE_KEY,
} from "./vnn-export.js";
import { workflowStatus, loadH1ExampleScenario, isSyntheticRecord,
  draftIndex, filterDrafts, STAGE_LABELS } from "./workflow.js";
import { createBackup, validateBackup, restoreBackup } from "./backup.js";
import { lookupTerritory, locationStatus, checkCountryMatch } from "../geo/territory.js";
import { createSiteDescriptor, validateSiteDescriptor, SITE_STORE_KEY } from "../geo/site.js";
import { explainDiscrepancy } from "../geo/site.js";
import { TERRITORY_DATASET } from "./territory-data.js";
import { createFeedbackStore, createFeedback, pilotReport,
  validateFeedback } from "./pilot.js";
import { validateCoordinateAssertion } from "../coordinate-assertion.js";
import { validateCandidate } from "./candidate.js";
import { validateEvidenceLink } from "./evidence.js";
import { validateHandoffRecord } from "./handoff.js";
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
const signatureStore = createRecordStore({
  storage: window.localStorage,
  key: SIGNATURE_STORE_KEY,
  validate: validateSignatureRecord,
  idPrefix: "sig",
});
const exportStore = createRecordStore({
  storage: window.localStorage,
  key: VNN_EXPORT_STORE_KEY,
  validate: validateVnnIntakeExport,
  idPrefix: "vex",
});
let signerKey = null;
const feedbackStore = createFeedbackStore(window.localStorage, {
  assertionStore, observationStore, candidateStore, packageStore,
});
const siteStore = createRecordStore({
  storage: window.localStorage,
  key: SITE_STORE_KEY,
  validate: validateSiteDescriptor,
  idPrefix: "site",
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
  const pinQuery = ($("pin-filter") ? $("pin-filter").value : "").trim().toLowerCase();
  for (const { id, record, savedAt, updatedAt } of assertionStore.list()) {
    if (pinQuery) {
      const hay = [record.source, record.latitude, record.longitude,
        record.provenanceRef, record.notes].join(" ").toLowerCase();
      if (!hay.includes(pinQuery)) continue;
    }
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pin-item";
    btn.dataset.id = id;
    const strong = document.createElement("strong");
    strong.textContent = record.source;
    const tag = document.createElement("span");
    tag.className = "hint";
    tag.textContent = isSyntheticRecord(record) ? " [SYNTHETIC]" : " [real]";
    strong.appendChild(tag);
    const small = document.createElement("small");
    small.textContent = `saved ${savedAt}${updatedAt !== savedAt ? " · edited" : ""}`;
    btn.append(strong, ` ${fmt(record.latitude)}, ${fmt(record.longitude)}`, small);
    li.appendChild(btn);
    list.appendChild(li);
  }
  list.querySelectorAll(".pin-item").forEach((btn) =>
    btn.addEventListener("click", () => renderDetail(btn.dataset.id)),
  );
  renderDraftOverview();
  renderProgress();
}

// GEO-011: filterable overview of every draft across all locations.
function renderDraftOverview() {
  const box = $("draft-rows");
  if (!box) return;
  box.replaceChildren();
  const rows = filterDrafts(draftIndex({
    assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore,
  }), {
    status: $("d-status").value,
    evidence: $("d-evidence").value,
    assertionId: $("d-scope").value === "selected" ? selectedId : null,
    query: $("d-query").value,
  });
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No drafts match these filters.";
    box.appendChild(p);
    return;
  }
  for (const r of rows) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pin-item";
    const strong = document.createElement("strong");
    strong.textContent = r.candidate.title || r.candidate.summary;
    const small = document.createElement("small");
    small.textContent =
      `${r.latitude !== null ? `${fmt(r.latitude)}, ${fmt(r.longitude)}` : "(no location)"} · ` +
      `${r.review.state}${r.missing.length ? ` · missing: ${r.missing.join(", ")}` : " · intake complete"} · ` +
      `evidence ${r.evidenceCount}` +
      `${r.packages.length ? " · packaged" : ""}${r.signatures.length ? " · signed" : ""}${r.exports.length ? " · exported" : ""}` +
      `${r.synthetic ? " · SYNTHETIC" : ""}`;
    btn.append(strong, small);
    btn.addEventListener("click", () => renderDetail(r.candidate.assertionId));
    box.appendChild(btn);
  }
}

// GEO-010: "where you are" strip — computed from the stores, plain language.
function renderProgress() {
  const status = workflowStatus({
    assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore,
  }, selectedId);
  $("progress-summary").textContent = status.summary;
  $("resume-line").textContent =
    `Saved work on this machine: ${status.assertions.length} location(s), ` +
    `${observationStore.list().length} observation(s), ` +
    `${candidateStore.list().length} draft(s), ` +
    `${packageStore.list().length} package(s). Everything survives a refresh.`;
  const steps = $("steps");
  steps.replaceChildren();
  const nextIdx = status.stages.findIndex((s) => !s.done);
  status.stages.forEach((s, i) => {
    const el = document.createElement("span");
    el.className = "step" + (s.done ? " done" : i === nextIdx ? " now" : "");
    el.textContent = `${i + 1}. ${STAGE_LABELS[i]}`;
    const detail = document.createElement("small");
    detail.textContent = s.detail;
    el.appendChild(detail);
    steps.appendChild(el);
  });
  renderPilot();
}

// GEO-012: pilot ops — live counts, next actions, feedback list.
function renderPilot() {
  const rep = pilotReport({
    assertionStore, observationStore, evidenceStore, candidateStore,
    handoffStore, packageStore, signatureStore, exportStore, feedbackStore,
  });
  const fmt2 = (s) => `${s.total} (${s.real} real / ${s.synthetic} synthetic)`;
  $("pilot-report").textContent =
    `locations ${fmt2(rep.locations)} · observations ${fmt2(rep.observations)} · ` +
    `evidence ${fmt2(rep.evidenceLinks)} · drafts ${fmt2(rep.drafts)} · ` +
    `approved ${rep.approvals.approved} · stale ${rep.approvals.stale} · ` +
    `declined ${rep.approvals.declined} · packages ${rep.packages} · ` +
    `signed ${rep.signatures} · exports ${rep.exports} · feedback ${rep.feedback.total}`;
  const acts = $("pilot-actions");
  acts.replaceChildren();
  for (const a of rep.nextActions) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = `${a.title}: ${a.action}`;
    acts.appendChild(p);
  }
  // Feedback target picker.
  const refSel = $("fb-ref");
  refSel.replaceChildren();
  const tt = $("fb-target").value;
  if (tt === "workflow_step") {
    STAGE_LABELS.forEach((label, i) => {
      const o = document.createElement("option");
      o.value = String(i + 1);
      o.textContent = `${i + 1}. ${label}`;
      refSel.appendChild(o);
    });
  } else if (tt !== "none") {
    const store = { assertion: assertionStore, observation: observationStore,
      draft: candidateStore, package: packageStore }[tt];
    for (const e of store.list()) {
      const o = document.createElement("option");
      o.value = e.id;
      o.textContent = tt === "draft"
        ? (e.record.title || e.record.summary)
        : tt === "assertion" ? `${e.record.source} ${fmt(e.record.latitude)},${fmt(e.record.longitude)}`
        : e.id;
      refSel.appendChild(o);
    }
    if (!refSel.children.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = `(no saved ${tt}s)`;
      refSel.appendChild(o);
    }
  } else {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "—";
    refSel.appendChild(o);
  }
  // Feedback list, newest first.
  const list = $("fb-list");
  list.replaceChildren();
  for (const e of feedbackStore.list().slice().reverse()) {
    const li = document.createElement("li");
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = `[${e.record.kind}] ${e.record.body}` +
      (e.record.targetType !== "none"
        ? ` — on ${e.record.targetType === "workflow_step" ? `step ${e.record.step}` : e.record.targetId}`
        : "") + ` (${e.record.createdAt.slice(0, 16)}Z)`;
    li.appendChild(p);
    list.appendChild(li);
  }
}

// GEO-012 (international): declared-country select from the dataset.
{
  const sel = $("geo-country");
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "(no declared country)";
  sel.appendChild(none);
  for (const f of TERRITORY_DATASET.features) {
    const o = document.createElement("option");
    o.value = f.iso;
    o.textContent = `${f.iso} — ${f.name}`;
    sel.appendChild(o);
  }
}

$("btn-geo-check").addEventListener("click", () => {
  const entry = selectedId ? assertionStore.get(selectedId) : null;
  if (!entry) { $("geo-explain").textContent = "Select a saved pin first."; return; }
  const match = checkCountryMatch({
    latitude: entry.record.latitude, longitude: entry.record.longitude,
    declaredIso: $("geo-country").value || null, dataset: TERRITORY_DATASET,
  });
  $("geo-explain").textContent = explainDiscrepancy(match);
});

function renderSiteList(assertionId) {
  const list = $("site-list");
  list.replaceChildren();
  for (const e of siteStore.list().filter((s) => s.record.assertionId === assertionId)) {
    const li = document.createElement("li");
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = `${e.record.kind} — ${JSON.stringify(e.record.fields)}` +
      `${e.record.declaredCountryCode ? ` · declared ${e.record.declaredCountryCode}` : ""} (source: ${e.record.source})`;
    li.appendChild(p);
    list.appendChild(li);
  }
}

$("btn-site-save").addEventListener("click", () => {
  if (!selectedId) { notice("Select a saved pin first.", "warn"); return; }
  let fields = {};
  const raw = $("site-fields").value.trim();
  if (raw) {
    try {
      fields = JSON.parse(raw);
    } catch {
      notice("Fields must be valid JSON.", "error");
      return;
    }
  }
  const rec = createSiteDescriptor({
    kind: $("site-kind").value,
    assertionId: selectedId,
    fields,
    declaredCountryCode: $("geo-country").value || null,
  });
  const result = siteStore.save(rec);
  if (!result.ok) {
    notice(`Site not saved: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
    return;
  }
  notice(`Site descriptor saved as "${rec.kind}" — a separate record; the point is unchanged.`);
  renderSiteList(selectedId);
});

$("fb-target").addEventListener("change", renderPilot);
$("btn-feedback").addEventListener("click", () => {
  const tt = $("fb-target").value;
  const rec = createFeedback({
    kind: $("fb-kind").value,
    body: $("fb-body").value,
    targetType: tt,
    targetId: tt === "workflow_step" ? null : ($("fb-ref").value || null),
    step: tt === "workflow_step" ? Number($("fb-ref").value) : null,
  });
  const result = feedbackStore.save(rec);
  if (!result.ok) {
    notice(`Feedback not saved: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
    return;
  }
  $("fb-body").value = "";
  notice("Feedback recorded — thank you.");
  renderPilot();
});

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

  // GEO-012 (international): territory + status for the selected point.
  const terr = lookupTerritory(a.latitude, a.longitude, TERRITORY_DATASET);
  const status = locationStatus({ assertion: a, territoryResult: terr });
  $("geo-status").textContent = `status: ${status.status} — ${status.detail}`;
  $("geo-territory").textContent = terr.ok && terr.found
    ? `Inside ${terr.name} (${terr.iso}) at ${terr.resolution} · uncertainty ±${terr.uncertaintyMeters}m · source: ${terr.source}`
    : `Territory unresolved — no dataset polygon contains this point (ocean, gap, or data limit). ${terr.ok ? "" : "Dataset error."}`;
  $("geo-explain").textContent = "";
  renderSiteList(id);

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

      // GEO-009: sign / verify-trust / preview+confirm VNN export.
      const signBtn = document.createElement("button");
      signBtn.type = "button";
      signBtn.textContent = "Sign package";
      signBtn.addEventListener("click", async () => {
        if (!signerKey) { notice("Generate a signer key first (section 8).", "error"); return; }
        const result = await createSignatureRecord({
          pkg: p.record, privateKey: signerKey.privateKey,
          publicKeyHex: signerKey.publicKeyHex, signerId: $("t-signer").value,
        });
        if (!result.ok) {
          notice(`Not signed: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`, "error");
          return;
        }
        signatureStore.save(result.signature);
        notice(`Package signed by "${result.signature.signerId}" (Ed25519 over digest ${result.signature.signedHash.slice(0, 12)}…).`);
        renderCandidates(id);
      });
      pp.appendChild(signBtn);
      const trustBtn = document.createElement("button");
      trustBtn.type = "button";
      trustBtn.textContent = "Verify trust";
      trustBtn.addEventListener("click", async () => {
        const rec = signatureStore.list().map((s) => s.record)
          .filter((s) => s.signedHash === p.record.sha256).pop() || null;
        const verdict = await assessTrust(p.record, rec, {
          verifyPackage, stores: { assertionStore, candidateStore },
        });
        const pre2 = document.createElement("pre");
        pre2.className = "payload";
        pre2.textContent =
          `contentIntact:        ${verdict.contentIntact}\n` +
          `signatureValid:       ${verdict.signatureValid === null ? "unsigned" : verdict.signatureValid}\n` +
          `signerAuthorized:     ${verdict.signerAuthorized === null ? "unsigned" : verdict.signerAuthorized}\n` +
          `evidenceAuthenticity: ${verdict.evidenceAuthenticity}` +
          (verdict.errors.length ? `\nflags: ${verdict.errors.map((e) => `${e.field} ${e.message}`).join("; ")}` : "");
        pp.appendChild(pre2);
      });
      pp.appendChild(trustBtn);
      const vexBtn = document.createElement("button");
      vexBtn.type = "button";
      vexBtn.textContent = "Preview VNN export";
      vexBtn.addEventListener("click", () => {
        const rec = signatureStore.list().map((s) => s.record)
          .filter((s) => s.signedHash === p.record.sha256).pop() || null;
        const result = buildVnnIntakeExport({
          pkg: p.record, requesterRef: $("t-requester").value, signatureRec: rec,
        });
        const pre3 = document.createElement("pre");
        pre3.className = "payload";
        if (!result.ok) {
          pre3.textContent = `export rejected: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`;
        } else {
          pre3.textContent = JSON.stringify(result.record, null, 2);
          const cf = document.createElement("button");
          cf.type = "button";
          cf.textContent = "Confirm export record";
          cf.addEventListener("click", () => {
            exportStore.save(result.record);
            notice(`Export record ${result.record.exportId} stored — a prepared draft, not a VNN submission.`);
            renderCandidates(id);
          });
          pre3.appendChild(cf);
        }
        pp.appendChild(pre3);
      });
      pp.appendChild(vexBtn);
      for (const s of signatureStore.list().filter((s) => s.record.signedHash === p.record.sha256)) {
        const st = document.createElement("p");
        st.className = "hint";
        st.textContent = `signature ${s.id} — ${s.record.signerId} · ${s.record.signature.slice(0, 16)}…`;
        pp.appendChild(st);
      }
      for (const e of exportStore.list().filter((e) => e.record.packageRef?.sha256 === p.record.sha256)) {
        const et = document.createElement("p");
        et.className = "hint";
        et.textContent = `export ${e.record.exportId} — ready=${e.record.readyForIntake} · dryRun (not submitted)`;
        pp.appendChild(et);
      }
      const pre = document.createElement("pre");
      pre.className = "payload";
      pre.textContent = JSON.stringify(p.record.content, null, 2);
      pp.appendChild(pre);
      wrap.appendChild(pp);
    }
    wrap.appendChild(li);
  }
  renderProgress();
}

// GEO-011: backup & restore — spec mirrors the real store set.
const BACKUP_SPECS = () => [
  { name: "assertions", store: assertionStore, validate: validateCoordinateAssertion,
    save: (r, id) => assertionStore.save(r, { id }) },
  { name: "observations", store: observationStore, validate: validateObservation,
    save: (r, id) => observationStore.save(r, { id }),
    refs: [{ field: "assertionId", into: ["assertions"] }] },
  { name: "candidates", store: candidateStore, validate: validateCandidate,
    save: (r, id) => candidateStore.save(r, { id }),
    refs: [{ field: "assertionId", into: ["assertions"] },
           { field: "observationId", into: ["observations"] }] },
  { name: "evidence", store: evidenceStore, validate: validateEvidenceLink,
    save: (r, id) => evidenceStore.save(r, { id }),
    refs: [{ field: "targetId",
      intoBy: (rec) => [rec.targetType === "observation" ? "observations" : "assertions"] }] },
  { name: "handoffs", store: handoffStore, validate: validateHandoffRecord,
    // append-only store: ids regenerate on restore; records keep draftId.
    save: (r) => handoffStore.save(r),
    refs: [{ field: "draftId", into: ["candidates"] }] },
  { name: "packages", store: packageStore, validate: validatePackageStructure,
    save: (r, id) => packageStore.save(r, { id }),
    refs: [{ field: "content.draftId", into: ["candidates"] }] },
  { name: "signatures", store: signatureStore, validate: validateSignatureRecord,
    save: (r, id) => signatureStore.save(r, { id }),
    refs: [{ field: "signedHash", valuesFrom: { store: "packages", path: "sha256" } }] },
  { name: "exports", store: exportStore, validate: validateVnnIntakeExport,
    save: (r, id) => exportStore.save(r, { id }),
    refs: [{ field: "packageRef.sha256", valuesFrom: { store: "packages", path: "sha256" } }] },
  { name: "feedback", store: feedbackStore, validate: validateFeedback,
    save: (r, id) => feedbackStore.save(r, { id }),
    refs: [{ field: "targetId",
      intoBy: (rec) => ({ assertion: ["assertions"], observation: ["observations"],
        draft: ["candidates"], package: ["packages"] }[rec.targetType] || []) }] },
  { name: "sites", store: siteStore, validate: validateSiteDescriptor,
    save: (r, id) => siteStore.save(r, { id }),
    refs: [{ field: "assertionId", into: ["assertions"] }] },
];

let pendingBackup = null;
$("btn-backup").addEventListener("click", async () => {
  const doc = await createBackup(BACKUP_SPECS());
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `h1geo-backup-${doc.createdAt.replace(/[:.]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("btn-bk-validate").addEventListener("click", async () => {
  const out = $("bk-result");
  let doc;
  try {
    doc = JSON.parse($("bk-import").value);
  } catch {
    out.textContent = "Not valid JSON.";
    return;
  }
  const check = await validateBackup(doc, BACKUP_SPECS());
  pendingBackup = check.valid ? doc : null;
  out.textContent = check.valid
    ? `Valid backup: ${Object.entries(check.counts).map(([n, c]) => `${n}=${c}`).join(", ")}. Restore is armed.`
    : `Invalid: ${check.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`;
});
$("btn-bk-restore").addEventListener("click", async () => {
  const out = $("bk-result");
  if (!pendingBackup) { out.textContent = "Validate a backup first."; return; }
  if (!window.confirm("Replace ALL saved H1-Geo work on this machine with this backup?")) return;
  const result = await restoreBackup(pendingBackup, BACKUP_SPECS());
  pendingBackup = null;
  out.textContent = result.ok
    ? `Restored: ${Object.entries(result.counts).map(([n, c]) => `${n}=${c}`).join(", ")}.`
    : `Restore failed: ${result.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`;
  refreshList();
  renderDetail(null);
});

for (const id of ["pin-filter", "d-status", "d-evidence", "d-scope", "d-query"]) {
  $(id).addEventListener("input", () => { refreshList(); });
  $(id).addEventListener("change", () => { refreshList(); });
}

$("btn-example").addEventListener("click", () => {
  const result = loadH1ExampleScenario({
    assertionStore, observationStore, evidenceStore, candidateStore,
  });
  if (!result.ok) {
    notice(`Example not loaded: ${result.errors.map((e) => `${e.what} ${(e.errors || []).map((x) => x.message).join("; ")}`).join("; ")}`, "error");
    return;
  }
  notice(result.label, "info");
  refreshList();
  renderDetail(result.assertionId);
});

$("btn-keygen").addEventListener("click", async () => {
  if (!(await ed25519Available())) {
    $("key-state").textContent = "Ed25519 unavailable in this WebCrypto — signing disabled";
    return;
  }
  signerKey = await generateSignerKey();
  $("key-state").textContent = `Ed25519 key ready — pub ${signerKey.publicKeyHex.slice(0, 16)}…`;
});

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
// Default the signer/reviewer name for the demo user; it remains editable.
if (!$("t-signer").value) $("t-signer").value = $("h-decidedby").value || "";
refreshList();
