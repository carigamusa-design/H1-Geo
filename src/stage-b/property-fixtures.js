/**
 * Synthetic property-level candidates for the Stage B demo and tests.
 *
 * These are NOT real parcels, addresses, or buildings. They exist so the
 * confirmation workflow can demonstrate — and tests can reproduce — how
 * the system behaves when property-level candidate data is ambiguous,
 * single, or absent. Every entry is marked fixture:true, and the set is
 * deliberately tiny: a real deployment would source candidates from
 * licensed footprint/address data (see docs/GEO-013_COMPLETION.md).
 */

export const PROPERTY_FIXTURES = Object.freeze({
  schemaVersion: "h1-geo/property-fixtures-v0",
  fixture: true,
  purpose: "Synthetic demonstration candidates — not real parcels or addresses.",
  candidates: [
    // US — two neighboring houses ~19m apart (both within a typical GPS radius)
    { id: "fx-us-house-a", label: "Fixture house A", kind: "building_footprint_estimate",
      latitude: 33.7490, longitude: -84.3885, region: "US", fixture: true, note: "synthetic neighbor pair" },
    { id: "fx-us-house-b", label: "Fixture house B", kind: "building_footprint_estimate",
      latitude: 33.7490, longitude: -84.3883, region: "US", fixture: true, note: "synthetic neighbor pair" },

    // US — opposite sides of a street ~33m apart
    { id: "fx-us-street-n", label: "Fixture north-side house", kind: "address_point_estimate",
      latitude: 33.7493, longitude: -84.3905, region: "US", fixture: true, note: "synthetic street pair" },
    { id: "fx-us-street-s", label: "Fixture south-side house", kind: "address_point_estimate",
      latitude: 33.7490, longitude: -84.3905, region: "US", fixture: true, note: "synthetic street pair" },

    // US — apartment building, three units within ~4m of each other
    { id: "fx-us-apt-1", label: "Fixture apt unit 1", kind: "unit_estimate",
      latitude: 33.7500, longitude: -84.3920, region: "US", fixture: true, note: "synthetic apartment stack" },
    { id: "fx-us-apt-2", label: "Fixture apt unit 2", kind: "unit_estimate",
      latitude: 33.75002, longitude: -84.39198, region: "US", fixture: true, note: "synthetic apartment stack" },
    { id: "fx-us-apt-3", label: "Fixture apt unit 3", kind: "unit_estimate",
      latitude: 33.7500, longitude: -84.39196, region: "US", fixture: true, note: "synthetic apartment stack" },

    // US — corner property, two plausible frontage points ~28m apart
    { id: "fx-us-corner-a", label: "Fixture corner frontage A", kind: "address_point_estimate",
      latitude: 33.7505, longitude: -84.3870, region: "US", fixture: true, note: "synthetic corner pair" },
    { id: "fx-us-corner-b", label: "Fixture corner frontage B", kind: "address_point_estimate",
      latitude: 33.7505, longitude: -84.3867, region: "US", fixture: true, note: "synthetic corner pair" },

    // MX — neighboring houses near Tijuana ~19m apart
    { id: "fx-mx-house-a", label: "Fixture casa A (MX)", kind: "building_footprint_estimate",
      latitude: 32.5149, longitude: -117.0382, region: "MX", fixture: true, note: "synthetic neighbor pair" },
    { id: "fx-mx-house-b", label: "Fixture casa B (MX)", kind: "building_footprint_estimate",
      latitude: 32.5149, longitude: -117.0380, region: "MX", fixture: true, note: "synthetic neighbor pair" },

    // CR — neighboring houses near San José ~21m apart
    { id: "fx-cr-house-a", label: "Fixture casa A (CR)", kind: "building_footprint_estimate",
      latitude: 9.9350, longitude: -84.1000, region: "CR", fixture: true, note: "synthetic neighbor pair" },
    { id: "fx-cr-house-b", label: "Fixture casa B (CR)", kind: "building_footprint_estimate",
      latitude: 9.9350, longitude: -84.0998, region: "CR", fixture: true, note: "synthetic neighbor pair" },

    // CR — isolated rural fixture; nothing else is near it
    { id: "fx-cr-rural", label: "Fixture rural finca (CR)", kind: "building_footprint_estimate",
      latitude: 9.2000, longitude: -83.7500, region: "CR", fixture: true, note: "synthetic rural singleton" },
  ],
});
