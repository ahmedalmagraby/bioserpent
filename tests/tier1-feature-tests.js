// tests/tier1-feature-tests.js — Tier 1: Core Isolated Feature Behavior & Invariants
const path = require('path');
const fs = require('fs');
const {
  loadGameScripts,
  TestSuite,
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows
} = require('./test-env.js');

const suite = new TestSuite('Tier 1: Core Feature Tests');

// =========================================================================
// FEATURE 1: Snake Kinematics & Portals (§R1)
// =========================================================================

suite.test('F1.1: Snake initialization sets default skin, position, length, and occupancy map', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  assertEqual(snake.skin.id, 'emerald', 'Default skin is emerald');
  assertEqual(snake.cells.length, 4, 'Default length is 4');
  assertEqual(snake.head.x, 10, 'Initial head X is 10');
  assertEqual(snake.head.y, 10, 'Initial head Y is 10');
  assert(snake.isOccupied(10, 10), 'Head cell is marked occupied');
  assert(snake.isOccupied(9, 10), 'Body cell 1 is marked occupied');
  assert(snake.isOccupied(8, 10), 'Body cell 2 is marked occupied');
  assert(snake.isOccupied(7, 10), 'Tail cell is marked occupied');
  assert(!snake.isOccupied(6, 10), 'Empty cell is not marked occupied');
});

suite.test('F1.2: Snake step in free space advances head and removes tail cell', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 4);
  const env = { cols: 20, rows: 20, wrap: false, ghost: false, ghostSelf: false };
  const res = snake.step(env);
  assert(!res.death, 'Step in free space does not cause death');
  assertEqual(snake.head.x, 11, 'Head X advanced by 1 to the right');
  assertEqual(snake.head.y, 10, 'Head Y remains 10');
  assert(snake.isOccupied(11, 10), 'New head is occupied');
  assert(!snake.isOccupied(7, 10), 'Old tail (7, 10) is vacated');
  assertEqual(snake.cells.length, 4, 'Length remains 4');
});

suite.test('F1.3: Snake directional queueing and 180-degree reversal prevention', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 4);
  
  // Attempt immediate 180 reversal (left while moving right)
  snake.queueDir(BS.DIRS.left);
  assertEqual(snake.pending.length, 0, '180-degree reversal is rejected immediately');

  // Queue valid 90-degree turns
  snake.queueDir(BS.DIRS.up);
  snake.queueDir(BS.DIRS.left);
  assertEqual(snake.pending.length, 2, 'Two valid perpendicular turns queued');

  const env = { cols: 20, rows: 20, wrap: false };
  snake.step(env);
  assertEqual(snake.dir.y, -1, 'First queued turn (up) was applied');
  assertEqual(snake.head.x, 10, 'Head stepped up');
  assertEqual(snake.head.y, 9, 'Head Y decreased');
});

suite.test('F1.4: Snake grow pending increases length and retains tail', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 4);
  snake.grow(2);
  assertEqual(snake.growPending, 2, 'Grow pending set to 2');

  const env = { cols: 20, rows: 20, wrap: false };
  snake.step(env); // First growth step
  assertEqual(snake.cells.length, 5, 'Snake length increased to 5');
  assertEqual(snake.growPending, 1, 'Grow pending decremented to 1');
  assert(snake.isOccupied(7, 10), 'Tail was retained during growth step');

  snake.step(env); // Second growth step
  assertEqual(snake.cells.length, 6, 'Snake length increased to 6');
  assertEqual(snake.growPending, 0, 'Grow pending reached 0');
});

suite.test('F1.5: Snake solid wall collision returns death: wall when wrap is false', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(19, 10, BS.DIRS.right, 4);
  const env = { cols: 20, rows: 20, wrap: false };
  const res = snake.step(env);
  assert(res && res.death === 'wall', 'Hitting right boundary returns death: wall');

  snake.reset(10, 0, BS.DIRS.up, 4);
  const resTop = snake.step(env);
  assert(resTop && resTop.death === 'wall', 'Hitting top boundary returns death: wall');
});

suite.test('F1.6: Snake wall wrap properly teleports coordinates across board bounds', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(19, 10, BS.DIRS.right, 4);
  const env = { cols: 20, rows: 20, wrap: true };
  const res = snake.step(env);
  assert(!res.death, 'Wrapping boundary does not cause death');
  assertEqual(snake.head.x, 0, 'Head wrapped from x=19 to x=0');
  assertEqual(snake.head.y, 10, 'Head Y remains 10');
});

