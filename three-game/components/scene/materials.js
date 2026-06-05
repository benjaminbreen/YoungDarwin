import * as THREE from 'three';

const gradientCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

export function getToonGradient() {
  if (!gradientCanvas) return null;
  gradientCanvas.width = 4;
  gradientCanvas.height = 1;
  const context = gradientCanvas.getContext('2d');
  context.fillStyle = '#2f2f2f';
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = '#777777';
  context.fillRect(1, 0, 1, 1);
  context.fillStyle = '#cfcfcf';
  context.fillRect(2, 0, 1, 1);
  context.fillStyle = '#ffffff';
  context.fillRect(3, 0, 1, 1);
  const texture = new THREE.CanvasTexture(gradientCanvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function toonMaterial(color, options = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradient(),
    ...options,
  });
}

export function addRimLight(material, {
  color = '#fff4bf',
  intensity = 0.34,
  power = 2.1,
} = {}) {
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = { value: new THREE.Color(color) };
    shader.uniforms.rimIntensity = { value: intensity };
    shader.uniforms.rimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 rimColor;
        uniform float rimIntensity;
        uniform float rimPower;`,
      )
      .replace(
        '#include <output_fragment>',
        `float rim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), rimPower);
        outgoingLight += rimColor * rim * rimIntensity;
        #include <output_fragment>`,
      );
  };
  material.needsUpdate = true;
  return material;
}
