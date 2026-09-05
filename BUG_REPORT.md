# 🐍 BioSerpent — Bug & Optimization Report

**Branch:** `arena/01a06eff-bioserpent` · **Base commit:** `4488cc5a` · **Date:** 2026-09-05
**Scope:** `index.html`, `css/`, `js/**` (7,133 LOC JS), `sw.js`, `manifest.json`

---

## How this was analysed

1. **Full read** of every JS module, plus the HTML/CSS/Service-Worker/PWA plumbing.
2. **Headless execution**: a Node harness stubbed the DOM + Canvas2D API and booted the real
   game scripts in order, then drove `Game.update()/render()` for thousands of frames across
   every mode (menu, classic, time attack, zen, daily, campaign levels, rival on/off),
   capturing every thrown error (**0 runtime exceptions** — no crashes found).
3. **Instrumented probes** for the suspects below (board sizing, resize, hotkeys, cooldowns,
   persistence, save/load, countdown) plus a **draw-call profiler** and a **logic-cost
   benchmark**. Numbers quoted in the evidence lines are measured, not estimated.

### Severity scale

| Level | Meaning |
|---|---|
| 🔴 **Critical** | Crash, data loss, or the game is unplayable. |
| 🟠 **High** | A core feature is materially broken or a run can be lost unfairly. |
| 🟡 **Medium** | Wrong/undesired behaviour with a visible or functional impact; a workaround exists. |
| 🔵 **Low** | Cosmetic, edge-case, or hygiene issue. |
| ⚪ **Opt** | Not a bug — a performance / memory / maintainability improvement. |

---

## Summary

| Severity | Count | IDs |
|---|---|---|
| 🔴 Critical | 0 | — |
| 🟠 High | 2 | B1, B2 |
| 🟡 Medium | 8 | B3 – B10 |
| 🔵 Low | 9 | B11 – B19 |
| ⚪ Optimization | 6 | O1 – O6 |

---

# 🟠 High

### B1 — Campaign levels silently load a **truncated map** on short/wide viewports
`js/main.js:703` · `js/entities/obstacles.js:33` · `js/entities/obstacles.js:61`

`startRun()` sets `view.forcedRows = 20` for level mode but **never calls `view.resize()`**.
The board therefore keeps whatever row count the adaptive layout last computed, and
`Obstacles.loadFromMap()` clamps the map to `BS.view.rows`:

```js
for (let y = 0; y < Math.min(rows.length, BS.view ? BS.view.rows : ROWS); y++)   // obstacles.js:33
const boardRows = BS.view ? BS.view.rows : ROWS;                                  // obstacles.js:61
```

When the stage is short (landscape phone, short desktop window) `view.rows` can be as low as
`ROWS_MIN = 14`, so **map rows 14–19 are never parsed**. The hazard grid is then built at the
truncated height and is *never rebuilt* — even after the layout settles and the board correctly
becomes 20 rows, rows 14–19 stay empty for the whole level.

**Measured impact** (stage 900×420 → `rows = 14`):

| Level | Hazards in map | Lost at rows=14 | Lost at rows=16 |
|---|---|---|---|
| 9 · Sunken Maze | 55 | **13** | 12 |
| 12 · Abyss Throne | 36 | **11** (+ both portals) | 5 |
| 6 · Mirage Maze | 29 | 10 | 10 |
| 10 · Coral Alley | 30 | 9 | 0 |
| 2 / 8 / 11 | 34 / 20 / 16 | 8 / 6 / 8 | … |

Live probe of level 12 (`startRun('level', 11)` on a 900×420 stage):

```
at startRun: forcedRows=20 view.rows=14 gridRows=14 rocks=12/16 brambles=6/12 portals=0/2
after resize: rows=20 gridRows=14 rocks=12 brambles=6 portals=0     ← never recovers
```

Portal pairs are placed in the lower half of most maps, so **"Crystal Warp" (L8) loses its core
mechanic** on a landscape phone.

**Fix** — one line, plus a safety net:

```js
this.view.forcedRows = mode === 'level' ? BASE_ROWS : null;
this.view.resize();            // ← apply the forced row count before anything reads view.rows
```
and in `Game.onResize()` (or `View.resize()`), re-run `obstacles._rebuildGrid(COLS, view.rows)`
whenever the grid dimensions no longer match the live board.

---

### B2 — Rotating / resizing the window **instantly kills the snake**
`js/main.js:637` · `js/engine/canvas.js:156`

