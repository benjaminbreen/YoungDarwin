// Regrade the Tripo Darwin albedo. Very desaturated + coat crushed near-black,
// so raw-pixel passes: 1) shadow tint -> dark pixels toward dark brown (coat);
// 2) warm -> shift near-neutral skin toward tan; 3) saturate -> amplify hue.
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const a=Object.fromEntries(process.argv.slice(2).map(s=>{const m=s.match(/^--([^=]+)=(.*)$/);return m?[m[1],m[2]]:[s.replace(/^--/,''),true];}));
const n=(k,d)=>a[k]!==undefined?Number(a[k]):d;
const shadowThresh=n('shadowThresh',80), sR=n('shadowR',40), sG=n('shadowG',23), sB=n('shadowB',9);
const sat=n('saturation',1.8), warmR=n('warmR',1.13), warmB=n('warmB',0.85), gain=n('gain',1.0);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read('asset-backups/darwin-tripo-recombined.glb');
const tex=doc.getRoot().listMaterials()[0].getBaseColorTexture();
const {data,info}=await sharp(Buffer.from(tex.getImage()),{limitInputPixels:false}).removeAlpha().raw().toBuffer({resolveWithObject:true});
const C=info.channels, clamp=v=>v<0?0:v>255?255:v;
for(let i=0;i<data.length;i+=C){
  let r=data[i],g=data[i+1],b=data[i+2];
  const L=0.299*r+0.587*g+0.114*b;
  if(L<shadowThresh){const f=(shadowThresh-L)/shadowThresh; r+=f*sR; g+=f*sG; b+=f*sB;}
  r*=warmR*gain; g*=gain; b*=warmB*gain;
  const L2=0.299*r+0.587*g+0.114*b;
  r=L2+(r-L2)*sat; g=L2+(g-L2)*sat; b=L2+(b-L2)*sat;
  data[i]=clamp(r); data[i+1]=clamp(g); data[i+2]=clamp(b);
}
const buf=await sharp(data,{raw:{width:info.width,height:info.height,channels:C}}).png().toBuffer();
tex.setImage(buf).setMimeType('image/png');
await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',quality:90}));
const out='public/assets/models/darwin-tripo.glb';
await io.write(out,doc);
console.log('Wrote',out,(fs.statSync(out).size/1e6).toFixed(1)+'MB | shadow',sR+','+sG+','+sB,'sat',sat,'warmR',warmR,'warmB',warmB,'gain',gain);
