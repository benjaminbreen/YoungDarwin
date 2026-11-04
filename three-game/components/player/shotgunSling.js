import * as THREE from 'three';

// The shotgun's sling: where the gun rides on Darwin's back, how it swings
// there, the leather strap between its swivels, and the timing of drawing it
// from (and returning it to) the shoulder. HandProp in PlayerModel.jsx owns
// the gun object and calls into this module each frame after the animation.
//
// Gun space (scripts/build-shotgun.mjs): grip at the origin, barrel along -Z,
// top +Y. Body space here is built from the skeleton each frame: `right` from
// the shoulders, `up` from the hips to the chest, `forward` = up x right.

// Rebuild: npm run asset:shotgun, then bump ?v= (assets are cached for up to
// an hour).
export const SHOTGUN_MODEL_PATH = '/assets/models/tools/shotgun.glb?v=2';

// Shared with the controller: how far the gun is off Darwin's back (1 =
// shouldered) and a hip shot waiting for the draw to finish (seconds,
// performance.now() clock). PlayerModel writes `t`; with no slung rig mounted
// it stays 1 and a shot fires at once.
export const slingDrawState = { t: 1, pendingShotUntil: 0 };

export const SLING = {
  // Swivels in gun space: under the fore-end tip and under the butt.
  frontSwivel: [0, 0.0, -0.4],
  rearSwivel: [0, -0.094, 0.22],
  muzzleReach: 0.862, // grip to muzzle along the barrel
  // Slung muzzle-up behind the right shoulder: where the muzzle rides
  // relative to the right shoulder joint (body space: right, up, forward)
  // and the barrel's lean (body space, normalised).
  // The coat's back and skirt flare out below the shoulders, so the gun
  // rides well behind the shoulder joint and leans butt-out to clear them.
  muzzleAnchor: [0.03, 0.2, -0.12],
  barrelLean: [0.1, 1, 0.12],
  // Strap path over the shoulder (body space, from the right shoulder).
  strapOverShoulder: [-0.01, 0.075, -0.01],
  strapFrontOfShoulder: [-0.035, -0.06, 0.1],
  strapUnderArm: [0.0, -0.24, 0.06],
  strapWidth: 0.026,
  strapThickness: 0.004,
  // Pendulum about the shoulder: stiffness, damping, response to the
  // shoulder's acceleration, and the largest swing (radians).
  swing: { stiffness: 38, damping: 5.5, gain: 0.55, limit: 0.4 },
  // Draw/stow: total seconds, when the gun leaves the back (fraction), and
  // the reach/release curve of the right-hand IK.
  // Short, because it is the delay between asking to aim and being on aim.
  drawSeconds: 0.6,
  liftStart: 0.38,
  holdSag: 0.13, // how far the strap hangs below the gun while held
  // Where the right wrist takes the slung gun (gun space): just under the
  // fore-end, which rides by the shoulder blade.
  grabWrist: [0.0, -0.05, -0.36],
  drawArc: [0.22, 0.2], // peak detour of the grip (right, up) mid-draw
};

