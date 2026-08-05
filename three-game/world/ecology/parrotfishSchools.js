// Shared spec for procedural parrotfish schools. ReefSwimmers reads the same
// path/startle fields as the GLB schools; `kind: 'parrotfish'` swaps the
// renderer for the instanced procedural rig.

export function parrotfishSchool(id, {
  variant = 'terminal',
  count = 10,
  center,
  radius = 4.4,
  pathRadiusX,
  pathRadiusZ,
  y,
  speed = 0.24,
  scale = [0.6, 0.9],
  cruiseEnergy = 0.3,
  verticalWander = 0.03,
  ...rest
}) {
  return {
    id,
    kind: 'parrotfish',
    variant,
    count,
    center,
    radius,
    pathRadiusX: pathRadiusX ?? radius * 3.6,
    pathRadiusZ: pathRadiusZ ?? radius * 0.75,
    y,
    speed,
    scale,
    motion: 'shoal',
    cruiseEnergy,
    verticalWander,
    maxPitch: 0.08,
    bank: 0.05,
    startleRadius: 8.5,
    startlePush: 4,
    startleBank: 0.2,
    ...rest,
  };
}
