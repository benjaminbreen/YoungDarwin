// Transplant an animation clip from one GLB into another, retargeting by
// bone name: rotation tracks copy directly, the hips translation track is
// rescaled by the ratio of the two rigs' rest-hip offsets, and all other
// translation/scale tracks are dropped so the destination keeps its own
// bone proportions.
//
// Usage: node scripts/transplant-clip.mjs <src.glb> <dst.glb> <dstClipName> [srcClipName] [--rebase-hips] [--trim-start=<seconds>]
// If srcClipName is omitted, the first animation in the source is used.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3d';

const rawArgs = process.argv.slice(2);
const rebaseHips = rawArgs.includes('--rebase-hips');
const trimStartArg = rawArgs.find(arg => arg.startsWith('--trim-start='));
const trimStart = trimStartArg ? Number(trimStartArg.slice('--trim-start='.length)) : 0;
if (!Number.isFinite(trimStart) || trimStart < 0) throw new Error(`Invalid --trim-start value: ${trimStartArg}`);
const [SRC, DST, CLIP, SRC_CLIP] = rawArgs.filter(arg => arg !== '--rebase-hips' && !arg.startsWith('--trim-start='));
if (!SRC || !DST || !CLIP) {
  console.error('Usage: node scripts/transplant-clip.mjs <src.glb> <dst.glb> <dstClipName> [srcClipName] [--rebase-hips] [--trim-start=<seconds>]');
  process.exit(1);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });
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
    let inArr = inAcc.getArray().slice();
    let outArr = outAcc.getArray().slice();
    if (trimStart > 0) {
      if (sSampler.getInterpolation() === 'CUBICSPLINE') {
        throw new Error(`--trim-start does not support CUBICSPLINE sampler in ${srcAnim.getName()}`);
      }
      const valueStride = outArr.length / inArr.length;
      if (!Number.isInteger(valueStride)) throw new Error(`Unexpected sampler stride ${valueStride} in ${srcAnim.getName()}`);
      let firstKey = 0;
      while (firstKey < inArr.length - 1 && inArr[firstKey] < trimStart) firstKey += 1;
      inArr = inArr.slice(firstKey);
      outArr = outArr.slice(firstKey * valueStride);
      const timeOrigin = inArr[0] || 0;
      for (let i = 0; i < inArr.length; i += 1) inArr[i] -= timeOrigin;
    }
    if (path === 'translation') {
      if (rebaseHips) {
        // Blender-baked retargets express the hips in the exported armature's
        // local basis. That basis may have a very different absolute rest
        // offset from the untouched runtime GLB even when the motion delta is
        // correct. Preserve the animated delta from the first key, but anchor
        // it to the destination hips rest so a clip cannot sink or levitate
        // the whole skinned character.
        const dstRest = dstNode.getTranslation();
        const sourceBase = outArr.slice(0, 3);
        for (let i = 0; i < outArr.length; i += 3) {
          outArr[i] = dstRest[0] + (outArr[i] - sourceBase[0]) * ratio;
          outArr[i + 1] = dstRest[1] + (outArr[i + 1] - sourceBase[1]) * ratio;
          outArr[i + 2] = dstRest[2] + (outArr[i + 2] - sourceBase[2]) * ratio;
        }
      } else {
        for (let i = 0; i < outArr.length; i++) outArr[i] *= ratio;
      }
    }
    const dIn = dst.createAccessor().setType(inAcc.getType()).setArray(inArr).setBuffer(buffer);
    const dOut = dst.createAccessor().setType(outAcc.getType()).setArray(outArr).setBuffer(buffer);
    dSampler = dst.createAnimationSampler().setInput(dIn).setOutput(dOut).setInterpolation(sSampler.getInterpolation());
    samplerMap.set(sSampler, dSampler);
    newAnim.addSampler(dSampler);
  }
  const dCh = dst.createAnimationChannel().setTargetNode(dstNode).setTargetPath(path).setSampler(dSampler);
  newAnim.addChannel(dCh);
}

console.log(`${CLIP}: ${newAnim.listChannels().length} channels (ratio ${ratio.toFixed(3)}, ${missing} unmatched, src "${srcAnim.getName()}", hips ${rebaseHips ? 'rebased' : 'scaled'}, trim ${trimStart.toFixed(3)}s)`);
await io.write(DST, dst);
