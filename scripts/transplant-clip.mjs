// Transplant an animation clip from one GLB into another, retargeting by
// bone name: rotation tracks copy directly, the hips translation track is
// rescaled by the ratio of the two rigs' rest-hip offsets, and all other
// translation/scale tracks are dropped so the destination keeps its own
// bone proportions.
//
// Usage: node scripts/transplant-clip.mjs <src.glb> <dst.glb> <dstClipName> [srcClipName]
// If srcClipName is omitted, the first animation in the source is used.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [SRC, DST, CLIP, SRC_CLIP] = process.argv.slice(2);
if (!SRC || !DST || !CLIP) {
  console.error('Usage: node scripts/transplant-clip.mjs <src.glb> <dst.glb> <dstClipName> [srcClipName]');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(SRC);
const dst = await io.read(DST);

const srcAnim = SRC_CLIP
  ? src.getRoot().listAnimations().find(a => a.getName() === SRC_CLIP)
  : src.getRoot().listAnimations()[0];
if (!srcAnim) throw new Error(`No source animation${SRC_CLIP ? ` "${SRC_CLIP}"` : ''} in ${SRC}`);

const dstNodesByName = new Map(dst.getRoot().listNodes().map(n => [n.getName(), n]));
const srcNodesByName = new Map(src.getRoot().listNodes().map(n => [n.getName(), n]));
const hipsName = [...dstNodesByName.keys()].find(n => /hips$/i.test(n));
const mag = v => Math.hypot(v[0], v[1], v[2]);
const srcHips = srcNodesByName.get(hipsName);
if (!srcHips) throw new Error(`Source has no node named ${hipsName}`);
const ratio = mag(dstNodesByName.get(hipsName).getTranslation()) / mag(srcHips.getTranslation());

const old = dst.getRoot().listAnimations().find(a => a.getName() === CLIP);
if (old) old.dispose();

const buffer = dst.getRoot().listBuffers()[0];
const newAnim = dst.createAnimation(CLIP);
const samplerMap = new Map();
let missing = 0;

for (const ch of srcAnim.listChannels()) {
  const targetName = ch.getTargetNode()?.getName();
  const dstNode = dstNodesByName.get(targetName);
  if (!dstNode) { missing++; continue; }
  const path = ch.getTargetPath();
  if (path === 'scale') continue;
  if (path === 'translation' && targetName !== hipsName) continue;
  const sSampler = ch.getSampler();
  let dSampler = samplerMap.get(sSampler);
  if (!dSampler) {
    const inAcc = sSampler.getInput();
    const outAcc = sSampler.getOutput();
    const outArr = outAcc.getArray().slice();
    if (path === 'translation') {
      for (let i = 0; i < outArr.length; i++) outArr[i] *= ratio;
    }
    const dIn = dst.createAccessor().setType(inAcc.getType()).setArray(inAcc.getArray().slice()).setBuffer(buffer);
    const dOut = dst.createAccessor().setType(outAcc.getType()).setArray(outArr).setBuffer(buffer);
    dSampler = dst.createAnimationSampler().setInput(dIn).setOutput(dOut).setInterpolation(sSampler.getInterpolation());
    samplerMap.set(sSampler, dSampler);
    newAnim.addSampler(dSampler);
  }
  const dCh = dst.createAnimationChannel().setTargetNode(dstNode).setTargetPath(path).setSampler(dSampler);
  newAnim.addChannel(dCh);
}

console.log(`${CLIP}: ${newAnim.listChannels().length} channels (ratio ${ratio.toFixed(3)}, ${missing} unmatched, src "${srcAnim.getName()}")`);
await io.write(DST, dst);
