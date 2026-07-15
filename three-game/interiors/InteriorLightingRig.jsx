'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Sparkles, SpotLight } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getRuntimePlayerPose, useThreeGameStore } from '../store';
import { skyState } from '../world/celestial';
import { fogAtmosphereUniforms } from '../world/fogAtmosphere';
import { computeOutdoorLightRig } from '../world/outdoorLighting';
import { weatherEnv } from '../world/weatherEnvRuntime';

const RECT_NORMAL = new THREE.Vector3(0, 0, -1);
const DUST_AXIS = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const INTERIOR_BASE_OPACITY_KEY = '__interiorBaseOpacity';
const INTERIOR_EXTERIOR_FILL_MATERIALS = new Set([
  'wetgrass',
  'leafnear',
  'leafmiddle',
  'leaffar',
  'basalt',
]);

const PANE_SHAFT_VERTEX = /* glsl */ `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PANE_SHAFT_FRAGMENT = /* glsl */ `
  uniform vec3 beamColor;
  uniform float beamOpacity;
  varying vec3 vLocalPosition;

  void main() {
    float edgeX = 1.0 - smoothstep(0.3, 0.5, abs(vLocalPosition.x));
    float edgeZ = 1.0 - smoothstep(0.3, 0.5, abs(vLocalPosition.z));
    float entryFade = smoothstep(-0.5, -0.34, vLocalPosition.y);
    float distanceFade = 1.0 - smoothstep(0.18, 0.5, vLocalPosition.y);
    float alpha = beamOpacity * edgeX * edgeZ * entryFade * distanceFade;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(beamColor, alpha);
  }
