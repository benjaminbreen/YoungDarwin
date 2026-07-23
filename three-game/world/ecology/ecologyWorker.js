import { getEcology } from './index';
import { getBorderVistas } from '../vistas';

function buildEcologies(ids) {
  const timings = [];
  const definitions = ids.map(zoneId => {
    const startedAt = performance.now();
    const ecology = getEcology(zoneId);
    timings.push({ zoneId, durationMs: performance.now() - startedAt });
    return { zoneId, ecology };
  });
  return { definitions, timings };
}

self.onmessage = event => {
  const { requestId, regionId } = event.data || {};
  try {
    const destinationStartedAt = performance.now();
    const destination = buildEcologies([regionId]);
    self.postMessage({
      requestId,
      stage: 'destination',
      payload: {
        regionId,
        definitions: destination.definitions,
        preparation: {
          mode: 'worker',
          durationMs: performance.now() - destinationStartedAt,
          timings: destination.timings,
        },
      },
    });
    const neighborIds = [...new Set(
      getBorderVistas(regionId)
        .map(vista => vista.toRegionId)
        .filter(zoneId => zoneId && zoneId !== regionId),
    )];
    const neighborsStartedAt = performance.now();
    const neighbors = buildEcologies(neighborIds);
    self.postMessage({
      requestId,
      stage: 'neighbors',
      payload: {
        regionId,
        definitions: neighbors.definitions,
        preparation: {
          mode: 'worker-neighbors',
          durationMs: performance.now() - neighborsStartedAt,
          timings: neighbors.timings,
        },
      },
    });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