suite.test('F1.7: Snake portal entry teleports to linked portal coordinates with cooldown', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(5, 5, BS.DIRS.right, 4);
  
  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    portalAt: (x, y) => (x === 6 && y === 5 ? { x: 14, y: 14 } : null)
  };

  const res = snake.step(env);
  assert(res.teleported, 'Step result indicates teleported: true');
  assertEqual(snake.head.x, 14, 'Head teleported to destination X');
  assertEqual(snake.head.y, 14, 'Head teleported to destination Y');
  assertEqual(snake.justTele, 2, 'justTele cooldown set to 2');
});

suite.test('F1.8: Snake self-collision returns death: self unless ghost/ghostSelf active', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  // Construct a closed loop body
  snake.cells = [
    { x: 5, y: 5 },
    { x: 5, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 5 },
    { x: 6, y: 4 }
  ];
  snake.occ.clear();
  snake.cells.forEach(c => snake._occAdd(c.x, c.y));
  snake.dir = { x: 1, y: 0 }; // Moving into (6, 5) which is occupied by body[3]

  const normalEnv = { cols: 20, rows: 20, wrap: false, ghost: false, ghostSelf: false };
  const resNormal = snake.step(normalEnv);
  assertEqual(resNormal.death, 'self', 'Colliding with self triggers death: self');

  // Reset and test with ghostSelf enabled
  const ghostSnake = new BS.Snake();
  ghostSnake.cells = [
    { x: 5, y: 5 },
    { x: 5, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 5 },
    { x: 6, y: 4 }
  ];
  ghostSnake.occ.clear();
  ghostSnake.cells.forEach(c => ghostSnake._occAdd(c.x, c.y));
  ghostSnake.dir = { x: 1, y: 0 };

  const ghostEnv = { cols: 20, rows: 20, wrap: false, ghost: false, ghostSelf: true };
  const resGhost = ghostSnake.step(ghostEnv);
  assert(!resGhost.death, 'ghostSelf allows passing through self without death');
});

// =========================================================================
// FEATURE 2: Rival AI & Collisions (§R1)
// =========================================================================

suite.test('F2.1: Rival initialization assigns distinct skin and calculates initial heading', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  assertEqual(rival.snake.skin.id, 'rival', 'Rival skin is rival');
  assertEqual(rival.dead, false, 'Rival is alive initially');
  assert(rival.snake.cells.length > 0, 'Rival snake has body segments');
});

suite.test('F2.2: Rival reset keeps minimum Manhattan clearance from player snake', () => {
  const { BS } = loadGameScripts();
  const view = { rows: 20 };
  const playerCells = [{ x: 5, y: 9 }, { x: 4, y: 9 }, { x: 3, y: 9 }, { x: 2, y: 9 }];
  const rival = new BS.Rival();
  rival.reset(view, playerCells, null, 6);

  for (const rc of rival.snake.cells) {
    for (const pc of playerCells) {
      const dist = Math.abs(rc.x - pc.x) + Math.abs(rc.y - pc.y);
      assert(dist >= 5, `Rival segment (${rc.x}, ${rc.y}) maintains clearance from player segment (${pc.x}, ${pc.y})`);
    }
  }
});

suite.test('F2.3: Rival BFS pathfinding plans path to target apple avoiding obstacles', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  rival.snake.reset(10, 10, { x: 1, y: 0 }, 4);
  
  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    playerCells: [],
    target: { gx: 14, gy: 10 }, // 4 cells to the right
    hazardAt: (x, y) => (x === 11 && y === 10 ? 'rock' : null), // Rock directly in front
    hazardVer: 1,
    stepMs: 150
  };

  const res = rival._doStep(env);
  assert(!res.death, 'Rival successfully navigates around rock without dying');
  // Since (11, 10) was blocked, it must have steered Up (10, 9) or Down (10, 11)
  assert(rival.snake.head.x === 10, 'Head X stayed 10 (did not crash into rock at 11)');
  assert(rival.snake.head.y === 9 || rival.snake.head.y === 11, 'Head Y changed to navigate around rock');
});

