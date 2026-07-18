'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../../store';
import { getZoneProps } from '../../physics/props/propRegistry';
import { PropVisual } from '../../physics/props/PropVisuals';
import { findBone } from './handAttachment';
import { carryGripForProp } from './carryProfiles';

const RIGHT_HAND = /righthand$/i;
const LEFT_HAND = /lefthand$/i;

export function CarriedPropAttachment({ scene }) {
  const groupRef = useRef(null);
  const bonesRef = useRef({ right: null, left: null });
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const carriedObjectId = useThreeGameStore(state => state.carriedObjectId);
  const prop = useMemo(() => {
    if (!carriedObjectId) return null;
    return getZoneProps(currentZoneId).find(item => item.id === carriedObjectId) || null;
  }, [carriedObjectId, currentZoneId]);
  const grip = useMemo(() => carryGripForProp(prop || {}), [prop]);
  const scratch = useMemo(() => ({
    rightHand: new THREE.Vector3(),
    leftHand: new THREE.Vector3(),
    target: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    xAxis: new THREE.Vector3(),
    yAxis: new THREE.Vector3(),
    zAxis: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
    targetQuaternion: new THREE.Quaternion(),
    parentQuaternion: new THREE.Quaternion(),
    localQuaternion: new THREE.Quaternion(),
    gripQuaternion: new THREE.Quaternion(),
    gripEuler: new THREE.Euler(),
    parentScale: new THREE.Vector3(1, 1, 1),
  }), []);

  useEffect(() => {
    bonesRef.current = {
      right: scene ? findBone(scene, RIGHT_HAND) : null,
      left: scene ? findBone(scene, LEFT_HAND) : null,
    };
  }, [scene]);

  useEffect(() => {
    scratch.gripEuler.set(grip.rotation[0] || 0, grip.rotation[1] || 0, grip.rotation[2] || 0, 'YXZ');
    scratch.gripQuaternion.setFromEuler(scratch.gripEuler);
  }, [grip.rotation, scratch]);

  useFrame(() => {
    const group = groupRef.current;
    const rightBone = bonesRef.current.right;
    const leftBone = bonesRef.current.left;
    const liveCarriedObjectId = useThreeGameStore.getState().carriedObjectId;
    if (!group || !prop || liveCarriedObjectId !== prop.id || !rightBone || !group.parent) {
      if (group) group.visible = false;
      return;
    }

    group.visible = true;
    rightBone.getWorldPosition(scratch.rightHand);
    if (leftBone) leftBone.getWorldPosition(scratch.leftHand);
    else scratch.leftHand.copy(scratch.rightHand);

    const pose = getRuntimePlayerPose();
    scratch.forward.set(pose?.facing?.x || 0, 0, pose?.facing?.z || -1);
    if (scratch.forward.lengthSq() < 0.0001) scratch.forward.set(0, 0, -1);
    scratch.forward.normalize();
    scratch.right.set(scratch.forward.z, 0, -scratch.forward.x).normalize();

    if (grip.mode === 'twoHand' && leftBone) {
      // The prop origin sits between the animated palms. Its local X axis spans
      // left-to-right, local Y stays upright, and local Z follows Darwin.
      scratch.xAxis.copy(scratch.rightHand).sub(scratch.leftHand);
      if (scratch.xAxis.lengthSq() < 0.0001) scratch.xAxis.copy(scratch.right);
      else scratch.xAxis.normalize();
      if (scratch.xAxis.dot(scratch.right) < 0) scratch.xAxis.negate();
      scratch.zAxis.copy(scratch.xAxis).cross(scratch.up).normalize();
      if (scratch.zAxis.dot(scratch.forward) < 0) {
        scratch.xAxis.negate();
        scratch.zAxis.copy(scratch.xAxis).cross(scratch.up).normalize();
      }
      scratch.yAxis.copy(scratch.zAxis).cross(scratch.xAxis).normalize();
      scratch.target.copy(scratch.rightHand).add(scratch.leftHand).multiplyScalar(0.5);
    } else {
      scratch.xAxis.copy(scratch.right);
      scratch.yAxis.copy(scratch.up);
      scratch.zAxis.copy(scratch.forward);
      scratch.target.copy(scratch.rightHand);
    }

    scratch.target
      .addScaledVector(scratch.xAxis, grip.offset[0] || 0)
      .addScaledVector(scratch.yAxis, grip.offset[1] || 0)
      .addScaledVector(scratch.zAxis, grip.offset[2] || 0);
    scratch.matrix.makeBasis(scratch.xAxis, scratch.yAxis, scratch.zAxis);
    scratch.targetQuaternion.setFromRotationMatrix(scratch.matrix).multiply(scratch.gripQuaternion);

    group.parent.updateWorldMatrix(true, false);
    group.parent.getWorldQuaternion(scratch.parentQuaternion);
    scratch.localQuaternion.copy(scratch.parentQuaternion).invert().multiply(scratch.targetQuaternion);
    group.quaternion.copy(scratch.localQuaternion);
    group.position.copy(scratch.target);
    group.parent.worldToLocal(group.position);
    group.parent.getWorldScale(scratch.parentScale);
    group.scale.set(
      grip.scale / Math.max(0.0001, scratch.parentScale.x),
      grip.scale / Math.max(0.0001, scratch.parentScale.y),
      grip.scale / Math.max(0.0001, scratch.parentScale.z),
    );
  });

  if (!prop) return null;
  return (
    <group
      ref={groupRef}
      visible={false}
      userData={{
        renderSource: `skeletal-carried-prop:${prop.id}`,
        renderLabel: `Skeletal carried prop: ${prop.label}`,
        renderKind: 'carried-prop',
        renderPath: prop.visualAsset || prop.visual || null,
      }}
    >
      <PropVisual visual={prop.visual} assetId={prop.visualAsset} offsetY={prop.visualOffsetY || 0} />
    </group>
  );
}
