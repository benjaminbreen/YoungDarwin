'use client';

import React, { useMemo } from 'react';
import {
  WESTERN_LOWLANDS_CABIN,
  WESTERN_LOWLANDS_DRYING_RACK,
  getWesternLowlandsCabinDependents,
  getWesternLowlandsCabinPieces,
  getWesternLowlandsDryingRackDependents,
  getWesternLowlandsDryingRackPieces,
} from '../../world/westernLowlandsLayout';
import { DestructibleTimberStructure } from './DestructibleTimberStructure';

const SUN_BLEACHED_TIMBER = ['#b7aa94', '#958a79', '#c2b49a', '#81786a'];
const SALT_DARKENED_TIMBER = ['#9d8f79', '#786f61', '#ad9c81', '#696257'];

export function WesternLowlandsCampRuins() {
  const cabinPieces = useMemo(() => getWesternLowlandsCabinPieces(), []);
  const cabinDependents = useMemo(() => getWesternLowlandsCabinDependents(), []);
  const rackPieces = useMemo(() => getWesternLowlandsDryingRackPieces(), []);
  const rackDependents = useMemo(() => getWesternLowlandsDryingRackDependents(), []);

  return (
    <>
      <DestructibleTimberStructure
        structureId="western-lowlands-cabin-remains"
        zoneId="W_LAVA"
        origin={WESTERN_LOWLANDS_CABIN}
        pieces={cabinPieces}
        dependents={cabinDependents}
        timberKind="western-lowlands-cabin-timber"
        timberTones={SUN_BLEACHED_TIMBER}
        releaseForce={930}
        strikeMaxPieces={2}
        shotgunMaxPieces={4}
        renderLabel="Western Lowlands cabin remains (destructible timber)"
      />
      <DestructibleTimberStructure
        structureId="western-lowlands-drying-rack"
        zoneId="W_LAVA"
        origin={WESTERN_LOWLANDS_DRYING_RACK}
        pieces={rackPieces}
        dependents={rackDependents}
        timberKind="western-lowlands-rack-timber"
        timberTones={SALT_DARKENED_TIMBER}
        releaseForce={720}
        strikeMaxPieces={2}
        shotgunMaxPieces={3}
        renderLabel="Western Lowlands drying rack (destructible timber)"
      />
    </>
  );
}
