'use client';

import React, { useMemo } from 'react';
import { GABRIEL_CAVE_PRESS_ZONE_ID as ZONE } from '../../blueprints/gabrielCave';
import { ceilingAt, wallAnchor, yawFacing } from './anchors';
import { buildSheetGeometry, HangingMesh } from './hanging';
import { PrintingPress } from './PrintingPress';
import { Ball, Beam, Block, Bundle, Candle, Cask, Cyl, hash, Lantern, Lathe, Rope, SheetStack, StaticBatch, useGround } from './primitives';

// The press gallery: the press under its lantern, the compositor's frame of
// type cases, the imposing stone, the ink bench, the paper trough and the
// finished bundles waiting by the eastern crawl. Rough shoring holds up the
// roof above the press, and printed sheets dry on lines strung between it.
// Positions match the fixedColliders in blueprints/gabrielCave.js.

const POSTS = {
  westN: [-2.6, -2.55],
  westS: [-2.6, 2.45],
  eastN: [5.6, -2.75],
  eastS: [5.6, 2.25],
};

function ShoringFrame({ a, b, ground, materials }) {
  const ya = ground(a[0], a[1]);
  const yb = ground(b[0], b[1]);
  const top = Math.min(ceilingAt(ZONE, a[0], a[1]), ceilingAt(ZONE, b[0], b[1]), 3.7) - 0.22;
  const midX = (a[0] + b[0]) / 2;
  const midZ = (a[1] + b[1]) / 2;
  const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const midCeiling = ceilingAt(ZONE, midX, midZ);
  return (
    <group>
      {[[a, ya], [b, yb]].map(([p, y], i) => (
        <group key={i}>
          <Cyl r={0.11} rTop={0.1} h={top - y} segments={9} material={materials.timberRound} position={[p[0], y + (top - y) / 2, p[1]]} rotation={[0.02 * (i ? 1 : -1), i, 0.015]} />
          {/* Flat stone footing. */}
          <Block size={[0.34, 0.06, 0.34]} material={materials.slate} position={[p[0], y + 0.02, p[1]]} rotation={[0, i * 0.7, 0]} />
        </group>
      ))}
      {/* Lintel across the gallery, and packing wedges up to the rock. */}
      <group position={[midX, top + 0.09, midZ]} rotation={[0, yaw, 0]}>
        <Beam size={[0.2, 0.18, span + 0.4]} material={materials.timber} tile={1.4} />
        {[-0.3, 0, 0.3].map(f => {
          const gap = Math.max(0.05, Math.min(midCeiling, top + 0.6) - top - 0.18);
          return <Beam key={f} size={[0.16, gap, 0.12]} material={materials.timber} position={[0, 0.09 + gap / 2, f * span]} />;
        })}
      </group>
    </group>
  );
}

function TypeCaseFrame({ materials, ...props }) {
  // Sloped frame holding two pairs of cases: upper case behind and steeper.
  return (
    <group {...props}>
      {[[-0.92, -0.38], [0.92, -0.38], [-0.92, 0.32], [0.92, 0.32]].map(([x, z], i) => (
        <Beam key={i} size={[0.07, z < 0 ? 1.18 : 0.86, 0.07]} material={materials.timber} position={[x, (z < 0 ? 1.18 : 0.86) / 2, z]} />
      ))}
      <Beam size={[1.92, 0.05, 0.07]} material={materials.timber} position={[0, 0.25, -0.38]} />
      <Beam size={[1.92, 0.05, 0.07]} material={materials.timber} position={[0, 0.25, 0.32]} />
      {/* Bottom shelf with spare cases racked in it. */}
      <Beam size={[1.86, 0.03, 0.66]} material={materials.crateWood} position={[0, 0.28, -0.03]} />
      {[0, 1, 2].map(i => (
        <Beam key={i} size={[0.86, 0.05, 0.5]} material={materials.crateWood} position={[-0.42 + (i % 2) * 0.86, 0.32 + Math.floor(i / 2) * 0.06, -0.05]} />
      ))}
      {/* Sloping case rails. */}
      {[-0.92, 0.92].map(x => (
        <Beam key={x} size={[0.06, 0.06, 0.86]} material={materials.timber} position={[x, 1.0, -0.03]} rotation={[0.42, 0, 0]} />
      ))}
      {/* The cases: upper and lower pair on the slope. */}
      {[-0.46, 0.46].map(x => (
        <group key={x} position={[x, 1.02, -0.03]} rotation={[0.42, 0, 0]}>
          <Beam size={[0.88, 0.04, 0.82]} material={materials.crateWood} position={[0, -0.01, 0]} />
          <mesh material={materials.typeCase} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[0.84, 0.78]} />
          </mesh>
        </group>
      ))}
      {/* Composing stick lying across the lower case, half set. */}
      <group position={[0.3, 0.92, 0.25]} rotation={[0.42, 0.3, 0]}>
        <Block size={[0.24, 0.01, 0.055]} material={materials.brass} position={[0, 0.03, 0]} />
        <Block size={[0.24, 0.035, 0.008]} material={materials.brass} position={[0, 0.045, -0.026]} />
        <Block size={[0.12, 0.022, 0.04]} material={materials.typeMetal} position={[-0.05, 0.047, 0]} />
      </group>
      {/* A shelf on top for the candle and the copy. */}
      <Beam size={[1.9, 0.03, 0.22]} material={materials.timber} position={[0, 1.2, -0.38]} />
      <SheetStack count={4} size={[0.3, 0.22]} materials={materials} seed={4} printed position={[0.45, 1.215, -0.38]} rotation={[0, 0.1, 0]} />
    </group>
  );
}