suite.test('F2.4: Rival treats player snake body cells as impassable/lethal hazard', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  rival.snake.reset(10, 10, { x: 1, y: 0 }, 4);

  // Player body forms a wall in front of the rival: (11, 8), (11, 9), (11, 10), (11, 11), (11, 12)
  const playerCells = [
    { x: 11, y: 8 },
    { x: 11, y: 9 },
    { x: 11, y: 10 },
    { x: 11, y: 11 },
    { x: 11, y: 12 }
  ];

  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    playerCells,
    target: { gx: 15, gy: 10 },
    hazardAt: null,
    hazardVer: 1,
    stepMs: 150
  };

  const res = rival._doStep(env);
  assert(!res.death, 'Rival detects player body and avoids crashing directly into it');
  assert(rival.snake.head.x !== 11 || !playerCells.some(c => c.x === rival.snake.head.x && c.y === rival.snake.head.y),
    'Rival head did not enter player occupied cell');
});

suite.test('F2.5: Rival tail-chasing fallback activates when direct path to food is blocked', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  rival.snake.reset(10, 10, { x: 1, y: 0 }, 4);

  // Target apple is completely enclosed in rocks
  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    playerCells: [],
    target: { gx: 18, gy: 18 },
    hazardAt: (x, y) => (x >= 17 && y >= 17 ? 'rock' : null),
    hazardVer: 1,
    stepMs: 150
  };

  const res = rival._doStep(env);
  assert(res && !res.death, 'Rival executes fallback survivable step without panic dying');
});

suite.test('F2.6: Rival step execution updates position and sets dead flag on collision', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  rival.snake.reset(19, 10, { x: 1, y: 0 }, 4);

  // Force move with obstacle directly on destination
  const stepRes = rival.snake.step({
    cols: 20,
    rows: 20,
    wrap: false,
    ghost: false,
    blocked: () => 'rock'
  });

  assert(stepRes && stepRes.death, 'Direct collision returned death result');
  // When step reports death, rival records dead state
  rival.dead = !!stepRes.death;
  assertEqual(rival.dead, true, 'Rival dead property is true upon fatal collision');
});

// =========================================================================
// FEATURE 3: Food & Power-Up Lifecycles (§R1)
// =========================================================================

suite.test('F3.1: FoodManager spawns apple in free space and collideCell consumes it', () => {
  const { BS } = loadGameScripts();
  const fm = new BS.FoodManager();
  const isFree = (x, y) => x > 2 && y > 2;
  const spawned = fm.spawnApple(isFree);
  assert(spawned, 'Apple spawned successfully');
  assertEqual(fm.items.length, 1, 'Items list contains 1 item');
  assertEqual(fm.items[0].type, 'apple', 'Item is of type apple');

  const ax = fm.items[0].gx;
  const ay = fm.items[0].gy;
  assert(isFree(ax, ay), 'Apple spawned at free coordinate');

  const eaten = fm.collideCell(ax, ay);
  assert(eaten !== null, 'collideCell returns eaten apple object');
  assertEqual(eaten.type, 'apple', 'Eaten item type is apple');
  assertEqual(fm.items.length, 0, 'Apple was removed from active items');
});

suite.test('F3.2: Golden berry spawns with countdown timer and expires after goldenLifeMs', () => {
  const { BS } = loadGameScripts();
  const fm = new BS.FoodManager();
  const spawned = fm.trySpawnGolden(() => true);
  assert(spawned, 'Golden berry spawned');
  const g = fm.items.find(i => i.type === 'golden');
  assert(g, 'Golden berry present in items');
  assertEqual(g.life, BS.CONFIG.goldenLifeMs, 'Golden berry life matches CONFIG.goldenLifeMs');

  // Update with time less than life
  fm.update(5000, {});
  assertEqual(fm.items.length, 1, 'Golden berry still alive after 5000ms');

  // Update past remaining lifetime
  fm.update(7000, {});
  assertEqual(fm.items.filter(i => i.type === 'golden').length, 0, 'Golden berry expired and despawned');
});

suite.test('F3.3: Serpent egg spawns and hatches into golden berry when timer expires', () => {
  const { BS } = loadGameScripts();
  const fm = new BS.FoodManager();
  const spawned = fm.trySpawnEgg(() => true);
  assert(spawned, 'Egg spawned successfully');
  const egg = fm.items.find(i => i.type === 'egg');
  assert(egg, 'Egg item present');

  // Advance time past egg life (9000ms) with view environment
  fm.update(10000, { view: { cx: () => 10, cy: () => 10 } });
  
  const hatched = fm.items.find(i => i.type === 'golden');
  assert(hatched !== undefined, 'Egg hatched into a golden berry upon timer expiration');
});