`;

function InteriorFogIsolation({ density = 0.00025 }) {
  const scene = useThree(state => state.scene);
  useFrame(() => {
    if (scene.fog?.isFogExp2) scene.fog.density = density;
    const atmosphere = fogAtmosphereUniforms.uFogAtmo.value;
    atmosphere.x = 0;
    atmosphere.z = 0;
    atmosphere.w = 0;
  });
  return null;
}

function InteriorEnvironmentControl({ lighting }) {
  const scene = useThree(state => state.scene);
  useEffect(() => {
    const previous = scene.environmentIntensity;
    return () => { scene.environmentIntensity = previous; };
  }, [scene]);
  useFrame(() => {
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const dayIntensity = lighting.environmentDay ?? 0.28;
    const nightIntensity = lighting.environmentNight ?? 0.055;
    scene.environmentIntensity = THREE.MathUtils.lerp(
      nightIntensity,
      dayIntensity,
      celestial.daylight,
    ) * (1 - weatherEnv.lightDim * 0.24);
  });
  return null;
}

function InteriorExposureControl({ lighting }) {
  const gl = useThree(state => state.gl);
  const previousRef = useRef(null);
  const exposureRef = useRef(null);
  useEffect(() => {
    previousRef.current = gl.toneMappingExposure;
    exposureRef.current = gl.toneMappingExposure;
    return () => {
      if (previousRef.current != null) gl.toneMappingExposure = previousRef.current;
      exposureRef.current = null;
    };
  }, [gl]);
  useFrame((_, delta) => {
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const target = THREE.MathUtils.lerp(
      lighting.exposureNight ?? 0.53,
      lighting.exposureDay ?? 0.64,
      celestial.daylight,
    );
    exposureRef.current = THREE.MathUtils.damp(
      exposureRef.current ?? gl.toneMappingExposure,
      target,
      lighting.exposureResponse ?? 1.9,
      delta,
    );
    gl.toneMappingExposure = exposureRef.current;
  });
  return null;
}

function InteriorPracticalMaterials({ groupRef, lighting }) {
  const rootRef = useRef(null);
  const rootObjectCountRef = useRef(0);
  const scanElapsedRef = useRef(Infinity);
  const flameMaterialsRef = useRef([]);
  const flameMeshesRef = useRef([]);
  const exteriorMistMaterialsRef = useRef([]);
  const exteriorFillMaterialsRef = useRef([]);
  useFrame(({ clock }, delta) => {
    const root = groupRef.current;
    if (!root) return;
    scanElapsedRef.current += delta;
    const rootChanged = rootRef.current !== root;
    if (rootChanged || scanElapsedRef.current >= 0.25) {
      scanElapsedRef.current = 0;
      let objectCount = 0;
      root.traverse(() => { objectCount += 1; });
      if (rootChanged || rootObjectCountRef.current !== objectCount) {
        rootRef.current = root;
        rootObjectCountRef.current = objectCount;
        const flameMaterials = new Set();
        const flameMeshes = new Set();
        const exteriorMistMaterials = new Map();
        const exteriorFillMaterials = new Set();
        root.traverse(object => {
          const objectName = object.name?.toLowerCase() || '';
          if (lighting.replaceLegacyExteriorGround
            && (objectName.includes('exteriorwetground') || objectName.includes('exteriorwestground'))) {
            object.visible = false;
          }
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            const materialName = material?.name?.toLowerCase() || '';
            if (materialName.includes('lampflame')) {
              flameMaterials.add(material);
              if (object.isMesh) flameMeshes.add(object);
            }
            if (materialName.includes('highlandmist')) {
              const storedBaseOpacity = material.userData?.[INTERIOR_BASE_OPACITY_KEY];
              const baseOpacity = Number.isFinite(storedBaseOpacity)
                ? storedBaseOpacity
                : material.opacity;
              material.userData[INTERIOR_BASE_OPACITY_KEY] = baseOpacity;
              exteriorMistMaterials.set(material, {
                material,
                baseOpacity,
                far: materialName.includes('far'),
              });
            }
            if (materialName.includes('periodbrass')) {
              material.envMapIntensity = 1.45;
              material.needsUpdate = true;
            }
            if (materialName.includes('periodlampglass') || materialName.includes('windowglass')) {
              material.envMapIntensity = 1.18;
              material.needsUpdate = true;
            }
            if (INTERIOR_EXTERIOR_FILL_MATERIALS.has(materialName) && material?.emissive?.isColor) {
              exteriorFillMaterials.add(material);
            }
          }
        });
        flameMaterialsRef.current = [...flameMaterials];
        flameMeshesRef.current = [...flameMeshes];
        exteriorMistMaterialsRef.current = [...exteriorMistMaterials.values()];
        exteriorFillMaterialsRef.current = [...exteriorFillMaterials];
      }
    }

    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const darkness = THREE.MathUtils.clamp(
      celestial.night + weatherEnv.lightDim * 0.24 + weatherEnv.rainIntensity * 0.1,
      0,
      1,
    );
    const activation = THREE.MathUtils.smoothstep(darkness, 0.08, 0.92);
    const dayEmission = lighting.flameDayEmission ?? 0.55;
    const nightEmission = lighting.flameNightEmission ?? 3.6;
    const flicker = 0.96 + Math.sin(clock.elapsedTime * 11.7) * 0.025 + Math.sin(clock.elapsedTime * 23.1) * 0.015;
    const strength = THREE.MathUtils.lerp(dayEmission, nightEmission, activation) * flicker;
    for (const material of flameMaterialsRef.current) {
      material.emissiveIntensity = strength;
      material.toneMapped = true;
    }
    // An orange flame-shaped mesh is conspicuous even with zero emission.
    // Daylight Lawson lamps are extinguished; they appear only once the room
    // is dark enough for their practical lights to matter.
    for (const mesh of flameMeshesRef.current) mesh.visible = activation > 0.075;

    // The shared sky now remains visible beyond one restrained haze veil. Keep
    // the veil only slightly luminous; the former HDR cards clipped windows to
    // white and turned garden silhouettes into flat black cutouts.
    const mistDaylight = celestial.daylight * (1 - weatherEnv.lightDim * 0.18);
    for (const entry of exteriorMistMaterialsRef.current) {
      entry.material.emissiveIntensity = THREE.MathUtils.lerp(
        entry.far ? 0.035 : 0.025,
        entry.far ? 0.24 : 0.14,
        mistDaylight,
      );
      entry.material.opacity = entry.baseOpacity * THREE.MathUtils.lerp(0.3, 0.82, mistDaylight);
    }
    const exteriorFill = THREE.MathUtils.lerp(
      lighting.exteriorFillNight ?? 0.015,
      lighting.exteriorFillDay ?? 0.28,
      mistDaylight,
    ) * (1 - weatherEnv.lightDim * 0.18);
    for (const material of exteriorFillMaterialsRef.current) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = exteriorFill;
    }
  });
  return null;
}

function InteriorAmbientLights({ lighting }) {
  const ambientRef = useRef(null);
  const hemisphereRef = useRef(null);
  useFrame(() => {
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const rig = computeOutdoorLightRig({
      daylight: celestial.daylight,
      golden: celestial.golden,
      elevation: celestial.elevation,
      overcast: weatherEnv.overcast,
      mist: weatherEnv.mistAmount,
      rain: weatherEnv.rainIntensity,
      lightDim: weatherEnv.lightDim,
      moonFraction: celestial.moon_phase.fraction,
    });
    ambientRef.current.intensity = THREE.MathUtils.lerp(
      lighting.ambientNight ?? 0.004,
      lighting.ambientDay ?? 0.03,
      celestial.daylight,
    ) + rig.weatherSoftness * celestial.daylight * 0.006;
    hemisphereRef.current.intensity = THREE.MathUtils.lerp(
      lighting.hemisphereNight ?? 0.012,
      lighting.hemisphereDay ?? 0.105,
      celestial.daylight,
    ) + rig.weatherSoftness * celestial.daylight * 0.014;
  });
  return (
    <>
      <ambientLight ref={ambientRef} color={lighting.ambientColor || '#778288'} intensity={0.02} />
      <hemisphereLight
        ref={hemisphereRef}
        args={[
          lighting.hemisphereSkyColor || '#91abb4',
          lighting.hemisphereGroundColor || '#140b06',
          0.08,
        ]}
      />
    </>
  );
}

function InteriorCharacterBounce({ bounce }) {
  const lightRef = useRef(null);
  const camera = useThree(state => state.camera);
  const cool = useMemo(() => new THREE.Color(bounce.color || '#d2ddd2'), [bounce.color]);
  const warm = useMemo(() => new THREE.Color(bounce.goldenColor || '#e8bd79'), [bounce.goldenColor]);
  const targetColor = useMemo(() => cool.clone(), [cool]);
  const scratch = useMemo(() => ({
    player: new THREE.Vector3(),
    cameraSide: new THREE.Vector3(),
    target: new THREE.Vector3(),
  }), []);

  useFrame((_, delta) => {
    const light = lightRef.current;
    const pose = getRuntimePlayerPose();
    const position = pose?.position;
    if (!light || !position) return;
    const px = Number(position.x);
    const py = Number(position.y);
    const pz = Number(position.z);
    if (![px, py, pz].every(Number.isFinite)) return;

    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    scratch.player.set(px, py, pz);
    scratch.cameraSide.copy(camera.position).sub(scratch.player).setY(0);
    if (scratch.cameraSide.lengthSq() < 0.001) scratch.cameraSide.set(0, 0, 1);
    scratch.cameraSide.normalize();
    scratch.target.copy(scratch.player)
      .addScaledVector(scratch.cameraSide, bounce.cameraOffset ?? 1.15);
    scratch.target.y += bounce.height ?? 1.08;
    light.position.lerp(scratch.target, 1 - Math.exp(-8 * Math.min(delta, 0.05)));

    const weatherDim = THREE.MathUtils.clamp(
      weatherEnv.lightDim * 0.45 + weatherEnv.rainIntensity * 0.12,
      0,
      0.58,
    );
    light.intensity = THREE.MathUtils.lerp(
      bounce.nightIntensity ?? 0.2,
      bounce.dayIntensity ?? 1.8,
      celestial.daylight,
    ) * (1 - weatherDim);
    targetColor.copy(cool).lerp(warm, celestial.golden * 0.48 + celestial.night * 0.72);
    light.color.copy(targetColor);
  });

  return (
    <pointLight
      ref={lightRef}
      color={bounce.color || '#d2ddd2'}
      intensity={bounce.nightIntensity ?? 0.2}
      distance={bounce.distance ?? 3.4}
      decay={bounce.decay ?? 2.15}
      castShadow={false}
    />
  );
}

function applyRectDirection(light, direction) {
  if (!light) return;
  light.quaternion.setFromUnitVectors(RECT_NORMAL, direction);
}

function PortalLight({ portal, worldYaw = 0 }) {
  const direct = portal.direct;
  const shaft = direct?.shaft;
  const panes = shaft?.panes;
  const scene = useThree(state => state.scene);
  const areaRef = useRef(null);
  const bounceRef = useRef(null);
  const spotRef = useRef(null);
  const dustGroupRef = useRef(null);
  const paneShaftGroupRef = useRef(null);
  const volumeMaterialRef = useRef(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const aperture = useMemo(() => new THREE.Vector3(...portal.position), [portal.position]);
  const outward = useMemo(() => new THREE.Vector3(...portal.normal).normalize(), [portal.normal]);
  const inward = useMemo(() => outward.clone().multiplyScalar(-1), [outward]);
  const sun = useMemo(() => new THREE.Vector3(), []);
  const projectorRay = useMemo(() => new THREE.Vector3(), []);
  const dustRay = useMemo(() => new THREE.Vector3(), []);
  const paneAxisWorld = useMemo(
    () => new THREE.Vector3(...(panes?.axis || [1, 0, 0])).normalize(),
    [panes?.axis],
  );
  const paneAxis = useMemo(() => new THREE.Vector3(), []);
  const paneCross = useMemo(() => new THREE.Vector3(), []);
  const paneBasis = useMemo(() => new THREE.Matrix4(), []);
  const cool = useMemo(() => new THREE.Color(portal.color || '#c3d8de'), [portal.color]);
  const warm = useMemo(() => new THREE.Color(portal.goldenColor || '#ffd08a'), [portal.goldenColor]);
  const lightColor = useMemo(() => cool.clone(), [cool]);
  const directColor = useMemo(() => cool.clone(), [cool]);
  const bounceDirection = useMemo(
    () => new THREE.Vector3(...(portal.bounce?.direction || [0, 1, 0])).normalize(),
    [portal.bounce?.direction],
  );
  const paneOffsets = useMemo(() => {
    if (!panes) return [];
    const count = Math.max(1, panes.count ?? 1);
    const spacing = panes.spacing ?? (portal.width / count);
    return Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * spacing);
  }, [panes, portal.width]);
  const paneShaftMaterial = useMemo(() => {
    if (!panes) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        beamColor: { value: new THREE.Color(portal.color || '#c3d8de') },
        beamOpacity: { value: 0 },
      },
      vertexShader: PANE_SHAFT_VERTEX,
      fragmentShader: PANE_SHAFT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      toneMapped: true,
    });
  }, [panes, portal.color]);

  useEffect(() => () => paneShaftMaterial?.dispose(), [paneShaftMaterial]);

  useEffect(() => {
    scene.add(target);
    if (spotRef.current) spotRef.current.target = target;
    applyRectDirection(areaRef.current, inward);
    applyRectDirection(bounceRef.current, bounceDirection);
    return () => scene.remove(target);
  }, [bounceDirection, inward, scene, target]);

  useFrame(() => {
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const rig = computeOutdoorLightRig({
      daylight: celestial.daylight,
      golden: celestial.golden,
      elevation: celestial.elevation,
      overcast: weatherEnv.overcast,
      mist: weatherEnv.mistAmount,
      rain: weatherEnv.rainIntensity,
      lightDim: weatherEnv.lightDim,
      moonFraction: celestial.moon_phase.fraction,
    });
    // Celestial vectors are expressed in world space. Interior portal normals
    // are authored in the house's local frame, so rotate the sun back through
    // the exterior building yaw before testing which windows it can reach.
    sun.set(...celestial.sun).normalize().applyAxisAngle(
      WORLD_UP,
      -(portal.worldYaw ?? worldYaw),
    );
    lightColor.copy(cool).lerp(warm, celestial.golden * 0.88);
    directColor.copy(lightColor).lerp(warm, direct?.warmth ?? 0);

    const facing = Math.max(0, sun.dot(outward));
    const directStrength = direct
      ? celestial.daylight
        * THREE.MathUtils.smoothstep(facing, direct.facingStart ?? 0.04, direct.facingFull ?? 0.32)
        * (0.12 + rig.hardSun * 0.88 + rig.goldenSideLight * 0.35)
        * (1 - weatherEnv.overcast * 0.8)
        * (1 - weatherEnv.rainIntensity * 0.8)
      : 0;

    const diffuseStrength = celestial.daylight
      * (0.46 + rig.weatherSoftness * 0.46)
      * (1 - weatherEnv.lightDim * 0.42)
      + celestial.night * 0.018 * (0.25 + celestial.moon_phase.fraction * 0.75);
    // Cloud cover removes hard-edged direct sun, not the much larger luminous
    // window source. Lawson can opt into a restrained diffuse shaft so cloudy
    // windows still read as light entering the room; clear sun remains the
    // stronger, more oblique component.
    const diffuseShaftStrength = diffuseStrength * (direct?.diffuseShaftShare ?? 0);
    const diffuseProjectorStrength = diffuseStrength * (direct?.diffuseProjectorShare ?? 0);
    const shaftStrength = THREE.MathUtils.clamp(directStrength + diffuseShaftStrength, 0, 1);
    if (areaRef.current) {
      const directContrast = 1 - directStrength * (direct?.diffuseCut ?? 0);
      areaRef.current.intensity = (portal.diffuseIntensity ?? 0.7) * diffuseStrength * directContrast;
      areaRef.current.color.copy(lightColor);
    }

    const spot = spotRef.current;
    if (spot && direct) {
      const sourceDistance = direct.sourceDistance ?? 4;
      const throwDistance = direct.distance ?? 9;
      projectorRay.copy(sun).multiplyScalar(directStrength).addScaledVector(outward, diffuseProjectorStrength);
      if (projectorRay.lengthSq() < 0.0001) projectorRay.copy(outward);
      projectorRay.normalize();
      spot.position.copy(aperture).addScaledVector(projectorRay, sourceDistance);
      target.position.copy(aperture).addScaledVector(projectorRay, -throwDistance * 0.78);
      spot.color.copy(directColor);
      spot.intensity = (direct.intensity ?? 24) * directStrength
        + (direct.diffuseProjectorIntensity ?? 0) * diffuseStrength;
      spot.penumbra = THREE.MathUtils.lerp(
        direct.penumbraClear ?? direct.penumbra ?? 0.34,
        direct.penumbraOvercast ?? Math.max(direct.penumbra ?? 0.34, 0.58),
        rig.weatherSoftness,
      );
      spot.shadow.radius = THREE.MathUtils.lerp(
        direct.shadowRadiusClear ?? direct.shadowRadius ?? 2.2,
        direct.shadowRadiusOvercast ?? direct.shadowRadius ?? 2.2,
        rig.weatherSoftness,
      );
      spot.shadow.needsUpdate = true;

      if (!volumeMaterialRef.current) {
        spot.traverse(object => {
          if (object.isMesh && object.material?.uniforms?.opacity) volumeMaterialRef.current = object.material;
        });
      }
      const opacityUniform = volumeMaterialRef.current?.uniforms?.opacity;
      if (opacityUniform) opacityUniform.value = panes ? 0 : (shaft?.opacity ?? 0) * directStrength;
      const volumeColor = volumeMaterialRef.current?.uniforms?.lightColor?.value;
      if (volumeColor?.copy) volumeColor.copy(directColor);
    }

    if (paneShaftGroupRef.current && paneShaftMaterial && panes) {
      const paneVisibilityThreshold = panes.visibilityThreshold ?? 0.12;
      paneShaftGroupRef.current.visible = shaftStrength > paneVisibilityThreshold;
      dustRay.copy(inward).multiplyScalar(diffuseShaftStrength).addScaledVector(sun, -directStrength);
      if (dustRay.lengthSq() < 0.001) dustRay.copy(inward);
      dustRay.normalize();
      paneShaftGroupRef.current.position.copy(aperture);
      paneAxis.copy(paneAxisWorld).addScaledVector(dustRay, -paneAxisWorld.dot(dustRay));
      if (paneAxis.lengthSq() < 0.001) paneAxis.set(1, 0, 0).addScaledVector(dustRay, -dustRay.x);
      paneAxis.normalize();
      paneCross.crossVectors(paneAxis, dustRay).normalize();
      paneBasis.makeBasis(paneAxis, dustRay, paneCross);
      paneShaftGroupRef.current.quaternion.setFromRotationMatrix(paneBasis);
      paneShaftMaterial.uniforms.beamOpacity.value = (panes.opacity ?? 0.1) * shaftStrength;
      paneShaftMaterial.uniforms.beamColor.value.copy(directColor);
    }

    if (dustGroupRef.current && shaft?.dust && !panes) {
      const dustLength = shaft.dust.length ?? 3.4;
      dustGroupRef.current.visible = directStrength > (shaft.dust.visibilityThreshold ?? 0.16);
      dustRay.copy(sun).multiplyScalar(-1);
      dustGroupRef.current.position.copy(aperture).addScaledVector(dustRay, dustLength * 0.52);
      dustGroupRef.current.quaternion.setFromUnitVectors(DUST_AXIS, dustRay);
    }

    if (bounceRef.current) {
      const bounceStrength = directStrength
        + diffuseStrength * (portal.bounce?.diffuseShare ?? 0);
      bounceRef.current.intensity = (portal.bounce?.intensity ?? 0) * bounceStrength;
      bounceRef.current.color.copy(directColor).lerp(warm, 0.2 + celestial.golden * 0.42);
    }
  });

  const areaPosition = aperture.clone().addScaledVector(inward, portal.inset ?? 0.07);
  const paneLength = panes?.length ?? shaft?.dust?.length ?? 3.4;
  const paneWidth = panes?.width ?? 0.56;
  const paneDepth = panes?.depth ?? portal.height * 0.64;
  const paneDust = panes?.dust === false ? null : shaft?.dust;
  const paneDustCount = paneDust
    ? Math.max(1, Math.round((paneDust.count ?? 72) / Math.max(1, paneOffsets.length)))
    : 0;
  return (
    <group userData={{ renderSource: `interior-portal:${portal.id}`, renderKind: 'interior-light' }}>
      <rectAreaLight
        ref={areaRef}
        position={areaPosition.toArray()}
        width={portal.width}
        height={portal.height}
        color={portal.color || '#c3d8de'}
        intensity={0}
      />
      {direct && (
        <SpotLight
          ref={spotRef}
          position={portal.position}
          intensity={0}
          color={portal.color || '#fff1cf'}
          angle={direct.angle ?? 0.48}
          penumbra={direct.penumbra ?? 0.42}
          distance={direct.distance ?? 9}
          decay={direct.decay ?? 1.45}
          castShadow={direct.castShadow !== false}
          shadow-mapSize-width={direct.shadowMapSize ?? 1024}
          shadow-mapSize-height={direct.shadowMapSize ?? 1024}
          shadow-bias={direct.shadowBias ?? -0.0001}
          volumetric={Boolean(shaft && !panes)}
          opacity={shaft?.opacity ?? 0}
          radiusTop={shaft?.radiusTop ?? 0.08}
          radiusBottom={shaft?.radiusBottom ?? 1.6}
          attenuation={shaft?.attenuation ?? 5}
          anglePower={shaft?.anglePower ?? 7}
        />
      )}
      {portal.bounce && (
        <rectAreaLight
          ref={bounceRef}
          position={portal.bounce.position}
          width={portal.bounce.width}
          height={portal.bounce.height}
          color={portal.goldenColor || '#ffd08a'}
          intensity={0}
        />
      )}
      {panes && paneShaftMaterial && (
        <group ref={paneShaftGroupRef} visible={false}>
          {paneOffsets.map((offset, index) => (
            <group key={`${portal.id}-pane-shaft-${index}`} position={[offset, paneLength * 0.5, 0]}>
              <mesh scale={[paneWidth, paneLength, paneDepth]} material={paneShaftMaterial} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
              </mesh>
              {paneDust && (
                <Sparkles
                  count={paneDustCount}
                  speed={paneDust.speed ?? 0.12}
                  opacity={paneDust.opacity ?? 0.48}
                  size={paneDust.size ?? 0.16}
                  noise={paneDust.noise ?? 0.32}
                  color={paneDust.color || '#ffe2ad'}
                  scale={[paneWidth * 0.72, paneLength * 0.9, paneDepth * 0.72]}
                />
              )}
            </group>
          ))}
        </group>
      )}
      {shaft?.dust && !panes && (
        <group ref={dustGroupRef} visible={false}>
          <Sparkles
            count={shaft.dust.count ?? 72}
            speed={shaft.dust.speed ?? 0.12}
            opacity={shaft.dust.opacity ?? 0.48}
            size={shaft.dust.size ?? 0.16}
            noise={shaft.dust.noise ?? 0.32}
            color={shaft.dust.color || '#ffe2ad'}
            scale={[
              shaft.dust.width ?? portal.width * 0.7,
              shaft.dust.length ?? 3.4,
              shaft.dust.depth ?? portal.height * 0.62,
            ]}
          />
        </group>
      )}
    </group>
  );
}

function PracticalLamp({ lamp, index }) {
  const lightRef = useRef(null);
  useFrame(({ clock }) => {
    const light = lightRef.current;
    if (!light) return;
    const store = useThreeGameStore.getState();
    const celestial = skyState(store.timeOfDay, store.day || 1);
    const darkness = THREE.MathUtils.clamp(
      celestial.night + weatherEnv.lightDim * 0.24 + weatherEnv.rainIntensity * 0.1,
      0,
      1,
    );
    const activation = THREE.MathUtils.smoothstep(darkness, 0.08, 0.92);
    const base = THREE.MathUtils.lerp(
      lamp.dayIntensity ?? 0.3,
      lamp.nightIntensity ?? 6,
      activation,
    );
    const flicker = 0.965
      + Math.sin(clock.elapsedTime * (7.1 + index * 0.43) + index * 1.9) * 0.025
      + Math.sin(clock.elapsedTime * 16.3 + index * 2.7) * 0.01;
    light.intensity = base * flicker;
  });
  return (
    <pointLight
      ref={lightRef}
      position={lamp.position}
      color={lamp.color || '#ff9a49'}
      intensity={lamp.dayIntensity ?? 0.3}
      distance={lamp.distance ?? 5.2}
      decay={lamp.decay ?? 2}
      castShadow={Boolean(lamp.castShadow)}
      shadow-mapSize-width={lamp.shadowMapSize ?? 512}
      shadow-mapSize-height={lamp.shadowMapSize ?? 512}
      shadow-bias={lamp.shadowBias ?? -0.00012}
    />
  );
}

export function InteriorLightingRig({ definition, groupRef }) {
  const lighting = definition.lighting || {};
  return (
    <>
      <InteriorFogIsolation density={lighting.fogDensity} />
      <InteriorEnvironmentControl lighting={lighting} />
      <InteriorExposureControl lighting={lighting} />
      <InteriorAmbientLights lighting={lighting} />
      {lighting.characterBounce?.enabled !== false && lighting.characterBounce && (
        <InteriorCharacterBounce bounce={lighting.characterBounce} />
      )}
      {(lighting.portals || []).map(portal => (
        <PortalLight key={portal.id} portal={portal} worldYaw={lighting.worldYaw || 0} />
      ))}
      {(lighting.lamps || []).map((lamp, index) => (
        <PracticalLamp key={lamp.id || index} lamp={lamp} index={index} />
      ))}
      <InteriorPracticalMaterials groupRef={groupRef} lighting={lighting} />
    </>
  );
}
