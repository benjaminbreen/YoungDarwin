import { interactionGroups } from '@react-three/rapier';

// Rapier interaction groups. Colliders default to every membership and every
// filter, so only the loose-rock roles and the player need explicit groups.
const ROCK_CATCHER = 5;
const LOOSE_ROCK = 6;
const ALL_BITS = Array.from({ length: 16 }, (_, bit) => bit);
const PLAYER_FILTER = ALL_BITS.filter(bit => bit !== ROCK_CATCHER && bit !== LOOSE_ROCK);

// Walk-over rocks have no Rapier collider for the player (analytic step-over
// support carries him). Near loose rocks they get a catcher collider that
// only loose rocks touch, so a rolling stone stops against a visible rock
// instead of passing through it.
export const ROCK_CATCHER_GROUPS = interactionGroups(ROCK_CATCHER, LOOSE_ROCK);
// Loose rocks meet the terrain, props, obstacles and each other, but never
// Darwin's capsule: he walks over them on analytic support and moves them
// only through explicit forces (his weight, a deliberate push).
export const LOOSE_ROCK_GROUPS = interactionGroups(LOOSE_ROCK);
export const PLAYER_COLLIDER_GROUPS = interactionGroups(0, PLAYER_FILTER);
// The character controller's query ignores catchers and loose rocks.
export const PLAYER_QUERY_GROUPS = interactionGroups(0, PLAYER_FILTER);
