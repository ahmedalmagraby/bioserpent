# 🐍 BioSerpent — Biomimetic Organic Snake Garden

[![Play Online](https://img.shields.io/badge/🎮_Play_BioSerpent-Live_Demo-emerald?style=for-the-badge)](https://ahmedalmagraby.github.io/bioserpent/)

> **Play Live**: **[https://ahmedalmagraby.github.io/bioserpent/](https://ahmedalmagraby.github.io/bioserpent/)**

**BioSerpent** is a fluid, modern web-based reimagining of the classic Snake arcade game featuring biomimetic organic motion, procedural animations, dynamic audio synthesis, particles, distinct biomes, diverse food & power-up systems, campaign levels, and multiple game modes.

---

## ✨ Features

- **Fluid Biomimetic Motion**: Smooth procedural spine inverse-kinematics and organic curves instead of rigid grid blocks, with seamless multi-strand portal traversal and toroidal edge wrapping.
- **Multiple Game Modes**:
  - 🐍 **Classic Run**: Progressive speed curves, biome transitions, combo multipliers, optional AI Rival, and high score tracking.
  - ⏳ **Time Attack**: Fast-paced score sprint under a strict timer with prey and egg time extensions.
  - 🪷 **Zen Flow**: Relaxing, peaceful garden wandering with tail ghosting, wall wrap, and curated flow power-ups (Magnet, Slow-Mo, and 2× Multiplier).
  - 📅 **Daily Challenge**: Seeded daily modifier combinations (Sun-Baked Haste, Giant Appetite, Portal Edges, Spectral Body, Insect Frenzy) with daily streak tracking.
  - 🗺️ **Campaign Garden**: 12 hand-crafted obstacle courses across 4 biomes with 3-star scoring benchmarks and linked warp portals.
- **Organic Ecosystem & Prey**:
  - Red Apples, Golden Berries, Rare Serpent Eggs (catch for high combo-multiplied points + magnet burst, or let hatch into a Golden Berry), Chasing Beetles, Bioluminescent Fireflies, and Evasive Dragonflies.
- **Dynamic Power-ups**:
  - Magnet Spores, Slow-Mo Amber, Ghost Phase (phases through walls, obstacles, own body, and Rival serpent), 2× Multipliers, and Prune Shrooms.
- **Rich Visuals & Biomes**:
  - Emerald Rainforest, Golden Oasis, Bioluminescent Cavern, and Abyssal Reef.
  - 7 Unlockable serpent species (Emerald Python, Coral Serpent, Golden Sun Dragon, Abyssal Biolume, Albino Royal, Cosmic Aurora, Crimson Dragon).
- **Synthetic Procedural Audio & Dynamics Limiter**:
  - Web Audio API synthesizer with Dynamics Compressor peak limiting, multi-voice chords, combo chime arpeggios, and ambient soundscapes.
- **In-Game Field Guide**:
  - Comprehensive bestiary detailing prey behaviors, power-up effects, biome hazards, and controls.
- **Smart Menu Demo**:
  - The attract-mode serpent on the menu plays itself with BFS pathfinding + flood-fill survival checks.
- **Rival Serpent AI** *(optional, off by default)*:
  - Toggle in Settings → Classic Run gains an AI competitor that hunts the same apples.
  - BFS pathfinding + flood-fill survival checks + tail-chasing when cornered; treats the player's whole body as lethal terrain.
  - Adaptive pace (~1.15× your current speed), growth parity, size cap, distinct violet banded skin.
  - Crash it for +25 points — it dissolves with a sting and respawns to keep the run competitive.
- **Quality of Life**:
  - Auto-pause on tab/window blur, JSON save export/import, gamepad support, PWA offline play, adaptive mobile board.
- **Performance**:
  - Per-biome background caching (LRU of 4 baked canvases) — biome switches and resizes swap a cached canvas instead of repainting; checkerboard grid drawn as a single pattern tile.

---

## 🎮 Controls

| Action | Keyboard | Touch / Mobile | Gamepad |
|---|---|---|---|
| **Steer** | Arrow Keys / `W`, `A`, `S`, `D` | Swipe / Floating Joystick / On-screen D-Pad | D-Pad / Left Stick |
| **Speed Burst** | Hold `Shift` | Hold Burst Button (`⚡`) / Second Finger | Hold `A` / `B` / `RB` / `RT` |
| **Pause / Resume** | `Space` / `P` / `Escape` | HUD Pause Button (`❚❚`) | `Start` (+) |
| **Quick Restart** | `Space` / `R` / `Enter` (on game over) · `R` (on pause / complete) | Restart Button (`↻`) | `A` (on game over) |
| **Field Guide** | `H` / `?` | Guide Button (`📖`) | — |
| **Toggle Mute** | `M` | Settings Modal Toggle | — |

*Gamepad: any standard-layout controller (Xbox, PlayStation, etc.) — plug in and press a button to connect. The first active pad drives the game.*

---

## 🧪 Automated Testing

BioSerpent includes a comprehensive 7-tier automated test harness (233 tests) covering core features, boundary invariants, cross-feature interactions, real-world workloads, adversarial stress tests, audit optimizations, and production-readiness regression checks:

```bash
node tests/run-all-tests.js
```

- **Tier 1**: Core Isolated Features (`tests/tier1-feature-tests.js` — 56 tests)
- **Tier 2**: Boundary & Corner Conditions (`tests/tier2-boundary-tests.js` — 48 tests)
- **Tier 3**: Cross-Feature Combinations & Invariants (`tests/tier3-cross-feature-tests.js` — 16 tests)
- **Tier 4**: Real-World Workload Playthroughs (`tests/tier4-workload-tests.js` — 5 tests)
- **Tier 5**: Adversarial Coverage Hardening Matrix (`tests/tier5-adversarial-hardening.js` — 53 tests)
- **Tier 6**: Audit Remediation & Optimization Matrix (`tests/tier6-audit-remediation-tests.js` — 26 tests)
- **Tier 7**: Production Readiness & Bug Regression Matrix (`tests/tier7-production-readiness-tests.js` — 29 tests)

The GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically runs the full 7-tier test suite on every push and pull request before deploying to GitHub Pages.

---

## 🚀 Quick Start / How to Play

BioSerpent runs completely client-side in any modern web browser with zero external dependencies or build steps required.

### 1. Play Online
Jump straight into the game in your browser:
👉 **[Play BioSerpent on GitHub Pages](https://ahmedalmagraby.github.io/bioserpent/)**

### 2. Run Locally
Open `index.html` directly in your browser or run a simple local web server:

```bash
# Using Python
python -m http.server 8080

# Using Node.js (npx)
npx serve .
```

Then navigate to `http://localhost:8080` in your web browser.

---

## 🛠️ Tech Stack

- **HTML5 Canvas** (2D Context Rendering)
- **Vanilla JavaScript** (ES6+, OOP classes namespaced under a single `window.BS` global — classic `<script>` includes, no bundler or build step)
- **Web Audio API** (Procedural sound effects and synthesis)
- **CSS3** (Animations & Responsive Layouts)

### Editing files

There is no build step; scripts are loaded in dependency order from `index.html`. When you change any file, bump the `?v=N` cache-buster on its `<script>`/`<link>` tag (currently `?v=32`, matching the service worker's `bioserpent-v32` cache) so browsers pick up the new version.

---

## 📄 License

MIT License. Feel free to use, modify, and build upon this project.