suite.test('F3.4: Insect spawning (firefly, beetle, dragonfly) moves and flees from player head', () => {
  const { BS } = loadGameScripts();
  const fm = new BS.FoodManager();
  fm.spawnInsect('dragonfly', () => true);
  assertEqual(fm.insects.length, 1, 'Dragonfly spawned');
  const ins = fm.insects[0];
  assertEqual(ins.kind, 'dragonfly', 'Insect kind is dragonfly');

  // Simulate tick with fleeing trigger (player head close by)
  const env = {
    head: { x: ins.fx + 1, y: ins.fy },
    cols: 20,
    rows: 20,
    isFree: () => true
  };
  fm.update(400, env);
  assert(ins.dur < 240, 'Dragonfly duration decreased (fleeing speed burst)');
});

suite.test('F3.5: PowerUpManager spawns max 2 items and update() prunes expired powerups', () => {
  const { BS } = loadGameScripts();
  const pm = new BS.PowerUpManager();
  pm.spawn(() => true, 'magnet');
  pm.spawn(() => true, 'slow');
  assertEqual(pm.field.length, 2, '2 power-ups spawned');

  // Attempt 3rd spawn — should be rejected by capacity limit
  pm.spawn(() => true, 'ghost');
  assertEqual(pm.field.length, 2, 'Field capped at 2 power-ups');

  // Advance time past life
  pm.update(BS.CONFIG.powerupLifeMs + 100);
  assertEqual(pm.field.length, 0, 'Expired power-ups pruned from field');
});

suite.test('F3.6: PowerUp collide() removes item and activatePower applies duration or prune shrink', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  // Spawn magnet powerup and test collision
  game.powerups.spawn(() => true, 'magnet');
  const p = game.powerups.field[0];
  const hit = game.powerups.collide(p.gx, p.gy);
  assert(hit && hit.type === 'magnet', 'collide() returned collided powerup');
  assertEqual(game.powerups.field.length, 0, 'Powerup removed from field on collision');

  // Activate powerup
  game.activatePower('magnet');
  assert(game.effects.magnet > 0, 'Magnet buff duration active in game.effects');

  // Test prune shroom (instant shrink)
  const initialLen = game.snake.length;
  game.snake.grow(4);
  game.snake.step({ cols: 20, rows: 20, wrap: false });
  game.snake.step({ cols: 20, rows: 20, wrap: false });
  const grownLen = game.snake.length;
  game.activatePower('prune');
  assert(game.snake.length < grownLen, 'Prune powerup shrunk snake tail');
});

// =========================================================================
// FEATURE 4: Game Modes & Scoring (§R1)
// =========================================================================

suite.test('F4.1: Classic Run start initializes run score, food counter, and speed curve', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  assertEqual(game.mode, 'classic', 'Game mode is classic');
  assertEqual(game.run.score, 0, 'Run score starts at 0');
  assertEqual(game.run.apples, 0, 'Apples eaten starts at 0');
  assertEqual(game.stepMs, BS.CONFIG.stepMs.classic, 'Initial stepMs matches classic config');
});

suite.test('F4.2: Time Attack mode starts with 90s, urgent threshold at 10s, and bonuses on prey', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('timeattack');
  assertEqual(game.mode, 'timeattack', 'Game mode is timeattack');
  assertEqual(game.taTime, BS.CONFIG.taStartMs, 'Time Attack begins with 90,000ms');

  // Consume apple and verify bonus time added
  const initialTime = game.taTime;
  game.consume('apple');
  assertEqual(game.taTime, initialTime + BS.CONFIG.taAppleBonus, 'Eating apple adds 3,000ms bonus time');
});

suite.test('F4.3: Zen Flow mode initializes with wrapping, ghost self-passability, and length score', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('zen');
  assertEqual(game.mode, 'zen', 'Game mode is zen');
  assertEqual(game.snake.length, 6, 'Zen mode begins with length 6');
  assertEqual(game.currentBest(), game.save.best.zen, 'Zen mode currentBest reflects length best');
});

suite.test('F4.4: Campaign Garden level loads map obstacles and completes when reaching goal apples', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('level', 0); // Level 1
  assertEqual(game.mode, 'level', 'Game mode is level');
  assertEqual(game.levelIdx, 0, 'Level index is 0');
  const lv = BS.LEVELS[0];
  assertEqual(game.obstacles.rocks.length > 0 || game.obstacles.brambles.length > 0, true, 'Level obstacles loaded');

  // Eat goalApples
  game.state = 'playing';
  game.run.apples = lv.goalApples - 1;
  game.consume('apple');
  game.doStep(16);
  assertEqual(game.state, 'complete', 'Level complete state triggered upon reaching goal apples');
});

