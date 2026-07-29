// Single source of truth for the player-facing controls list.
//
// This used to live inline in ThreeHUD's `HotkeysResponse`, reachable only by
// typing "hotkeys" into the narrator composer — a route no first-time player
// finds. The same data now backs that narrator response, the `?`/F1 overlay, and
// the launch menu's Controls screen.
//
// Keep in sync with KEYBOARD_MAP in three-game/ThreeDarwinGame.jsx.

const DEV_TOOLS_VISIBLE = process.env.NODE_ENV !== 'production';

export function controlsSections({ polished = true, includeNarratorCommands = true } = {}) {
  const sections = [
    ['Movement', [
      'WASD / arrows: move',
      'Shift: run',
      'Space: jump',
      'C: crouch or running slide',
      'B: dodge roll',
      'Q or V: climb / mantle / descend',
    ]],
    ['Camera', [
      'Mouse drag: rotate camera',
      'Scroll: zoom',
      'Z / X: rotate left / right',
      'Tab: recentre the camera behind Darwin',
      'M: cycle camera mode',
    ]],
    ['Fieldwork', [
      'Enter: use the equipped field tool on the attended subject; with no subject, enter observation mode',
      'Tab: cycle collection method while the collection card is open',
      'E: speak, carry, open, or travel',
      'J: use the equipped tool without a selected subject',
      '1-6: equip toolbar slot',
      'F: rifle aim when shotgun is equipped',
      'Left click while aiming: fire rifle',
    ]],
    ['Interface', [
      'Esc: pause — settings, controls, end expedition',
      '? or F1: show this list',
      ...(polished ? ['H: hide or show the expedition interface'] : []),
      'Cmd/Ctrl+I: open the specimen case',
      ...(polished ? ['4 then J: equip and swing the geological hammer'] : []),
    ]],
    ['Direct Actions', [
      polished ? null : 'H: hammer',
      'N: net',
      'G: gather',
      'Y: write',
      'I: kneel inspect',
      'L: look around',
      'O: point',
      'P: pray',
      'T: trip',
      'U: teeter',
      'K: sit',
      'R: rest / lie down',
    ].filter(Boolean)],
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
      'check traps / abandon trap: manage traps',
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
      '0: asset browser',
      '7: animal animation lab',
      '8: Darwin animation lab',
      'Shift+9: toggle Darwin5 locomotion preview',
    ]]);
  }

  return sections;
}
