import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const srcPath = process.argv[2] || 'public/assets/models/darwin-candidate-2-animated.glb';
const dstPath = process.argv[3] || 'public/assets/models/darwin-final-animated.glb';

const CLIPS_TO_COPY = [
  'climbingDownWall',
  'crouchRun',
  'dodgeRoll',
  'holdIdle',
  'holdWalk',
  'idleFidget',
  'jumpFromWall',
  'lyingDown',
  'rifleIdle',
  'runRifle',
  'runUpStairs',
  'runningSlide',
  'runningTurn180',
  'sitIdle',
  'standToRoll',
  'standToSit',
  'stumble',
  'swim',
  'swimToEdge',
  'tiredWalk',
  'vault',
  'wadeWalk',
  'walkBackwards',
  'walkUpStairs',
  'walkingTurn180',
  'wallRun',
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(srcPath);
const dst = await io.read(dstPath);

const srcRoot = src.getRoot();
const dstRoot = dst.getRoot();
const srcAnimations = new Map(srcRoot.listAnimations().map(animation => [animation.getName(), animation]));
const dstAnimations = new Map(dstRoot.listAnimations().map(animation => [animation.getName(), animation]));
const dstNodesByName = new Map(dstRoot.listNodes().map(node => [node.getName(), node]));
const srcNodesByName = new Map(srcRoot.listNodes().map(node => [node.getName(), node]));
const hipsName = [...dstNodesByName.keys()].find(name => /hips$/i.test(name));
const dstHips = dstNodesByName.get(hipsName);
const srcHips = srcNodesByName.get(hipsName);
if (!hipsName || !dstHips || !srcHips) throw new Error('Could not match source/destination hips node.');

const ratio = magnitude(dstHips.getTranslation()) / magnitude(srcHips.getTranslation());
const buffer = dstRoot.listBuffers()[0] || dst.createBuffer();
const copied = [];
const skipped = [];
const missing = [];

for (const clipName of CLIPS_TO_COPY) {
  if (dstAnimations.has(clipName)) {
    skipped.push({ clip: clipName, reason: 'already-present' });
    continue;
  }
  const srcAnimation = srcAnimations.get(clipName);
  if (!srcAnimation) {
    missing.push(clipName);
    continue;
  }
  const result = copyAnimation(srcAnimation, clipName);
  copied.push(result);
}

if (copied.length) await io.write(dstPath, dst);

console.log(JSON.stringify({
  source: srcPath,
  destination: dstPath,
  ratio: Number(ratio.toFixed(5)),
  copied,
  skipped,
  missing,
}, null, 2));

function copyAnimation(srcAnimation, clipName) {
  const newAnim = dst.createAnimation(clipName);
  const samplerMap = new Map();
  let unmatchedChannels = 0;

  for (const channel of srcAnimation.listChannels()) {
    const targetName = channel.getTargetNode()?.getName();
    const dstNode = dstNodesByName.get(targetName);
    if (!dstNode) {
      unmatchedChannels += 1;
      continue;
    }
    const targetPath = channel.getTargetPath();
    if (targetPath === 'scale') continue;
    if (targetPath === 'translation' && targetName !== hipsName) continue;

    const srcSampler = channel.getSampler();
    const samplerKey = `${srcSampler.getName() || ''}:${srcAnimation.listSamplers().indexOf(srcSampler)}:${targetPath}`;
    let dstSampler = samplerMap.get(samplerKey);
    if (!dstSampler) {
      dstSampler = copySampler(srcSampler, targetPath);
      samplerMap.set(samplerKey, dstSampler);
      newAnim.addSampler(dstSampler);
    }
    newAnim.addChannel(dst.createAnimationChannel()
      .setTargetNode(dstNode)
      .setTargetPath(targetPath)
      .setSampler(dstSampler));
  }

  return {
    clip: clipName,
    channels: newAnim.listChannels().length,
    unmatchedChannels,
  };
}

function copySampler(srcSampler, targetPath) {
  const input = srcSampler.getInput();
  const output = srcSampler.getOutput();
  const outputArray = output.getArray().slice();
  if (targetPath === 'translation') {
    for (let index = 0; index < outputArray.length; index += 1) {
      outputArray[index] *= ratio;
    }
  }
  return dst.createAnimationSampler()
    .setInput(dst.createAccessor()
      .setType(input.getType())
      .setArray(input.getArray().slice())
      .setBuffer(buffer))
    .setOutput(dst.createAccessor()
      .setType(output.getType())
      .setArray(outputArray)
      .setBuffer(buffer))
    .setInterpolation(srcSampler.getInterpolation());
}

function magnitude(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}
