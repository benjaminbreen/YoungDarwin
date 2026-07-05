export function flamingoFlyoverLayer(id, items, layer = {}) {
  return {
    id,
    loadTier: layer.loadTier ?? 1,
    items: items.map((item, index) => ({
      id: item.id || `${id}-${index + 1}`,
      assetId: 'flyingFlamingo',
      clip: 'flamingo_flyA_',
      cx: item.cx ?? 0,
      cz: item.cz ?? 0,
      radiusX: item.radiusX ?? item.radius ?? 34,
      radiusZ: item.radiusZ ?? item.radius ?? 14,
      height: item.height ?? 31,
      speed: item.speed ?? 0.026,
      phase: item.phase ?? index * 1.9,
      scale: item.scale ?? 0.92,
      timeScale: item.timeScale ?? 0.64,
      rollAmount: item.rollAmount ?? 0.05,
      floatAmount: item.floatAmount ?? 0.7,
      pitch: item.pitch ?? -0.035,
      yawOffset: item.yawOffset ?? 0,
    })),
  };
}

export function coastalBirds(items) {
  return items.map((item, index) => ({
    species: item.species || (index % 3 === 1 ? 'gull' : 'frigatebird'),
    path: item.path || (index % 2 === 0 ? 'thermalCircle' : 'lazyFigureEight'),
    radiusX: item.radiusX ?? item.radius ?? 22,
    radiusZ: item.radiusZ ?? item.radius ?? 14,
    height: item.height ?? 24,
    speed: item.speed ?? (index % 2 === 0 ? 0.075 : -0.058),
    phase: item.phase ?? index * 2.2,
    cx: item.cx ?? 0,
    cz: item.cz ?? 0,
    flapRate: item.flapRate,
    scale: item.scale,
    altitudeLift: item.altitudeLift,
  }));
}
