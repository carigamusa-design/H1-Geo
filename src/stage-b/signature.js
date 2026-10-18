/**
 * GEO-009 trusted-handoff signing adapter for GEO-008 packages.
 *
 * Contract reused from H1-DR (products/h1_dr/server/signature.py):
 * Ed25519 over the UTF-8 bytes of the hex digest string — H1-DR's
 * sign_hash() signs `hash_value.encode()` and returns hex; this adapter
 * signs the package's sha256 hex exactly the same way via WebCrypto.
 *
 * A signature record binds: package digest (signedHash), signer identity
 * (signerId), and key reference (publicKey raw hex). It claims "the
 * signer vouches for this exact package" — nothing more. Integrity,
 * signature validity, signer authorization, and evidence authenticity
 * are four separate questions answered separately by assessTrust().
 */

import { validatePackageStructure } from "./handoff-package.js";

export const SIGNATURE_SCHEMA_VERSION = "h1-geo/handoff-signature-v0";
export const SIGNATURE_STORE_KEY = "h1geo.stageb.signatures.v1";
export const SIGNATURE_ALGORITHM = "Ed25519";

function fail(errors, field, message) {
  errors.push({ field, message });
}

function hexOf(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** Whether this platform's WebCrypto can run Ed25519. Never throws. */
export async function ed25519Available() {
  try {
    if (!crypto.subtle) return false;
    await crypto.subtle.generateKey({ name: SIGNATURE_ALGORITHM }, false, ["sign"]);
    return true;
  } catch {
    return false;
  }
}

/** Generate an exportable Ed25519 signer keypair for this session. */
export async function generateSignerKey() {
  const pair = await crypto.subtle.generateKey(
    { name: SIGNATURE_ALGORITHM }, true, ["sign", "verify"]);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, publicKeyHex: hexOf(raw) };
}

/**
 * Sign a package's digest. Returns { ok, signature?, errors }.
 * Requires a named signer — anonymous signatures are meaningless here.
 */
export async function createSignatureRecord({ pkg, privateKey, publicKeyHex, signerId, now = new Date().toISOString() }) {
  const errors = [];
  if (!validatePackageStructure(pkg).valid) fail(errors, "pkg", "not a structurally valid package");
  if (typeof signerId !== "string" || !/\S/.test(signerId)) {
    fail(errors, "signerId", "must be a non-empty signer name");
  }
  if (typeof publicKeyHex !== "string" || !/^[0-9a-f]{64}$/.test(publicKeyHex)) {
    fail(errors, "publicKeyHex", "must be the 64-hex raw Ed25519 public key");
  }
  if (errors.length) return { ok: false, errors };
  const bytes = new TextEncoder().encode(pkg.sha256);
  const sig = await crypto.subtle.sign(SIGNATURE_ALGORITHM, privateKey, bytes);
  return {
    ok: true,
    signature: {
      schemaVersion: SIGNATURE_SCHEMA_VERSION,
      algorithm: SIGNATURE_ALGORITHM,
      signerId,
      publicKey: publicKeyHex,
      signedHash: pkg.sha256,
      signature: hexOf(sig),
      signedAt: now,
    },
  };
}

/** Structural validation — used as the signature store's validate fn. */
export function validateSignatureRecord(rec) {
  const errors = [];
  if (typeof rec !== "object" || rec === null || Array.isArray(rec)) {
    fail(errors, "", "must be an object");
    return { valid: false, errors };
  }
  if (rec.schemaVersion !== SIGNATURE_SCHEMA_VERSION) {
    fail(errors, "schemaVersion", `must equal "${SIGNATURE_SCHEMA_VERSION}"`);
  }
  if (rec.algorithm !== SIGNATURE_ALGORITHM) fail(errors, "algorithm", `must be "${SIGNATURE_ALGORITHM}"`);
  if (typeof rec.signerId !== "string" || !/\S/.test(rec.signerId)) {
    fail(errors, "signerId", "must be a non-empty signer name");
  }
  if (typeof rec.publicKey !== "string" || !/^[0-9a-f]{64}$/.test(rec.publicKey)) {
    fail(errors, "publicKey", "must be 64-hex raw Ed25519 public key");
  }
  if (typeof rec.signedHash !== "string" || !/^[0-9a-f]{64}$/.test(rec.signedHash)) {
    fail(errors, "signedHash", "must be a 64-hex package digest");
  }
  if (typeof rec.signature !== "string" || !/^[0-9a-f]{128}$/.test(rec.signature)) {
    fail(errors, "signature", "must be 128-hex Ed25519 signature");
  }
  if (typeof rec.signedAt !== "string" || Number.isNaN(Date.parse(rec.signedAt))) {
    fail(errors, "signedAt", "must be a date-time string");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Cryptographically verify a signature record against a package.
 * Checks: structure, signedHash binds THIS package's digest, the key is
 * well-formed, and Ed25519 verifies over the digest hex string.
 * Returns { signatureValid, errors } — never throws on bad crypto.
 */
export async function verifySignatureRecord(pkg, rec) {
  const errors = [];
  if (!validatePackageStructure(pkg).valid) {
    fail(errors, "pkg", "not a structurally valid package");
    return { signatureValid: false, errors };
  }
  const structure = validateSignatureRecord(rec);
  if (!structure.valid) {
    for (const e of structure.errors) fail(errors, e.field, e.message);
    return { signatureValid: false, errors };
  }
  if (rec.signedHash !== pkg.sha256) {
    fail(errors, "signedHash", "does not match this package's digest");
    return { signatureValid: false, errors };
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw", hexBytes(rec.publicKey), { name: SIGNATURE_ALGORITHM }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      SIGNATURE_ALGORITHM, key, hexBytes(rec.signature),
      new TextEncoder().encode(rec.signedHash));
    return { signatureValid: ok, errors };
  } catch (exc) {
    fail(errors, "signature", `crypto failure: ${exc && exc.message ? exc.message : exc}`);
    return { signatureValid: false, errors };
  }
}

/**
 * The four-way trust verdict — deliberately NOT collapsed into one flag.
 *   contentIntact        — package digest recomputes (integrity)
 *   signatureValid       — Ed25519 verifies over the digest (crypto)
 *   signerAuthorized     — signer name == the recorded approver (policy)
 *   evidenceAuthenticity — always "not_established": refs are refs
 */
export async function assessTrust(pkg, signatureRec, { verifyPackage, stores } = {}) {
  const errors = [];
  let contentIntact = null;
  if (verifyPackage) {
    const v = await verifyPackage(pkg, stores);
    contentIntact = v.valid;
    if (!v.valid) for (const e of v.errors) errors.push({ field: `integrity.${e.field}`, message: e.message });
  }
  let signatureValid = null;
  let signerAuthorized = null;
  if (signatureRec != null) {
    const sv = await verifySignatureRecord(pkg, signatureRec);
    signatureValid = sv.signatureValid;
    for (const e of sv.errors) errors.push({ field: `signature.${e.field}`, message: e.message });
    const approver = pkg && pkg.content && pkg.content.review ? pkg.content.review.decidedBy : null;
    signerAuthorized = signatureRec.signerId === approver;
    if (!signerAuthorized) {
      errors.push({ field: "signature.signerId", message: "signer is not the recorded approver" });
    }
  }
  return {
    contentIntact,
    signatureValid,
    signerAuthorized,
    evidenceAuthenticity: "not_established",
    errors,
  };
}