function ImposingStone({ materials, ...props }) {
  return (
    <group {...props}>
      {/* Coffin: a heavy frame with drawers for quoins and furniture. */}
      {[[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]].map(([x, z], i) => (
        <Beam key={i} size={[0.1, 0.8, 0.1]} material={materials.timber} position={[x, 0.4, z]} />
      ))}
      <Beam size={[1.7, 0.16, 0.92]} material={materials.timber} position={[0, 0.72, 0]} />
      {[-0.42, 0.42].map(x => (
        <group key={x}>
          <Beam size={[0.7, 0.12, 0.02]} material={materials.crateWood} position={[x, 0.72, 0.465]} />
          <Cyl r={0.018} h={0.03} segments={6} material={materials.iron} position={[x, 0.72, 0.485]} rotation={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
      <Beam size={[1.6, 0.04, 0.84]} material={materials.crateWood} position={[0, 0.16, 0]} />
      {/* The stone: a slab of fine basalt, ground flat. */}
      <Block size={[1.62, 0.07, 0.88]} material={materials.slate} position={[0, 0.835, 0]} />
      {/* A chase with a forme locked up, waiting for the press. */}
      <group position={[-0.25, 0.875, 0.04]}>
        <Block size={[0.56, 0.025, 0.42]} material={materials.iron} position={[0, 0.003, 0]} />
        <mesh material={materials.forme} position={[0, 0.017, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.52, 0.38]} />
        </mesh>
      </group>
      {/* Galley of standing type, mallet and planer. */}
      <group position={[0.42, 0.875, 0.12]} rotation={[0, -0.2, 0]}>
        <Block size={[0.32, 0.012, 0.2]} material={materials.brass} position={[0, 0.006, 0]} />
        <Block size={[0.32, 0.03, 0.012]} material={materials.brass} position={[0, 0.02, -0.1]} />
        <Block size={[0.012, 0.03, 0.2]} material={materials.brass} position={[-0.16, 0.02, 0]} />
        <Block size={[0.22, 0.024, 0.13]} material={materials.typeMetal} position={[-0.03, 0.024, -0.02]} />
      </group>
      <group position={[0.2, 0.89, -0.26]} rotation={[0, 0.6, Math.PI / 2]}>
        <Cyl r={0.045} h={0.13} segments={10} material={materials.timberRound} />
        <Cyl r={0.013} h={0.26} segments={6} material={materials.timber} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
      </group>
      <Beam size={[0.22, 0.04, 0.09]} material={materials.timber} position={[-0.6, 0.89, -0.25]} rotation={[0, 0.3, 0]} />
      {Array.from({ length: 5 }, (_, i) => (
        <Beam key={i} size={[0.06, 0.018, 0.025]} material={materials.timber} position={[-0.68 + i * 0.03, 0.88, 0.28 + hash(i, 2) * 0.05]} rotation={[0, hash(i, 1) * 2, 0]} />
      ))}
    </group>
  );
}

function InkBench({ materials, ...props }) {
  return (
    <group {...props}>
      {[[-0.6, -0.27], [0.6, -0.27], [-0.6, 0.27], [0.6, 0.27]].map(([x, z], i) => (
        <Beam key={i} size={[0.08, 0.7, 0.08]} material={materials.timber} position={[x, 0.35, z]} rotation={[0, 0, (x > 0 ? -1 : 1) * 0.04]} />
      ))}
      <Beam size={[1.36, 0.06, 0.66]} material={materials.timber} position={[0, 0.72, 0]} />
      {/* Ink slab, black and glossy where the brayer works. */}
      <Block size={[0.62, 0.05, 0.46]} material={materials.slate} position={[-0.28, 0.775, 0]} />
      <mesh material={materials.ink} position={[-0.28, 0.801, 0.02]} rotation={[-Math.PI / 2, 0, 0.2]}>
        <circleGeometry args={[0.17, 18]} />
      </mesh>
      {/* Ink knife. */}
      <Block size={[0.2, 0.004, 0.03]} material={materials.iron} position={[-0.1, 0.803, -0.15]} rotation={[0, 0.5, 0]} />
      {/* Two ink balls stood in their block, handles down. */}
      <Beam size={[0.3, 0.08, 0.16]} material={materials.timber} position={[0.35, 0.79, 0.1]} />
      {[0.26, 0.44].map((x, i) => (
        <group key={x} position={[x, 0.83, 0.1]} rotation={[0, 0, (i ? -1 : 1) * 0.14]}>
          <Cyl r={0.022} h={0.2} segments={8} material={materials.timberRound} position={[0, 0.1, 0]} />
          <Lathe profile={[[0.0, 0.18], [0.1, 0.19], [0.13, 0.23], [0.12, 0.28], [0.06, 0.31], [0.0, 0.315]]} segments={14} material={materials.leather} />
          <Ball r={0.06} material={materials.ink} scale={[1.6, 0.35, 1.6]} position={[0, 0.305, 0]} />
        </group>
      ))}
      {/* Pots of lampblack and boiled oil. */}
      <Lathe profile={[[0, 0], [0.07, 0.0], [0.09, 0.06], [0.08, 0.12], [0.05, 0.14], [0.06, 0.16], [0, 0.16]]} segments={12} material={materials.clayDark} position={[0.45, 0.75, -0.18]} />
      <Lathe profile={[[0, 0], [0.06, 0.0], [0.065, 0.09], [0.05, 0.1], [0, 0.1]]} segments={12} material={materials.clay} position={[0.2, 0.75, -0.2]} />
      <Ball r={0.06} material={materials.charcoal} scale={[1, 0.3, 1]} position={[0.2, 0.85, -0.2]} />
      {/* A rag soaked black. */}
      <Ball r={0.08} material={materials.inkedWood} scale={[1.3, 0.3, 1]} position={[-0.58, 0.76, 0.24]} />
    </group>
  );
}

function PaperTrough({ materials, ...props }) {
  return (
    <group {...props}>
      {/* A trough adzed from one log, half full of water and soaking paper. */}
      <Beam size={[1.5, 0.08, 0.7]} material={materials.timber} position={[0, 0.04, 0]} />
      <Beam size={[1.5, 0.48, 0.08]} material={materials.timber} position={[0, 0.28, -0.31]} />
      <Beam size={[1.5, 0.48, 0.08]} material={materials.timber} position={[0, 0.28, 0.31]} />
      <Beam size={[0.08, 0.48, 0.54]} material={materials.timber} position={[-0.71, 0.28, 0]} />
      <Beam size={[0.08, 0.48, 0.54]} material={materials.timber} position={[0.71, 0.28, 0]} />
      <Block size={[1.34, 0.01, 0.54]} material={materials.water} position={[0, 0.36, 0]} />
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} material={materials.paper} position={[-0.4 + i * 0.2, 0.358 + i * 0.001, (hash(i, 3) - 0.5) * 0.08]} rotation={[-Math.PI / 2, 0, (hash(i, 1) - 0.5) * 0.5]}>
          <planeGeometry args={[0.38, 0.28]} />
        </mesh>
      ))}
      {/* Damp sheets pressed between boards under a stone. */}
      <Beam size={[0.56, 0.03, 0.42]} material={materials.crateWood} position={[0.35, 0.535, 0]} />
      <SheetStack count={16} size={[0.46, 0.34]} materials={materials} seed={9} position={[0.35, 0.55, 0]} />
      <Beam size={[0.56, 0.03, 0.42]} material={materials.crateWood} position={[0.35, 0.63, 0]} />
      <Ball r={0.14} material={materials.slate} scale={[1.2, 0.6, 1]} position={[0.35, 0.69, 0]} />
      {/* Dry stock laid across the near end. */}
      <SheetStack count={22} size={[0.46, 0.34]} materials={materials} seed={13} position={[-0.38, 0.52, 0]} rotation={[0, 0.06, 0]} />
      {/* Logbook leaves and book endpapers waiting to be used. */}
      <group position={[-0.38, 0.62, 0.02]} rotation={[0, -0.3, 0]}>
        <Block size={[0.24, 0.05, 0.32]} material={materials.leather} />
        <Block size={[0.22, 0.045, 0.3]} material={materials.bookPages} position={[0.012, 0, 0]} />
      </group>
    </group>
  );
}

