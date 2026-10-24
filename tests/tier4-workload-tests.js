// tests/tier4-workload-tests.js — Tier 4: Real-World Workload Scenarios
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

const suite = new TestSuite('Tier 4: Real-World Workload Scenarios');

suite.test('W1: Campaign Garden Multi-Level Progression (Levels 1 to 3 Star Progression & Unlocks)', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;

  // Step 1: Open Level Select
  game.gotoMenu();
  assertEqual(game.state, 'menu', 'At main menu');
  assert(game.isLevelUnlocked(0), 'Level 1 is unlocked by default');
  assert(!game.isLevelUnlocked(1), 'Level 2 is initially locked');

  // Step 2: Play and master Level 1
  game.startRun('level', 0);
  assertEqual(game.mode, 'level', 'In level mode');
  assertEqual(game.levelIdx, 0, 'Playing Level 1');
  const lv0 = BS.LEVELS[0];
  game.state = 'playing';

  // Eat goal apples to achieve 3 stars
  for (let i = 0; i < lv0.goalApples; i++) {
    game.consume('apple');
  }
  game.run.score = lv0.stars[2] + 50; // Ensure 3 stars
  game.doStep(16);
  assertEqual(game.state, 'complete', 'Level 1 completed');
  assertEqual(game.save.stars[0], 3, 'Level 1 awarded 3 stars');
  assert(game.isLevelUnlocked(1), 'Level 2 is now unlocked');

  // Step 3: Play Level 2
  game.startRun('level', 1);
  assertEqual(game.levelIdx, 1, 'Playing Level 2');
  const lv1 = BS.LEVELS[1];
  game.state = 'playing';
  for (let i = 0; i < lv1.goalApples; i++) {
    game.consume('apple');
  }
  game.run.score = lv1.stars[1] + 20; // 2 stars
  game.doStep(16);
  assertEqual(game.state, 'complete', 'Level 2 completed');
  assertEqual(game.save.stars[1], 2, 'Level 2 awarded 2 stars');
  assert(game.isLevelUnlocked(2), 'Level 3 is now unlocked');

  // Step 4: Verify overall star total and persistence
  assertEqual(game.sumStars(), 5, 'Total stars earned is 5');
  const saved = JSON.parse(env.localStorage.getItem('bioSerpentSave_v1'));
  assertEqual(saved.stars[0], 3, 'Level 1 stars in localStorage');
  assertEqual(saved.stars[1], 2, 'Level 2 stars in localStorage');
});

suite.test('W2: Daily Challenge Full Lifecycle (Modifiers, Run Execution, Streak & Badge Tracking)', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;

  // Step 1: Start Daily Challenge
  game.startRun('daily');
  assertEqual(game.mode, 'daily', 'Mode is daily');
  assertEqual(game.dailyMods.length, 2, 'Loaded 2 daily modifiers');
  assertEqual(game.state, 'countdown', 'Started in countdown');

  // Step 2: Transition to playing and collect prey
  game.state = 'playing';
  game.consume('apple');
  game.consume('golden');
  game.consumeInsect('firefly');
  assert(game.run.score > 70, 'Score accumulated from prey');
  assertEqual(game.combo >= 2, true, 'Combo multiplier built up');

  // Step 3: Fatal collision and Game Over
  const finalScore = game.run.score;
  game.die('wall');
  assertEqual(game.state, 'over', 'Game over state triggered');

  // Step 4: Verify streak and daily record
  assertEqual(game.save.daily.best, finalScore, 'Daily best recorded');
  assert(game.save.daily.streak >= 1, 'Streak is active');
  assert(game.save.stats.dailyPlayed >= 1, 'Daily played counter incremented');
});

