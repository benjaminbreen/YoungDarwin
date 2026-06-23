// Compress the recombined Tripo Darwin texture to WebP and write into the game.
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('asset-backups/darwin-tripo-recombined.glb');
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90 }));
const out = 'public/assets/models/darwin-tripo.glb';
await io.write(out, doc);
console.log('Wrote', out, (fs.statSync(out).size/1e6).toFixed(1)+'MB');
