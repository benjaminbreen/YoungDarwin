import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { installKtx2TerrainProvider } from '../../world/ktx2Textures';

// Hands the terrain loader its compressed-texture source and starts the
// prefetch. Mounted with the scene, which is early enough: terrain materials
// read the cache synchronously, so a prefetch that lands after they are built
// buys nothing that session.
export function Ktx2Warmup() {
  const renderer = useThree(state => state.gl);
  useEffect(() => { installKtx2TerrainProvider(renderer); }, [renderer]);
  return null;
}

export default Ktx2Warmup;
