import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { regionMaps } from '../game-core/regionMaps.js';
import { getInteriorDefinition } from '../three-game/interiors/interiorRegistry.js';
import {
  buildRippleNormalBytes,
  buildSeafloorBytes,
  buildStandingWaterMaskBytes,
  buildWaterContactBytes,
} from '../three-game/world/waterBakeData.js';
import {
  WATER_BAKE_RESOLUTIONS,
  WATER_CONTACT_RESOLUTION,
  WATER_RIPPLE_NORMAL_SIZE,
  regionTypeRendersDetailedWater,
  waterBakeAssetStem,
} from '../three-game/world/waterTextureManifest.js';

const outputDirectory = path.join(process.cwd(), 'public', 'assets', 'textures', 'world', 'water-bakes');
const requestedZone = process.argv.find(argument => argument.startsWith('--zone='))?.split('=')[1] || null;

async function writeRgbaPng(filename, data, size) {
  await sharp(data, { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10, palette: false })
    .toFile(path.join(outputDirectory, filename));
}

await fs.mkdir(outputDirectory, { recursive: true });

const rippleData = buildRippleNormalBytes(WATER_RIPPLE_NORMAL_SIZE);
await writeRgbaPng(`ripple-normal-${WATER_RIPPLE_NORMAL_SIZE}.png`, rippleData, WATER_RIPPLE_NORMAL_SIZE);

const zoneIds = Object.keys(regionMaps).filter(zoneId => {
  if (requestedZone && zoneId !== requestedZone) return false;
  if (getInteriorDefinition(zoneId)) return false;
  return regionTypeRendersDetailedWater(regionMaps[zoneId].type);
});

for (const zoneId of zoneIds) {
  const stem = waterBakeAssetStem(zoneId);
  for (const resolution of WATER_BAKE_RESOLUTIONS) {
    const startedAt = Date.now();
    await Promise.all([
      writeRgbaPng(
        `${stem}-seafloor-${resolution}.png`,
        buildSeafloorBytes(zoneId, resolution),
        resolution,
      ),
      writeRgbaPng(
        `${stem}-standing-water-${resolution}.png`,
        buildStandingWaterMaskBytes(zoneId, resolution),
        resolution,
      ),
    ]);
    console.log(`[water-bakes] ${zoneId} ${resolution}px ${Date.now() - startedAt}ms`);
  }
  await writeRgbaPng(
    `${stem}-water-contact-${WATER_CONTACT_RESOLUTION}.png`,
    buildWaterContactBytes(zoneId, WATER_CONTACT_RESOLUTION),
    WATER_CONTACT_RESOLUTION,
  );
}

console.log(`[water-bakes] wrote ${zoneIds.length} zone sets to ${outputDirectory}`);
