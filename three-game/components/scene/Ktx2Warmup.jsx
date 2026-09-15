import { useEffect } from 'react';
import { installKtx2TerrainProvider } from '../../world/ktx2Textures';

// Hands the terrain loader its compressed-texture source and starts the
// prefetch. Mounted with the scene, which is early enough: terrain materials
// read the cache synchronously, so a prefetch that lands after they are built
// buys nothing that session.
export function Ktx2Warmup() {
  useEffect(() => { installKtx2TerrainProvider(); }, []);
  return null;
}

export default Ktx2Warmup;
