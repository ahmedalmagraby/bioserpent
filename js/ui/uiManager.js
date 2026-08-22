window.BS = window.BS || {};
(function (BS) {
"use strict";
const { SKINS, drawSkinPreview } = BS;

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

class UIManager {
  constructor(handlers) {
    this.h = handlers;
    this.$ = id => document.getElementById(id);
    this.el = {
      hud: this.$('hud'),
      score: this.$('hudScore'),
      best: this.$('hudBest'),
      combo: this.$('hudCombo'),
      chipBar: this.$('chipBar'),
      dpad: this.$('dpad'),
      levelGrid: this.$('levelGrid'),
      skinGrid: this.$('skinGrid'),
      badgeGrid: this.$('badgeGrid'),
      menuStats: this.$('menuStats'),
      hudBar: this.$('hudBar'),
      overTitle: this.$('overTitle'),
      overStats: this.$('overStats'),
      starsBox: this.$('starsBox'),
      completeScore: this.$('completeScore'),
      btnNext: this.$('btnNext'),
      toasts: this.$('toasts'),
      hudStats: this.$('hudStats'),
      pauseStats: this.$('pauseStats')
    };
    this._statsHtml = '';
    this.screens = {
      menu: this.$('screen-menu'),
      levels: this.$('screen-levels'),
      skins: this.$('screen-skins'),
      badges: this.$('screen-badges'),
      pause: this.$('screen-pause'),
      over: this.$('screen-over'),
      complete: this.$('screen-complete')
    };
    this.chips = new Map();
    this._wire(this.$('btnClassic'), () => this.h.onClassic());
    this._wire(this.$('btnLevels'), () => this.h.onLevels());
    this._wire(this.$('btnTimeAttack'), () => this.h.onTimeAttack());
    this._wire(this.$('btnZen'), () => this.h.onZen());
    this._wire(this.$('btnSkins'), () => this.h.onSkins());
    this._wire(this.$('btnBadges'), () => this.h.onOpenBadges());
    this._wire(this.$('btnSettings'), () => this.h.onOpenSettings());
    this._wire(this.$('btnGuide'), () => this.openGuide());
    this._wire(this.$('btnCloseGuide'), () => this.closeGuide());
    this._wire(this.$('btnPause'), () => this.h.onPauseButton());
    document.querySelectorAll('.back-btn').forEach(b => this._wire(b, () => this.h.onBack(b.dataset.back)));
    this._wire(this.$('btnResume'), () => this.h.onResume());
    this._wire(this.$('btnPauseRestart'), () => this.h.onRestart());
    this._wire(this.$('btnPauseSettings'), () => this.h.onOpenSettings());
    this._wire(this.$('btnPauseQuit'), () => this.h.onQuit());
    this._wire(this.$('btnOverRestart'), () => this.h.onRestart());
    this._wire(this.$('btnOverMenu'), () => this.h.onQuit());
    this._wire(this.$('btnNext'), () => this.h.onNextLevel());
    this._wire(this.$('btnReplay'), () => this.h.onRestart());
    this._wire(this.$('btnCompleteMenu'), () => this.h.onQuit());
    this._wire(this.$('btnCloseSettings'), () => this.h.onCloseSettings());
    this._wire(this.$('btnExportSave'), () => this.h.onExportSave());
    this._wire(this.$('btnImportSave'), () => this.h.onImportSave());
    const btnReset = this.$('btnResetProgress');
    this._resetArmed = false;
    this._resetTimer = null;
    this._wire(btnReset, () => {
      if (!this._resetArmed) {
        this._resetArmed = true;
        btnReset.textContent = '⚠ Tap again to reset';
        btnReset.classList.add('armed');
        this._resetTimer = setTimeout(() => this._disarmReset(), 3000);
      } else {
        this._disarmReset();
        this.h.onResetProgress();
      }
    });
    
    const modalSettings = this.$('modal-settings');
    modalSettings.addEventListener('pointerdown', e => {
      if (e.target === modalSettings) this.h.onCloseSettings();
    });

    const modalGuide = this.$('modal-guide');
    if (modalGuide) {
      modalGuide.addEventListener('pointerdown', e => {
        if (e.target === modalGuide) this.closeGuide();
      });
      document.querySelectorAll('.guide-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
          this.h.onClick();
          this.setGuideTab(tabBtn.dataset.tab);
        });
      });
    }

    this.el.menuStats.addEventListener('click', () => {
      this.el.menuStats.blur();
      this.h.onClick();
      this.h.onOpenBadges();
    });
    const s = {
      music: this.$('setMusic'),
      sfx: this.$('setSfx'),
      mute: this.$('setMute'),
      touch: this.$('setTouch'),
      walls: this.$('setWalls')
    };
    s.music.addEventListener('input', () => {
      this.h.onSettingsChange({ music: s.music.value / 100 });
      if (this.h.onPreviewSound) this.h.onPreviewSound('music');
    });
    s.sfx.addEventListener('input', () => {
      this.h.onSettingsChange({ sfx: s.sfx.value / 100 });
      if (this.h.onPreviewSound) this.h.onPreviewSound('sfx');
    });
    s.mute.addEventListener('change', () => this.h.onSettingsChange({ muted: s.mute.checked }));
    s.touch.addEventListener('change', () => this.h.onSettingsChange({ touch: s.touch.value }));
    s.walls.addEventListener('change', () => this.h.onSettingsChange({ walls: s.walls.value }));
  }

  _wire(el, fn) {
    el.addEventListener('click', () => {
      el.blur();
      this.h.onClick();
      fn();
    });
  }

  _disarmReset() {
    this._resetArmed = false;
    clearTimeout(this._resetTimer);
    const b = this.$('btnResetProgress');
    b.textContent = 'Reset progress';
    b.classList.remove('armed');
  }

  _openModal(m) {
    if (!m) return;
    this._prevFocus = document.activeElement;
    m.classList.remove('hidden');
    m.addEventListener('keydown', this._trapHandler);
    const p = m.querySelector('.panel');
    if (p) {
      p.setAttribute('tabindex', '-1');
      p.focus({ preventScroll: true });
    }
  }

  _closeModal(m) {
    if (!m) return;
    m.classList.add('hidden');
    m.removeEventListener('keydown', this._trapHandler);
    if (this._prevFocus && this._prevFocus.focus) {
      try { this._prevFocus.focus({ preventScroll: true }); } catch (_) { this._prevFocus.focus(); }
    }
    this._prevFocus = null;
  }

  _trapHandler(e) {
    if (e.key !== 'Tab') return;
    const modal = e.currentTarget;
    const f = modal.querySelectorAll(FOCUSABLE);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === modal.querySelector('.panel'))) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }

  showScreen(name) {
    for (const key of Object.keys(this.screens)) {
      this.screens[key].classList.toggle('hidden', key !== name);
    }
  }

  isScreenOpen() {
    return Object.values(this.screens).some(el => !el.classList.contains('hidden'));
  }

  setHUD(vis) {
    this.el.hud.classList.toggle('hidden', !vis);
    if (!vis) this.el.chipBar.innerHTML = '';
    this.chips.clear();
  }

  updateHUD(d) {
    if (d.score !== undefined) this.el.score.textContent = d.score;
    if (d.best !== undefined) this.el.best.textContent = d.best;
    if (d.stats !== undefined) this.setStats(d.stats);
    if (d.combo !== undefined) {
      if (d.combo) {
        this.el.combo.textContent = d.combo;
        this.el.combo.classList.remove('hidden');
        this.el.combo.classList.remove('pulse');
        void this.el.combo.offsetWidth;
        this.el.combo.classList.add('pulse');
      } else {
        this.el.combo.classList.add('hidden');
      }
    }
    if (d.bar !== undefined) {
      const bar = this.el.hudBar;
      if (d.bar) {
        bar.classList.remove('hidden');
        const fill = bar.querySelector('i') || bar.firstChild;
        fill.style.width = Math.max(0, Math.min(1, d.bar.frac)) * 100 + '%';
        fill.style.background = d.bar.color || 'var(--accent)';
      } else {
        bar.classList.add('hidden');
      }
    }
  }

  setChips(list) {
    const seen = new Set();
    for (const c of list) {
      seen.add(c.key);
      let chip = this.chips.get(c.key);
      if (!chip) {
        const el = document.createElement('div');
        el.className = 'chip';
        el.innerHTML = `<span class="dot" style="background:${c.color}">${c.glyph}</span><span>${c.label}</span><span class="bar"><i style="background:${c.color}"></i></span>`;
        this.el.chipBar.appendChild(el);
        chip = { el, bar: el.querySelector('.bar i') };
        this.chips.set(c.key, chip);
      }
      chip.bar.style.width = Math.max(0, Math.min(1, c.frac)) * 100 + '%';
    }
    for (const [key, chip] of this.chips) {
      if (!seen.has(key)) {
        chip.el.remove();
        this.chips.delete(key);
      }
    }
  }

  toast(html) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = html;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  buildLevels(levels, isUnlocked, starsFor, bestFor) {
    this.el.levelGrid.innerHTML = '';
    levels.forEach((lv, i) => {
      const unlocked = isUnlocked(i);
      const card = document.createElement('button');
      card.className = 'card' + (unlocked ? '' : ' locked');
      const st = starsFor(i);
      let starsHtml = '';
      for (let k = 0; k < 3; k++) starsHtml += `<span class="${k < st ? '' : 'off'}">★</span>`;
      const best = bestFor ? bestFor(i) : 0;
      card.innerHTML = `
        <div class="lv-num">LEVEL ${String(i + 1).padStart(2, '0')}</div>
        <div class="lv-name">${lv.name}</div>
        <div class="lv-biome" style="color:${{ rainforest: '#57a05a', oasis: '#d9a95f', cavern: '#6ee7f0', reef: '#54c2d8' }[lv.biome]}">${lv.blurb}</div>
        <div class="lv-goal">🍎 ${lv.goalApples} to win · Best ${best > 0 ? best : '—'}</div>
        <div class="lv-stars">${starsHtml}</div>
        ${unlocked ? '' : '<div class="lv-lock">🔒</div>'}`;
      if (unlocked) card.addEventListener('click', () => { card.blur(); this.h.onClick(); this.h.onSelectLevel(i); });
      else card.title = 'Earn a star on the previous level';
      this.el.levelGrid.appendChild(card);
    });
  }

  buildBadges(defs, isEarned) {
    this.el.badgeGrid.innerHTML = '';
    const earnedCount = defs.filter(d => isEarned(d.id)).length;
    const head = document.createElement('div');
    head.className = 'badge-summary';
    head.textContent = `${earnedCount} / ${defs.length} earned`;
    this.el.badgeGrid.appendChild(head);
    for (const b of defs) {
      const earned = isEarned(b.id);
      const card = document.createElement('div');
      card.className = 'card badge-card' + (earned ? '' : ' locked');
      card.innerHTML = `
        <div class="bd-icon">${earned ? '🏅' : '🔒'}</div>
        <div>
          <div class="sk-name">${b.name}</div>
          <div class="sk-hint">${b.desc}</div>
        </div>`;
      this.el.badgeGrid.appendChild(card);
    }
  }

  buildSkins(isUnlocked, currentId) {
    this.el.skinGrid.innerHTML = '';
    for (const skin of SKINS) {
      const unlocked = isUnlocked(skin.id);
      const card = document.createElement('button');
      card.className = 'card skin-card' + (unlocked ? '' : ' locked') + (skin.id === currentId ? ' selected' : '');
      const cv = document.createElement('canvas');
      card.appendChild(cv);
      const txt = document.createElement('div');
      txt.innerHTML = `<div class="sk-name">${skin.name}</div><div class="sk-hint">${unlocked ? (skin.trail ? '✨ Particle trail' : '✔ Unlocked') : '🔒 ' + skin.hint}</div>`;
      card.appendChild(txt);
      drawSkinPreview(cv, skin);
      if (unlocked) card.addEventListener('click', () => { card.blur(); this.h.onClick(); this.h.onSelectSkin(skin.id); });
      this.el.skinGrid.appendChild(card);
    }
  }

  syncSettings(s) {
    this.$('setMusic').value = Math.round(s.music * 100);
    this.$('setSfx').value = Math.round(s.sfx * 100);
    this.$('setMute').checked = s.muted;
    this.$('setTouch').value = s.touch;
    this.$('setWalls').value = s.walls || 'solid';
  }

  gameOver(d) {
    this.el.overTitle.textContent = d.title;
    let rows = `<div>Score</div><b>${d.score}</b>`;
    rows += `<div>${d.newBest ? '<span class="new-best">★ NEW BEST!</span>' : 'Best ' + d.best}</div>`;
    rows += `<div class="over-grid">` +
      `<span>⏱</span><b>${d.time || 0}s</b>` +
      `<span>🍎</span><b>${d.apples}</b>` +
      `<span>✨</span><b>${d.golden || 0}</b>` +
      `<span>📏</span><b>${d.length}</b>` +
      `</div>`;
    this.el.overStats.innerHTML = rows;
    this.showScreen('over');
  }

  showPauseStats(s) {
    this.el.pauseStats.innerHTML =
      `<span class="stat"><b>${s.score}</b><small>Score</small></span>` +
      `<span class="stat"><b>${s.length}</b><small>Length</small></span>` +
      `<span class="stat"><b>${s.apples}</b><small>Apples</small></span>` +
      `<span class="stat"><b>${s.time}s</b><small>Time</small></span>`;
  }

  levelComplete(d) {
    this.el.starsBox.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.className = 'star' + (i < d.stars ? ' on' : '');
      s.textContent = '⭐';
      s.style.animationDelay = i * 0.28 + 's';
      this.el.starsBox.appendChild(s);
    }
    this.el.completeScore.innerHTML = `Score <b>${d.score}</b>`;
    this.el.btnNext.classList.toggle('hidden', !d.hasNext);
    this.showScreen('complete');
  }

  setMenuStats(html) {
    this.el.menuStats.innerHTML = html;
  }

  setDpadVisible(v) {
    this.el.dpad.classList.toggle('hidden', !v);
  }

  setStats(list) {
    let html = '';
    for (const s of list) {
      html += `<span class="stat${s.cls ? ' ' + s.cls : ''}"><b>${s.v}</b><small>${s.l}</small></span>`;
    }
    if (html === this._statsHtml) return;
    this._statsHtml = html;
    this.el.hudStats.innerHTML = html;
  }

  openGuide() {
    this.setGuideTab('prey');
    this._openModal(this.$('modal-guide'));
  }

  closeGuide() {
    this._closeModal(this.$('modal-guide'));
  }

  isGuideOpen() {
    return !this.$('modal-guide').classList.contains('hidden');
  }

  openSettingsModal() {
    this._openModal(this.$('modal-settings'));
  }

  closeSettingsModal() {
    this._closeModal(this.$('modal-settings'));
  }

  isSettingsOpen() {
    return !this.$('modal-settings').classList.contains('hidden');
  }

  setGuideTab(tab) {
    document.querySelectorAll('.guide-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    const c = this.$('guideContent');
    if (!c) return;
    if (tab === 'prey') {
      c.innerHTML = `
        <div class="guide-grid">
          <div class="guide-card"><div class="g-icon">🍎</div><div><b>Red Apple (+10 pts)</b><p>Primary nourishment. Grows serpent length by 1 and powers combo multipliers.</p></div></div>
          <div class="guide-card"><div class="g-icon">✨</div><div><b>Golden Berry (+50 pts)</b><p>Rare luminous fruit that pulses with light. Adds +2 length and temporary aura.</p></div></div>
          <div class="guide-card"><div class="g-icon">🪰</div><div><b>Swift Dragonfly (+60 pts)</b><p>Fast, erratic diagonal flier. Evasive prey that flees when lunged at.</p></div></div>
          <div class="guide-card"><div class="g-icon">🪲</div><div><b>Ground Beetle (+40 pts)</b><p>Armored crawler patrolling the soil. Adds +1 length and bonus points.</p></div></div>
          <div class="guide-card"><div class="g-icon">💡</div><div><b>Biolume Firefly (+30 pts)</b><p>Gentle glowing nocturnal flyer drifting serenely through the biomes.</p></div></div>
        </div>`;
    } else if (tab === 'powers') {
      c.innerHTML = `
        <div class="guide-grid">
          <div class="guide-card"><div class="g-icon">🧲</div><div><b>Magnet Spore [M]</b><p>Generates a magnetic field pulling all nearby berries directly to your jaws.</p></div></div>
          <div class="guide-card"><div class="g-icon">⏱</div><div><b>Slow-Mo Amber [S]</b><p>Dilates time by 50%, granting total precision through obstacle mazes.</p></div></div>
          <div class="guide-card"><div class="g-icon">👻</div><div><b>Ghost Phase [G]</b><p>Phase through your own body and solid stone without taking damage.</p></div></div>
          <div class="guide-card"><div class="g-icon">✖️</div><div><b>2× Multiplier [×2]</b><p>Doubles all score gains from prey and berries during its active duration.</p></div></div>
          <div class="guide-card"><div class="g-icon">✂️</div><div><b>Prune Shroom [−3]</b><p>Instantly trims 3 tail segments to squeeze safely through tight tunnels.</p></div></div>
        </div>`;
    } else if (tab === 'hazards') {
      c.innerHTML = `
        <div class="guide-grid">
          <div class="guide-card"><div class="g-icon">🌀</div><div><b>Paired Portals</b><p>Quantum vortexes connecting distant sectors. Slither into A to emerge at partner A.</p></div></div>
          <div class="guide-card"><div class="g-icon">🪨</div><div><b>Ancient Rocks</b><p>Impassable mineral monoliths. Striking them will break your momentum.</p></div></div>
          <div class="guide-card"><div class="g-icon">🌿</div><div><b>Thorn Brambles</b><p>Sharp defensive botanical hazards. Steer carefully around their perimeter.</p></div></div>
          <div class="guide-card"><div class="g-icon">🟣</div><div><b>Toxic Spores</b><p>Pulsing cavern fungi emitting poisonous spores upon physical contact.</p></div></div>
        </div>`;
    } else {
      c.innerHTML = `
        <div class="guide-grid">
          <div class="guide-card"><div class="g-icon">🔥</div><div><b>Combo System</b><p>Consume food within 3.8s to stack combo streaks from 2× up to 5× points!</p></div></div>
          <div class="guide-card"><div class="g-icon">⚡</div><div><b>Speed Burst</b><p>Hold <b>Shift</b> on keyboard or <b>⚡</b> on touch to charge forward with a particle tail.</p></div></div>
          <div class="guide-card"><div class="g-icon">🔄</div><div><b>Wall Wrap Option</b><p>Toggle walls between Solid and Wrap mode in Settings to loop across edges.</p></div></div>
          <div class="guide-card"><div class="g-icon">🪷</div><div><b>Zen Flow Mode</b><p>Infinite peaceful garden flow with tail ghosting and zero wall death.</p></div></div>
        </div>`;
    }
  }

  setUrgent(v) {
    this.$('hudCenter').classList.toggle('urgent', v);
  }
}

Object.assign(BS, { UIManager });

})(window.BS);
