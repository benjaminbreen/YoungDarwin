import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { solveLegPlant } from './legPlanting';
import { footPhasePulse } from './gaitProfiles';
import { createVisualFootSurfaceSampler } from '../../world/visualFootSurfaces';

const CLEARANCE = 0.006;
const SUPPORT_SOURCES = /^(authored-obstacle|loose-rock|physics-prop)$/;
const UNSUPPORTED_ACTION = /fall|death|roll|climb|jump|swim|crawl|lying|sitting|trip/i;

export function planStandingFeet(root, forward, right, heightAt) {
  const candidates = sign => {
    const list = [];
    for (const advance of [-0.12, 0, 0.12, 0.24, 0.36]) for (const width of [0.13, 0.21, 0.32, 0.4, 0.52]) {
      const x = root.x + right.x * sign * width + forward.x * advance;
      const z = root.z + right.z * sign * width + forward.z * advance;
      const heights = [], unstable = [];
      for (const toe of [-0.14, 0.1, 0.24]) for (const edge of [-0.085, 0.085]) {
        const surface = heightAt(x + forward.x * toe + right.x * edge, z + forward.z * toe + right.z * edge);
        heights.push(surface.y);unstable.push(surface.loose);
      }
      const high = Math.max(...heights), spread = high - Math.min(...heights);
      list.push({ x, z, high, score: advance * advance + (width - 0.13) ** 2 + spread * 0.8 + (unstable.some(Boolean) ? 0.7 : 0) });
    }
    return list;
  };
  let best = null;
  for (const left of candidates(1)) for (const right of candidates(-1)) {
    const score = left.score + right.score + Math.abs(left.high - right.high) * 2;
    if (!best || score < best.score) best = { left, right, score };
  }
  for(const foot of [best.left,best.right]) {
    const dx=(heightAt(foot.x+0.08,foot.z).y-heightAt(foot.x-0.08,foot.z).y)/0.16;
    const dz=(heightAt(foot.x,foot.z+0.08).y-heightAt(foot.x,foot.z-0.08).y)/0.16;
    const scale=Math.min(1,Math.tan(0.4)/Math.max(0.001,Math.hypot(dx,dz)));
    foot.normal=new THREE.Vector3(-dx*scale,1,-dz*scale).normalize();
  }
  return best;
}

// The drawn heightfield is triangulated. Interpolating its actual vertices
// avoids the small discrepancies between the analytic height and the mesh.
export function sampleHeightfieldSurface(geometry, x, z) {
  const p = geometry?.attributes?.position;
  const segments = geometry?.userData?.terrainSegments;
  if (!p || !segments || p.count !== (segments + 1) ** 2) return null;
  const side = segments + 1, end = p.count - 1;
  const u = (x - p.getX(0)) / (p.getX(end) - p.getX(0)) * segments;
  const v = (z - p.getZ(0)) / (p.getZ(end) - p.getZ(0)) * segments;
  if (u < 0 || v < 0 || u > segments || v > segments) return null;
  const ix = Math.min(segments - 1, Math.floor(u)), iz = Math.min(segments - 1, Math.floor(v));
  const fx = u - ix, fz = v - iz, a = ix + side * iz;
  const ay = p.getY(a), by = p.getY(a + side), cy = p.getY(a + side + 1), dy = p.getY(a + 1);
  return fx + fz <= 1 ? ay * (1 - fx - fz) + by * fz + dy * fx
    : by * (1 - fx) + cy * (fx + fz - 1) + dy * (1 - fz);
}

