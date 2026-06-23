// Transplant the 'idle' animation from darwin-final-animated.glb into
// darwin-candidate-2-animated.glb, matching channel targets by node name.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const SRC = 'public/assets/models/darwin-final-animated.glb';
const DST = 'public/assets/models/darwin-candidate-2-animated.glb';
const CLIP = process.argv[2] || 'idle';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(SRC);
const dst = await io.read(DST);

const srcAnim = src.getRoot().listAnimations().find(a => a.getName() === CLIP);
if (!srcAnim) throw new Error(`No ${CLIP} in source`);

const dstNodesByName = new Map(dst.getRoot().listNodes().map(n => [n.getName(), n]));

// Remove existing clip in destination
const old = dst.getRoot().listAnimations().find(a => a.getName() === CLIP);
if (old) {
  old.listSamplers().forEach(s => { /* leave accessors; dispose sampler */ });
  old.dispose();
}

// Retarget: copy ONLY rotation tracks (destination keeps its own bone
// lengths/rest translations), plus the hips translation rescaled by the
// ratio of rest-hip offsets between the two rigs.
const srcNodesByName = new Map(src.getRoot().listNodes().map(n => [n.getName(), n]));
const hipsName = [...dstNodesByName.keys()].find(n => /hips$/i.test(n));
const mag = v => Math.hypot(v[0], v[1], v[2]);
const ratio = mag(dstNodesByName.get(hipsName).getTranslation()) / mag(srcNodesByName.get(hipsName).getTranslation());
console.log('hips translation scale ratio:', ratio.toFixed(4));

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

console.log(`Transplanted '${CLIP}': ${newAnim.listChannels().length} channels, ${missing} unmatched nodes`);
await io.write(DST, dst);
console.log('Wrote', DST);