function PamphletCrates({ materials, ...props }) {
  return (
    <group {...props}>
      <Beam size={[1.0, 0.5, 0.7]} material={materials.crateWood} position={[0, 0.25, -0.35]} />
      <Beam size={[1.0, 0.5, 0.66]} material={materials.crateWood} position={[0.02, 0.25, 0.36]} rotation={[0, 0.05, 0]} />
      {/* Bundles stacked on the crates. */}
      {[[-0.22, -0.4], [0.2, -0.36], [-0.2, 0.32], [0.22, 0.4]].map(([x, z], i) => (
        <Bundle key={i} materials={materials} position={[x, 0.58, z]} rotation={[0, hash(i, 1) * 0.4 - 0.2, 0]} />
      ))}
      {[[-0.05, -0.38], [0.02, 0.34]].map(([x, z], i) => (
        <Bundle key={`top${i}`} materials={materials} position={[x, 0.74, z]} rotation={[0, 0.3 + i, 0]} />
      ))}
      <Bundle materials={materials} position={[0.0, 0.9, -0.36]} rotation={[0, -0.2, 0]} />
      {/* The chalked destinations face the gallery. */}
      <mesh material={materials.chalk} position={[-0.505, 0.27, 0.0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.95, 0.36]} />
      </mesh>
      {/* Tarred twine and a knife. */}
      <Cyl r={0.06} h={0.08} segments={10} material={materials.twine} position={[0.35, 0.54, 0.1]} />
    </group>
  );
}

