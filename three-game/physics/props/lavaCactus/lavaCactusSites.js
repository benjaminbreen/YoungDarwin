import { getInteractiveFloraSites } from '../../../world/ecology';
import { AUTHORED_LAVA_CACTUS_SITES } from './lavaCactusAuthoredSites';

export { AUTHORED_LAVA_CACTUS_SITES as LAVA_CACTUS_SITES };

export function getLavaCactusSites(zoneId) {
  return [
    ...(AUTHORED_LAVA_CACTUS_SITES[zoneId] || []),
    ...getInteractiveFloraSites(zoneId, 'lava-cactus'),
  ].map(site => ({
    ...site,
    // A small visual lift keeps this naturally low cactus legible among
    // terrain litter without turning it into a columnar or tree cactus.
    size: Math.min(1.65, Math.max(0.9, (site.size || 1) * 1.1)),
  }));
}
