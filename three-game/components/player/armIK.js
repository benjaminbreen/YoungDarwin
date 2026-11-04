import * as THREE from 'three';

// Shared arm and long-gun helpers for skinned (Mixamo-rigged) characters:
// Darwin's held tools in PlayerModel.jsx and Covington's gun in SymsGun.jsx.

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const shaftBasis = new THREE.Matrix4();
const shaftX = new THREE.Vector3();
const shaftY = new THREE.Vector3();
const shaftZ = new THREE.Vector3();

// World orientation for a long gun whose barrel is local -Z and top local +Y:
// the barrel along `dir`, the top as near `up` as the barrel allows. Pointing
// the barrel alone (setFromUnitVectors) leaves the roll free, and the gun
// rolled around its bore whenever the aim direction moved.
export function longGunQuaternion(out, dir, up = WORLD_UP) {
  shaftZ.copy(dir).negate().normalize();
  shaftX.crossVectors(up, shaftZ);
  if (shaftX.lengthSq() < 1e-6) shaftX.set(1, 0, 0).cross(shaftZ);
  shaftX.normalize();
  shaftY.crossVectors(shaftZ, shaftX);
  shaftBasis.makeBasis(shaftX, shaftY, shaftZ);
  return out.setFromRotationMatrix(shaftBasis);
}

const ikA = new THREE.Vector3();
const ikB = new THREE.Vector3();
const ikC = new THREE.Vector3();
const ikT = new THREE.Vector3();
const ikAB = new THREE.Vector3();
const ikAC = new THREE.Vector3();
const ikAT = new THREE.Vector3();
const ikBA = new THREE.Vector3();
const ikBC = new THREE.Vector3();
const ikAxis0 = new THREE.Vector3();
const ikAxis1 = new THREE.Vector3();
const ikRot = new THREE.Quaternion();
const ikRot2 = new THREE.Quaternion();
const ikWorld = new THREE.Quaternion();
const ikLocal = new THREE.Quaternion();

// Turn a bone by a world-space rotation, keeping its parent where it is.
export function rotateBoneWorld(bone, worldRotation) {
  bone.getWorldQuaternion(ikWorld);
  ikLocal.copy(ikWorld).invert().multiply(worldRotation).multiply(ikWorld);
  bone.quaternion.multiply(ikLocal);
  bone.updateWorldMatrix(false, true);
}

// Analytic two-bone IK: bend `upper`/`lower` so `end` reaches `target`
// (world), keeping the arm's current bend plane so the elbow stays where the
// animation had it. `weight` blends from the animated pose.
export function solveTwoBoneIK(upper, lower, end, target, weight = 1) {
  if (weight <= 0) return;
  upper.getWorldPosition(ikA);
  lower.getWorldPosition(ikB);
  end.getWorldPosition(ikC);
  ikT.copy(ikC).lerp(target, weight);
  const lab = ikB.distanceTo(ikA);
  const lcb = ikC.distanceTo(ikB);
  const lat = THREE.MathUtils.clamp(ikT.distanceTo(ikA), 0.01, lab + lcb - 0.001);
  ikAB.subVectors(ikB, ikA);
  ikAC.subVectors(ikC, ikA);
  ikAT.subVectors(ikT, ikA);
  ikBA.subVectors(ikA, ikB);
  ikBC.subVectors(ikC, ikB);
  const acAb = ikAC.angleTo(ikAB);
  const baBc = ikBA.angleTo(ikBC);
  const acAt = ikAC.angleTo(ikAT);
  const acAbTarget = Math.acos(THREE.MathUtils.clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
  const baBcTarget = Math.acos(THREE.MathUtils.clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
  ikAxis0.crossVectors(ikAC, ikAB);
  // A straight arm has no bend plane: bend the elbow down.
  if (ikAxis0.lengthSq() < 1e-8) ikAxis0.crossVectors(ikAC, WORLD_UP).negate();
  ikAxis0.normalize();
  ikAxis1.crossVectors(ikAC, ikAT);
  rotateBoneWorld(lower, ikRot.setFromAxisAngle(ikAxis0, baBcTarget - baBc));
  ikRot.setFromAxisAngle(ikAxis0, acAbTarget - acAb);
  if (ikAxis1.lengthSq() > 1e-10) ikRot.premultiply(ikRot2.setFromAxisAngle(ikAxis1.normalize(), acAt));
  rotateBoneWorld(upper, ikRot);
}