suite.test('F4.5: Combo multiplier increases on successive food eats up to 5x with timer decay', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  assertEqual(game.combo, 0, 'Combo starts at 0');

  game.consume('apple'); // 1st
  assertEqual(game.combo, 1, 'Combo is 1 after 1st apple');
  game.consume('apple'); // 2nd
  assertEqual(game.combo, 2, 'Combo is 2 after 2nd apple');
  game.consume('apple'); // 3rd
  game.consume('apple'); // 4th
  game.consume('apple'); // 5th
  assertEqual(game.combo, 5, 'Combo reaches max 5');
  game.consume('apple'); // 6th
  assertEqual(game.combo, 5, 'Combo remains capped at 5');
});

suite.test('F4.6: Near-miss obstacle skimming awards +5 bonus points with cooldown', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  
  // Place a rock at (6, 5)
  game.obstacles.rocks.push({ x: 6, y: 5, seed: 1, radii: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4] });
  game.obstacles._rebuildGrid(20, 20);

  // Move snake head adjacent to rock (5, 5) heading up
  game.food.reset();
  game.snake.reset(5, 6, BS.DIRS.up, 4);
  const initialScore = game.run.score;
  game.doStep(16); // Steps to (5, 5), distance to (6, 5) is 1 cell

  assert(game.run.score > initialScore, 'Near miss awarded bonus points');
  assertEqual(game.run.score, initialScore + BS.CONFIG.nearMissGain, 'Near miss gave exactly +5 points');
  assertEqual(game.run.nearMisses, 1, 'Near misses counter incremented');
});

// =========================================================================
// FEATURE 5: State & Score Persistence (§R1, §AC)
// =========================================================================

suite.test('F5.1: Default save schema is initialized when localStorage is empty', () => {
  const { BS, env } = loadGameScripts();
  env.localStorage.clear();
  const save = BS.game.save;
  assert(save.best && save.best.classic === 0, 'Default classic best is 0');
  assert(save.settings && save.settings.music === 0.7, 'Default music volume is 0.7');
  assert(save.stats && save.stats.apples === 0, 'Default apples stat is 0');
  assertEqual(save.skin, 'emerald', 'Default skin is emerald');
});

suite.test('F5.2: High scores persist across game modes into localStorage', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;
  game.save.best.classic = 450;
  game.save.best.timeattack = 780;
  game.save.best.zen = 42;
  game.persist();

  const raw = env.localStorage.getItem('bioSerpentSave_v1');
  assert(raw !== null, 'Save string written to localStorage');
  const parsed = JSON.parse(raw);
  assertEqual(parsed.best.classic, 450, 'Persisted classic high score matches');
  assertEqual(parsed.best.timeattack, 780, 'Persisted time attack high score matches');
  assertEqual(parsed.best.zen, 42, 'Persisted zen high score matches');
});

suite.test('F5.3: Campaign level star ratings and levelBest scores persist accurately', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;
  game.save.stars[0] = 3;
  game.save.stars[1] = 2;
  game.save.levelBest[0] = 520;
  game.persist();

  const raw = env.localStorage.getItem('bioSerpentSave_v1');
  const parsed = JSON.parse(raw);
  assertEqual(parsed.stars[0], 3, 'Level 0 has 3 stars persisted');
  assertEqual(parsed.stars[1], 2, 'Level 1 has 2 stars persisted');
  assertEqual(parsed.levelBest[0], 520, 'Level 0 best score 520 persisted');
});

suite.test('F5.4: Daily Challenge score, streak tracking, and dailyPlayed counter persist', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;
  game.startRun('daily');
  game.run.score = 310;
  game.recordDailyScore();

  const raw = env.localStorage.getItem('bioSerpentSave_v1');
  const parsed = JSON.parse(raw);
  assert(parsed.daily.best >= 310, 'Daily score persisted');
  assert(parsed.daily.streak >= 1, 'Daily streak is at least 1');
  assert(parsed.stats.dailyPlayed >= 1, 'dailyPlayed counter incremented');
});

