// HMS Beagle is one anchored landmark viewed from several recentered region
// scenes. The regional route grid is topological rather than metric, so these
// sightlines are deliberately art-directed instead of projected from grid
// coordinates. Keep the scene model and local-minimap marker on this shared
// source so their bearings cannot drift apart.

const POST_OFFICE_BAY_SIGHTLINE = Object.freeze({
  position: Object.freeze([36, -1.08, -56]),
  rotation: Object.freeze([0, -0.08, 0]),
  scale: 0.92,
  interactive: true,
  label: 'HMS Beagle — offshore anchorage',
});

export const BEAGLE_SIGHTLINES = Object.freeze({
  POST_OFFICE_BAY: POST_OFFICE_BAY_SIGHTLINE,
  'post-office-bay-anchorage': POST_OFFICE_BAY_SIGHTLINE,
  N_SHORE: Object.freeze({
    position: Object.freeze([-62, -1.08, -74]),
    // The ship is beyond the local chart. Pin its bearing just below the
    // legend rather than hiding the northwest marker under the map controls.
    minimapPosition: Object.freeze([-45, 0, -26]),
    rotation: Object.freeze([0, -0.08, 0]),
    scale: 0.92,
    interactive: false,
    label: 'HMS Beagle — anchorage to the northwest',
  }),
  NW_REEF: Object.freeze({
    position: Object.freeze([82, -1.08, -86]),
    rotation: Object.freeze([0, -0.08, 0]),
    scale: 0.92,
    interactive: false,
    label: 'HMS Beagle — distant anchorage to the northeast',
  }),
});

export function getBeagleSightline(zoneId) {
  return BEAGLE_SIGHTLINES[zoneId] || null;
}