`onResize()` prunes out-of-bounds food and power-ups but **never validates the snake's cells**.
If the adaptive board shrinks (portrait → landscape), the head can end up outside the board, and
the next `step()` returns `{death:'wall'}`. The window listener makes it worse: it calls
`view.resize()` *immediately* but defers `onResize()` by 150 ms (`main.js:2118`), so the board is
already inconsistent for ~10 frames.

**Reproduced:**

```
rows at start = 30, snake at y = 28
rotate to 780×360 → rows = 14, head y = 28
state after the next step: over        (death cause "wall")
```

**Fix** — in `onResize()`, clamp every snake cell (and the rival's) into
`[0, COLS-1] × [0, rows-1]` (wrapping or truncating), or freeze the row count for the duration of
a run and only apply a new row count on the next run.

---

# 🟡 Medium

### B3 — Global hotkeys fire **while typing in the save-import textarea**
`js/engine/inputManager.js:212-240`

The `M` / `R` / `?`/`H` / `Escape` branches run **before** the "don't steal keys from form
fields" guard at line 243 (`t.closest('input, select, textarea, …')`). Measured on a focused
`#saveJsonArea`:

```
typing "m" → settings.muted  false → true
typing "r" → game state      paused → countdown   (the paused run is discarded)
```

Pasting a save containing the letters *m* or *r* therefore mutes the game or **restarts (and
loses) an in-progress run**. The guide (`?`) also pops open mid-typing.

**Fix** — move the `const t = e.target; if (t && t.closest && t.closest('input, select, textarea, button, a')) return;`
guard to the top of `onKeyDown`, keeping only `Escape` and the global modifier combos outside it.

---

### B4 — Board size leaks between modes
`js/main.js:703`

Same root cause as B1. `forcedRows` is cleared for non-level modes but nothing resizes, so
leaving a level keeps the 20-row board until an unrelated resize happens — Classic/Zen/Daily then
play on a smaller-than-intended board (wasted screen space, and `liveRows()` disagrees with the
viewport):

```
menu rows = 30 → classic rows = 30 → level rows = 20
back to classic: rows = 20, forcedRows = null      ← stale until an explicit resize
after resize: rows = 30                             ← what it should have been
```

---

### B5 — Insects stranded off-board after a resize are **never cleaned up**
`js/main.js:637` (`onResize`) vs `js/entities/food.js:227`

`onResize()` prunes `food.items` and `powerups.field`, but not `food.insects`. An insect left
below the new board can never move again (`food.js:301` rejects every out-of-bounds candidate, so
`chosen` stays `null`), it stays in the food occupancy map forever, and the respawn logic
(`main.js:1699`) still counts it — **the run permanently loses that insect**.

```
rows 30 → 20 :  insects: [ firefly@16,27 ]   → stranded
after 2 s of play:        [ firefly@16,27 ]   → still there, never replaced
```

**Fix** — splice out-of-bounds insects in `onResize()` (and add the same bounds check to
`FoodManager.update()`, which already handles it for `items`).

---

### B6 — Near-miss bonus cooldown is measured in **steps**, not milliseconds
`js/main.js:1347` · `js/main.js:1415`

`doStep(dt = 16)` has a hard-coded default `dt`, and the near-miss cooldown is decremented with
it — so one movement tick burns only 16 ms of the 900 ms cooldown, regardless of the real step
interval. Measured over 30 s of play: **one near-miss every 2.14 s instead of 0.9 s** (and it
gets slower, not faster, as the game speeds up). It directly throttles the *Daredevil* badge
(25 near misses).

**Fix** — pass the real interval (`doStep(this.stepMs * easeMul * …)`) or store
`this._nearMissUntil = performance.now() + CONFIG.nearMissCooldownMs`.

---

### B7 — The countdown counts **4 → 3 → 2 → 1 → Go!**
`js/main.js:800` · `js/main.js:1599`

`countdownTimer = 1600` and `Math.ceil(1600 / 450) = 4`, so the very first tick bumps the display
*up* from 3 to 4. Measured sequence: `4 → 3 → 2 → 1 → 0("Go!")`.

**Fix** — `countdownTimer = 1350` (3 × 450) or `Math.min(3, Math.ceil(...))`.

---

### B8 — Pausing during the countdown **cancels the rest of it**
`js/main.js:889` / `js/main.js:897` · `js/main.js:1608-1611`

`togglePause()` from `countdown` goes to `paused`, and resuming sets the state straight to
`playing` while `countdownTimer` is still ~1.4 s — the snake starts moving with no warning, and
`ui.hideCountdown()` has already hidden the numbers. (Also relevant: the auto-pause on
tab-blur fires during the countdown.)

**Fix** — on resume, return to `countdown` (and re-show the countdown) when
`countdownTimer > 0`.

---

### B9 — Service worker: assets cached twice, `?v=` busting defeated, offline `respondWith(undefined)`
`sw.js:8-22` · `sw.js:43-56`

* `ASSETS` lists **bare** URLs (`js/main.js`), but `index.html` requests `js/main.js?v=29`.
  `caches.match(..., { ignoreSearch: true })` then hits the bare entry and the background
  re-validate `put()`s the `?v=` URL as a **second copy of every file** (~2× storage).
* Because matching ignores the search string, bumping `?v=29 → ?v=30` inside one cache
  generation can still serve the **previous** build's body.
* `return hit || fetching` where `fetching` resolves to `undefined` on failure →
  `respondWith(undefined)` throws for uncached, offline requests (e.g. the Google Fonts
  stylesheet).

**Fix** — list the versioned URLs in `ASSETS` (or strip queries everywhere), drop
`ignoreSearch`, and fall back to `caches.match('./index.html')` / `new Response('', {status:504})`
instead of `undefined`.

---

### B10 — In-run stats are lost if the tab is closed
`js/main.js` (`persist()` call sites)

`save.stats` (apples / golden / insects / power-ups / near misses) is only written when a badge
unlocks, when a run ends, or on `startRun`. Instrumented trace of 5 apples eaten:

```
persist() from: Game.startRun (main.js:789)
persist() from: Game.checkBadges (main.js:414)
persist() from: Game.finishRun (main.js:1281)
```

`beforeunload` only saves the **Zen** best. Quitting mid-run throws away every lifetime counter
accumulated since the last badge.

**Fix** — call `persist()` in `beforeunload`/`visibilitychange` (or debounce-save every ~10 s).

---

# 🔵 Low

| ID | Issue | Location |
|---|---|---|
| **B11** | **Zen "NEW BEST!" never fires.** `doStep()` writes `save.best.zen = snake.length` at the end of every step (`main.js:1437`), so `maybeNewBest()` — called earlier from `consume()` — always compares against an already-updated best. Measured: 0 popups in Zen vs 1 in the Classic control over the same growth. | `js/main.js:1437`, `1076` |
| **B12** | **Game-over "Personal Best" bar always shows 100 %** after a new best, because `finishRun()` updates the best before the panel is built (`bestScore = max(d.best, score)`). | `js/ui/uiManager.js:731-733` |
| **B13** | Menu attract-mode snake can spawn **partly off-board** on short viewports: `resetDemo()` uses hard-coded `randi(4, 15)` while `rows` may be 14. Measured **47 / 200** demo resets produced an out-of-bounds body cell. | `js/main.js:213` |
| **B14** | Snake idle animation (blink / tongue / mouth) is **frozen during the countdown** and on the game-over screen, because `update()` returns before `snake.tick()`. Measured: `blinkT` unchanged after 0.5 s. | `js/main.js:1597-1613` vs `js/main.js:1692` |
| **B15** | `_dailyCountedToday` is never reset when the calendar day rolls over, so the *Daily Devotee* badge (7 days) can advance **at most once per page load**. Measured across 3 simulated days: `dailyPlayed` stayed at 1. | `js/main.js:1222` |
| **B16** | Dying to the rival reuses the **wall death FX** — `causeFx` has no `rival` key, so it falls back to the grey "wall" particles/flash. | `js/main.js:1135` |
| **B17** | D-pad burst can **stick on**. `bindDPad()` explicitly calls `releasePointerCapture()` and only listens for `pointerup` on the d-pad container, so lifting the finger outside the pad never clears `_dpBurstId` → `game.burst` stays `true` until the next blur. (The swipe/joystick path is safe — it keeps capture on `#stage`.) | `js/engine/inputManager.js:365`, `js/engine/inputManager.js:386-394` |
| **B18** | Save-import validation is only `obj.best && obj.settings` (`main.js:1984`); `Object.assign` then copies arbitrary values into `stars` / `stats`. A non-numeric star value makes `sumStars()` string-concatenate and silently breaks every star-gated skin unlock. | `js/main.js:1984-2010` |
| **B19** | Time-up (Time Attack) plays the **"power expired"** jingle and shows the game-over panel instantly, skipping the dissolve used by every other ending. | `js/main.js:1298` (`gentle`), `js/audio/soundManager.js` |

---

# ⚪ Optimizations

### O1 — Baked background canvases cost ~30 MB of VRAM/RAM
`js/main.js:501-560`

Up to 4 cached canvases are baked at full board size × device pixel ratio (up to `dprMax = 3`),
plus the separate rock bake. Measured on a 380×570 board at dpr 3:

```
4 background canvases = 29.7 MB   +   rock bake = 7.4 MB
```

**Fix** — bake at `Math.min(dpr, 2)` (or even 1.5) and let `drawImage` upscale: the background is
a soft gradient + blobs, so the quality loss is invisible and the memory drops ~55 %.

### O2 — Radial gradients rebuilt every frame for fireflies and portals
`js/entities/food.js:569` · `js/entities/obstacles.js:250`

Unlike the apple/golden berries, these two paths call `createRadialGradient()` on every frame for
every entity. Measured on a level with 2 fireflies + 2 portals: **5.2 gradient objects created per
frame** (~310/s). **Fix** — memoise by `cell` size exactly like `_gradCache` already does for
apples.

### O3 — Body rendering: ~2.9 canvas strokes per spine sample
`js/entities/snake.js:drawBody`

Each spine sample costs 2 strokes (outline + fill) plus a shadow pass and a belly pass. Measured
draw calls per frame: **120 strokes** (short snake) → **173 strokes** with the rival on, ~210
`beginPath`s. Acceptable today, but the biggest remaining render cost. **Fix** — batch the
outline pass into one path per width bucket (the particle system already uses this trick), or
skip the shadow pass on low-end devices / when `REDUCED_MOTION` is set.

### O4 — Every slider tick triggers a resize, a food/power-up prune **and** a localStorage write
`js/ui/uiManager.js:255` → `Game.applySettings()` (`js/main.js:927`)

Dragging the volume slider fires `onSettingsChange` → `applySettings()` →
`view.resize()` + `onResize()` + `persist()` (synchronous `JSON.stringify` + `localStorage.setItem`)
on every `input` event. **Fix** — debounce `persist()` (and skip the resize when only volumes change).

### O5 — Rival AI allocates fresh BFS/flood-fill buffers per step
`js/entities/rival.js:_doStep`, `floodFillSize`

Each step allocates `const q = [start]` for the BFS and again for each of up to 5 flood fills.
Measured 59 steps / 59 flood fills over 10 s — cheap at 20×20, but it is per-step garbage.
**Fix** — reuse preallocated `Int32Array` ring buffers (the menu demo AI already does this).

### O6 — Service-worker duplicate entries
Same as **B9**: every asset is stored twice (bare + `?v=` URL) — roughly 2× the offline cache size.

---

# ✅ Verified healthy (no action needed)

These were specifically probed and came back clean:

* **No runtime exceptions** in any mode — ~15 k simulated frames across menu, Classic, Time
  Attack, Zen, Daily, campaign levels (0/8/11 run headless, all 12 maps parsed), pause/restart/quit/reset/resize paths.
* **Game-logic cost is negligible**: `update()` averages **0.024–0.032 ms/frame** with a 45-segment
  snake *and* the rival AI running (measured over 2 000 frames). The rival's BFS + flood fill runs
  ~6×/s and is not a hot spot.
* **No missing DOM ids** — every `getElementById`/`$(…)` in JS resolves against `index.html`
  (scripted cross-check of all 60+ ids).
* **Occupancy bookkeeping is correct** — the incremental `Snake.occ` / `FoodManager.occ` maps stay
  perfectly in sync through grow/shrink/prune/ghost-wrap sequences (verified after `prune` with
  pending growth: `cells.length === occ.size === 7`).
* **Auto-pause on blur / visibilitychange**, ghost-vs-self vs ghost-vs-obstacle semantics, portal
  re-entry guard (`justTele`), and the rival's stale-respawn guard (`_rivalRunId`) all behave as
  documented.
* **Background caching, particle colour batching, HUD throttling (110 ms) and the obstacles rock
  bake** are all working as intended — the render side is already well optimised apart from O1–O3.

---

## Suggested fix order

1. **B1 + B4** (one-line `view.resize()` after `forcedRows`, plus a grid rebuild on resize) —
   fixes broken campaign levels for every landscape player.
2. **B2** (clamp the snake on resize) — stops unfair deaths on rotate.
3. **B3** (hotkey guard) — prevents silent loss of a paused run.
4. **B5, B6, B7, B8** — small, well-localised gameplay fixes.
5. **B9 + O6** (service worker) and **O1** (background memory) — ship-quality items.
6. **B10–B19, O2–O5** — polish pass.
