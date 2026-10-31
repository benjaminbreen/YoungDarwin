'use client';

import React from 'react';
import { Beam, Block, Cyl, hash } from './primitives';

// A common wooden hand-press of the eighteenth-century pattern, built as
// Moxon describes it: two upright cheeks pegged into feet and capped, a
// heavy head carrying the iron screw, the till and hose guiding the platen,
// and a carriage that runs out along the ribs on the rounce so the forme can
// be inked and the sheet laid on the tympan.
//
// Local axes: the ribs run along +x (the carriage runs out toward -x, where
// the pressman inks and lays on); the cheeks stand at ±z. Origin is the floor
// under the platen. Overall footprint ~3.3 m x 1.2 m, inside the
// 'common-press' collider.

const CHEEK_Z = 0.36;
const CHEEK_H = 1.98;
const RIB_Y = 0.66;

function Pegs({ positions, material }) {
  return positions.map((p, i) => (
    <Cyl key={i} r={0.014} h={0.03} segments={6} material={material} position={p} rotation={[Math.PI / 2, 0, 0]} />
  ));
}

export function PrintingPress({ materials, ...props }) {
  const wood = materials.pressWood;
  const inked = materials.inkedWood;
  const iron = materials.iron;
  const pegs = [];
  for (const z of [-CHEEK_Z - 0.071, CHEEK_Z + 0.071]) {
    for (const y of [0.2, 0.55, 1.42, 1.68, 1.9]) pegs.push([0.06, y, z]);
  }
  return (
    <group name="CommonPress" {...props}>
      {/* Feet: two sills under the cheeks, and the cross-sill between them. */}
      {[-CHEEK_Z, CHEEK_Z].map(z => (
        <Beam key={`foot${z}`} size={[1.3, 0.15, 0.2]} material={wood} position={[0.0, 0.075, z]} />
      ))}
      <Beam size={[0.18, 0.12, CHEEK_Z * 2 + 0.2]} material={wood} position={[-0.55, 0.06, 0]} />
      <Beam size={[0.18, 0.12, CHEEK_Z * 2 + 0.2]} material={wood} position={[0.55, 0.06, 0]} />
      {/* Cheeks. */}
      {[-CHEEK_Z, CHEEK_Z].map(z => (
        <Beam key={`cheek${z}`} size={[0.24, CHEEK_H, 0.14]} material={wood} position={[0, CHEEK_H / 2 + 0.1, z]} tile={1.4} />
      ))}
      {/* Cap, with a moulded lip. */}
      <Beam size={[0.34, 0.12, CHEEK_Z * 2 + 0.3]} material={wood} position={[0, CHEEK_H + 0.16, 0]} />
      <Beam size={[0.3, 0.05, CHEEK_Z * 2 + 0.22]} material={wood} position={[0, CHEEK_H + 0.08, 0]} />
      {/* Head: the heavy beam that takes the thrust of the screw. */}
      <Beam size={[0.3, 0.32, CHEEK_Z * 2 - 0.14]} material={wood} position={[0, 1.6, 0]} />
      {/* Iron head-plate and the nut. */}
      <Block size={[0.2, 0.02, 0.2]} material={iron} position={[0, 1.43, 0]} />
      {/* Till: the shelf the hose passes through. */}
      <Beam size={[0.32, 0.06, CHEEK_Z * 2 - 0.14]} material={wood} position={[0, 1.12, 0]} />
      {/* Winter: the cross-beam under the ribs. */}
      <Beam size={[0.3, 0.22, CHEEK_Z * 2 - 0.14]} material={wood} position={[0, 0.48, 0]} />
      <Pegs positions={pegs} material={inked} />
      {/* Spindle (iron screw) from the head down through the hose. */}
      <Cyl r={0.04} h={0.42} segments={10} material={iron} position={[0, 1.27, 0]} />
      {/* Thread ridges on the exposed screw. */}
      {[0, 1, 2, 3, 4].map(i => (
        <mesh key={i} position={[0, 1.4 - i * 0.025, 0]} rotation={[Math.PI / 2, 0, i * 0.4]} material={iron} castShadow>
          <torusGeometry args={[0.042, 0.006, 4, 12]} />
        </mesh>
      ))}
      {/* The eye of the spindle and the bar, swung out toward the pressman. */}
      <Cyl r={0.055} h={0.08} segments={10} material={iron} position={[0, 1.24, 0]} />
      <group position={[0, 1.24, 0]} rotation={[0, -0.95, 0]}>
        <Cyl r={0.019} h={0.92} segments={8} material={iron} position={[0.46, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
        {/* The bar cranks down toward its wooden handle. */}
        <group position={[0.92, 0, 0]} rotation={[0, 0, -0.5]}>
          <Cyl r={0.019} h={0.16} segments={8} material={iron} position={[0.07, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
          <Cyl r={0.032} h={0.3} segments={10} material={materials.timberRound} position={[0.28, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
        </group>
      </group>
      {/* Hose: the square wooden box guiding the platen. */}
      <Beam size={[0.18, 0.2, 0.18]} material={wood} position={[0, 1.0, 0]} />
      {/* Hooks and cords hanging the platen from the hose. */}
      {[[-0.16, -0.12], [0.16, -0.12], [-0.16, 0.12], [0.16, 0.12]].map(([x, z]) => (
        <Cyl key={`${x}${z}`} r={0.006} h={0.16} segments={4} material={iron} position={[x * 0.8, 0.9, z * 0.9]} rotation={[z * 0.6, 0, -x * 0.6]} />
      ))}
      {/* Platen: iron plate, worn bright at the edges. */}
      <Block size={[0.46, 0.035, 0.36]} material={iron} position={[0, 0.84, 0]} />
      <Block size={[0.5, 0.012, 0.4]} material={materials.typeMetal} position={[0, 0.818, 0]} />
      {/* Ribs: the rails the carriage runs on, out to both ends. */}
      {[-0.17, 0.17].map(z => (
        <Beam key={`rib${z}`} size={[3.2, 0.07, 0.07]} material={wood} position={[0.5, RIB_Y, z]} tile={1.6} />
      ))}
      {/* Iron cramps along the ribs. */}
      {[-0.9, -0.4, 0.6, 1.2, 1.8].map(x => [-0.17, 0.17].map(z => (
        <Block key={`cramp${x}${z}`} size={[0.04, 0.012, 0.075]} material={iron} position={[x, RIB_Y + 0.04, z]} />
      )))}
      {/* Front stay and back rail supporting the rib ends. */}
      <Beam size={[0.1, RIB_Y - 0.035, 0.1]} material={wood} position={[-1.02, (RIB_Y - 0.035) / 2, 0]} />
      <Beam size={[0.1, 0.06, 0.48]} material={wood} position={[-1.02, RIB_Y - 0.06, 0]} />
      <Beam size={[0.12, RIB_Y - 0.035, 0.12]} material={wood} position={[2.02, (RIB_Y - 0.035) / 2, 0]} />
      <Beam size={[0.12, 0.08, 0.52]} material={wood} position={[2.02, RIB_Y - 0.07, 0]} />
      {/* Carriage: plank, coffin and stone, run halfway out for inking. */}
      <group position={[-0.45, RIB_Y + 0.035, 0]}>
        <Beam size={[0.92, 0.04, 0.6]} material={wood} position={[0, 0.02, 0]} />
        <Beam size={[0.78, 0.07, 0.52]} material={wood} position={[0, 0.075, 0]} />
        <Block size={[0.66, 0.02, 0.44]} material={materials.ash} position={[0, 0.12, 0]} />
        {/* The locked forme, freshly inked. */}
        <mesh material={materials.forme} position={[0, 0.132, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} receiveShadow>
          <planeGeometry args={[0.44, 0.33]} />
        </mesh>
        {/* Tympan hinged at the outer end, raised; frisket hinged beyond it. */}
        <group position={[-0.46, 0.13, 0]} rotation={[0, 0, -1.05]}>
          <Beam size={[0.62, 0.025, 0.5]} material={wood} position={[-0.31, 0, 0]} />
          <mesh material={materials.paperOld} position={[-0.31, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.56, 0.44]} />
          </mesh>
          <mesh material={materials.sheetPrinted} position={[-0.3, 0.017, 0]} rotation={[-Math.PI / 2, 0, 0.02]}>
            <planeGeometry args={[0.46, 0.34]} />
          </mesh>
          {/* Points that pierce the sheet to register it. */}
          {[-0.1, -0.5].map(x => <Cyl key={x} r={0.004} h={0.03} segments={4} material={iron} position={[x, 0.025, 0]} />)}
          <group position={[-0.62, 0.012, 0]} rotation={[0, 0, -1.25]}>
            {/* Frisket: a thin iron frame with a paper mask. */}
            <Block size={[0.56, 0.012, 0.016]} material={iron} position={[-0.28, 0, -0.22]} />
            <Block size={[0.56, 0.012, 0.016]} material={iron} position={[-0.28, 0, 0.22]} />
            <Block size={[0.016, 0.012, 0.46]} material={iron} position={[-0.56, 0, 0]} />
            <mesh material={materials.paper} position={[-0.28, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.54, 0.42]} />
            </mesh>
          </group>
        </group>
      </group>
      {/* Rounce: the spit and handle that wind the carriage in and out. */}
      <group position={[0.42, RIB_Y - 0.05, 0]}>
        <Cyl r={0.05} h={0.42} segments={10} material={wood} rotation={[Math.PI / 2, 0, 0]} />
        <Cyl r={0.02} h={0.62} segments={6} material={iron} position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]} />
        <group position={[0, 0, 0.42]} rotation={[0, 0, 0.6]}>
          <Beam size={[0.04, 0.24, 0.04]} material={wood} position={[0, 0.12, 0]} />
          <Cyl r={0.022} h={0.12} segments={8} material={materials.timberRound} position={[0, 0.24, 0.06]} rotation={[Math.PI / 2, 0, 0]} />
        </group>
        {/* Girths: the straps that pull the carriage. */}
        <Block size={[1.1, 0.004, 0.035]} material={materials.leather} position={[-0.5, 0.05, 0.08]} />
        <Block size={[1.0, 0.004, 0.035]} material={materials.leather} position={[0.5, 0.05, -0.08]} />
      </group>
      {/* Ink spatter and a wiping rag on the back rail. */}
      <Block size={[0.24, 0.05, 0.16]} material={materials.linen} position={[2.02, RIB_Y - 0.01, 0.08]} rotation={[0.2, 0.3, 0.1]} />
      {/* Drips of ink on the feet, the press's ledger of use. */}
      {Array.from({ length: 14 }, (_, i) => (
        <Block
          key={`drip${i}`}
          size={[0.03 + hash(i, 1) * 0.05, 0.003, 0.02 + hash(i, 2) * 0.06]}
          material={materials.ink}
          position={[-0.6 + hash(i, 3) * 1.2, 0.152, (i % 2 ? 1 : -1) * CHEEK_Z + (hash(i, 4) - 0.5) * 0.12]}
          rotation={[0, hash(i, 5) * 3, 0]}
        />
      ))}
    </group>
  );
}
