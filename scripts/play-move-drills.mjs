// Named movement drills for `npm run play -- move <drill>`. Each is a timed key
// script for window.__darwinE2E.recordMotion: `at` is milliseconds from the
// start, `down`/`up` are control names from three-game/input/gameKeys.js.
// Keep them short and on open ground; they measure feel, not navigation.

export const MOVE_DRILLS = {
  walk: {
    about: 'Walk forward 2.5s and let go: start ramp, cruise, stop slide.',
    durationMs: 4000,
    steps: [{ at: 200, down: ['forward'] }, { at: 2700, up: ['forward'] }],
  },
  run: {
    about: 'Run forward 3s (into sprint) and let go.',
    durationMs: 4800,
    steps: [{ at: 200, down: ['forward', 'run'] }, { at: 3200, up: ['forward', 'run'] }],
  },
  tap: {
    about: 'Tap forward for 130ms: does a nudge move him a step or play a whole start/stop?',
    durationMs: 1800,
    steps: [{ at: 200, down: ['forward'] }, { at: 330, up: ['forward'] }],
  },
  taps: {
    about: 'Three quick forward taps: repeated small adjustments.',
    durationMs: 2600,
    steps: [
      { at: 200, down: ['forward'] }, { at: 380, up: ['forward'] },
      { at: 700, down: ['forward'] }, { at: 880, up: ['forward'] },
      { at: 1200, down: ['forward'] }, { at: 1380, up: ['forward'] },
    ],
  },
  reverse: {
    about: 'Run forward, then hold back: 180 turn while running toward the camera.',
    durationMs: 5000,
    steps: [
      { at: 200, down: ['forward', 'run'] },
      { at: 2200, up: ['forward'], down: ['backward'] },
      { at: 3700, up: ['backward', 'run'] },
    ],
  },
  turn90: {
    about: 'Run forward, then hold right: 90 turn and sideways run.',
    durationMs: 4800,
    steps: [
      { at: 200, down: ['forward', 'run'] },
      { at: 2000, up: ['forward'], down: ['right'] },
      { at: 3500, up: ['right', 'run'] },
    ],
  },
  zigzag: {
    about: 'Run while alternating forward-left and forward-right every 450ms.',
    durationMs: 3600,
    steps: [
      { at: 200, down: ['forward', 'run', 'left'] },
      { at: 650, up: ['left'], down: ['right'] },
      { at: 1100, up: ['right'], down: ['left'] },
      { at: 1550, up: ['left'], down: ['right'] },
      { at: 2000, up: ['right'], down: ['left'] },
      { at: 2450, up: ['left', 'forward', 'run'] },
    ],
  },
  walkrun: {
    about: 'Walk, shift into a run, drop back to a walk, stop.',
    durationMs: 5200,
    steps: [
      { at: 200, down: ['forward'] },
      { at: 1400, down: ['run'] },
      { at: 2900, up: ['run'] },
      { at: 4100, up: ['forward'] },
    ],
  },
  jump: {
    about: 'Standing jump.',
    durationMs: 2600,
    steps: [{ at: 300, down: ['jump'] }, { at: 400, up: ['jump'] }],
  },
  runjump: {
    about: 'Running jump, keep running after landing.',
    durationMs: 4000,
    steps: [
      { at: 200, down: ['forward', 'run'] },
      { at: 1700, down: ['jump'] },
      { at: 1800, up: ['jump'] },
      { at: 3400, up: ['forward', 'run'] },
    ],
  },
  // Tool drills equip `tool` first. Each presses F, then asks to walk on
  // before the swing has finished: how soon does Darwin answer the stick?
  net: {
    about: 'Net in hand: F, then hold forward 0.6s later.',
    tool: 'insect_net',
    durationMs: 4200,
    steps: [{ at: 200, down: ['useTool'] }, { at: 320, up: ['useTool'] }, { at: 800, down: ['forward'] }, { at: 3200, up: ['forward'] }],
  },
  netSweep: {
    about: 'Net in hand: F and stand still through the whole sweep.',
    tool: 'insect_net',
    durationMs: 1900,
    steps: [{ at: 200, down: ['useTool'] }, { at: 320, up: ['useTool'] }],
  },
  hammer: {
    about: 'Hammer in hand: F, then hold forward 0.4s later.',
    tool: 'hammer',
    durationMs: 3400,
    steps: [{ at: 200, down: ['useTool'] }, { at: 320, up: ['useTool'] }, { at: 600, down: ['forward'] }, { at: 2600, up: ['forward'] }],
  },
  gunTap: {
    about: 'Shotgun in hand: tap F (hip fire), then hold forward.',
    tool: 'shotgun',
    durationMs: 3000,
    steps: [{ at: 200, down: ['useTool'] }, { at: 300, up: ['useTool'] }, { at: 500, down: ['forward'] }, { at: 2200, up: ['forward'] }],
  },
  gunAim: {
    about: 'Shotgun in hand: hold F 1.2s (aim), release.',
    tool: 'shotgun',
    durationMs: 2600,
    steps: [{ at: 200, down: ['useTool'] }, { at: 1400, up: ['useTool'] }],
  },
};
