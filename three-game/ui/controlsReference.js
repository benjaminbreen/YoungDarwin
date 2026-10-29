// Single source of truth for the player-facing controls list.
//
// This used to live inline in ThreeHUD's `HotkeysResponse`, reachable only by
// typing "hotkeys" into the narrator composer — a route no first-time player
// finds. The same data now backs that narrator response, the `?`/F1 overlay, and
// the launch menu's Controls screen.
//
// Keep in sync with KEYBOARD_MAP in three-game/input/gameKeys.js.

const DEV_TOOLS_VISIBLE = process.env.NODE_ENV !== 'production';
export const CONTROL_HINT_INACTIVITY_MS = 20000;

const CAMERA_CONTROLS = [
  'Mouse drag: look around (middle-drag pans)',
  'Scroll: zoom',
  'Z / X: turn the camera left / right',
  'Tab: put the camera back behind you',
  'V: switch between the follow camera and first person',
];

const INTERFACE_CONTROLS = polished => [
  'Esc: pause — settings, controls, end expedition',
  '? or F1: show this list',
  ...(polished ? ['H: hide or show the expedition interface'] : []),
];

function animalControlsSections(modeId, polished) {
  const finch = modeId === 'finch';
  return [
    ['Movement', finch ? [
      'WASD / arrows: fly — W climbs, S descends, A / D steer',
      'Shift: fly faster and dive',
      'Space: land or take off',
    ] : [
      'WASD / arrows: walk',
      'Shift: walk faster',
      'Space: brace on steep slopes',
    ]],
    ['Camera', CAMERA_CONTROLS],
    ['Animal Actions', [
      '1 / Eat button: eat',
      '2 / Sleep button: sleep',
      '3 / Defecate button: defecate',
      'F: repeat the selected action',
      ...(finch ? ['Eat / sleep: land before using these actions'] : []),
    ]],
    ['Interface', INTERFACE_CONTROLS(polished)],
  ];
}

export function nextControlHintPhase(playableModeId, progress) {
  if (!progress.moved) return 'move';
  if (!progress.ran) return 'faster';
  if (!progress.jumped) return playableModeId === 'finch' ? 'land' : playableModeId === 'tortoise' ? 'brace' : 'jump';
  if (playableModeId === 'finch' || playableModeId === 'tortoise') {
    if (!progress.animalAction) return 'animalActions';
    if (!progress.camera) return 'camera';
    return 'complete';
  }
  if (!progress.camera) return 'camera';
  if (!progress.fieldAction) return 'fieldAction';
  if (!progress.worldAction) return 'worldAction';
  return 'complete';
}

export function controlsSections({ polished = true, includeNarratorCommands = true, playableModeId = 'darwin' } = {}) {
  if (playableModeId === 'finch' || playableModeId === 'tortoise') {
    return animalControlsSections(playableModeId, polished);
  }

  const sections = [
    ['Movement', [
      'WASD / arrows: move',
      'Shift: run',
      'Space: jump',
      'C: crouch (while running: slide)',
      'Q: climb up or down a wall or boulder',
    ]],
    ['Camera', CAMERA_CONTROLS],
    ['Fieldwork', [
      'E or Enter: the action on screen — examine, collect, speak, pick up, read',
      'Hold E at a region’s edge: travel on',
      '1-6: take a tool in hand',
      'F: use the tool in hand (swing the net, fire, sketch)',
      'Right mouse (hold): aim the shotgun; left click fires',
      'R: halt and rest — two hours, one provision',
      'Hold G: gestures — sit, point, look around, kneel, write, pray',
    ]],
    ['Interface', [
      ...INTERFACE_CONTROLS(polished),
      'Cmd/Ctrl+I: open the specimen case',
    ]],
  ];

  if (includeNarratorCommands) {
    sections.push(['Narrator Commands', [
      'hotkeys / controls / commands: show this list',
      'north / south / east / west, or go north: travel by direction',
      '/move <place>: travel to a known place',
      '/collect <specimen>: collect a named specimen',
      '/use <tool> on <target>: use a tool on something',
      'survey site / look around: record the habitat',
      'document <specimen> / sketch <specimen>: make field notes',
      'rest / sleep / make camp: rest',
      'journal / field book / open journal: open the journal',
      'end game: conclude the expedition and open Henslow’s assessment',
    ]]);
  }

  // These keys only exist in a development build, so documenting them in a
  // deployed one sent testers chasing shortcuts that do nothing.
  if (DEV_TOOLS_VISIBLE) {
    sections.push(['Dev / Debug', [
      '`: performance panel',
      'Alt+0: asset browser (Alt+Shift+0: audio debug)',
      'Alt+6: map geography panel',
      'Alt+7: animal animation lab',
      'Alt+8: Darwin animation lab',
      'Alt+9: ecology overlay',
      'Shift+9: toggle Darwin5 locomotion preview',
    ]]);
  }

  return sections;
}
