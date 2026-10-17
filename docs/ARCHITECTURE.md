# H1-Geo — Architecture and Ownership Boundaries
Status: Proposed contracts and boundaries; subject to evidence-driven validation.

## Authority
H1-Geo: geographic reference semantics, coordinate validation, spatial indexing/geometry interfaces, accuracy and uncertainty vocabulary, provider-neutral map and measurement contracts.
H1-SnapNTalk: observations, media artifacts, capture integrity, corrections, destination grants.
H1-HomeVault: person's property and life-continuity records; existing localStorage vs Hull persistence conflict remains unresolved.
H1-VNN: mission opportunities, provider matching, offers, assignments and work outcomes.
H1-Ride-MX: transportation-specific geocoding, routes, ETA, dispatch; its Python map adapter is not the browser renderer.
H1-Sandbox-Factory: isolated experiments and promotion evidence; not permanent geographic authority.
H1-Economic-Participation: contribution, agreements, compensation rights; H1-Finance executes money movement.

## Identity boundaries
1. Geographic reference: a versioned spatial assertion with coordinates, source, uncertainty and provenance. A pin is not proof of property ownership.
2. Physical object: property, building, fence, field, road or other asset. Geometry and identity may be unknown or disputed.
3. Observation: a time-bounded claim/evidence about an object or location, owned by SnapN'Talk.
4. Opportunity candidate: a reviewable indication of a possible need; not a verified need, solicitation permission, assignment or price.
5. Mission: an approved actionable request governed by VNN.

Use explicit stable references between these domains. Do not use geohash, H3, or coordinates alone as a global object identity. Nearby observations must not silently merge.

## Existing evidence (GEO-001, reported by Devin)
H1-SnapNTalk 52/52; HomeVault SnapN'Talk 96/96; VNN 299/299; Ride-MX adapter 4/4; sanitizer 50/50; HomeVault property/Universal 7/7. These are reported local executions, not independent verification in this repository. H1-Ride-MX has a mock-only map adapter and coordinate-event schema; no proven production geocoder or map renderer. HomeVault Property is currently localStorage-backed. VNN Mission.location is text.

## Contract principles
- WGS84 latitude [-90,90], longitude [-180,180], finite numbers; avoid false precision.
- Source distinguishes device-reported position from a manually selected target pin. A device's accuracy radius does not establish target-property accuracy.
- Record datum/CRS, source, observation time, and provenance. Accuracy may be unknown; never fabricate it.
- A map tile is a visual aid, not cadastral evidence. Parcel boundaries, geocoding and building measurement need separate provider/benchmark gates.
- No silent network calls from a pure coordinate validator.
- Keep spatial contract portable across browser, server, and future sensors.
- Avoid copying capture media or personally identifying content into geographic indices.
- Data visibility, retention, access controls and exports are explicit at the integration boundary.

## Integration sequence
GEO-002: stand-alone contracts, validation, tests and a sandbox-only vertical slice.
Next: read-only adapters to SnapN'Talk and a candidate record; no production writes.
Later: explicit, reviewed HomeVault persistence and VNN mission handoffs, with authorization gates.
Future: separately benchmarked parcel, imagery, photogrammetry, LiDAR, agricultural and robotics capabilities.