function collectSoleProbes(scene, side) {
  const probes = [], point = new THREE.Vector3();
  scene.updateWorldMatrix(true, true);
  const modelSpace = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh || !mesh.geometry.attributes.skinWeight) return;
    const indices = new Set(mesh.skeleton.bones.flatMap((bone, i) => new RegExp(`${side}(Foot|Toe.*)$`, 'i').test(bone.name) ? [i] : []));
    if (!indices.size) return;
    const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
    const candidates = [], skinGroups = new Map();
    let minY = Infinity;
    for (let i = 0; i < position.count; i += 1) {
      let weight = 0;
      for (let k = 0; k < 4; k += 1) if (indices.has(skinIndex.getComponent(i, k))) weight += skinWeight.getComponent(i, k);
      if (weight < 0.5) continue;
      // Choose the underside from the mesh's bind geometry, independent of
      // whichever animation happened to be playing when the zone mounted.
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(modelSpace);
      const candidate = { index: i, x: point.x, y: point.y, z: point.z };
      candidates.push(candidate);
      let strongestWeight = -1, strongestBone = 0;
      for (let k = 0; k < 4; k += 1) {
        const w = skinWeight.getComponent(i, k);
        if (w > strongestWeight) { strongestWeight = w; strongestBone = skinIndex.getComponent(i, k); }
      }
      const key = strongestBone;
      if (!skinGroups.has(key)) skinGroups.set(key, []);
      skinGroups.get(key).push(candidate);
      minY = Math.min(minY, point.y);
    }
    const sole = candidates.filter(p => p.y <= minY + 0.035);
    if (!sole.length) return;
    const minX = Math.min(...sole.map(p => p.x)), maxX = Math.max(...sole.map(p => p.x));
    const minZ = Math.min(...sole.map(p => p.z)), maxZ = Math.max(...sole.map(p => p.z));
    const cells = new Map();
    for (const p of sole) {
      const x = Math.min(2, Math.floor((p.x - minX) / Math.max(0.001, maxX - minX) * 3));
      const z = Math.min(4, Math.floor((p.z - minZ) / Math.max(0.001, maxZ - minZ) * 5));
      const key = x + z * 3;
      if (!cells.has(key) || cells.get(key).y > p.y) cells.set(key, p);
    }
    const selected = new Set([...cells.values()].map(p => p.index));
    // Heel/toe roll can make an edge that sits above the neutral sole become
    // the lowest visible point. Include the complete boot's convex boundary,
    // separated by the controlling joint so toe flex keeps its own boundary.
    skinGroups.forEach(group => {
      const unique = new Map();
      group.forEach(p => unique.set(`${p.x}:${p.y}:${p.z}`, p));
      const points = [...unique.values()].map(p => Object.assign(new THREE.Vector3(p.x, p.y, p.z), { sourceIndex: p.index }));
      if (points.length < 4) { points.forEach(p => selected.add(p.sourceIndex)); return; }
      const hull = new ConvexHull().setFromPoints(points);
      if (!hull.faces.length) { points.forEach(p => selected.add(p.sourceIndex)); return; }
      hull.faces.forEach(face => {
        let edge = face.edge;
        do { selected.add(edge.head().point.sourceIndex); edge = edge.next; } while (edge !== face.edge);
      });
    });
    selected.forEach(index => probes.push({ mesh, index }));
  });
  return probes;
}

