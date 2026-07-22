import * as THREE from 'three';

// A tiny mutable runtime channel shared by the player material and footprint
// renderer. It deliberately stays out of Zustand: this changes every frame but
// never needs to trigger React renders or survive an expedition reload.
const bootWetness = {
  amount: 0,
  wetHeight: 0.27,
};

export function getBootWetness() {
  return bootWetness;
}
export function updateBootWetness({
  delta = 0,
  wadeDepth = 0,
  swimming = false,
  rainIntensity = 0,
} = {}) {
  const dt = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.1);
  const depth = Math.max(0, Number(wadeDepth) || 0);
  const rain = THREE.MathUtils.clamp(Number(rainIntensity) || 0, 0, 1);
  const inWater = swimming || depth > 0.035;

  if (inWater) {
    const target = swimming ? 1 : THREE.MathUtils.clamp(0.55 + depth * 0.9, 0.58, 1);
    bootWetness.amount = THREE.MathUtils.damp(bootWetness.amount, target, 9, dt);
    bootWetness.wetHeight = Math.max(
      bootWetness.wetHeight,
      THREE.MathUtils.clamp(0.25 + (swimming ? 0.72 : depth), 0.27, 0.96),
    );
    return bootWetness;
  }

  // Rain keeps a low, persistent dampness; water picked up while wading dries
  // over roughly twenty seconds and is also shed by each subsequent footfall.
  const rainFloor = rain * 0.42;
  if (bootWetness.amount < rainFloor) {
    bootWetness.amount = THREE.MathUtils.damp(bootWetness.amount, rainFloor, 1.35, dt);
  } else {
    bootWetness.amount = rainFloor
      + (bootWetness.amount - rainFloor) * Math.exp(-dt / 19);
  }
  if (bootWetness.amount < 0.015) {
    bootWetness.amount = 0;
    bootWetness.wetHeight = 0.27;
  }
  return bootWetness;
}

export function shedBootWetness(intensity = 0.5) {
  const pressure = THREE.MathUtils.clamp(Number(intensity) || 0, 0, 1);
  bootWetness.amount = Math.max(0, bootWetness.amount - (0.045 + pressure * 0.025));
  if (bootWetness.amount < 0.015) {
    bootWetness.amount = 0;
    bootWetness.wetHeight = 0.27;
  }
  return bootWetness.amount;
}
