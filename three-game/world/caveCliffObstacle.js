// Collision for a 'cave-cliff' volcanic formation: two cheeks either side of
// the opening and a lintel above it, all boxes in the formation's own frame
// (opening facing +z, rock running back to -depth). VolcanicFormationField
// draws the same radii and opening, so the rock you see is the rock you hit.
export function caveCliffObstacle(formation, { zoneId, idPrefix }) {
  const [outerHalfWidth, outerHeight, depth] = formation.radii;
  const [openingWidth = 7.6, openingHeight = 3.15] = formation.opening || [];
  const openingHalfWidth = openingWidth * 0.5;
  const sideWidth = Math.max(0.8, outerHalfWidth - openingHalfWidth);
  const topHeight = Math.max(0.8, outerHeight - openingHeight);
  const yBase = -(formation.sink || 0);
  const shapes = [
    {
      type: 'box',
      size: [sideWidth, outerHeight, depth * 1.15],
      offset: [-(openingHalfWidth + sideWidth * 0.5), yBase + outerHeight * 0.5, -depth * 0.42],
    },
    {
      type: 'box',
      size: [sideWidth, outerHeight, depth * 1.15],
      offset: [openingHalfWidth + sideWidth * 0.5, yBase + outerHeight * 0.5, -depth * 0.42],
    },
    {
      type: 'box',
      size: [openingWidth, topHeight, depth * 1.15],
      offset: [0, yBase + openingHeight + topHeight * 0.5, -depth * 0.42],
    },
  ];
  return {
    id: `${idPrefix}-formation-${formation.id}`,
    kind: 'ledge',
    path: null,
    x: formation.x,
    z: formation.z,
    radius: outerHalfWidth,
    height: outerHeight,
    colliderTop: yBase + outerHeight,
    colliderBottom: yBase,
    scale: 1,
    yaw: formation.yaw || 0,
    jumpable: false,
    climbable: false,
    edgeRisk: false,
    pushable: false,
    pushMass: 1,
    pushFriction: 0.96,
    traversal: null,
    definition: { collider: { type: 'compound', shapes } },
    zoneId,
    shapes,
  };
}