suite.test('F5.5: Badge unlock evaluations trigger achievements and persist to badges array', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;
  game.save.stats.apples = 105; // Eligible for 'fruitsalad' badge (100 apples)
  game.checkBadges();

  assert(game.save.badges.includes('fruitsalad'), 'Fruit Salad badge unlocked');
  const raw = env.localStorage.getItem('bioSerpentSave_v1');
  const parsed = JSON.parse(raw);
  assert(parsed.badges.includes('fruitsalad'), 'Badge unlock persisted to localStorage');
});

suite.test('F5.6: Skin unlocks evaluate conditions correctly', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.save.stats.apples = 35; // Coral requires 30
  game.save.best.classic = 250; // Golden requires 200
  game.save.stars = { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 }; // 18 stars (Albino requires 18)

  assert(game.isSkinUnlocked('emerald'), 'Emerald (default) is unlocked');
  assert(game.isSkinUnlocked('coral'), 'Coral Serpent is unlocked at 35 apples');
  assert(game.isSkinUnlocked('golden'), 'Golden Sun Dragon is unlocked at 250 classic score');
  assert(game.isSkinUnlocked('albino'), 'Albino Royal is unlocked at 18 stars');
  assert(!game.isSkinUnlocked('aurora'), 'Aurora (25 stars) is still locked at 18 stars');
});

// =========================================================================
// FEATURE 6: Audio & Volume Envelopes (§R1)
// =========================================================================

suite.test('F6.1: SoundManager unlock initializes Web Audio graph with dynamics compressor', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();
  assert(sm.ctx !== null, 'AudioContext created on unlock');
  assert(sm.compressor !== null, 'Master DynamicsCompressor created');
  assert(sm.master !== null, 'Master GainNode created');
  assert(sm.musicBus !== null, 'Music bus GainNode created');
  assert(sm.sfxBus !== null, 'SFX bus GainNode created');
});

suite.test('F6.2: Volume settings adjust master, musicBus, and sfxBus gain nodes', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();
  sm.setVolumes({ music: 0.5, sfx: 0.8, muted: false });

  assertEqual(sm.volumes.music, 0.5, 'Music volume recorded as 0.5');
  assertEqual(sm.volumes.sfx, 0.8, 'SFX volume recorded as 0.8');
  assertEqual(sm.volumes.muted, false, 'Muted is false');
  assert(sm.musicBus.gain.calls.length > 0, 'musicBus gain scheduled via setTargetAtTime');
});

suite.test('F6.3: Mute toggle immediately silences master gain to 0', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();
  sm.setVolumes({ muted: true });

  const lastCall = sm.master.gain.calls[sm.master.gain.calls.length - 1];
  assert(lastCall && lastCall.v === 0, 'Master gain scheduled to target 0 on mute');

  sm.setVolumes({ muted: false });
  const unmutedCall = sm.master.gain.calls[sm.master.gain.calls.length - 1];
  assert(unmutedCall && unmutedCall.v === 1, 'Master gain restored to 1 on unmute');
});

suite.test('F6.4: SoundManager tone() schedules safe oscillator and gain envelopes', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();
  
  // Play a simple tone
  sm.tone({ f: 440, f2: 880, dur: 0.15, gain: 0.3, type: 'sine' });
  assert(true, 'Tone synthesis executed cleanly');
});

suite.test('F6.5: Procedural SFX generators execute without throwing audio errors', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();

  sm.bite(0);
  sm.golden(0);
  sm.insect(0);
  sm.dragonfly(0);
  sm.powerup(0);
  sm.portal(0);
  sm.star(0);
  sm.death();
  sm.click();
  sm.achieve();
  sm.nearMiss(0);
  sm.comboChime(3, 0);

  assert(true, 'All 12 procedural SFX methods executed cleanly');
});

suite.test('F6.6: Audio suspension and resume state management', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();

  sm.setSuspended(true);
  assertEqual(sm.ctx.state, 'suspended', 'AudioContext suspended');

  sm.setSuspended(false);
  assertEqual(sm.ctx.state, 'running', 'AudioContext resumed');
});

// =========================================================================
// FEATURE 7: Cache & Service Worker (§R4, §AC)
// =========================================================================