suite.test('W3: Zen Flow Extended Session & Length Record Tracking', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;

  // Step 1: Enter Zen Flow mode
  game.startRun('zen');
  assertEqual(game.mode, 'zen', 'In Zen mode');
  assertEqual(game.snake.length, 6, 'Starting length is 6');
  game.state = 'playing';

  // Step 2: Traverse and eat multiple apples
  for (let i = 0; i < 15; i++) {
    game.consume('apple');
  }
  for (let i = 0; i < 15; i++) {
    game.snake.step({ cols: 20, rows: 20, wrap: true, ghost: false, ghostSelf: true });
  }
  assertEqual(game.snake.length, 21, 'Snake grew to length 21');

  // Step 3: Trigger window blur / pause event
  env.win.dispatchEvent({ type: 'blur' });
  assertEqual(game.burst, false, 'Burst disarmed on blur');

  // Step 4: Return to menu and verify Zen length best persisted
  game.gotoMenu();
  assertEqual(game.save.best.zen, 21, 'New Zen best length 21 recorded');
  const saved = JSON.parse(env.localStorage.getItem('bioSerpentSave_v1'));
  assertEqual(saved.best.zen, 21, 'Zen best persisted to localStorage');
});

suite.test('W4: Comprehensive Settings Customization, Backup, Corruption Recovery & Import Cycle', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;

  // Step 1: Customize settings
  game.openSettings();
  game.save.settings.music = 0.45;
  game.save.settings.sfx = 0.85;
  game.save.settings.touch = 'joystick';
  game.save.settings.rival = true;
  game.save.settings.walls = 'wrap';
  game.applySettings();

  assertEqual(game.sound.volumes.music, 0.45, 'Sound music volume matches');
  assertEqual(game.input.pref, 'joystick', 'Input preference matches');

  // Step 2: Export save backup
  const backupJson = JSON.stringify(game.save);
  game.ui.openSaveModal(backupJson, true);
  assertEqual(game.ui.el.saveJsonArea.value, backupJson, 'Backup JSON in textarea');

  // Step 3: Simulate corrupted storage
  env.localStorage.setItem('bioSerpentSave_v1', '{"broken"');
  const freshEnv = createBrowserEnv();
  freshEnv.localStorage.setItem('bioSerpentSave_v1', '{"broken"');
  const freshSession = loadGameScripts(freshEnv);
  assertEqual(freshSession.BS.game.save.settings.music, 0.7, 'Fell back to default save on corrupted data');

  // Step 4: Restore backup JSON
  const restoredSave = JSON.parse(backupJson);
  Object.assign(freshSession.BS.game.save, restoredSave);
  freshSession.BS.game.applySettings();

  assertEqual(freshSession.BS.game.save.settings.music, 0.45, 'Restored custom music volume');
  assertEqual(freshSession.BS.game.save.settings.touch, 'joystick', 'Restored custom touch control');
  assertEqual(freshSession.BS.game.save.settings.rival, true, 'Restored rival setting');
});

suite.test('W5: Competitive Classic Run with Rival AI Interaction, Kill Bonus, and Skin Unlocks', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;

  // Step 1: Enable Rival and start Classic Run
  game.save.settings.rival = true;
  game.startRun('classic');
  assertEqual(game.mode, 'classic', 'Classic mode active');
  assert(game.rival !== null, 'Rival serpent spawned');

  game.state = 'playing';

  // Step 2: Compete for apples and build score
  for (let i = 0; i < 10; i++) {
    game.consume('apple');
  }
  assertEqual(game.run.apples, 10, 'Ate 10 apples');

  // Step 3: Eliminate Rival and verify +25 bonus
  const scoreBeforeKill = game.run.score;
  game.killRival();
  assertEqual(game.run.score, scoreBeforeKill + 25, 'Earned +25 Rival Down bonus points');
  assertEqual(game.rival, null, 'Rival cleared from board during respawn delay');

  // Step 4: Reach high score > 200 to unlock Golden Sun Dragon skin
  game.run.score = 250;
  game.finishRun(false, 'Game Over', false);
  assertEqual(game.save.best.classic, 250, 'Recorded classic high score 250');
  assert(game.isSkinUnlocked('golden'), 'Golden Sun Dragon skin unlocked at 250 points');
});

// Run directly if executed as main
if (require.main === module) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
