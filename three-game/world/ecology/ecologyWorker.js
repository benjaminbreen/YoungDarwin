import { getEcology } from './index';
import { getBorderVistas } from '../vistas';

function regionEcologies(regionId) {
  const ids = [...new Set([
    regionId,
    ...getBorderVistas(regionId).map(vista => vista.toRegionId),
  ].filter(Boolean))];
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
    const startedAt = performance.now();
    const result = regionEcologies(regionId);
    self.postMessage({
      requestId,
      payload: {
        regionId,
        definitions: result.definitions,
        preparation: {
          mode: 'worker',
          durationMs: performance.now() - startedAt,
          timings: result.timings,
        },
      },
    });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