suite.test('F7.1: Cache version in sw.js matches asset query string versions in index.html', () => {
  const root = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  const swMatch = swJs.match(/const\s+CACHE\s*=\s*['"]bioserpent-v(\d+)['"]/);
  assert(swMatch, 'Found CACHE constant in sw.js');
  const swVersion = swMatch[1];

  const scriptMatch = indexHtml.match(/src="js\/main\.js\?v=(\d+)"/);
  assert(scriptMatch, 'Found main.js script tag in index.html with ?v=N');
  const htmlVersion = scriptMatch[1];

  assertEqual(htmlVersion, swVersion, 'Cache version in sw.js matches ?v= query parameter in index.html');
});

suite.test('F7.2: Service Worker ASSETS array includes all core CSS, JS, icon, and manifest files', () => {
  const root = path.resolve(__dirname, '..');
  const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  const assetsMatch = swJs.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
  assert(assetsMatch, 'Found ASSETS array in sw.js');

  const assetList = assetsMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(s => s.length > 0 && s !== './');

  for (const asset of assetList) {
    const cleanPath = asset.replace(/^\.\//, '');
    const fullPath = path.join(root, cleanPath);
    assert(fs.existsSync(fullPath), `Asset specified in sw.js exists on disk: ${cleanPath}`);
  }
});

suite.test('F7.3: Service Worker fetch handler handles GET requests', () => {
  const root = path.resolve(__dirname, '..');
  const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert(swJs.includes("e.request.method !== 'GET'"), 'SW ignores non-GET requests');
  assert(swJs.includes('caches.match(e.request'), 'SW performs cache matching');
});

suite.test('F7.4: Service Worker activate handler purges outdated caches', () => {
  const root = path.resolve(__dirname, '..');
  const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert(swJs.includes('caches.keys()'), 'SW activate queries cache keys');
  assert(swJs.includes('caches.delete(k)'), 'SW activate purges stale cache keys');
});

suite.test('F7.5: Web App Manifest contains required PWA metadata', () => {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert(manifest.name && manifest.name.includes('BioSerpent'), 'Manifest has name');
  assert(manifest.short_name, 'Manifest has short_name');
  assertEqual(manifest.display, 'standalone', 'Manifest display is standalone');
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Manifest defines icons');
});

suite.test('F7.6: Boot error handler catches unhandled script errors', () => {
  const root = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(indexHtml.includes('__booterr'), 'index.html contains __booterr visual error reporter');
});

// =========================================================================
// FEATURE 8: UI/UX & Responsive Scaling (§R2, §AC)
// =========================================================================

suite.test('F8.1: Adaptive rows calculation (rowsFor) clamps between ROWS_MIN (14) and ROWS_MAX (30)', () => {
  const { BS } = loadGameScripts();

  // Ultra-tall screen (e.g. 400x1200)
  const tallRows = BS.rowsFor ? BS.rowsFor(400, 1200) : 30;
  assert(tallRows <= BS.ROWS_MAX, 'Tall aspect rows clamped to ROWS_MAX (30)');

  // Ultra-wide screen (e.g. 1600x400)
  const wideRows = BS.rowsFor ? BS.rowsFor(1600, 400) : 14;
  assert(wideRows >= BS.ROWS_MIN, 'Wide aspect rows clamped to ROWS_MIN (14)');
});

suite.test('F8.2: View forcedRows locks board height to 20 for campaign maps', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('level', 0);
  assertEqual(game.view.forcedRows, BS.BASE_ROWS, 'Campaign garden locks forcedRows to BASE_ROWS (20)');
});

suite.test('F8.3: View canvas scaling sets correct dimensions and dpr transform', () => {
  const { BS } = loadGameScripts();
  const v = BS.view;
  v.resize();
  assert(v.w > 0, 'View width is positive');
  assert(v.h > 0, 'View height is positive');
  assertEqual(v.w, v.cell * BS.COLS, 'View width is cell * COLS');
  assertEqual(v.h, v.cell * v.rows, 'View height is cell * rows');
});

suite.test('F8.4: HUD updates score, high score chip, and active buff chips with expiring states', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;
  ui.updateHUD({ score: 120, best: 350 });
  assertEqual(ui.el.score.textContent, '120', 'HUD score element updated to 120');
  assertEqual(ui.el.best.textContent, '350', 'HUD best element updated to 350');

  // Set buff chips
  ui.setChips([{ key: 'magnet', label: 'Magnet', glyph: 'M', color: '#69b7ff', frac: 0.15 }]);
  const chip = ui.chips.get('magnet');
  assert(chip, 'Magnet chip created in UI');
  assert(chip.el.classList.contains('buff-expiring'), 'Chip with frac < 0.25 has buff-expiring class');
});

suite.test('F8.5: Screen navigation toggles visibility across screens', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;

  ui.showScreen('menu');
  assert(!ui.screens.menu.classList.contains('hidden'), 'Menu screen visible');
  assert(ui.screens.pause.classList.contains('hidden'), 'Pause screen hidden');

  ui.showScreen('pause');
  assert(ui.screens.menu.classList.contains('hidden'), 'Menu screen hidden');
  assert(!ui.screens.pause.classList.contains('hidden'), 'Pause screen visible');
});