function Broadside({ anchor, material, size = [0.46, 0.68], tilt = 0, materials }) {
  if (!anchor) return null;
  const [x, y, z] = anchor.position;
  const n = anchor.normal;
  const yaw = yawFacing(n);
  return (
    <group position={[x + n[0] * 0.03, y, z + n[2] * 0.03]} rotation={[0, yaw, tilt]}>
      <mesh material={material} receiveShadow>
        <planeGeometry args={size} />
      </mesh>
      {/* Thorns used as pins at the corners. */}
      {[[-1, 1], [1, 1]].map(([sx, sy]) => (
        <Cyl key={sx} r={0.006} h={0.04} segments={4} material={materials.bark} position={[sx * size[0] * 0.44, sy * size[1] * 0.46, 0.01]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
    </group>
  );
}

export function PressGallery({ materials }) {
  const ground = useGround(ZONE);
  const layout = useMemo(() => {
    const broadsides = [
      { x: -3.0, z: 2.0, material: 'broadsideCatalan', size: [0.5, 0.75], tilt: 0.03 },
      { x: 0.4, z: 2.0, material: 'broadsideSpanish', size: [0.5, 0.75], tilt: -0.02 },
      { x: 3.6, z: 1.6, material: 'broadsideEnglish', size: [0.44, 0.55], tilt: 0.05 },
    ].map(item => ({ ...item, anchor: wallAnchor(ZONE, item.x, 1.6, item.z, [0, 1]) }));
    const lanternCeiling = ceilingAt(ZONE, 0.2, -0.2);
    return { broadsides, lanternCeiling };
  }, []);

  // Lines strung between the shoring posts at head height and above.
  const lineY = 2.45;
  const lines = useMemo(() => [
    { a: [POSTS.westN[0], lineY, POSTS.westN[1] + 0.6], b: [POSTS.eastN[0], lineY, POSTS.eastN[1] + 0.6], sag: 0.025, count: 13 },
    { a: [POSTS.westS[0], lineY, POSTS.westS[1] - 0.5], b: [POSTS.eastS[0], lineY, POSTS.eastS[1] - 0.5], sag: 0.025, count: 13 },
    { a: [POSTS.westN[0], lineY + 0.15, -0.6], b: [POSTS.eastN[0], lineY + 0.15, -0.7], sag: 0.02, count: 12 },
  ], []);

  const pressY = ground(0.2, -0.2);
  const lantern = [0.2, 2.62, -0.2];
  return (
    <>
      <StaticBatch name="PressGalleryFurnishings">
        <PrintingPress materials={materials} position={[0.2, pressY, -0.2]} />
        <TypeCaseFrame materials={materials} position={[-4.6, ground(-4.6, -2.35), -2.35]} rotation={[0, 0.08, 0]} />
        <ImposingStone materials={materials} position={[4.1, ground(4.1, -2.15), -2.15]} rotation={[0, -0.06, 0]} />
        <InkBench materials={materials} position={[-1.9, ground(-1.9, 1.95), 1.95]} rotation={[0, 0.05, 0]} />
        <PaperTrough materials={materials} position={[6.1, ground(6.1, 1.85), 1.85]} rotation={[0, -0.1, 0]} />
        <PamphletCrates materials={materials} position={[8.3, ground(8.3, 1.0), 1.0]} rotation={[0, 0.2 + Math.PI / 2, 0]} />
        <ShoringFrame a={POSTS.westN} b={POSTS.westS} ground={ground} materials={materials} />
        <ShoringFrame a={POSTS.eastN} b={POSTS.eastS} ground={ground} materials={materials} />
        {lines.map((line, i) => (
          <Rope key={i} points={[line.a, line.b]} sag={line.sag} radius={0.007} material={materials.rope} />
        ))}
        {/* The lantern's cord to an iron spike in the roof. */}
        <Rope points={[[lantern[0], lantern[1] + 0.31, lantern[2]], [lantern[0], layout.lanternCeiling, lantern[2]]]} sag={0} radius={0.006} material={materials.rope} />
        {layout.broadsides.map(item => (
          <Broadside key={item.material} anchor={item.anchor} material={materials[item.material]} size={item.size} tilt={item.tilt} materials={materials} />
        ))}
        {/* Spoiled sheets, crumpled on the floor by the press. */}
        {Array.from({ length: 7 }, (_, i) => {
          const x = -1.6 + hash(i, 1) * 2.2;
          const z = 0.7 + hash(i, 2) * 0.9;
          return <Ball key={i} r={0.06 + hash(i, 3) * 0.03} segments={6} material={materials.paper} scale={[1, 0.7, 1.1]} position={[x, ground(x, z) + 0.04, z]} />;
        })}
        {/* A water cask for damping, and a spare forme leaning on the wall. */}
        <Cask height={0.7} radius={0.26} material={materials.crateWood} hoop={materials.iron} position={[-6.2, ground(-6.2, -2.0), -2.0]} />
        <SheetStack count={30} size={[0.5, 0.36]} materials={materials} seed={21} printed position={[7.4, ground(7.4, -1.9) + 0.02, -1.9]} rotation={[0, 0.4, 0]} />
        <SheetStack count={18} size={[0.5, 0.36]} materials={materials} seed={25} printed position={[7.45, ground(7.45, -1.9) + 0.14, -1.85]} rotation={[0, 0.1, 0]} />
      </StaticBatch>
      <HangingMesh name="PressGallery_DryingSheets" build={buildSheetGeometry} lines={lines} seed={3} material={materials.sheetHanging} />
      <Lantern materials={materials} position={lantern} size={1.15} />
      <Candle materials={materials} position={[-5.35, ground(-4.6, -2.35) + 1.215, -2.64]} />
      <Candle materials={materials} position={[4.75, ground(4.1, -2.15) + 0.87, -2.45]} holder="stone" />
    </>
  );
}
