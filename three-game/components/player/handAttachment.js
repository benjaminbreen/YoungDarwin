import * as THREE from 'three';

// Find the first bone/node in a loaded scene whose name matches `regex`
// (e.g. /righthand$/i for mixamorig:RightHand).
export function findBone(scene, regex) {
  let found = null;
  scene.traverse(obj => {
    if (!found && regex.test(obj.name || '')) found = obj;
  });
  return found;
}

// Attach an Object3D to a skeleton bone, normalising for the bone's world scale
// so sizes/offsets are expressed in world metres regardless of how the rig was
// exported. Returns { group, bone, dispose } or null if the bone is missing.
//
// - worldScale: desired uniform world scale of the object (1 = keep authored size)
// - position:   offset from the bone, in world metres
// - euler:      local rotation applied after attachment, radians
export function attachToBone(scene, boneRegex, object, { worldScale = 1, position = [0, 0, 0], euler = [0, 0, 0] } = {}) {
  const bone = findBone(scene, boneRegex);
  if (!bone) return null;

  bone.updateWorldMatrix(true, false);
  const boneScale = new THREE.Vector3();
  bone.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), boneScale);
  const inv = 1 / Math.max(1e-4, boneScale.x);

  const group = new THREE.Group();
  group.add(object);
  group.scale.setScalar(worldScale * inv);
  group.position.set(position[0] * inv, position[1] * inv, position[2] * inv);
  group.rotation.set(euler[0], euler[1], euler[2]);
  bone.add(group);

  // Only detach. The object is typically a shallow `.clone()` of a cached
  // useGLTF scene, so its geometry/materials are SHARED with that cache —
  // disposing them here would corrupt later clones. The cache owns disposal.
  const dispose = () => {
    bone.remove(group);
  };

  return { group, bone, dispose, invBoneScale: inv };
}
