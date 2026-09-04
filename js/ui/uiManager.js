window.BS = window.BS || {};
(function (BS) {
"use strict";
const { SKINS, drawSkinPreview } = BS;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
      levelTotalStars: this.$('levelTotalStars'),
      levelProgFill: this.$('levelProgFill'),
      btnContinueGarden: this.$('btnContinueGarden'),
      skinGrid: this.$('skinGrid'),
      badgeGrid: this.$('badgeGrid'),
      menuStats: this.$('menuStats'),
      menuSkinCanvas: this.$('menuSkinCanvas'),
      menuSkinName: this.$('menuSkinName'),
      menuSkinPreviewBtn: this.$('menuSkinPreviewBtn'),
      badgeDailyStreak: this.$('badgeDailyStreak'),
      badgeDailyNew: this.$('badgeDailyNew'),
      dockBadgeCount: this.$('dockBadgeCount'),
      levelBiomeTabs: this.$('levelBiomeTabs'),
      skinHeroCanvas: this.$('skinHeroCanvas'),
      skinHeroName: this.$('skinHeroName'),
      skinHeroDesc: this.$('skinHeroDesc'),
      skinFilterTabs: this.$('skinFilterTabs'),
      badgeFilterTabs: this.$('badgeFilterTabs'),
      badgeProgText: this.$('badgeProgText'),
      badgeProgBar: this.$('badgeProgBar'),
      hudBar: this.$('hudBar'),
      hudBarFill: this.$('hudBar') ? (this.$('hudBar').querySelector('i') || this.$('hudBar').firstChild) : null,
      overTitle: this.$('overTitle'),
      overMode: this.$('overMode'),
      overStats: this.$('overStats'),
      overRankBadge: this.$('overRankBadge'),
      starsBox: this.$('starsBox'),
      completeScore: this.$('completeScore'),
      completeNextStar: this.$('completeNextStar'),
      btnNext: this.$('btnNext'),
      toasts: this.$('toasts'),
      hudStats: this.$('hudStats'),
      pauseStats: this.$('pauseStats'),
      pauseSub: this.$('pauseSub'),
      countdown: this.$('countdown'),
      countdownNum: this.$('countdownNum'),
      dangerVignette: this.$('dangerVignette'),
      subClassic: this.$('subClassic'),
      subLevels: this.$('subLevels'),
      subTimeAttack: this.$('subTimeAttack'),
      subZen: this.$('subZen'),
      subDaily: this.$('subDaily'),
      valMusic: this.$('valMusic'),
      valSfx: this.$('valSfx'),
      modalSave: this.$('modal-save'),
      saveJsonArea: this.$('saveJsonArea'),
      saveModalTitle: this.$('saveModalTitle'),
      saveModalSub: this.$('saveModalSub')
    };
    this._statsHtml = '';
    this._focusStack = [];
    this._prevFocus = null;
    this._lastTrigger = null;
    this._trapHandler = this._trapHandler.bind(this);
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
    if (this.el.btnContinueGarden) this._wire(this.el.btnContinueGarden, () => this.h.onContinueGarden ? this.h.onContinueGarden() : this.h.onLevels());
    this._wire(this.$('btnTimeAttack'), () => this.h.onTimeAttack());
    this._wire(this.$('btnZen'), () => this.h.onZen());
    this._wire(this.$('btnDaily'), () => this.h.onDaily());
    this._wire(this.$('btnSkins'), () => this.h.onSkins());
    if (this.el.menuSkinPreviewBtn) this._wire(this.el.menuSkinPreviewBtn, () => this.h.onSkins());
    this._wire(this.$('btnBadges'), () => this.h.onOpenBadges());
    this._wire(this.$('btnSettings'), () => this.h.onOpenSettings());
    this._wire(this.$('btnGuide'), () => this.openGuide());
    this._wire(this.$('btnCloseGuide'), () => this.closeGuide());
    this._wire(this.$('btnPause'), () => this.h.onPauseButton());
    document.querySelectorAll('.back-btn').forEach(b => this._wire(b, () => this.h.onBack(b.dataset.back)));
    this._wire(this.$('btnResume'), () => this.h.onResume());
    this._wire(this.$('btnPauseRestart'), () => this.h.onRestart());
    this._wire(this.$('btnPauseGuide'), () => this.openGuide());
    this._wire(this.$('btnPauseSettings'), () => this.h.onOpenSettings());
    this._wire(this.$('btnPauseQuit'), () => this.h.onQuit());
    this._wire(this.$('btnOverRestart'), () => this.h.onRestart());
    this._wire(this.$('btnOverShare'), () => this.h.onShareResult());
    this._wire(this.$('btnOverMenu'), () => this.h.onQuit());
    this._wire(this.$('btnNext'), () => this.h.onNextLevel());
    this._wire(this.$('btnReplay'), () => this.h.onRestart());
    this._wire(this.$('btnCompleteMenu'), () => this.h.onQuit());
    this._wire(this.$('btnCloseSettings'), () => this.h.onCloseSettings());
    this._wire(this.$('btnExportSave'), () => this.h.onExportSave());
    this._wire(this.$('btnImportSave'), () => this.h.onImportSave());
    this._wire(this.$('btnSaveCopy'), () => this.h.onSaveModalCopy());
    this._wire(this.$('btnSaveDownload'), () => this.h.onSaveModalDownload());
    this._wire(this.$('btnSaveApplyImport'), () => this.h.onSaveModalApplyImport(this.el.saveJsonArea ? this.el.saveJsonArea.value : ''));
    this._wire(this.$('btnCloseSaveModal'), () => this.closeSaveModal());

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

    // Settings tabs
    document.querySelectorAll('.settings-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        this.h.onClick();
        this.setSettingsTab(tabBtn.dataset.tab);
      });
    });

    // Level Garden Biome tabs
    document.querySelectorAll('#levelBiomeTabs .filter-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        this.h.onClick();
        document.querySelectorAll('#levelBiomeTabs .filter-tab').forEach(b => b.classList.toggle('active', b === tabBtn));
        if (this._lastLevelsArgs) {
          this.buildLevels(this._lastLevelsArgs[0], this._lastLevelsArgs[1], this._lastLevelsArgs[2], this._lastLevelsArgs[3], tabBtn.dataset.biome);
        }
      });
    });

    // Skin Locker Filter tabs
    document.querySelectorAll('#skinFilterTabs .filter-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        this.h.onClick();
        document.querySelectorAll('#skinFilterTabs .filter-tab').forEach(b => b.classList.toggle('active', b === tabBtn));
        if (this._lastSkinsArgs) {
          this.buildSkins(this._lastSkinsArgs[0], this._lastSkinsArgs[1], this._lastSkinsArgs[2], tabBtn.dataset.filter);
        }
      });
    });

    // Badges Filter tabs
    document.querySelectorAll('#badgeFilterTabs .filter-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        this.h.onClick();
        document.querySelectorAll('#badgeFilterTabs .filter-tab').forEach(b => b.classList.toggle('active', b === tabBtn));
        if (this._lastBadgesArgs) {
          this.buildBadges(this._lastBadgesArgs[0], this._lastBadgesArgs[1], this._lastBadgesArgs[2], tabBtn.dataset.filter);
        }
      });
    });

    // Global Keyboard navigation
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (this.isSaveModalOpen()) {
          if (e.preventDefault) e.preventDefault();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          this.closeSaveModal();
          return;
        }
        if (this.isGuideOpen()) {
          if (e.preventDefault) e.preventDefault();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          this.closeGuide();
          return;
        }
        if (this.isSettingsOpen()) {
          if (e.preventDefault) e.preventDefault();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          this.closeSettingsModal();
          return;
        }
        const activeScreen = Object.keys(this.screens).find(k => k !== 'menu' && !this.screens[k].classList.contains('hidden'));
        if (activeScreen === 'levels' || activeScreen === 'skins' || activeScreen === 'badges') {
          if (e.preventDefault) e.preventDefault();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          this.h.onClick();
          this.h.onBack('menu');
        }
      }
    });

    const modalSave = this.$('modal-save');
    if (modalSave) {
      modalSave.addEventListener('pointerdown', e => {
        if (e.target === modalSave) this.closeSaveModal();
      });
    }

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
    this.el.menuStats.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
        if (e.preventDefault) e.preventDefault();
        this.h.onClick();
        this.h.onOpenBadges();
      }
    });
    const s = {
      music: this.$('setMusic'),
      sfx: this.$('setSfx'),
      mute: this.$('setMute'),
      touch: this.$('setTouch'),
      walls: this.$('setWalls'),
      shake: this.$('setShake'),
      flash: this.$('setFlash'),
      rival: this.$('setRival')
    };
    s.music.addEventListener('input', () => {
      s.music.setAttribute('aria-valuenow', s.music.value);
      s.music.setAttribute('aria-valuetext', s.music.value + '%');
      if (this.el.valMusic) this.el.valMusic.textContent = s.music.value + '%';
      this.h.onSettingsChange({ music: s.music.value / 100 });
      if (this.h.onPreviewSound) this.h.onPreviewSound('music');
    });
    s.sfx.addEventListener('input', () => {
      s.sfx.setAttribute('aria-valuenow', s.sfx.value);
      s.sfx.setAttribute('aria-valuetext', s.sfx.value + '%');
      if (this.el.valSfx) this.el.valSfx.textContent = s.sfx.value + '%';
      this.h.onSettingsChange({ sfx: s.sfx.value / 100 });
      if (this.h.onPreviewSound) this.h.onPreviewSound('sfx');
    });
    s.mute.addEventListener('change', () => this.h.onSettingsChange({ muted: s.mute.checked }));
    s.touch.addEventListener('change', () => this.h.onSettingsChange({ touch: s.touch.value }));
    s.walls.addEventListener('change', () => this.h.onSettingsChange({ walls: s.walls.value }));
    if (s.shake) s.shake.addEventListener('change', () => this.h.onSettingsChange({ shake: s.shake.checked }));
    if (s.flash) s.flash.addEventListener('change', () => this.h.onSettingsChange({ flash: s.flash.checked }));
    if (s.rival) s.rival.addEventListener('change', () => this.h.onSettingsChange({ rival: s.rival.checked }));
  }


  _wire(el, fn) {
    if (!el) return;
    el.addEventListener('click', () => {
      this._lastTrigger = el;
      const isModalTrigger = el.id === 'btnSettings' || el.id === 'btnPauseSettings' ||
                             el.id === 'btnGuide' || el.id === 'btnPauseGuide' ||
                             el.id === 'btnExportSave' || el.id === 'btnImportSave';
      if (!isModalTrigger) {
        el.blur();
      }
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

  _getFocusable(container) {
    if (!container) return [];
    const isVisible = el => {
      if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
      if (el.closest && el.closest('.hidden')) return false;
      return el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0) || !el.classList.contains('hidden');
    };
    return Array.from(container.querySelectorAll(FOCUSABLE)).filter(isVisible);
  }

  _openModal(m, trigger = null) {
    if (!m) return;
    const prev = trigger || (document.activeElement && document.activeElement !== document.body ? document.activeElement : this._lastTrigger);
    this._focusStack.push({ modal: m, prevFocus: prev });
    this._prevFocus = prev;
    m.classList.remove('hidden');
    m.addEventListener('keydown', this._trapHandler);
    const p = m.querySelector('.panel');
    if (p) {
      p.setAttribute('tabindex', '-1');
    }
    const f = this._getFocusable(m);
    const initial = f.find(el => el.classList && el.classList.contains('active')) || f[0] || p;
    if (initial && typeof initial.focus === 'function') {
      try { initial.focus({ preventScroll: true }); } catch (_) { initial.focus(); }
    }
  }

  _closeModal(m) {
    if (!m) return;
    m.classList.add('hidden');
    m.removeEventListener('keydown', this._trapHandler);
    let entry = null;
    for (let i = this._focusStack.length - 1; i >= 0; i--) {
      if (this._focusStack[i].modal === m) {
        entry = this._focusStack.splice(i, 1)[0];
        break;
      }
    }
    const target = entry ? entry.prevFocus : (m._prevFocus || this._prevFocus);
    if (target && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    }
    this._prevFocus = this._focusStack.length > 0 ? this._focusStack[this._focusStack.length - 1].prevFocus : null;
  }

  _trapHandler(e) {
    if (e.key === 'Escape') return;
    if (e.key !== 'Tab') return;
    const modal = e.currentTarget;
    const f = this._getFocusable ? this._getFocusable(modal) : Array.from(modal.querySelectorAll(FOCUSABLE)).filter(el => !el.disabled && (!el.closest || !el.closest('.hidden')));
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    const p = modal.querySelector('.panel');
    if (e.shiftKey && (document.activeElement === first || document.activeElement === p)) {
      last.focus();
      if (e.preventDefault) e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      if (e.preventDefault) e.preventDefault();
    }
  }

  showScreen(name) {
    for (const key of Object.keys(this.screens)) {
      this.screens[key].classList.toggle('hidden', key !== name);
    }
  }

  isScreenOpen() {
    return Object.keys(this.screens).some(k => k !== 'menu' && !this.screens[k].classList.contains('hidden'));
  }

  setHUD(vis) {
    this.el.hud.classList.toggle('hidden', !vis);
    if (!vis) {
      if (this.el.chipBar) this.el.chipBar.innerHTML = '';
      this.chips.clear();
      this._lastScore = undefined;
    }
  }

  updateHUD(d) {
    if (d.score !== undefined) {
      const prev = this._lastScore;
      this._lastScore = d.score;
      this.el.score.textContent = d.score;
      if (prev !== undefined && d.score > prev) {
        if (this.el.score.classList.contains('score-bump')) {
          this.el.score.classList.remove('score-bump');
          this.el.score.classList.add('score-bump-alt');
        } else {
          this.el.score.classList.remove('score-bump-alt');
          this.el.score.classList.add('score-bump');
        }
      }
    }
    if (d.best !== undefined) this.el.best.textContent = d.best;
    if (d.stats !== undefined) this.setStats(d.stats);
    if (d.combo !== undefined) {
      if (d.combo) {
        this.el.combo.textContent = d.combo;
        this.el.combo.classList.remove('vis-hidden', 'hidden');
        if (this.el.combo.classList.contains('pulse')) {
          this.el.combo.classList.remove('pulse');
          this.el.combo.classList.add('pulse-alt');
        } else {
          this.el.combo.classList.remove('pulse-alt');
          this.el.combo.classList.add('pulse');
        }
      } else {
        this.el.combo.classList.remove('pulse', 'pulse-alt');
        this.el.combo.classList.add('vis-hidden');
      }
    }
    if (d.bar !== undefined) {
      const bar = this.el.hudBar;
      if (d.bar) {
        bar.classList.remove('vis-hidden', 'hidden');
        const fill = this.el.hudBarFill || (this.el.hudBarFill = bar.querySelector('i') || bar.firstChild);
        if (fill) {
          fill.style.width = Math.max(0, Math.min(1, d.bar.frac)) * 100 + '%';
          fill.style.background = d.bar.color || 'var(--accent)';
        }
      } else {
        bar.classList.add('vis-hidden');
      }
    }
  }

  setChips(list) {
    if (this.el.chipBar) {
      this.el.chipBar.classList.toggle('compact', list.length > 2);
    }
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
      chip.el.classList.toggle('buff-expiring', c.frac < 0.25);
    }
    for (const [key, chip] of this.chips) {
      if (!seen.has(key)) {
        chip.el.remove();
        this.chips.delete(key);
      }
    }
  }

  updateBuffs(list) {
    return this.setChips(list);
  }

  toast(html, category = '') {
    while (this.el.toasts.children.length >= 4) {
      this.el.toasts.firstElementChild.remove();
    }
    const t = document.createElement('div');
    t.className = 'toast' + (category ? ' ' + category : '');
    t.innerHTML = html;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  buildLevels(levels, isUnlocked, starsFor, bestFor, filterBiome = 'all') {
    this._lastLevelsArgs = [levels, isUnlocked, starsFor, bestFor];
    this.el.levelGrid.innerHTML = '';

    const totalStarsEarned = levels.reduce((sum, _, i) => sum + starsFor(i), 0);
    const maxStars = levels.length * 3;
    const totalPct = Math.round((totalStarsEarned / maxStars) * 100);
    if (this.el.levelTotalStars) this.el.levelTotalStars.textContent = `${totalStarsEarned} / ${maxStars} ★ (${totalPct}%)`;
    if (this.el.levelProgFill) this.el.levelProgFill.style.width = `${totalPct}%`;

    const BIOME_META = {
      rainforest: { name: '🌿 Emerald Rainforest', color: '#57a05a' },
      oasis: { name: '☀️ Golden Oasis', color: '#d9a95f' },
      cavern: { name: '💎 Bioluminescent Cavern', color: '#6ee7f0' },
      reef: { name: '🌊 Abyssal Reef', color: '#54c2d8' }
    };

    const biomes = filterBiome === 'all' ? ['rainforest', 'oasis', 'cavern', 'reef'] : [filterBiome];

    biomes.forEach(biomeKey => {
      const meta = BIOME_META[biomeKey];
      const biomeLevels = levels.map((lv, i) => ({ lv, i })).filter(item => item.lv.biome === biomeKey);
      if (!biomeLevels.length) return;

      if (filterBiome === 'all') {
        const earnedBiomeStars = biomeLevels.reduce((sum, item) => sum + starsFor(item.i), 0);
        const totalBiomeStars = biomeLevels.length * 3;
        const head = document.createElement('div');
        head.className = 'biome-header';
        head.style.borderColor = meta.color + '44';
        head.innerHTML = `<span style="color:${meta.color}">${meta.name}</span><span>${earnedBiomeStars} / ${totalBiomeStars} ★</span>`;
        this.el.levelGrid.appendChild(head);
      }

      biomeLevels.forEach(({ lv, i }) => {
        const unlocked = isUnlocked(i);
        const card = document.createElement('button');
        card.className = 'card' + (unlocked ? '' : ' locked');
        const st = starsFor(i);
        let starsHtml = '';
        for (let k = 0; k < 3; k++) starsHtml += `<span class="${k < st ? '' : 'off'}">★</span>`;
        const best = bestFor ? bestFor(i) : 0;
        const threshHtml = `<div class="lv-thresholds"><span>★ ${lv.stars[0]}</span><span>★★ ${lv.stars[1]}</span><span>★★★ ${lv.stars[2]}</span></div>`;
        const reqHtml = unlocked ? '' : `<div class="lv-unlock-req">🔒 Complete Level ${i} first</div>`;
        card.innerHTML = `
          <div class="lv-num">LEVEL ${String(i + 1).padStart(2, '0')}</div>
          <div class="lv-name">${lv.name}</div>
          <div class="lv-biome" style="color:${meta.color}">${lv.blurb}</div>
          <div class="lv-goal">🍎 ${lv.goalApples} to win · Best ${best > 0 ? best : '—'}</div>
          ${threshHtml}
          <div class="lv-stars">${starsHtml}</div>
          ${reqHtml}
          ${unlocked ? '' : '<div class="lv-lock">🔒</div>'}`;
        if (unlocked) card.addEventListener('click', () => { card.blur(); this.h.onClick(); this.h.onSelectLevel(i); });
        else card.title = `Earn a star on Level ${i} to unlock`;
        this.el.levelGrid.appendChild(card);
      });
    });
  }

  buildBadges(defs, isEarned, save, filterType = 'all') {
    this._lastBadgesArgs = [defs, isEarned, save];
    this.el.badgeGrid.innerHTML = '';
    const earnedCount = defs.filter(d => isEarned(d.id)).length;
    const pct = Math.round((earnedCount / defs.length) * 100);

    if (this.el.badgeProgText) this.el.badgeProgText.textContent = `${earnedCount} / ${defs.length} (${pct}%)`;
    if (this.el.badgeProgBar) this.el.badgeProgBar.style.width = `${pct}%`;

    for (const b of defs) {
      const earned = isEarned(b.id);
      if (filterType === 'earned' && !earned) continue;
      if (filterType === 'locked' && earned) continue;

      const card = document.createElement('div');
      card.className = 'card badge-card' + (earned ? '' : ' locked');
      let progHtml = '';
      if (!earned && save) {
        let cur = 0, max = 0;
        if (b.id === 'centipede') { cur = save.stats.maxLength || 0; max = 30; }
        else if (b.id === 'fruitsalad') { cur = save.stats.apples || 0; max = 100; }
        else if (b.id === 'goldenhunter') { cur = save.stats.golden || 0; max = 15; }
        else if (b.id === 'shroomlord') { cur = save.stats.powerups || 0; max = 25; }
        else if (b.id === 'dragonflyhunter') { cur = save.stats.dragonflies || 0; max = 5; }
        else if (b.id === 'combomaster') { cur = save.stats.combos || 0; max = 5; }
        else if (b.id === 'aurora') { cur = Object.values(save.stars || {}).reduce((a, c) => a + c, 0); max = 25; }
        else if (b.id === 'daredevil') { cur = save.stats.nearMisses || 0; max = 25; }
        else if (b.id === 'dailydevotee') { cur = save.stats.dailyPlayed || 0; max = 7; }
        if (max > 0) {
          const frac = Math.min(1, cur / max);
          progHtml = `<div class="prog-track"><div class="prog-fill" style="width:${Math.round(frac * 100)}%"></div></div><div class="sk-hint" style="color:var(--accent);margin-top:2px;">Progress: ${cur} / ${max}</div>`;
        }
      }
      card.innerHTML = `
        <div class="bd-icon">${earned ? '🏅' : '🔒'}</div>
        <div style="flex:1;min-width:0;">
          <div class="sk-name">${b.name}</div>
          <div class="sk-hint">${b.desc}</div>
          ${progHtml}
        </div>`;
      this.el.badgeGrid.appendChild(card);
    }
  }

  buildSkins(isUnlocked, currentId, save, filterType = 'all') {
    this._lastSkinsArgs = [isUnlocked, currentId, save];
    this.el.skinGrid.innerHTML = '';

    const curSkin = SKINS.find(s => s.id === currentId) || SKINS[0];
    if (this.el.skinHeroCanvas && curSkin) drawSkinPreview(this.el.skinHeroCanvas, curSkin);
    if (this.el.skinHeroName && curSkin) this.el.skinHeroName.textContent = curSkin.name;
    if (this.el.skinHeroDesc && curSkin) {
      this.el.skinHeroDesc.textContent = curSkin.desc || (curSkin.trail ? '✨ Emits elemental particle trail while moving' : 'Biomimetic scales & organic cellular pattern');
    }

    for (const skin of SKINS) {
      const unlocked = isUnlocked(skin.id);
      if (filterType === 'unlocked' && !unlocked) continue;
      if (filterType === 'locked' && unlocked) continue;

      const card = document.createElement('button');
      card.className = 'card skin-card' + (unlocked ? '' : ' locked') + (skin.id === currentId ? ' selected' : '');
      const cv = document.createElement('canvas');
      card.appendChild(cv);
      let hintText = unlocked ? (skin.trail ? '✨ Particle trail' : (skin.id === currentId ? '★ Equipped' : '✔ Unlocked')) : '🔒 ' + skin.hint;
      let progHtml = '';
      if (!unlocked && skin.unlock && save) {
        const u = skin.unlock;
        let cur = 0;
        if (u.type === 'apples') cur = save.stats.apples || 0;
        else if (u.type === 'classicBest') cur = save.best.classic || 0;
        else if (u.type === 'stars') cur = Object.values(save.stars || {}).reduce((a, c) => a + c, 0);
        if (u.value > 0) {
          const frac = Math.min(1, cur / u.value);
          progHtml = `<div class="prog-track"><div class="prog-fill" style="width:${Math.round(frac * 100)}%"></div></div>`;
          hintText = `🔒 ${cur} / ${u.value} (${skin.hint.replace(/^Score |Eat |Earn /, '')})`;
        }
      }
      const txt = document.createElement('div');
      txt.style.cssText = 'flex:1;min-width:0;';
      txt.innerHTML = `<div class="sk-name">${skin.name}</div><div class="sk-hint">${hintText}</div>${progHtml}`;
      card.appendChild(txt);
      drawSkinPreview(cv, skin);
      if (unlocked) card.addEventListener('click', () => { card.blur(); this.h.onClick(); this.h.onSelectSkin(skin.id); });
      this.el.skinGrid.appendChild(card);
    }
  }

  syncSettings(s) {
    const mVal = Math.round(s.music * 100);
    const sVal = Math.round(s.sfx * 100);
    const setMusic = this.$('setMusic');
    if (setMusic) {
      setMusic.value = mVal;
      setMusic.setAttribute('aria-valuenow', mVal);
      setMusic.setAttribute('aria-valuetext', mVal + '%');
    }
    if (this.el.valMusic) this.el.valMusic.textContent = mVal + '%';
    const setSfx = this.$('setSfx');
    if (setSfx) {
      setSfx.value = sVal;
      setSfx.setAttribute('aria-valuenow', sVal);
      setSfx.setAttribute('aria-valuetext', sVal + '%');
    }
    if (this.el.valSfx) this.el.valSfx.textContent = sVal + '%';
    this.$('setMute').checked = s.muted;
    this.$('setTouch').value = s.touch;
    this.$('setWalls').value = s.walls || 'solid';
    const shakeEl = this.$('setShake');
    if (shakeEl) shakeEl.checked = s.shake !== false;
    const flashEl = this.$('setFlash');
    if (flashEl) flashEl.checked = s.flash !== false;
    const rivalEl = this.$('setRival');
    if (rivalEl) rivalEl.checked = !!s.rival;
  }

  setSettingsTab(tab) {
    document.querySelectorAll('.settings-tab').forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.settings-pane').forEach(p => {
      p.classList.toggle('hidden', p.id !== `pane-${tab}`);
    });
  }

  updateMenuSubLabels(bests, starsSum, totalStars = 36, extra = null, currentSkinId = 'emerald') {
    if (this.el.subClassic) this.el.subClassic.textContent = `${bests.classic || 0}`;
    if (this.el.subLevels) this.el.subLevels.textContent = `${starsSum || 0} / ${totalStars} ★`;
    if (this.el.subTimeAttack) this.el.subTimeAttack.textContent = `${bests.timeattack || 0}`;
    if (this.el.subZen) this.el.subZen.textContent = `${bests.zen || 0}`;
    if (this.el.subDaily && extra && extra.daily) {
      if (extra.daily.playedToday) {
        this.el.subDaily.textContent = `Completed · Best: ${extra.daily.best || 0}`;
      } else if (extra.daily.best > 0) {
        this.el.subDaily.textContent = `Best: ${extra.daily.best} · Try again!`;
      } else {
        this.el.subDaily.textContent = `New challenge active!`;
      }
      if (this.el.badgeDailyStreak) {
        this.el.badgeDailyStreak.textContent = extra.daily.streak >= 1 ? `🔥 ${extra.daily.streak}d` : 'Daily';
      }
      if (this.el.badgeDailyNew) {
        this.el.badgeDailyNew.classList.toggle('hidden', !!extra.daily.playedToday);
      }
    }
    const btnDaily = this.$('btnDaily');
    if (btnDaily && extra && extra.daily) {
      btnDaily.classList.toggle('new-daily', !extra.daily.playedToday);
    }
    if (extra && extra.badgesCount !== undefined && this.el.dockBadgeCount) {
      this.el.dockBadgeCount.textContent = `${extra.badgesCount}/11`;
    }
    const skin = SKINS.find(s => s.id === currentSkinId) || SKINS[0];
    if (this.el.menuSkinName && skin) {
      this.el.menuSkinName.textContent = skin.name;
    }
    if (this.el.menuSkinCanvas && skin) {
      drawSkinPreview(this.el.menuSkinCanvas, skin);
    }
  }

  showCountdown(num) {
    if (!this.el.countdown || !this.el.countdownNum) return;
    this.el.countdownNum.textContent = String(num);
    this.el.countdown.classList.remove('hidden');
    this.el.countdownNum.style.animation = 'none';
    void this.el.countdownNum.offsetWidth;
    this.el.countdownNum.style.animation = 'countPop 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) forwards';
  }

  hideCountdown() {
    if (this.el.countdown) this.el.countdown.classList.add('hidden');
  }

  gameOver(d) {
    this.el.overTitle.textContent = d.title;
    if (this.el.overMode) this.el.overMode.textContent = d.modeName || '';
    
    // Performance Rank based on score & mode
    let rank = 'C';
    const score = d.score || 0;
    if (d.mode === 'classic') {
      if (score >= 400) rank = 'S';
      else if (score >= 250) rank = 'A';
      else if (score >= 120) rank = 'B';
    } else if (d.mode === 'timeattack') {
      if (score >= 300) rank = 'S';
      else if (score >= 180) rank = 'A';
      else if (score >= 100) rank = 'B';
    } else {
      if (score >= 250) rank = 'S';
      else if (score >= 150) rank = 'A';
      else if (score >= 80) rank = 'B';
    }
    
    if (this.el.overRankBadge) {
      this.el.overRankBadge.textContent = rank;
      this.el.overRankBadge.className = 'over-rank-badge rank-' + rank.toLowerCase();
    }

    const bestScore = Math.max(d.best || 0, score);
    const pbFrac = bestScore > 0 ? Math.min(1, score / bestScore) : 1;
    const pbPct = Math.round(pbFrac * 100);

    let rows = `
      <div class="over-score-hero">
        <span class="hud-label">Final Score</span>
        <span class="score-num">${d.score}</span>
        ${d.newBest ? '<span class="new-best">★ NEW PERSONAL BEST!</span>' : ''}
        <div class="over-pb-comp">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;">
            <span>Personal Best</span>
            <span style="color:var(--gold);">${bestScore} (${pbPct}%)</span>
          </div>
          <div class="over-pb-track"><div class="over-pb-fill" style="width:${pbPct}%"></div></div>
        </div>
      </div>`;

    rows += `
      <div class="over-grid">
        <div class="over-grid-item"><span>Time</span><b>${d.time || 0}s</b></div>
        <div class="over-grid-item"><span>Apples</span><b>${d.apples || 0}</b></div>
        <div class="over-grid-item"><span>Golden</span><b>${d.golden || 0}</b></div>
        <div class="over-grid-item"><span>Prey</span><b>${d.insects || 0}</b></div>
        <div class="over-grid-item"><span>Powerups</span><b>${d.powerups || 0}</b></div>
        <div class="over-grid-item"><span>Length</span><b>${d.length || 0}</b></div>
      </div>` +
      (Array.isArray(d.history) && d.history.length > 1 ? this.historyBars(d.history) : '');

    this.el.overStats.innerHTML = rows;
    this.showScreen('over');
  }

  historyBars(history) {
    const max = Math.max(...history, 1);
    const bars = history.slice(-10).map((s, i, arr) => {
      const isLast = i === arr.length - 1;
      const h = Math.max(8, Math.round((s / max) * 44));
      return `<i style="height:${h}px" class="${isLast ? 'last' : ''}" title="${s}"></i>`;
    }).join('');
    return `<div class="history-box"><small>Recent runs</small><div class="history-bars">${bars}</div></div>`;
  }

  showPauseStats(s, modeTitle = '') {
    if (this.el.pauseSub) this.el.pauseSub.textContent = modeTitle;
    this.el.pauseStats.innerHTML =
      `<span class="stat"><b>${s.score}</b><small>Score</small></span>` +
      `<span class="stat"><b>${s.length}</b><small>Length</small></span>` +
      `<span class="stat"><b>${s.apples}</b><small>Apples</small></span>` +
      `<span class="stat"><b>${s.time}s</b><small>Time</small></span>`;
    const tipEl = document.getElementById('pauseTip');
    if (tipEl) tipEl.textContent = '';
  }

  setPauseTip(text) {
    const tipEl = document.getElementById('pauseTip');
    if (tipEl && text) tipEl.textContent = text;
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
    this.completeScore = this.el.completeScore;
    if (this.completeScore) this.completeScore.innerHTML = `Score <b>${d.score}</b>`;
    if (this.el.completeNextStar) {
      if (d.stars < 3 && d.nextStarScore) {
        const nextStarsStr = d.stars === 1 ? '★★' : '★★★';
        this.el.completeNextStar.textContent = `🎯 Need ${d.nextStarScore} pts for ${nextStarsStr}`;
        this.el.completeNextStar.classList.remove('hidden');
      } else if (d.stars === 3) {
        this.el.completeNextStar.textContent = `🌟 Mastered! (3/3 Stars)`;
        this.el.completeNextStar.classList.remove('hidden');
      } else {
        this.el.completeNextStar.classList.add('hidden');
      }
    }
    this.el.btnNext.classList.toggle('hidden', !d.hasNext);
    this.showScreen('complete');
  }

  setMenuStats(html) {
    this.el.menuStats.innerHTML = html;
  }

  setDpadVisible(v) {
    this.el.dpad.classList.toggle('hidden', !v);
    document.body.classList.toggle('dpad-open', !!v);
  }

  setStats(list) {
    let html = '';
    for (const s of list) {
      const cls = s.cls ? ' ' + s.cls : '';
      const titleAttr = s.title ? ` title="${s.title}"` : '';
      const iconHtml = s.icon ? `<span class="stat-icon">${s.icon}</span>` : '';
      const labelHtml = s.l ? `<small>${s.l}</small>` : '';
      html += `<span class="stat${cls}"${titleAttr}>${iconHtml}<b>${s.v}</b>${labelHtml}</span>`;
    }
    if (html === this._statsHtml) return;
    this._statsHtml = html;
    this.el.hudStats.innerHTML = html;
  }

  openGuide() {
    this._openModal(this.$('modal-guide'));
    this.setGuideTab('prey');
  }

  closeGuide() {
    if (this._guideRaf) {
      cancelAnimationFrame(this._guideRaf);
      this._guideRaf = null;
    }
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

  openSaveModal(jsonStr = '', isExport = true) {
    if (this.el.saveModalTitle) this.el.saveModalTitle.textContent = isExport ? 'Export Save Data' : 'Import Save Data';
    if (this.el.saveModalSub) this.el.saveModalSub.textContent = isExport ? 'Copy your JSON save or download it as a backup file' : 'Paste your BioSerpent JSON save below and click Import';
    if (this.el.saveJsonArea) this.el.saveJsonArea.value = jsonStr;
    const btnImport = this.$('btnSaveApplyImport');
    if (btnImport) btnImport.classList.toggle('hidden', isExport);
    this._openModal(this.el.modalSave);
  }

  closeSaveModal() {
    this._closeModal(this.el.modalSave);
  }

  isSaveModalOpen() {
    return this.el.modalSave && !this.el.modalSave.classList.contains('hidden');
  }

  setGuideTab(tab) {
    document.querySelectorAll('.guide-tab').forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const c = this.$('guideContent');
    if (!c) return;
    c.setAttribute('aria-labelledby', `guideTab-${tab}`);
    this._guideCanvases = [];
    if (tab === 'prey') {
      c.innerHTML = `
        <div class="guide-grid">
          <div class="guide-card"><canvas id="guideCanvasApple" width="54" height="54"></canvas><div><b>Red Apple (+10 pts)</b><p>Primary nourishment. Grows serpent length by 1 and powers combo multipliers.</p></div></div>
          <div class="guide-card"><canvas id="guideCanvasGolden" width="54" height="54"></canvas><div><b>Golden Berry (+50 pts)</b><p>Rare luminous fruit that pulses with light. Adds +2 length and temporary aura.</p></div></div>
          <div class="guide-card"><canvas id="guideCanvasDragonfly" width="54" height="54"></canvas><div><b>Swift Dragonfly (+60 pts)</b><p>Fast, erratic diagonal flier. Evasive prey that flees when lunged at.</p></div></div>
          <div class="guide-card"><canvas id="guideCanvasBeetle" width="54" height="54"></canvas><div><b>Ground Beetle (+40 pts)</b><p>Armored crawler patrolling the soil. Adds +1 length and bonus points.</p></div></div>
          <div class="guide-card"><canvas id="guideCanvasFirefly" width="54" height="54"></canvas><div><b>Biolume Firefly (+30 pts)</b><p>Gentle glowing nocturnal flyer drifting serenely through the biomes.</p></div></div>
          <div class="guide-card"><canvas id="guideCanvasEgg" width="54" height="54"></canvas><div><b>Serpent Egg (+75 pts)</b><p>A rare treat! Swallow it before it hatches for big points and a magnet burst — dally and it becomes a golden berry.</p></div></div>
        </div>`;
      this._guideCanvases = [
        { id: 'guideCanvasApple', type: 'apple' },
        { id: 'guideCanvasGolden', type: 'golden' },
        { id: 'guideCanvasDragonfly', type: 'dragonfly' },
        { id: 'guideCanvasBeetle', type: 'beetle' },
        { id: 'guideCanvasFirefly', type: 'firefly' },
        { id: 'guideCanvasEgg', type: 'egg' }
      ];
      this._startGuideAnim();
    } else if (tab === 'powers') {
      if (this._guideRaf) cancelAnimationFrame(this._guideRaf);
      c.innerHTML = `
        <div class="guide-grid">
          <div class="guide-card"><div class="g-icon-box" style="color:#ffd54a;">🧲</div><div><b>Magnet Spore [M]</b><p>Generates a magnetic field pulling all nearby berries directly to your jaws.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#6ee7f0;">⏱</div><div><b>Slow-Mo Amber [S]</b><p>Dilates time by 50%, granting total precision through obstacle mazes.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#e07ec5;">👻</div><div><b>Ghost Phase [G]</b><p>Phase through your own body and all hazards — rocks, brambles, and spores — without taking damage.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#ff6b6b;">✖️</div><div><b>2× Multiplier [×2]</b><p>Doubles all score gains from prey and berries during its active duration.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#7ee08a;">✂️</div><div><b>Prune Shroom [−3]</b><p>Instantly trims 3 tail segments to squeeze safely through tight tunnels.</p></div></div>
        </div>`;
    } else if (tab === 'hazards') {
      if (this._guideRaf) cancelAnimationFrame(this._guideRaf);
      c.innerHTML = `
        <div class="guide-grid">
          <div class="guide-card"><div class="g-icon-box" style="color:#6ee7f0;">🌀</div><div><b>Paired Portals</b><p>Quantum vortexes connecting distant sectors. Slither into A to emerge at partner A.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#9db8a4;">🪨</div><div><b>Ancient Rocks</b><p>Impassable mineral monoliths. Striking them will break your momentum.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#7ee08a;">🌿</div><div><b>Thorn Brambles</b><p>Sharp defensive botanical hazards. Steer carefully around their perimeter.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#e07ec5;">🟣</div><div><b>Toxic Spores</b><p>Pulsing cavern fungi emitting poisonous spores upon physical contact.</p></div></div>
        </div>`;
    } else {
      if (this._guideRaf) cancelAnimationFrame(this._guideRaf);
      c.innerHTML = `
        <div class="guide-grid">
          <div class="guide-card"><div class="g-icon-box" style="color:#ffd54a;">🔥</div><div><b>Combo System</b><p>Consume food within 3.8s to stack combo streaks from 2× up to 5× points! At high combos your serpent glows — and the music heats up.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#ffd54a;">⚡</div><div><b>Speed Burst</b><p>Hold <b>Shift</b> on keyboard or <b>⚡</b> on touch to charge forward with a particle tail.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#6ee7f0;">💨</div><div><b>Near Miss Bonus</b><p>Skim past rocks, brambles, or spores without touching them to earn +5 style points. Risk pays!</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#ffd54a;">✨</div><div><b>Milestone Berries</b><p>Every 10 segments of growth conjures a guaranteed golden berry somewhere in the garden.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#7ee08a;">🔄</div><div><b>Wall Wrap Option</b><p>Toggle walls between Solid and Wrap mode in Settings to loop across edges.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#e07ec5;">🪷</div><div><b>Zen Flow Mode</b><p>Infinite peaceful garden flow with tail ghosting and zero wall death.</p></div></div>
          <div class="guide-card"><div class="g-icon-box" style="color:#ffd54a;">📅</div><div><b>Daily Challenge</b><p>One shared challenge per day with two random modifiers and a rotating biome. Build a streak by playing every day!</p></div></div>
        </div>`;
    }
  }

  _startGuideAnim() {
    if (this._guideRaf) cancelAnimationFrame(this._guideRaf);
    const dpr = Math.min(window.devicePixelRatio || 1, (window.BS && window.BS.CONFIG && window.BS.CONFIG.dprMax) || 3);
    const cssW = 54, cssH = 54;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    const render = (time) => {
      if (!this.isGuideOpen()) return;
      const t = time * 0.001;
      if (this._guideCanvases && this._guideCanvases.length) {
        for (const item of this._guideCanvases) {
          const cv = document.getElementById(item.id);
          if (!cv) continue;
          if (cv.width !== targetW || cv.height !== targetH) {
            cv.width = targetW;
            cv.height = targetH;
            cv.style.width = cssW + 'px';
            cv.style.height = cssH + 'px';
          }
          const ctx = cv.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);
          const cx = cssW / 2, cy = cssH / 2;

          if (item.type === 'apple') {
            const hop = Math.sin(t * 4) * 2;
            ctx.save();
            ctx.translate(cx, cy + hop);
            const grad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 14);
            grad.addColorStop(0, '#ff6b6b');
            grad.addColorStop(0.8, '#d32f2f');
            grad.addColorStop(1, '#8b0000');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 2, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#7ee08a';
            ctx.beginPath();
            ctx.ellipse(4, -9, 5, 2.5, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#5d4037';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.quadraticCurveTo(2, -11, 0, -13);
            ctx.stroke();
            ctx.restore();
          } else if (item.type === 'golden') {
            const pulse = 1 + Math.sin(t * 5) * 0.15;
            ctx.save();
            ctx.translate(cx, cy);
            const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 18 * pulse);
            halo.addColorStop(0, 'rgba(255, 213, 74, 0.8)');
            halo.addColorStop(0.5, 'rgba(255, 170, 0, 0.3)');
            halo.addColorStop(1, 'rgba(255, 213, 74, 0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffd54a';
            ctx.shadowColor = '#ffd54a';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(0, 0, 8 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-10 * pulse, 0); ctx.lineTo(10 * pulse, 0);
            ctx.moveTo(0, -10 * pulse); ctx.lineTo(0, 10 * pulse);
            ctx.stroke();
            ctx.restore();
          } else if (item.type === 'dragonfly') {
            const flap = Math.sin(t * 26);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.fillStyle = 'rgba(110, 231, 240, 0.45)';
            ctx.strokeStyle = 'rgba(110, 231, 240, 0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(-11, -5 * flap, 12, 3, -Math.PI / 8, 0, Math.PI * 2);
            ctx.ellipse(11, -5 * flap, 12, 3, Math.PI / 8, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(-9, 4 * flap, 10, 2.5, Math.PI / 8, 0, Math.PI * 2);
            ctx.ellipse(9, 4 * flap, 10, 2.5, -Math.PI / 8, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#00e5ff';
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.ellipse(0, 0, 2.5, 12, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(-2, -10, 1.8, 0, Math.PI * 2);
            ctx.arc(2, -10, 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (item.type === 'beetle') {
            const crawl = Math.sin(t * 8) * 1.5;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.strokeStyle = '#c67d0a';
            ctx.lineWidth = 1.5;
            for (let i = -1; i <= 1; i++) {
              const legAnim = Math.sin(t * 12 + i * 2) * 2.5;
              ctx.beginPath();
              ctx.moveTo(-5, i * 5);
              ctx.lineTo(-12, i * 5 + legAnim);
              ctx.moveTo(5, i * 5);
              ctx.lineTo(12, i * 5 - legAnim);
              ctx.stroke();
            }
            ctx.fillStyle = '#e69500';
            ctx.shadowColor = '#ffa000';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.ellipse(0, crawl, 7, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#5a3800';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, crawl - 10);
            ctx.lineTo(0, crawl + 10);
            ctx.stroke();
            ctx.restore();
          } else if (item.type === 'firefly') {
            const bob = Math.sin(t * 3) * 2.5;
            const glow = 0.5 + Math.sin(t * 6) * 0.5;
            ctx.save();
            ctx.translate(cx, cy + bob);
            const aura = ctx.createRadialGradient(0, 5, 2, 0, 5, 14);
            aura.addColorStop(0, `rgba(126, 224, 138, ${0.9 * glow})`);
            aura.addColorStop(1, 'rgba(126, 224, 138, 0)');
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(0, 5, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.ellipse(-5, -3, 6, 2.2, -Math.PI / 4, 0, Math.PI * 2);
            ctx.ellipse(5, -3, 6, 2.2, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(0, -3, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#7ee08a';
            ctx.shadowColor = '#7ee08a';
            ctx.shadowBlur = 8 * glow;
            ctx.beginPath();
            ctx.ellipse(0, 4, 3.5, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (item.type === 'egg') {
            const wobble = Math.sin(t * 4) * 0.08;
            ctx.save();
            ctx.translate(cx, cy + 2);
            ctx.rotate(wobble);
            const eg = ctx.createRadialGradient(-3, -4, 2, 0, 0, 13);
            eg.addColorStop(0, '#ffffff');
            eg.addColorStop(0.5, '#d4e8dd');
            eg.addColorStop(1, '#8fa998');
            ctx.fillStyle = eg;
            ctx.shadowColor = '#7ee08a';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.ellipse(0, 0, 9, 12, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#57a05a';
            ctx.beginPath();
            ctx.arc(-2.5, -2, 1, 0, Math.PI * 2);
            ctx.arc(3.5, 2.5, 0.9, 0, Math.PI * 2);
            ctx.arc(1, -5, 1.2, 0, Math.PI * 2);
            ctx.arc(-1.5, 4, 0.9, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
      this._guideRaf = requestAnimationFrame(render);
    };
    render(0);
  }

  setUrgent(v) {
    this.$('hudCenter').classList.toggle('urgent', v);
    if (this.el.dangerVignette) {
      this.el.dangerVignette.classList.toggle('hidden', !v);
      this.el.dangerVignette.classList.toggle('active', !!v);
    }
  }
}

Object.assign(BS, { UIManager });

})(window.BS);


