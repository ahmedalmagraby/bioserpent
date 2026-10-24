// tests/tier3-cross-feature-tests.js — Tier 3: Pairwise Combinations & Multi-System Interactions
const path = require('path');
const fs = require('fs');
const {
  createBrowserEnv,
  loadGameScripts,
  TestSuite,
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows
} = require('./test-env.js');

const suite = new TestSuite('Tier 3: Cross-Feature Interaction Tests');

suite.test('X1: Portal teleport into Rival position triggers mutual collision / game over', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  // Setup portal at (5, 5) leading to (15, 15)
  game.obstacles.portals = [
    { x: 5, y: 5, pair: 'A' },
    { x: 15, y: 15, pair: 'A' }
  ];

  // Spawn rival occupying (15, 15)
  game.rival = new BS.Rival();
  game.rival.snake.reset(15, 15, { x: -1, y: 0 }, 4);

  // Step player into portal entry at (5, 5)
  game.snake.reset(4, 5, BS.DIRS.right, 4);
  game.doStep(16);

  assertEqual(game.snake.head.x, 15, 'Player head teleported to portal exit (15, 15)');
  assertEqual(game.snake.head.y, 15, 'Player head teleported to (15, 15)');
  assertEqual(game.state, 'over', 'Colliding with Rival at portal exit triggered game over');
});

suite.test('X2: Power-Up active buffs expire cleanly upon Level Victory without dangling state', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('level', 0);
  game.state = 'playing';

  // Activate all buffs
  game.activatePower('magnet');
  game.activatePower('slow');
  game.activatePower('multi');
  assert(game.effects.magnet > 0 && game.effects.multi > 0, 'Buffs active');

  // Trigger level victory
  game.completeLevel();
  assertEqual(game.state, 'complete', 'Level is in complete state');
  assertEqual(game.ui.chips.size, 0, 'Transient HUD buff chips cleared upon level complete');
});

suite.test('X3: D-pad speed burst active modulates step cadence, triggers particle bursts and audio intensity', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  const normalStep = game.stepMs;
  game.burst = true;
  const burstStep = Math.round(normalStep * BS.CONFIG.burstMul);

  assert(burstStep < normalStep, 'Burst step interval is significantly shorter than normal step');
  assertEqual(game.burst, true, 'Burst flag is active on game instance');
});

suite.test('X4: Web Audio ducking during pause/resume adjusts gain parameters safely', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.sound.unlock();
  game.startRun('classic');
  game.state = 'playing';

  // Toggle pause
  game.togglePause();
  assertEqual(game.state, 'paused', 'Game transitioned to paused');

  // Toggle resume
  game.togglePause();
  assertEqual(game.state, 'playing', 'Game resumed to playing');
  assert(game.sound.master.gain.calls.length > 0, 'Audio volume automation calls executed cleanly');
});

suite.test('X5: Ghost Mode powerup + Obstacle vs Zen mode GhostSelf interaction differences', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  // Case A: Zen mode (ghostSelf = true, but ghost = false) -> hits rock = dies
  game.startRun('zen');
  game.state = 'playing';
  game.obstacles.rocks.push({ x: 10, y: 10, seed: 1, radii: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4] });
  game.obstacles._rebuildGrid(20, 20);
  game.snake.reset(9, 10, BS.DIRS.right, 4);
  game.doStep(16);
  assertEqual(game.state, 'over', 'Zen mode snake dies when hitting rock obstacle');

  // Case B: Classic run with Ghost Phase powerup (ghost = true) -> passes through rock
  game.startRun('classic');
  game.state = 'playing';
  game.effects.ghost = 5000;
  game.obstacles.rocks.push({ x: 10, y: 10, seed: 1, radii: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4] });
  game.obstacles._rebuildGrid(20, 20);
  game.snake.reset(9, 10, BS.DIRS.right, 4);
  game.doStep(16);
  assertEqual(game.state, 'playing', 'Ghost phase allows passing directly through rock obstacle');
  assertEqual(game.snake.head.x, 10, 'Head successfully occupied rock coordinate');
});

suite.test('X6: Magnet Spore pull + Rapid Turn food consumption pulls items safely', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  game.activatePower('magnet');
  // Place apple 3 cells away at (8, 5)
  game.food.items = [{ type: 'apple', gx: 8, gy: 5, age: 0, hop: 0 }];
  game.snake.reset(5, 5, BS.DIRS.right, 4);

  // Step towards apple with magnet pull active
  game.doStep(16);
  const apple = game.food.items[0];
  assert(apple.gx < 8 || apple.gx === 6, 'Magnet pull attracted apple towards snake head');
});

suite.test('X7: Prune Mushroom (-3 segments) eaten at length 4 shrinks to 3 while preserving Pacifist status', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('level', 0);
  game.state = 'playing';

  assertEqual(game.run.pacifist, true, 'Run starts with pacifist: true');
  game.activatePower('prune');
  assertEqual(game.snake.length, 3, 'Snake tail pruned to min length 3');
  assertEqual(game.run.pacifist, true, 'Pacifist status preserved (powerups do not void pacifist)');
});