export function createBootGroundConstraint(scene, groupRef) {
  const find = suffix => {
    let result = null;
    scene.traverse(bone => { if (bone.isBone && new RegExp(`${suffix}$`, 'i').test(bone.name)) result = bone; });
    return result;
  };
  const legs = ['Left', 'Right'].map(side => ({
    side: side.toLowerCase(), upper: find(`${side}UpLeg`), lower: find(`${side}Leg`), foot: find(`${side}Foot`), toe: find(`${side}ToeBase`),
    probes: collectSoleProbes(scene, side), changed: false,
    pose: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
    clearance: null, correction: 0,
    planted: false, weight: 0, age: 0, anchor: new THREE.Vector3(),
    settleFrom: new THREE.Vector3(), settleTo: new THREE.Vector3(), scrambleTarget: new THREE.Vector3(),
  })).filter(leg => leg.upper && leg.lower && leg.foot && leg.probes.length);
  legs.forEach(leg=>{
    const skeleton=leg.probes[0].mesh.skeleton;
    const bind=skeleton.boneInverses[skeleton.bones.indexOf(leg.foot)];
    if(bind){leg.bindRotation=new THREE.Quaternion();bind.clone().invert().decompose(new THREE.Vector3(),leg.bindRotation,new THREE.Vector3());}
  });
  const point = new THREE.Vector3(), query = new THREE.Vector3(), target = new THREE.Vector3(), root = new THREE.Vector3();
  const forward = new THREE.Vector3(), q = new THREE.Quaternion();
  const right = new THREE.Vector3();
  const footWorldRotation=new THREE.Quaternion(),surfaceRotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion();
  const tangent=new THREE.Vector3(),surfaceRight=new THREE.Vector3(),surfaceBasis=new THREE.Matrix4();
  const hip = new THREE.Vector3(), knee = new THREE.Vector3(), ankle = new THREE.Vector3();
  let pelvisOffset = 0;
  let appliedPelvisOffset = 0;
  let quietAge = 0;
  let quietSince = null;
  let lastUpdateAt = null;
  let standingPlan = null;
  const lastRoot = new THREE.Vector3();
  let hasRoot = false;
  let terrain = null;
  const restorePose = () => {
    // Whole-body grounding must sample the authored pose next frame. Leaving
    // this visual drop applied makes it lift the body back against the legs.
    if (groupRef.current && appliedPelvisOffset) groupRef.current.position.y += appliedPelvisOffset;
    appliedPelvisOffset = 0;
    legs.forEach(leg => {
      if (leg.changed) [leg.upper, leg.lower, leg.foot].forEach((bone, i) => bone.quaternion.copy(leg.pose[i]));
      leg.changed = false;
    });
  };
  const saveLegPose = leg => {
    if (leg.changed) return;
    [leg.upper, leg.lower, leg.foot].forEach((bone, i) => leg.pose[i].copy(bone.quaternion));
    leg.changed = true;
  };
  const fitFootOrientation = (leg, normal, amount) => {
    if (!leg.toe || !leg.bindRotation) return;
    tangent.copy(forward).addScaledVector(normal, -forward.dot(normal)).normalize();
    surfaceRight.crossVectors(normal, tangent).normalize();
    surfaceBasis.makeBasis(surfaceRight, normal, tangent);
    surfaceRotation.setFromRotationMatrix(surfaceBasis).multiply(leg.bindRotation);
    leg.foot.getWorldQuaternion(footWorldRotation); footWorldRotation.slerp(surfaceRotation, amount);
    saveLegPose(leg); leg.foot.parent.getWorldQuaternion(parentRotation);
    leg.foot.quaternion.copy(parentRotation.invert().multiply(footWorldRotation));
    leg.foot.updateWorldMatrix(false, true);
  };
  const readClearance = (leg, adapter, floorAt, supportAt, visualAt, offsetX = 0, offsetZ = 0) => {
    let minimum = Infinity;
    leg.probes.forEach(({ mesh, index }) => {
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
      point.x += offsetX; point.z += offsetZ;
      query.copy(point); query.y = Math.max(root.y, point.y) + 0.05;
      const rendered = floorAt?.(point.x, point.z) ?? sampleHeightfieldSurface(terrain?.geometry, point.x, point.z);
      const ground = !supportAt || rendered == null ? adapter?.groundInfo(query, { supportRadius: 0 }) : null;
      let y = rendered ?? (ground?.terrainY !== undefined ? ground.terrainY - 0.015 : ground?.y ?? point.y);
      const support = supportAt ? supportAt(query) : SUPPORT_SOURCES.test(ground?.source || '') ? ground.y - 0.015 : null;
      if (support != null) y = Math.max(y, support);
      const rock = visualAt?.heightAt(point.x, point.z);
      if (rock != null) y = Math.max(y, rock);
      minimum = Math.min(minimum, point.y - y);
    });
    return minimum;
  };
  return {
    restorePose,
    update({ enabled, motion, adapter, zoneId, floorAt, delta = 1 / 60, phase = 0, profile = null, now = null }) {
      const group = groupRef.current;
      const time = now ?? performance.now() / 1000;
      if (lastUpdateAt !== null) delta = THREE.MathUtils.clamp(time - lastUpdateAt, 0.001, 0.05);
      lastUpdateAt = time;
      if (!enabled || !group || (!adapter && !floorAt) || motion.airborne || motion.swimming || motion.sitting || motion.lying || (!motion.rockScramble && motion.climbMotion) || motion.traverseMotion || motion.rollMotion
        || (!motion.rockScramble && UNSUPPORTED_ACTION.test(motion.action || ''))) {
        legs.forEach(leg => { leg.clearance = null; leg.correction = 0; leg.planted = false; leg.weight = 0; });
        pelvisOffset = 0;
        quietAge = 0;
        quietSince = null;
        standingPlan = null;
        return;
      }
      group.getWorldPosition(root); group.getWorldQuaternion(q);
      if (hasRoot && Math.hypot(root.x-lastRoot.x,root.z-lastRoot.z)>0.6) {
        quietAge=0;quietSince=null;standingPlan=null;pelvisOffset=0;
        legs.forEach(leg=>{leg.planted=false;leg.weight=0;});
      }
      lastRoot.copy(root);hasRoot=true;
      forward.set(0, 0, 1).applyQuaternion(q);
      forward.y = 0;forward.normalize();right.set(forward.z,0,-forward.x);
      const source = `terrain:${zoneId}:heightfield`;
      if (!terrain?.parent || terrain.userData.renderSource !== source) {
        terrain = null;
        let world = group;
        while (world.parent) world = world.parent;
        world.traverse(object => { if (object.isMesh && object.userData?.renderSource === source) terrain = object; });
      }
      const still = !motion.crouching && (motion.speed || 0) < 0.45 && (!motion.action || /^(stopWalking|runToStop)$/.test(motion.action));
      const reach = motion.fieldReach;
      // In the gather source the left boot bears weight as the right leg
      // folds back. Leave that rear leg free to follow the authored kneel.
      const kneeling = reach?.groundStudy && motion.action === reach.clip
        && time >= reach.startedAt + reach.groundStudy.leadIn + 0.14;
      if (still && !motion.action) {
        quietSince ??= time;
        quietAge = Math.max(0, time - quietSince);
      } else {
        quietSince = null; quietAge = 0;
      }
      if (!still || motion.action) standingPlan = null;
      if (quietAge >= 0.22 && !standingPlan) {
        const bounds = {minX:root.x-1,maxX:root.x+1,minZ:root.z-1,maxZ:root.z+1};
        const visual = createVisualFootSurfaceSampler(zoneId,bounds,root.y+0.85);
        const supports = adapter?.createFootSurfaceSampler?.(bounds,visual.ids);
        standingPlan = planStandingFeet(root,forward,right,(x,z)=>{
          query.set(x,root.y+0.2,z);
          const ground=adapter?.groundInfo(query,{supportRadius:0});
          const floor=floorAt?.(x,z)??sampleHeightfieldSurface(terrain?.geometry,x,z)??(ground?.terrainY??ground?.y??root.y)-0.015;
          return {y:Math.max(floor,visual.heightAt(x,z)??-Infinity,supports?.(query)??-Infinity),loose:ground?.source==='loose-rock'};
        });
        legs.forEach(leg=>{
          leg.foot.getWorldPosition(leg.settleFrom);
          const home=standingPlan[leg.side];
          leg.settleTo.set(home.x,leg.settleFrom.y,home.z);
        });
      }
      let pelvisTarget = 0;
      let scrambleCeiling = Infinity;
      legs.forEach(leg => {
        leg.foot.getWorldPosition(query);
        const bounds = { minX: query.x - 0.75, maxX: query.x + 0.75, minZ: query.z - 0.75, maxZ: query.z + 0.75 };
        const supportCeiling = Math.max(root.y, motion.rockScramble?.end.y ?? -Infinity) + 0.85;
        leg.visualAt = createVisualFootSurfaceSampler(zoneId, bounds, supportCeiling);
        leg.supportAt = adapter?.createFootSurfaceSampler?.(bounds, leg.visualAt.ids);
        if (standingPlan) {
          const start = leg.side === 'left' ? 0.22 : 0.54;
          fitFootOrientation(leg, standingPlan[leg.side].normal, THREE.MathUtils.smoothstep(quietAge, start, start + 0.3));
        }
        if (motion.rockScramble) {
          const step = motion.rockScramble.feet?.[leg.side];
          if (step) {
            const heightAt = (x,z) => Math.max(floorAt?.(x,z) ?? sampleHeightfieldSurface(terrain?.geometry,x,z) ?? adapter?.groundInfo({x,y:root.y+0.8,z},{supportRadius:0}).terrainY ?? root.y,
              leg.visualAt.heightAt(x,z) ?? -Infinity);
            const x=step.target.x,z=step.target.z;
            const dx=(heightAt(x+0.08,z)-heightAt(x-0.08,z))/0.16;
            const dz=(heightAt(x,z+0.08)-heightAt(x,z-0.08))/0.16;
            const scale=Math.min(1,Math.tan(0.4)/Math.max(0.001,Math.hypot(dx,dz)));
            point.set(-dx*scale,1,-dz*scale).normalize();
            fitFootOrientation(leg,point,0.9);
          }
          leg.foot.getWorldPosition(ankle);
          leg.scrambleTarget.copy(step?.target || ankle);
          const gap = readClearance(leg, adapter, floorAt, leg.supportAt, leg.visualAt,
            leg.scrambleTarget.x - ankle.x, leg.scrambleTarget.z - ankle.z);
          leg.scrambleFloor = ankle.y - gap + CLEARANCE;
          leg.scrambleStance = step?.planted;
          leg.scrambleTarget.y = leg.scrambleStance ? leg.scrambleFloor : Math.max(leg.scrambleTarget.y, leg.scrambleFloor);
          leg.upper.getWorldPosition(hip); leg.lower.getWorldPosition(knee); leg.foot.getWorldPosition(ankle);
          const thigh = hip.distanceTo(knee), shin = knee.distanceTo(ankle);
          const minimumReach = Math.sqrt(thigh * thigh + shin * shin + 2 * thigh * shin * Math.cos(2.2));
          const horizontal = Math.hypot(hip.x - leg.scrambleTarget.x, hip.z - leg.scrambleTarget.z);
          leg.scrambleVertical = Math.max(0.2, Math.sqrt(Math.max(0, minimumReach * minimumReach - horizontal * horizontal)));
          leg.scrambleHipY = hip.y;
          if (leg.scrambleStance) {
            const length = thigh + shin - 0.006;
            const reach = Math.sqrt(Math.max(0, length * length - horizontal * horizontal));
            scrambleCeiling = Math.min(scrambleCeiling, leg.scrambleTarget.y + reach - hip.y);
          }
        }
        if (!still) return;
        const gap = readClearance(leg, adapter, floorAt, leg.supportAt, leg.visualAt);
        if (gap < 0.02 && !standingPlan) return;
        leg.upper.getWorldPosition(hip); leg.lower.getWorldPosition(knee); leg.foot.getWorldPosition(ankle);
        const length = hip.distanceTo(knee) + knee.distanceTo(ankle) - 0.008;
        target.copy(ankle); target.y -= Math.max(0, gap - CLEARANCE);
        if (standingPlan) {
          const home=standingPlan[leg.side];
          // Fit the actual, oriented boot at its destination, rather than
          // estimating ankle height from a single height under its center.
          const destinationGap=readClearance(leg,adapter,floorAt,leg.supportAt,leg.visualAt,home.x-ankle.x,home.z-ankle.z);
          target.set(home.x,ankle.y-destinationGap+CLEARANCE,home.z);
          if(target.y>=ankle.y)return;
        }
        const horizontal = Math.hypot(hip.x - target.x, hip.z - target.z);
        const reach = Math.sqrt(Math.max(0, length * length - horizontal * horizontal));
        pelvisTarget = Math.max(pelvisTarget, hip.y - target.y - reach);
      });
      pelvisOffset = THREE.MathUtils.damp(pelvisOffset, Math.min(standingPlan ? 0.38 : 0.14, pelvisTarget), 12, delta);
      let bodyOffset = -pelvisOffset;
      if (motion.rockScramble) {
        bodyOffset = Math.min(bodyOffset, scrambleCeiling);
        for (const leg of legs) {
          // Once the swing can meet the rock, its extra arc cannot lift the
          // other boot off the ground. Let the leading sole take the load.
          if (!leg.scrambleStance) {
            const swingCeiling = leg.scrambleHipY + scrambleCeiling - leg.scrambleVertical;
            leg.scrambleTarget.y = Math.max(leg.scrambleFloor, Math.min(leg.scrambleTarget.y, swingCeiling));
          }
          bodyOffset = Math.max(bodyOffset, leg.scrambleTarget.y + leg.scrambleVertical - leg.scrambleHipY);
        }
      }
      group.position.y += bodyOffset;
      appliedPelvisOffset = -bodyOffset;
      group.getWorldPosition(root);
      legs.forEach(leg => {
        const { visualAt, supportAt } = leg;
        const savePose = () => saveLegPose(leg);
        if (motion.rockScramble) solveLegPlant(leg.upper, leg.lower, leg.foot, leg.scrambleTarget, forward, true);
        leg.correction = 0;
        const gap = readClearance(leg, adapter, floorAt, supportAt, visualAt);
        const pulse = profile ? footPhasePulse(phase, profile[leg.side], profile.width, profile.cycles || 1) : 0;
        const stance = !motion.rockScramble && (still || (kneeling && leg.side === 'left')
          || (profile && (leg.planted ? pulse > 0.12 : pulse > 0.4)));
        if (stance && !leg.planted && (gap < 0.4 || standingPlan)) {
          leg.foot.getWorldPosition(leg.anchor); leg.planted = true; leg.age = 0;
        }
        // Let the authored stop finish drawing the feet underneath the hips.
        // Capturing its first raised ankle forever leaves a frozen half-step.
        if (still && quietAge < 0.22) leg.foot.getWorldPosition(leg.anchor);
        let settleLift=0;
        if (standingPlan) {
          const start=leg.side==='left'?0.22:0.54;
          const settle=THREE.MathUtils.smoothstep(quietAge,start,start+0.3);
          leg.anchor.copy(leg.settleFrom).lerp(leg.settleTo,settle);
          settleLift=Math.sin(Math.PI*settle)*Math.min(0.06,leg.settleFrom.distanceTo(leg.settleTo)*0.25);
        }
        leg.foot.getWorldPosition(target);
        if (!stance || (!standingPlan && Math.hypot(target.x - leg.anchor.x, target.z - leg.anchor.z) > 0.3)) leg.planted = false;
        leg.weight = THREE.MathUtils.damp(leg.weight, leg.planted ? 1 : 0, still ? 14 : 32, delta);
        if (leg.planted) leg.age += delta;
        // A loaded foot must arrive at the surface, not merely avoid passing
        // through it. Finish the last step when stopping; keep the swing free.
        if (leg.weight > 0.02) {
          savePose();
          target.x = THREE.MathUtils.lerp(target.x, leg.anchor.x, leg.weight);
          target.z = THREE.MathUtils.lerp(target.z, leg.anchor.z, leg.weight);
          target.y -= THREE.MathUtils.clamp(gap-CLEARANCE-settleLift,-0.06,0.4)*leg.weight;
          solveLegPlant(leg.upper, leg.lower, leg.foot, target, forward, Boolean(motion.rockScramble));
          // Horizontal settling can cross a facet boundary. Refit the sole
          // at its destination before enforcing the independent floor barrier.
          for(let pass=0;pass<2;pass++) {
            const clearance=readClearance(leg,adapter,floorAt,supportAt,visualAt);
            if(clearance<=CLEARANCE+settleLift+0.001)break;
            leg.foot.getWorldPosition(target);target.y-=Math.min(0.16,clearance-CLEARANCE-settleLift)*leg.weight;
            solveLegPlant(leg.upper,leg.lower,leg.foot,target,forward,Boolean(motion.rockScramble));
          }
        }
        for (let pass = 0; pass < 4; pass += 1) {
          const gap = readClearance(leg, adapter, floorAt, supportAt, visualAt);
          if (gap >= CLEARANCE - 0.0005) break;
          savePose();
          const lift = CLEARANCE - gap + 0.001;
          leg.foot.getWorldPosition(target); target.y += lift;
          solveLegPlant(leg.upper, leg.lower, leg.foot, target, forward, Boolean(motion.rockScramble));
          leg.correction += lift;
        }
        leg.clearance = readClearance(leg, adapter, floorAt, supportAt, visualAt);
      });
    },
    debug: () => legs.map(leg => ({ side: leg.side, clearance: leg.clearance, correction: leg.correction, probes: leg.probes.length, planted: leg.planted, weight: leg.weight, anchor: leg.anchor.toArray() })),
    dispose: restorePose,
  };
}
