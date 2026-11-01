import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {EXTTextureWebP, KHRTextureTransform} from '@gltf-transform/extensions';
import * as THREE from 'three';
import sharp from 'sharp';
import {metricBoxUvs} from '../three-game/world/regions/materials/periodMaterialUvs.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'public/assets/models/props/beagle-cabin/folding-stool.glb');
const output=path.join(root,'public/assets/models/props/beagle-cabin/folding-stool-period.glb');
const io=new NodeIO().registerExtensions([EXTTextureWebP,KHRTextureTransform]);
const document=await io.read(source);
const topologyDigest=doc=>{
 const digest=createHash('sha256');
 for(const node of doc.getRoot().listNodes()){
  digest.update(JSON.stringify([node.getName(),node.getMatrix()]));
  for(const primitive of node.getMesh()?.listPrimitives()||[]){
   for(const key of ['POSITION','NORMAL']){const array=primitive.getAttribute(key)?.getArray();if(array)digest.update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));}
   const indices=primitive.getIndices()?.getArray();if(indices)digest.update(new Uint8Array(indices.buffer,indices.byteOffset,indices.byteLength));
  }
 }
 return digest.digest('hex');
};
const before=topologyDigest(document);
const material=document.getRoot().listMaterials().find(m=>m.getName()==='CabinCanvas');
if(!material)throw new Error('Expected the authored CabinCanvas material');
// These UVs are authored like the procedural prop UVs (v points up). GLTF
// textures load with flipY=false, so reflect the embedded images once to match
// the browser loader's flipY=true path. Keep the baked normal vectors intact.
const texture=async role=>{
 const bytes=await fs.readFile(path.join(root,`public/assets/textures/interiors/period-kit/canvas-${role}.webp`));
 const flipped=await sharp(bytes).flip().webp({lossless:true}).toBuffer();
 const {data:original,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
 const decoded=await sharp(flipped).raw().toBuffer();const stride=info.width*info.channels;
 for(let y=0;y<info.height;y++)if(!decoded.subarray(y*stride,(y+1)*stride).equals(original.subarray((info.height-1-y)*stride,(info.height-y)*stride)))throw new Error(`Embedded ${role} changed channel values`);
 return document.createTexture(`PeriodCanvas_${role}`).setImage(flipped).setMimeType('image/webp');
};
material.setBaseColorTexture(await texture('albedo')).setBaseColorFactor([1,1,1,1]);
material.setNormalTexture(await texture('normal')).setNormalScale(0.45);
material.setExtras({ ...material.getExtras(), periodSurface: { key: 'canvas', tileMetres: 0.2, uvMode: 'baked' } });
material.setMetallicRoughnessTexture(await texture('roughness')).setMetallicFactor(0).setRoughnessFactor(1);
let changedPrimitives=0;
for(const node of document.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()||[]){
 if(primitive.getMaterial()!==material)continue;
 const positions=primitive.getAttribute('POSITION'),normals=primitive.getAttribute('NORMAL');
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions.getArray().slice(),3));
 geometry.setAttribute('normal',new THREE.BufferAttribute(normals.getArray().slice(),3));
 geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(positions.getCount()*2),2));
 const matrix=node.getWorldMatrix();
 geometry.scale(Math.hypot(matrix[0],matrix[1],matrix[2]),Math.hypot(matrix[4],matrix[5],matrix[6]),Math.hypot(matrix[8],matrix[9],matrix[10]));
 metricBoxUvs(geometry);
 const uv=geometry.attributes.uv.array;
 for(let i=0;i<uv.length;i++)uv[i]/=0.2;
 primitive.setAttribute('TEXCOORD_0',document.createAccessor('PeriodCanvasMetricUV').setType('VEC2').setArray(uv.slice()).setBuffer(positions.getBuffer()));
 geometry.dispose();changedPrimitives++;
}
if(!changedPrimitives)throw new Error('No canvas primitives were updated');
await io.write(output,document);
const after=topologyDigest(await io.read(output));
if(before!==after)throw new Error('Stool geometry or transforms changed during the material bake');
const report={source:path.relative(root,source),sourceSha256:createHash('sha256').update(await fs.readFile(source)).digest('hex'),output:path.relative(root,output),outputBytes:(await fs.stat(output)).size,changedPrimitives,geometryAndTransformsUnchanged:true,geometrySha256:before,preservedMaterials:['CabinVarnishedOak','CabinPolishedBrass'],changedMaterial:'CabinCanvas',textureTileMetres:0.2,embeddedImagesFlippedY:true,embeddedChannelValuesVerified:true};
await fs.writeFile(path.join(root,'assets-src/period-materials/stool-build-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(report);