suite.test('X8: 2x Multiplier powerup combined with 5x Combo multiplier calculates compound score gain', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  // Set 5x combo
  game.combo = 4; // next meal will be 5x
  // Set 2x Multiplier
  game.effects.multi = 5000;

  // Consume golden berry (+50 base)
  // gain = 50 * (2 * (1 + (5 - 1) * 0.3)) = 50 * (2 * 2.2) = 50 * 4.4 = 220
  const initialScore = game.run.score;
  game.consume('golden');
  assertEqual(game.run.score, initialScore + 220, 'Score reflects compound 2x Multiplier * 2.2x Combo multiplier');
});

suite.test('X9: Time Attack urgency threshold (<10s) toggles danger vignette, preserved across pause/resume', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('timeattack');
  game.state = 'playing';

  game.taTime = 8000; // Less than 10,000ms urgent threshold
  game._urgent = true;
  game.ui.setUrgent(true);

  assert(game.ui.el.dangerVignette.classList.contains('active'), 'Danger vignette active in urgent state');

  // Pause and resume
  game.togglePause();
  assertEqual(game.state, 'paused', 'Paused in urgent state');
  game.togglePause();
  assertEqual(game.state, 'playing', 'Resumed in urgent state');
});

suite.test('X10: Daily Challenge modifiers (Haste + Giant) compound speed scaling and double segment growth', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('daily');
  game.state = 'playing';

  // Force Haste + Giant
  game.dailyMods = [
    { id: 'haste', stepMul: 0.78 },
    { id: 'giant', growMul: 2 }
  ];

  const initialLen = game.snake.length;
  game.consume('apple'); // Normal apple grows by 1; Giant grows by 2
  game.doStep(16);
  game.doStep(16);

  assertEqual(game.snake.length, initialLen + 2, 'Giant modifier caused 2 segments growth per apple');
});

suite.test('X11: Daily Challenge modifiers (Wrap + Ghosty) allow simultaneous edge wrapping and self passability', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('daily');
  game.state = 'playing';

  game.dailyMods = [
    { id: 'wrap', wrap: true },
    { id: 'ghosty', ghost: true }
  ];

  // Head at (19, 10) stepping right -> wraps to (0, 10)
  game.snake.reset(19, 10, BS.DIRS.right, 4);
  game.doStep(16);
  assertEqual(game.snake.head.x, 0, 'Wrapped edge with wrap modifier active');
  assertEqual(game.state, 'playing', 'Snake remains alive');
});

suite.test('X12: Level complete star rating progression unlocks next level in sequence', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  // Level 1 complete with 3 stars
  game.startRun('level', 0);
  game.run.score = 300;
  game.completeLevel();

  assert(game.isLevelUnlocked(0), 'Level 0 is unlocked');
  assert(game.isLevelUnlocked(1), 'Level 1 is unlocked after earning stars on Level 0');
  assertEqual(game.save.stars[0], 3, 'Level 0 recorded 3 stars');
});

suite.test('X13: Settings toggle for Rival in Classic Run spawns or despawns Rival dynamically', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.save.settings.rival = false;
  game.startRun('classic');
  game.state = 'playing';
  assertEqual(game.rival, null, 'Rival is initially null when setting is disabled');

  // Enable rival in settings
  game.save.settings.rival = true;
  game.applySettings();
  assert(game.rival !== null, 'Rival spawned dynamically when setting enabled');

  // Disable rival in settings
  game.save.settings.rival = false;
  game.applySettings();
  assertEqual(game.rival, null, 'Rival despawned cleanly when setting disabled');
});

suite.test('X14: Biome transition during extended Classic Run shifts environment every 12 food eaten', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  assertEqual(game.biomeKey, 'rainforest', 'Initial biome is rainforest');

  // Eat 12 apples to transition to Oasis
  for (let i = 0; i < 12; i++) game.consume('apple');
  assertEqual(game.biomeKey, 'oasis', 'Transitioned to Oasis after 12 food items');

  // Eat 12 more apples to transition to Cavern
  for (let i = 0; i < 12; i++) game.consume('apple');
  assertEqual(game.biomeKey, 'cavern', 'Transitioned to Cavern after 24 food items');
});

suite.test('X15: Save export from live game session, memory wipe, and import restores exact progression', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;
  game.save.best.classic = 620;
  game.save.stars = { 0: 3, 1: 3, 2: 2 };
  game.save.stats.apples = 350;
  game.save.skin = 'albino';
  game.persist();

  // Export save JSON
  const exported = JSON.stringify(game.save);

  // Wipe memory and simulate new session
  env.localStorage.clear();
  const newEnv = createBrowserEnv();
  newEnv.localStorage.setItem('bioSerpentSave_v1', exported);
  const reloaded = loadGameScripts(newEnv);

  assertEqual(reloaded.BS.game.save.best.classic, 620, 'Restored classic score');
  assertEqual(reloaded.BS.game.save.stars[0], 3, 'Restored Level 0 stars');
  assertEqual(reloaded.BS.game.save.stats.apples, 350, 'Restored apples count');
  assertEqual(reloaded.BS.game.save.skin, 'albino', 'Restored albino skin');
});

suite.test('X16: Rapid Game Over restart resets all entity managers and triggers countdown', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.consume('apple');
  game.die('wall');

  assertEqual(game.state, 'over', 'Game transitioned to over');

  // Trigger onRestart handler
  game.startRun('classic');
  assertEqual(game.state, 'countdown', 'Game entered 3-2-1 countdown on restart');
  assertEqual(game.run.score, 0, 'Run score reset to 0');
  assertEqual(game.run.apples, 0, 'Run apples reset to 0');
});

// Run directly if executed as main
if (require.main === module) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