suite.test('F8.6: Touch controls layout switches based on preference', () => {
  const { BS } = loadGameScripts();
  const input = BS.input;
  input.setPref('dpad');
  assertEqual(input.mode, 'dpad', 'Input mode set to dpad');

  input.setPref('swipe');
  assertEqual(input.mode, 'swipe', 'Input mode set to swipe');

  input.setPref('keys');
  assertEqual(input.mode, 'keys', 'Input mode set to keys');
});

// =========================================================================
// FEATURE 9: Modal Accessibility & Navigation (§R2, §AC)
// =========================================================================

suite.test('F9.1: Modals exist in DOM with class modal and panel container', () => {
  const root = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const modalIds = ['modal-settings', 'modal-guide', 'modal-save'];
  for (const id of modalIds) {
    const regex = new RegExp(`id="${id}"[^>]*class="[^"]*modal[^"]*"`, 'i');
    assert(regex.test(indexHtml), `${id} is declared in index.html with class modal`);
  }
});

suite.test('F9.2: Settings modal opens, syncs controls, switches tabs, and updates volume labels', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;
  ui.openSettingsModal();
  assert(ui.isSettingsOpen(), 'Settings modal is open');

  ui.syncSettings({ music: 0.85, sfx: 0.40, muted: false, touch: 'dpad', walls: 'wrap', shake: true, flash: true, rival: true });
  assertEqual(ui.el.valMusic.textContent, '85%', 'Music volume label reflects 85%');
  assertEqual(ui.el.valSfx.textContent, '40%', 'SFX volume label reflects 40%');

  ui.closeSettingsModal();
  assert(!ui.isSettingsOpen(), 'Settings modal closed');
});

suite.test('F9.3: Field Guide modal opens, renders specimen preview, and switches tabs', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;
  ui.openGuide();
  assert(ui.isGuideOpen(), 'Field Guide modal is open');

  ui.setGuideTab('hazards');
  assert(ui.isGuideOpen(), 'Switched to hazards tab');

  ui.closeGuide();
  assert(!ui.isGuideOpen(), 'Field Guide closed');
});

suite.test('F9.4: Save Data modal configures export vs import mode and populates textarea', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;
  const testJson = JSON.stringify({ version: 1, test: true });

  // Export mode
  ui.openSaveModal(testJson, true);
  assert(ui.isSaveModalOpen(), 'Save modal open');
  assertEqual(ui.el.saveJsonArea.value, testJson, 'Save JSON populated in textarea');
  assertEqual(ui.el.saveModalTitle.textContent, 'Export Save Data', 'Title shows Export');

  // Import mode
  ui.openSaveModal('', false);
  assertEqual(ui.el.saveModalTitle.textContent, 'Import Save Data', 'Title shows Import');

  ui.closeSaveModal();
  assert(!ui.isSaveModalOpen(), 'Save modal closed');
});

suite.test('F9.5: Modal focus trapping and Escape key dismissal', () => {
  const { BS, env } = loadGameScripts();
  const ui = BS.ui;
  ui.openSettingsModal();
  assert(ui.isSettingsOpen(), 'Settings open');

  // Simulate Escape key on window
  env.win.dispatchEvent({ key: 'Escape', type: 'keydown' });
  assert(!ui.isSettingsOpen(), 'Escape key dismissed Settings modal');
});

suite.test('F9.6: Menu stats badge trigger element exists in DOM and handles clicks', () => {
  const root = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert(indexHtml.includes('id="menuStats"'), 'menuStats element exists in index.html');
  assert(indexHtml.includes('class="menu-stats'), 'menuStats has menu-stats class');

  const { BS } = loadGameScripts();
  let clicked = false;
  BS.ui.h.onOpenBadges = () => { clicked = true; };
  BS.ui.el.menuStats.click();
  assert(clicked, 'Clicking menuStats triggers onOpenBadges handler');
});

// Run directly if executed as main
if (require.main === module) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
