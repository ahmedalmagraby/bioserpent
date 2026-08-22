# 🐍 BioSerpent — Biomimetic Organic Snake Garden

**BioSerpent** is a fluid, modern web-based reimagining of the classic Snake arcade game featuring biomimetic organic motion, procedural animations, dynamic audio synthesis, particles, distinct biomes, diverse food & power-up systems, campaign levels, and multiple game modes.

---

## ✨ Features

- **Fluid Biomimetic Motion**: Smooth procedural spine inverse-kinematics and organic curves instead of rigid grid blocks.
- **Multiple Game Modes**:
  - 🐍 **Classic Run**: Progressive speed curves, biome transitions, combo multipliers, and high score tracking.
  - ⏳ **Time Attack**: Fast-paced score sprint under a strict timer with combo time extensions.
  - 🪷 **Zen Flow**: Relaxing, peaceful garden wandering with tail ghosting and wall wrap.
  - 🗺️ **Campaign Garden**: 12 hand-crafted obstacle courses across 4 biomes with 3-star scoring benchmarks.
- **Organic Ecosystem & Prey**:
  - Red Apples, Golden Berries, Chasing Beetles, Bioluminescent Fireflies, and Evasive Dragonflies.
- **Dynamic Power-ups**:
  - Magnet Spores, Slow-Mo Amber, Ghost Phase, 2× Multipliers, and Prune Shrooms.
- **Rich Visuals & Biomes**:
  - Emerald Rainforest, Golden Oasis, Bioluminescent Cavern, and Abyssal Reef.
  - 7 Unlockable serpent species (Emerald Python, Coral Serpent, Golden Sun Dragon, Abyssal Biolume, Albino Royal, Cosmic Aurora, Crimson Dragon).
- **Synthetic Procedural Audio & Dynamics Limiter**:
  - Web Audio API synthesizer with Dynamics Compressor peak limiting, multi-voice chords, combo chime arpeggios, and ambient soundscapes.
- **In-Game Field Guide**:
  - Comprehensive bestiary detailing prey behaviors, power-up effects, biome hazards, and controls.

---

## 🎮 Controls

| Action | Keyboard | Touch / Mobile |
|---|---|---|
| **Steer** | Arrow Keys / `W`, `A`, `S`, `D` | Swipe / Floating Joystick / On-screen D-Pad |
| **Speed Burst** | Hold `Shift` | Hold Burst Button (`⚡`) / Second Finger |
| **Pause / Resume** | `Space` / `P` / `Escape` | HUD Pause Button (`❚❚`) |
| **Quick Restart** | `R` (on game over / pause) | Restart Button (`↻`) |
| **Toggle Mute** | `M` | Settings Modal Toggle |

---

## 🚀 Quick Start / How to Play

BioSerpent runs completely client-side in any modern web browser with zero external dependencies or build steps required.

### 1. Run Locally
Open index.html directly in your browser or run a simple local web server:

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

There is no build step; scripts are loaded in dependency order from `index.html`. When you change any file, bump the `?v=N` cache-buster on its `<script>`/`<link>` tag (currently `?v=8`) so browsers pick up the new version.

---

## 📄 License

MIT License. Feel free to use, modify, and build upon this project.
