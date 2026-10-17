# H1-Geo

**H1 Geographic Intelligence** — a global, human-centered geospatial foundation for H1 Universe.

## Why it exists
H1-Geo develops reusable geographic capabilities for homes, services, mobility, agriculture, infrastructure, drones and robotics. The first commercial direction is a location → observation → reviewable opportunity candidate → eventual authorized H1-VNN work loop. The foundation is designed for many domains; the first release is deliberately narrow and measurable.

## Current state
**Foundation proposal / GEO-002 Stage A.** This repository does not yet contain a working map, live GPS engine, geocoder, parcel registry, property measurement engine, or deployed service. Do not mistake contracts or diagrams for implemented capabilities.

## Read first
- [Founding charter](docs/FOUNDING_CHARTER.md)
- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Field education and conduct](docs/FIELD_EDUCATION_AND_CONDUCT.md)
- [GEO-002 build order and gates](docs/GEO-002_BUILD_ORDER.md)
- [Coordinate assertion draft](contracts/geo-coordinate-assertion-v0.schema.json)

## H1 boundaries
H1-Geo owns shared spatial semantics and eventual geographic operations. H1-SnapNTalk owns capture and evidence. H1-HomeVault owns personal property records. H1-VNN owns opportunities, providers and work. H1-Ride-MX owns ride-specific workflows. H1-Sandbox-Factory hosts isolated validation. Integration must use explicit contracts, not duplicated business logic.

## Engineering posture
Build test-first. Keep source, time, uncertainty, provenance and coordinate reference systems explicit. Never turn a visual observation into a verified service need automatically. Measure before claiming accuracy. Start with internal H1 use, validate against real reference data, and scale only after evidence gates.

## Contributing
No production integration or new vendor dependency without scoped review. No secrets or founder records in tests. Stage A is foundational documentation and a draft schema; validation implementation and the first operational vertical slice require their own acceptance evidence.

## Licensing
No open-source license has been selected. Public repository visibility does not by itself grant reuse rights.
