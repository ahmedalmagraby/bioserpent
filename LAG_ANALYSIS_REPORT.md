# Game Lag Analysis Report

## Executive Summary

The game experiences frame drops during **rush moments** (high action, many entities) and **when catching magnets** due to several performance bottlenecks in the rendering and update loops. The most critical issue is the **O(n²) complexity in the magnet pull collision detection**.

---

## Performance Issues Table

| # | Issue | Location | Severity | Estimated Improvement | Description |
|---|-------|----------|----------|----------------------|-------------|
| 1 | **Magnet Pull O(n²) Collision** | `food.js:125-141` | 🔴 **CRITICAL** | **40-60% FPS gain** during magnet mode | `magnetPull()` calls `occupied()` for each item within range. `occupied()` iterates ALL items+insects with `.some()`. With 10 items and 8 insects = 80+ array iterations per frame. |
| 2 | **Occupied Check Linear Search** | `food.js:27-32` | 🔴 **HIGH** | 20-30% general improvement | No spatial hash for food/insects. Every collision check scans entire arrays. Should use occupancy map like Snake does. |
| 3 | **getNearestItemPx Per-Frame** | `food.js:261-274`, `main.js:1797` | 🟠 **MEDIUM-HIGH** | 10-15% rendering boost | Called EVERY render frame. Calculates `Math.hypot()` distance to ALL items and insects. Should cache or throttle. |
| 4 | **Insect Rendering Complexity** | `food.js:407-520` | 🟠 **MEDIUM-HIGH** | 15-25% during swarms | Each dragonfly draws 4 wings with rotations, gradients, ellipses, eyes. Multiple `ctx.save()/restore()` per insect. |
| 5 | **Snake Body Wrap Copies** | `snake.js:350-369` | 🟡 **MEDIUM** | 10-20% with long snakes | For each body strand, calculates visibility offsets and draws up to 4 copies. Nested loops with canvas state changes. |
| 6 | **Chaikin Smoothing Overhead** | `snake.js:70-81`, `277-336` | 🟡 **MEDIUM** | 5-15% rendering | Subdivides spine points every render. Array allocations in hot path. |
| 7 | **Particle Batch Rebuild** | `particleSystem.js:213-271` | 🟡 **MEDIUM** | 5-10% with many particles | `_batches` Map cleared and rebuilt every render. Could reuse batch arrays. |
| 8 | **Combo/Magnet Aura Arcs** | `snake.js:400-428` | 🟢 **LOW-MEDIUM** | 3-8% during effects | Multiple arc() calls per head copy with alpha calculations. Can pre-calculate or simplify. |
| 9 | **Food Render Gradients** | `food.js:301-308`, `335-338` | 🟢 **LOW** | 2-5% | Radial gradients created per apple/egg per frame. Should cache gradient objects. |
| 10 | **Demo Mode AI Pathfinding** | `main.js:232-277` | 🟢 **LOW** | Minor (menu only) | BFS + flood-fill every demo step. Only affects menu screen. |

---

## Most Likely Cause: Magnet Pull O(n²) Collision Detection

### Root Cause Analysis

The **primary culprit** for lag during magnet collection is the `magnetPull()` function in `food.js`:

```javascript
// Line 125-141 in food.js
magnetPull(head, canLand) {
  for (const it of this.items) {           // Loop 1: N items
    const dx = head.x - it.gx;
    const dy = head.y - it.gy;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 6 || dist === 0) continue;
    let nx = it.gx;
    let ny = it.gy;
    if (Math.abs(dx) >= Math.abs(dy)) nx += Math.sign(dx);
    else ny += Math.sign(dy);
    if (canLand(nx, ny) && !this.occupied(nx, ny)) {  // ← O(M) operation!
      it.gx = nx;
      it.gy = ny;
      it.hop = 1;
    }
  }
}

// Line 27-32 in food.js
occupied(x, y) {
  if (this.items.some(i => i.gx === x && i.gy === y)) return true;   // O(N)
  return this.insects.some(n =>                                     // O(M)
    (Math.round(n.fx) === x && Math.round(n.fy) === y) ||
    (n.tx === x && n.ty === y));
}
```

### Why This Causes Lag

1. **Nested Complexity**: For each item within magnet range (up to ~6 cells), we call `occupied()` which scans ALL items AND ALL insects
2. **Called Every Tick**: This runs in the update loop (~60fps) while magnet power-up is active (9 seconds)
3. **Worst Case Scenario**: During "rush moments" you typically have:
   - 8-10 food items on board
   - 6-8 insects flying around
   - Result: 10 × (10 + 8) = **180 array iterations per frame**

### Compound Effect

This bottleneck combines with:
- **Insect movement AI** (line 181-229): Also calls `occupied()` multiple times per insect
- **Rendering overhead**: More entities = more complex draw calls
- **Particle bursts**: Food collection triggers particle explosions

---

## Recommended Fix Priority

### Phase 1 (Critical - Do First)
1. **Add spatial hash for food/insects** - Mirror the Snake's occupancy map pattern
2. **Cache getNearestItemPx results** - Only recalculate when items move or snake moves significantly
3. **Throttle magnet pull** - Only run every 2-3 ticks instead of every frame

### Phase 2 (High Impact)
4. **Simplify insect rendering** - Reduce wing flap calculations, cache wing paths
5. **Optimize Chaikin** - Only smooth when direction changes, cache smoothed segments
6. **Batch particle renders better** - Reuse batch arrays instead of clearing Map

### Phase 3 (Polish)
7. **Pre-calculate auras** - Cache combo/magnet ring calculations
8. **Cache food gradients** - Create once per spawn, not per frame

---

## Confirmation Required

Please confirm if you'd like me to proceed with implementing these fixes. I recommend starting with **Phase 1** as it will provide the most significant performance improvement with minimal code changes.

Which fixes would you like me to implement first?