const scratch = {
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  m: new THREE.Matrix4(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
};

export function findSlingBones(scene) {
  const find = regex => {
    let found = null;
    scene.traverse(node => { if (!found && node.isBone && regex.test(node.name)) found = node; });
    return found;
  };
  const bones = {
    hips: find(/hips$/i),
    chest: find(/spine2$/i),
    leftShoulder: find(/leftarm$/i),
    rightShoulder: find(/rightarm$/i),
  };
  return Object.values(bones).every(Boolean) ? bones : null;
}

// Body frame from the skeleton, so the slot leans and twists with the torso.
export function bodyFrame(bones, out = scratch) {
  bones.rightShoulder.getWorldPosition(out.a);
  bones.leftShoulder.getWorldPosition(out.b);
  out.right.subVectors(out.a, out.b).normalize();
  bones.chest.getWorldPosition(out.a);
  bones.hips.getWorldPosition(out.b);
  out.up.subVectors(out.a, out.b).normalize();
  out.forward.crossVectors(out.up, out.right).normalize();
  out.right.crossVectors(out.forward, out.up).normalize();
  return out;
}

export function bodyOffset(frame, offset, out) {
  return out
    .copy(frame.right).multiplyScalar(offset[0])
    .addScaledVector(frame.up, offset[1])
    .addScaledVector(frame.forward, offset[2]);
}

// Barrel along `dir`, gun top toward `up`.
function gunQuaternion(out, dir, up) {
  scratch.z.copy(dir).negate().normalize();
  scratch.x.crossVectors(up, scratch.z);
  if (scratch.x.lengthSq() < 1e-6) scratch.x.set(1, 0, 0).cross(scratch.z);
  scratch.x.normalize();
  scratch.y.crossVectors(scratch.z, scratch.x);
  scratch.m.makeBasis(scratch.x, scratch.y, scratch.z);
  return out.setFromRotationMatrix(scratch.m);
}

// Pendulum swing of the slung gun about the shoulder, driven by how the
// shoulder accelerates (walking bob, turns, jumps and landings).
export function createSlingSwing() {
  return {
    pitch: 0, roll: 0, pitchVel: 0, rollVel: 0,
    lastPos: new THREE.Vector3(), lastVel: new THREE.Vector3(), primed: 0,
    vel: new THREE.Vector3(), acc: new THREE.Vector3(),
  };
}

export function updateSlingSwing(swing, pivot, frame, delta) {
  const dt = THREE.MathUtils.clamp(delta, 1 / 240, 1 / 20);
  const cfg = SLING.swing;
  if (swing.primed < 2) {
    if (swing.primed === 1) swing.lastVel.subVectors(pivot, swing.lastPos).divideScalar(dt);
    swing.lastPos.copy(pivot);
    swing.primed += 1;
    return swing;
  }
  swing.vel.subVectors(pivot, swing.lastPos).divideScalar(dt);
  swing.acc.subVectors(swing.vel, swing.lastVel).divideScalar(dt);
  swing.lastPos.copy(pivot);
  swing.lastVel.copy(swing.vel);
  // Teleports and respawns: forget the jump instead of flinging the gun.
  if (swing.acc.lengthSq() > 400 * 400) swing.acc.set(0, 0, 0);
  // The hanging gun lags the shoulder: forward acceleration swings the
  // muzzle back (pitch), sideways acceleration tips it the other way (roll).
  // Upward acceleration (a jump take-off or landing) adds weight and
  // tightens the swing.
  const gEff = Math.max(2, 9.81 + swing.acc.dot(frame.up));
  const forwardAcc = swing.acc.dot(frame.forward);
  const sideAcc = swing.acc.dot(frame.right);
  const stiffness = cfg.stiffness * (gEff / 9.81);
  swing.pitchVel += (-stiffness * swing.pitch - cfg.damping * swing.pitchVel - forwardAcc * cfg.gain) * dt;
  swing.rollVel += (-stiffness * swing.roll - cfg.damping * swing.rollVel + sideAcc * cfg.gain) * dt;
  swing.pitch = THREE.MathUtils.clamp(swing.pitch + swing.pitchVel * dt, -cfg.limit, cfg.limit);
  swing.roll = THREE.MathUtils.clamp(swing.roll + swing.rollVel * dt, -cfg.limit, cfg.limit);
  return swing;
}

const slotScratch = {
  pivot: new THREE.Vector3(),
  muzzle: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  gunUp: new THREE.Vector3(),
  swingQ: new THREE.Quaternion(),
  rollQ: new THREE.Quaternion(),
  offset: new THREE.Vector3(),
};

// World transform of the slung gun (grip position + orientation), with the
// swing applied about the strap's bearing point on the shoulder. `fit`
// overrides where the muzzle rides and how the barrel leans, for a body of a
// different build (Covington's jacket is closer cut than Darwin's coat).
export function slungTransform(bones, frame, swing, outPosition, outQuaternion, fit = SLING) {
  const s = slotScratch;
  bones.rightShoulder.getWorldPosition(s.pivot);
  s.muzzle.copy(s.pivot).add(bodyOffset(frame, fit.muzzleAnchor, s.offset));
  bodyOffset(frame, fit.barrelLean, s.dir).normalize();
  // Underside (and the sling) against the back: gun top faces away.
  s.gunUp.copy(frame.forward).negate();
  gunQuaternion(outQuaternion, s.dir, s.gunUp);
  outPosition.copy(s.muzzle).addScaledVector(s.dir, -SLING.muzzleReach);
  if (swing) {
    s.swingQ.setFromAxisAngle(frame.right, swing.pitch);
    s.rollQ.setFromAxisAngle(frame.forward, swing.roll);
    s.swingQ.multiply(s.rollQ);
    // Swing about the shoulder bearing point.
    s.pivot.add(bodyOffset(frame, SLING.strapOverShoulder, s.offset));
    outPosition.sub(s.pivot).applyQuaternion(s.swingQ).add(s.pivot);
    outQuaternion.premultiply(s.swingQ);
  }
}

// Draw (0 -> 1) and stow (1 -> 0) share one curve. `gun` is how far the gun
// has travelled from the back slot to the hands; `reach` is the right-hand
// IK weight (reaching back to the gun, carrying it, then letting the clip's
// hand pose take over).
export function drawCurve(t) {
  const lift = THREE.MathUtils.smoothstep(t, SLING.liftStart, 1);
  const reachIn = THREE.MathUtils.smoothstep(t, 0, SLING.liftStart);
  const release = 1 - THREE.MathUtils.smoothstep(t, 0.78, 1);
  return { gun: lift, reach: Math.min(reachIn, release) };
}

// Flat leather strap: a box-section ribbon along a smooth curve, rebuilt
// every frame (a few hundred vertices).
const STRAP_SAMPLES = 36;

export function createStrapMesh() {
  const positions = new Float32Array(STRAP_SAMPLES * 4 * 3);
  const index = [];
  for (let i = 0; i < STRAP_SAMPLES - 1; i += 1) {
    for (let k = 0; k < 4; k += 1) {
      const a = i * 4 + k;
      const b = i * 4 + ((k + 1) % 4);
      const c = a + 4;
      const d = b + 4;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(index);
  const material = new THREE.MeshStandardMaterial({ color: '#5b3a22', roughness: 0.72, metalness: 0 });
  material.name = 'Shotgun sling leather';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'darwinShotgunSling';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.userData.noTint = true;
  return mesh;
}

const strapScratch = {
  curve: new THREE.CatmullRomCurve3([], false, 'centripetal', 0.5),
  point: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  side: new THREE.Vector3(),
  normal: new THREE.Vector3(),
};

// `points`: world-space control points. `faceNormal(point, out)`: which way
// the flat of the strap faces at a point.
export function updateStrapMesh(mesh, points, faceNormal) {
  const s = strapScratch;
  s.curve.points = points;
  const position = mesh.geometry.attributes.position;
  const halfW = SLING.strapWidth / 2;
  const halfT = SLING.strapThickness / 2;
  for (let i = 0; i < STRAP_SAMPLES; i += 1) {
    const u = i / (STRAP_SAMPLES - 1);
    s.curve.getPointAt(u, s.point);
    s.curve.getTangentAt(u, s.tangent);
    faceNormal(s.point, s.normal);
    s.side.crossVectors(s.tangent, s.normal);
    if (s.side.lengthSq() < 1e-8) s.side.set(1, 0, 0);
    s.side.normalize();
    s.normal.crossVectors(s.side, s.tangent).normalize();
    for (let k = 0; k < 4; k += 1) {
      const sw = k === 0 || k === 3 ? -halfW : halfW;
      const st = k < 2 ? -halfT : halfT;
      position.setXYZ(
        i * 4 + k,
        s.point.x + s.side.x * sw + s.normal.x * st,
        s.point.y + s.side.y * sw + s.normal.y * st,
        s.point.z + s.side.z * sw + s.normal.z * st,
      );
    }
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

export function createStrapState() {
  return {
    points: Array.from({ length: 5 }, () => new THREE.Vector3()),
    front: new THREE.Vector3(),
    rear: new THREE.Vector3(),
    shoulder: new THREE.Vector3(),
    hang: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    gunX: new THREE.Vector3(),
    gunQ: new THREE.Quaternion(),
  };
}

const SLUNG_STRAP_PATH = [null, 'strapOverShoulder', 'strapFrontOfShoulder', 'strapUnderArm', null];

// Strap control points: over the shoulder when slung (held = 0), hanging
// under the gun between its swivels when it is in the hands (held = 1),
// blended while the gun travels. `gun` is the gun object (its world matrix).
export function poseSlingStrap(strap, state, bones, frame, gun, held) {
  gun.updateWorldMatrix(true, false);
  state.front.fromArray(SLING.frontSwivel).applyMatrix4(gun.matrixWorld);
  state.rear.fromArray(SLING.rearSwivel).applyMatrix4(gun.matrixWorld);
  bones.rightShoulder.getWorldPosition(state.shoulder);
  const p = state.points;
  p[0].copy(state.front);
  p[4].copy(state.rear);
  for (let i = 1; i < 4; i += 1) {
    const u = i / 4;
    state.hang.copy(state.front).lerp(state.rear, u);
    state.hang.y -= SLING.holdSag * 4 * u * (1 - u);
    p[i].copy(state.shoulder)
      .add(bodyOffset(frame, SLING[SLUNG_STRAP_PATH[i]], state.offset))
      .lerp(state.hang, held);
  }
  state.gunX.set(1, 0, 0).applyQuaternion(gun.getWorldQuaternion(state.gunQ));
  const shoulder = state.shoulder;
  updateStrapMesh(strap, p, (point, out) => {
    // Flat against the body over the shoulder; sideways under the gun.
    out.subVectors(point, shoulder);
    out.addScaledVector(frame.up, -out.dot(frame.up));
    if (out.lengthSq() < 1e-8) out.copy(frame.forward);
    out.normalize().lerp(state.gunX, held).normalize();
    return out;
  });
}

// Brass swivel loops, parented to the gun.
export function createSwivels() {
  const geometry = new THREE.TorusGeometry(0.009, 0.0018, 6, 14);
  const material = new THREE.MeshStandardMaterial({ color: '#b08a3e', roughness: 0.35, metalness: 0.9 });
  return [SLING.frontSwivel, SLING.rearSwivel].map(at => {
    const ring = new THREE.Mesh(geometry, material);
    ring.position.fromArray(at);
    ring.rotation.y = Math.PI / 2;
    ring.castShadow = true;
    ring.userData.noTint = true;
    return ring;
  });
}
