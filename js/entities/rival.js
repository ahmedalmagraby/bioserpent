window.BS = window.BS || {};
(function (BS) {
"use strict";
const { COLS, DIRS, clamp } = BS;

const DIR_VALUES = Object.values(DIRS);
// Base cadence for the rival. env.stepMs overrides per run — main.js keeps the
// rival at ~1.15x the player's current step time, so it tracks your speed curve
// while staying slightly beatable.
const RIVAL_STEP_MS = 150;
// Growth + size ceiling: the rival should read as a peer, not a leviathan.
const RIVAL_MAX_LEN = 13;

// Distinct look so it's never mistaken for the player's species.
const RIVAL_SKIN = {
  id: 'rival', name: 'Rival',
  c1: '#b388ff', c2: '#7c43bd', belly: '#e1bee7', outline: '#2a1440',
  pattern: '#f3d9ff', eye: '#ffd23e', pupil: '#181810', tongue: '#ff8ab5',
  banded: true, trail: null, unlock: null, hint: 'AI rival'
};

// AI-driven competitor serpent for Classic Run (toggle in Settings).
// Reuses Snake for movement/rendering; thinks with BFS + flood-fill survival
// checks (same family as the menu demo AI) but treats the PLAYER'S ENTIRE BODY
// as lethal terrain — it dies if IT crashes, you crash if YOU hit it.
class Rival {
  constructor() {
    this.snake = new BS.Snake();
    this.snake.skin = RIVAL_SKIN;
    this.acc = 0;
    this.dead = false;
    this._blocked = new Uint8Array(0);   // scratch BFS grid
    this._seen = new Uint8Array(0);
    this._prev = new Int16Array(0);
    this._hazGrid = null;
    this._hazKey = '';
  }

  // Interpolation fraction for rendering. Uses the pace from the most recent
  // step() call so the glide matches whatever speed the run is at.
  get tFrac() { return clamp(this.acc / (this._curPace || RIVAL_STEP_MS), 0, 1); }

  // Spawn on the right side heading left, away from the player's start, keeping
  // `sep` manhattan clearance from every player cell. Falls back gracefully.
  reset(view, playerCells, blockedFn, sep = 6) {
    const R = view.rows;
    const rows = [Math.floor(R / 2), Math.floor(R / 2) - 3, Math.floor(R / 2) + 3, 2, R - 3];
    for (const y of rows) {
      if (y < 1 || y > R - 2) continue;
      for (let hx = COLS - 4; hx >= 8; hx--) {
        let ok = true;
        for (let i = 0; i < 4; i++) {
          const cx = hx + i;
          if (blockedFn && blockedFn(cx, y)) { ok = false; break; }
          for (const c of playerCells) {
            if (Math.abs(c.x - cx) + Math.abs(c.y - y) < sep) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (ok) {
          this.snake.reset(hx, y, { x: -1, y: 0 }, 4);
          this.acc = 0;
          this.dead = false;
          return;
        }
      }
    }
    // Last resort: mirrored start row
    this.snake.reset(COLS - 5, clamp(Math.floor(R / 2), 1, R - 2), { x: -1, y: 0 }, 4);
    this.acc = 0;
    this.dead = false;
  }

  _hazardGrid(env) {
    const key = env.cols + '|' + env.rows + '|' + env.hazardVer;
    if (this._hazGrid && this._hazKey === key) return this._hazGrid;
    const g = new Uint8Array(env.cols * env.rows);
    if (env.hazardAt) {
      for (let y = 0; y < env.rows; y++) {
        for (let x = 0; x < env.cols; x++) {
          if (env.hazardAt(x, y)) g[y * env.cols + x] = 1;
        }
      }
    }
    this._hazKey = key;
    this._hazGrid = g;
    return g;
  }

  // Advance the rival on its own cadence. Returns the Snake.step() result of
  // the final executed step (check .death), or null if no step fired.
  step(dt, env) {
    this.acc += dt;
    let stepped = null;
    const pace = this._curPace = env.stepMs || RIVAL_STEP_MS;
    while (this.acc >= pace) {
      this.acc -= pace;
      stepped = this._doStep(env);
      if (stepped && stepped.death) { this.dead = true; break; }
    }
    return stepped;
  }

  _doStep(env) {
    const s = this.snake;
    const W = env.cols, R = env.rows;
    const N = W * R;
    const idx = (x, y) => y * W + x;
    if (this._blocked.length !== N) this._blocked = new Uint8Array(N);
    if (this._seen.length !== N) this._seen = new Uint8Array(N);
    if (this._prev.length !== N) this._prev = new Int16Array(N);
    const blocked = this._blocked;
    const seen = this._seen;
    const prev = this._prev;
    blocked.fill(0);
    seen.fill(0);
    prev.fill(-1);

    // Own body (tail cell vacates each step)
    for (let i = 0; i < s.cells.length - 1; i++) {
      blocked[idx(s.cells[i].x, s.cells[i].y)] = 1;
    }
    // The player's whole body is lethal terrain
    const pc = env.playerCells;
    for (let i = 0; i < pc.length; i++) {
      const c = pc[i];
      if (c.x >= 0 && c.x < W && c.y >= 0 && c.y < R) blocked[idx(c.x, c.y)] = 1;
    }
    // Static hazards (rocks/brambles/spores), cached per board+map version
    const haz = this._hazardGrid(env);
    for (let i = 0; i < N; i++) if (haz[i]) blocked[i] = 1;

    const wrap = !!env.wrap;
    const start = idx(s.head.x, s.head.y);
    const target = env.target ? idx(clamp(env.target.gx, 0, W - 1), clamp(env.target.gy, 0, R - 1)) : -1;
    seen[start] = 1;
    const q = [start];
    let found = false;
    while (q.length) {
      const cur = q.shift();
      if (cur === target) { found = true; break; }
      const cx2 = cur % W;
      const cy2 = (cur / W) | 0;
      for (const d of DIR_VALUES) {
        const nx = wrap ? (cx2 + d.x + W) % W : cx2 + d.x;
        const ny = wrap ? (cy2 + d.y + R) % R : cy2 + d.y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= R) continue;
        const ni = idx(nx, ny);
        if (seen[ni] || blocked[ni]) continue;
        seen[ni] = 1;
        prev[ni] = cur;
        q.push(ni);
      }
    }

    let dir = null;
    if (found) {
      let sc = target;
      while (prev[sc] !== start && prev[sc] !== -1) sc = prev[sc];
      if (prev[sc] !== -1) {
        const sx = sc % W, sy = (sc / W) | 0;
        for (const d of DIR_VALUES) {
          const tx = wrap ? (s.head.x + d.x + W) % W : s.head.x + d.x;
          const ty = wrap ? (s.head.y + d.y + R) % R : s.head.y + d.y;
          if (tx === sx && ty === sy) {
            // Don't take a path into a pocket smaller than our body
            if (this.floodFillSize(sx, sy, blocked, W, R, wrap) >= s.cells.length) dir = d;
            break;
          }
        }
      }
    }
    // No safe path to the apple: chase our own tail instead of freezing or
    // suiciding. The tail cell vacates each beat, so circling it is always
    // survivable until a route to the apple opens again.
    if (!dir && env.target) {
      dir = this.tailChaseDir(blocked, seen, prev, start, W, R, wrap);
    }
    if (!dir) dir = this.greedyDir(blocked, W, R, env.target, wrap);
    if (!dir) return { held: true };   // fully boxed in: freeze rather than die
    s.dir = dir;
    return s.step({
      wrap,
      cols: W,
      rows: R,
      ghost: false,
      blocked: env.hazardAt ? env.hazardAt : null
    });
  }

  // Survival mode: step toward our own tail using the BFS distance field the
  // apple search just produced. The tail vacates each beat, so tail-chasing is
  // always survivable; it keeps the rival alive until the apple opens up again.
  // Returns null only if the tail itself is unreachable (truly boxed in).
  tailChaseDir(blocked, seen, prev, start, W, R, wrap) {
    const s = this.snake;
    const tail = s.cells[s.cells.length - 1];
    let best = null;
    let bestScore = Infinity;
    for (const d of DIR_VALUES) {
      const nx = wrap ? (s.head.x + d.x + W) % W : s.head.x + d.x;
      const ny = wrap ? (s.head.y + d.y + R) % R : s.head.y + d.y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= R) continue;
      const ni = ny * W + nx;
      if (blocked[ni] || prev[ni] === -1) continue;   // wall or unreachable
      const manh = Math.abs(nx - tail.x) + Math.abs(ny - tail.y);
      // Tie-breaker: prefer moves that keep access to open space
      const space = this.floodFillSize(nx, ny, blocked, W, R, wrap);
      const score = manh - Math.min(space, s.cells.length * 2) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  floodFillSize(x0, y0, blocked, W, R, wrap) {
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= R) return 0;
    if (blocked[y0 * W + x0]) return 0;
    const seen = new Set([y0 * W + x0]);
    const q = [[x0, y0]];
    let n = 0;
    while (q.length) {
      const pair = q.pop();
      const cx = pair[0], cy = pair[1];
      n++;
      for (const d of DIR_VALUES) {
        const nx = wrap ? (cx + d.x + W) % W : cx + d.x;
        const ny = wrap ? (cy + d.y + R) % R : cy + d.y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= R) continue;
        const ni = ny * W + nx;
        if (!seen.has(ni) && !blocked[ni]) {
          seen.add(ni);
          q.push([nx, ny]);
        }
      }
    }
    return n;
  }

  greedyDir(blocked, W, R, target, wrap) {
    const s = this.snake;
    const turns = [
      { x: s.dir.x, y: s.dir.y },
      { x: s.dir.y, y: -s.dir.x },
      { x: -s.dir.y, y: s.dir.x }
    ];
    let best = null;
    let bestScore = Infinity;
    for (const d of turns) {
      const nx = wrap ? (s.head.x + d.x + W) % W : s.head.x + d.x;
      const ny = wrap ? (s.head.y + d.y + R) % R : s.head.y + d.y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= R) continue;
      if (blocked[ny * W + nx]) continue;
      const dist = target ? Math.abs(target.gx - nx) + Math.abs(target.gy - ny) : 0;
      const score = dist + (d === turns[0] ? -0.4 : 0) + Math.random() * 0.35;
      if (score < bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  tick(dt, target) {
    const h = this.snake.head;
    const near = target && Math.abs(target.gx - h.x) + Math.abs(target.gy - h.y) < 3;
    this.snake.tick(dt, near ? 1 : 0);
  }

  render(ctx, view, time, target) {
    this.snake.render(ctx, view, this.tFrac, time, {
      ghost: false,
      lookX: target ? target.gx : null,
      lookY: target ? target.gy : null
    });
  }
}

Object.assign(BS, { Rival });

})(window.BS);
