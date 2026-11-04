'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTrackedGLTF } from '../assets/gltfCachePolicy';
import {
  SHOTGUN_MODEL_PATH,
  bodyFrame,
  createSlingSwing,
  createStrapMesh,
  createStrapState,
  createSwivels,
  findSlingBones,
  poseSlingStrap,
  slungTransform,
  updateSlingSwing,
} from '../player/shotgunSling';
import { longGunQuaternion, solveTwoBoneIK } from '../player/armIK';

// Covington's jacket is closer cut than Darwin's frock coat, so the gun can
// ride nearer his back.
const SYMS_SLING_FIT = Object.freeze({
  muzzleAnchor: [0.03, 0.2, -0.1],
  barrelLean: [0.1, 1, 0.08],
});

// Shouldered (gun space, as Darwin's shoulderMount in PlayerModel.jsx).
const SYMS_MOUNT = Object.freeze({
  pocket: [-0.05, -0.035, 0.0],
  buttLength: 0.335,
  gripWrist: [0.0, -0.03, 0.06],
  supportHand: [-0.03, -0.012, -0.24],
  // Seconds to bring the gun from the back to the shoulder.
  raiseSeconds: 0.55,
});

function findBone(scene, regex) {
  let found = null;
  scene.traverse(node => { if (!found && node.isBone && regex.test(node.name)) found = node; });
  return found;
}

// The collecting gun on Covington: slung on his back while he carries it,
// raised to his shoulder when he shoots. `gunRef.current` is written by
// SymsCovington's frame loop: { visible, aimAt: Vector3 | null }. `postPose`
// is the set of handlers SymsCovington runs after his animation is applied.
export function SymsGun({ scene, gunRef, postPose }) {
  const { scene: worldScene } = useThree();
  const { scene: source } = useTrackedGLTF(SHOTGUN_MODEL_PATH);
  const scratch = useMemo(() => ({
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    slotPos: new THREE.Vector3(),
    slotQuat: new THREE.Quaternion(),
    aimQuat: new THREE.Quaternion(),
    aimDir: new THREE.Vector3(),
    butt: new THREE.Vector3(),
    grip: new THREE.Vector3(),
    wrist: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    pivot: new THREE.Vector3(),
  }), []);

  useEffect(() => {
    if (!scene || !source || !postPose) return undefined;
    const bones = findSlingBones(scene);
    if (!bones) return undefined;
    const rightArm = {
      upper: findBone(scene, /rightarm$/i),
      lower: findBone(scene, /rightforearm$/i),
      end: findBone(scene, /righthand$/i),
    };
    const leftArm = {
      upper: findBone(scene, /leftarm$/i),
      lower: findBone(scene, /leftforearm$/i),
      end: findBone(scene, /lefthand$/i),
    };
    const gun = source.clone(true);
    gun.name = 'symsShotgun';
    gun.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.userData.noTint = true;
    });
    createSwivels().forEach(ring => gun.add(ring));
    const strap = createStrapMesh();
    strap.name = 'symsShotgunSling';
    gun.visible = false;
    strap.visible = false;
    worldScene.add(gun);
    worldScene.add(strap);
    const swing = createSlingSwing();
    const strapState = createStrapState();
    let raised = 0;

    const pose = (_frameState, delta) => {
      const want = gunRef.current;
      if (!want?.visible) {
        if (gun.visible) gun.visible = false;
        if (strap.visible) strap.visible = false;
        raised = 0;
        return;
      }
      gun.visible = true;
      strap.visible = true;
      const s = scratch;
      const dt = Math.min(Math.max(delta || 0, 0), 0.1);
      raised = THREE.MathUtils.clamp(raised + (want.aimAt ? 1 : -1) * dt / SYMS_MOUNT.raiseSeconds, 0, 1);
      const w = THREE.MathUtils.smoothstep(raised, 0, 1);
      const frame = bodyFrame(bones);
      bones.rightShoulder.getWorldPosition(s.pivot);
      updateSlingSwing(swing, s.pivot, frame, dt);
      slungTransform(bones, frame, swing, s.slotPos, s.slotQuat, SYMS_SLING_FIT);
      s.pos.copy(s.slotPos);
      s.quat.copy(s.slotQuat);
      if (w > 0 && want.aimAt && rightArm.upper && rightArm.lower && rightArm.end) {
        // Butt in the shoulder pocket, barrel on the quarry.
        rightArm.upper.getWorldPosition(s.butt);
        s.aimDir.subVectors(want.aimAt, s.butt).normalize();
        longGunQuaternion(s.aimQuat, s.aimDir);
        s.butt.add(s.offset.fromArray(SYMS_MOUNT.pocket).applyQuaternion(s.aimQuat));
        s.grip.copy(s.butt).addScaledVector(s.aimDir, SYMS_MOUNT.buttLength);
        s.pos.lerp(s.grip, w).addScaledVector(frame.up, 0.2 * Math.sin(Math.PI * w));
        s.quat.slerp(s.aimQuat, w);
        s.wrist.fromArray(SYMS_MOUNT.gripWrist).applyQuaternion(s.quat).add(s.pos);
        solveTwoBoneIK(rightArm.upper, rightArm.lower, rightArm.end, s.wrist, w);
        if (leftArm.upper && leftArm.lower && leftArm.end) {
          s.wrist.fromArray(SYMS_MOUNT.supportHand).applyQuaternion(s.quat).add(s.pos);
          solveTwoBoneIK(leftArm.upper, leftArm.lower, leftArm.end, s.wrist, w);
        }
      }
      gun.position.copy(s.pos);
      gun.quaternion.copy(s.quat);
      poseSlingStrap(strap, strapState, bones, frame, gun, w);
    };
    postPose.add(pose);
    return () => {
      postPose.delete(pose);
      worldScene.remove(gun);
      worldScene.remove(strap);
      strap.geometry.dispose();
      strap.material.dispose();
    };
  }, [gunRef, postPose, scene, scratch, source, worldScene]);

  return null;
}
