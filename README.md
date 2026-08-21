# 🐍 BioSerpent — Biomimetic Organic Snake Garden

**BioSerpent** is a fluid, modern web-based reimagining of the classic Snake arcade game featuring biomimetic organic motion, procedural animations, dynamic audio synthesis, particles, distinct biomes, diverse food & power-up systems, campaign levels, and multiple game modes.

---

## ✨ Features

- **Fluid Biomimetic Motion**: Smooth procedural spine inverse-kinematics and organic curves instead of rigid grid blocks.
- **Multiple Game Modes**:
  - 🐍 **Classic Run**: Progressive difficulty, speed curves, and high score tracking.
  - ⏳ **Time Attack**: Fast-paced score sprint under a strict timer.
  - 🌿 **Zen Mode**: Relaxing, peaceful garden wandering with no wall death.
  - 🗺️ **Campaign Levels**: 10 hand-crafted obstacle courses with 3-star scoring benchmarks.
- **Organic Ecosystem & Prey**:
  - Apples, Golden Berries, Chasing Beetles, Fireflies, Dragonflies, and more.
- **Dynamic Power-ups**:
  - Speed Boosts, Time Dilation / Slomo, Magnetism, Ghost (Phasing), and Multipliers.
- **Rich Visuals & Biomes**:
  - Lush Garden, Volcanic Basin, Bioluminescent Deep, Ancient Ruins, and Cosmic Void.
  - Unlockable serpent skins (Emerald, Obsidian, Coral, Aurora, etc.).
- **Synthetic Procedural Audio**:
  - Web Audio API synthesizer for responsive, real-time sound effects and ambient chimes with no external audio asset dependencies.
- **Responsive Controls**:
  - Keyboard (Arrows, WASD, Space for burst)
  - Virtual D-Pad / Touch Joystick on mobile
  - Swipe gestures

---

## 🚀 Quick Start / How to Play

BioSerpent runs completely client-side in any modern web browser with zero external dependencies or build steps required.

### 1. Run Locally
Open index.html directly in your browser or run a simple local web server:

\\\ash
# Using Python
python -m http.server 8080

# Using Node.js (npx)
npx serve .
\\\

Then navigate to \http://localhost:8080\ in your web browser.

---

## 🎮 Controls

| Action | Keyboard | Touch / Mobile |
|---|---|---|
| **Move** | Arrow Keys / \W\, \A\, \S\, \D\ | Swipe / Virtual Joystick / D-Pad |
| **Speed Burst** | \Space\ / \Shift\ | Burst Button (⚡) |
| **Pause** | \Escape\ / \P\ | HUD Pause Button (❚❚) |

---

## 🛠️ Tech Stack

- **HTML5 Canvas** (2D Context Rendering)
- **Vanilla JavaScript** (ES6+ Modules & OOP Architecture)
- **Web Audio API** (Procedural sound effects and synthesis)
- **CSS3** (Animations & Responsive Layouts)

---

## 📄 License

MIT License. Feel free to use, modify, and build upon this project.
