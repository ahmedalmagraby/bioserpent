// tests/test-env.js — Lightweight Node.js test environment & browser mock for BioSerpent
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class MockClassList {
  constructor(owner) {
    this._owner = owner;
    this._classes = new Set();
  }
  add(...names) {
    names.forEach(n => {
      if (n) {
        n.split(/\s+/).forEach(c => c && this._classes.add(c));
      }
    });
  }
  remove(...names) {
    names.forEach(n => {
      if (n) {
        n.split(/\s+/).forEach(c => c && this._classes.delete(c));
      }
    });
  }
  toggle(name, force) {
    if (force === true) { this._classes.add(name); return true; }
    if (force === false) { this._classes.delete(name); return false; }
    if (this._classes.has(name)) { this._classes.delete(name); return false; }
    this._classes.add(name); return true;
  }
  contains(name) { return this._classes.has(name); }
  get length() { return this._classes.size; }
  toString() { return Array.from(this._classes).join(' '); }
}

class MockElement {
  constructor(tagName = 'div', id = '', initialClass = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this._className = initialClass;
    this.classList = new MockClassList(this);
    if (initialClass) this.classList.add(initialClass);
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this._listeners = {};
    this.value = '';
    this.checked = false;
    this._textContent = '';
    this.innerHTML = '';
    this.width = 600;
    this.height = 600;
    this._rect = { left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600, x: 0, y: 0 };
  }

  set className(v) {
    this._className = String(v ?? '');
    this.classList = new MockClassList(this);
    if (this._className) this.classList.add(this._className);
  }
  get className() { return this._className; }

  set textContent(v) { this._textContent = String(v ?? ''); }
  get textContent() { return this._textContent; }

  set innerHTML(html) {
    this._innerHTML = String(html ?? '');
    this.children = [];
    if (!html) return;
    const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\/?>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1] || match[4];
      if (!tag) continue;
      const attrs = match[2] || match[5] || '';
      const inner = match[3] || '';
      const child = new MockElement(tag);
      const classMatch = attrs.match(/class="([^"]*)"/);
      if (classMatch) child.classList.add(classMatch[1]);
      const idMatch = attrs.match(/id="([^"]*)"/);
      if (idMatch) child.id = idMatch[1];
      if (inner && !inner.includes('<')) {
        child.textContent = inner;
      } else if (inner) {
        child.innerHTML = inner;
      }
      this.appendChild(child);
    }
  }
  get innerHTML() { return this._innerHTML; }

  setRect(w, h) {
    this._rect = { left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0 };
  }

  getBoundingClientRect() {
    return this._rect;
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  get firstChild() { return this.children[0] || null; }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  removeEventListener(type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(l => l !== fn);
  }

  dispatchEvent(evt) {
    const list = this._listeners[evt.type] || [];
    for (const fn of list) {
      evt.target = evt.target || this;
      evt.currentTarget = this;
      fn(evt);
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, currentTarget: this, preventDefault: () => {} });
  }

  focus() {}
  blur() {}

  getContext(type) {
    return new MockCanvasContext2D(this);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    if (!selector) return [];
    const parts = selector.trim().split(/\s+/);
    if (parts.length === 1) {
      const matchSingle = (el, sel) => {
        if (sel.startsWith('#') && el.id === sel.slice(1)) return true;
        if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return true;
        if (sel.toUpperCase() === el.tagName) return true;
        if (sel === '[data-tab]' && el.dataset.tab) return true;
        if (sel === '[data-biome]' && el.dataset.biome) return true;
        if (sel === '[data-filter]' && el.dataset.filter) return true;
        if (sel.includes('button') && el.tagName === 'BUTTON') return true;
        return false;
      };
      const results = [];
      const walk = (el) => {
        for (const child of el.children) {
          if (matchSingle(child, parts[0])) results.push(child);
          walk(child);
        }
      };
      walk(this);
      return results;
    } else {
      let current = [this];
      for (const part of parts) {
        let next = [];
        for (const parent of current) {
          next.push(...parent.querySelectorAll(part));
        }
        current = next;
      }
      return current;
    }
  }
}

class MockCanvasContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;
    this.lineCap = 'butt';
    this._stack = [];
  }
  save() { this._stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha }); }
  restore() { const s = this._stack.pop(); if (s) Object.assign(this, s); }
  fillRect() {}
  strokeRect() {}
  clearRect() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  fill() {}
  stroke() {}
  clip() {}
  setTransform() {}
  transform() {}
  resetTransform() {}
  translate() {}
  rotate() {}
  scale() {}
  drawImage() {}
  createLinearGradient() { return { addColorStop: () => {} }; }
  createRadialGradient() { return { addColorStop: () => {} }; }
  createPattern() { return {}; }
  measureText(text) { return { width: (text || '').length * 8 }; }
  fillText() {}
  strokeText() {}
  roundRect() { return this; }
}

class MockAudioParam {
  constructor(val = 0) {
    this.value = val;
    this.calls = [];
  }
  setValueAtTime(v, t) { this.value = v; this.calls.push({ fn: 'setValueAtTime', v, t }); }
  linearRampToValueAtTime(v, t) { this.value = v; this.calls.push({ fn: 'linearRampToValueAtTime', v, t }); }
  exponentialRampToValueAtTime(v, t) { this.value = v; this.calls.push({ fn: 'exponentialRampToValueAtTime', v, t }); }
  setTargetAtTime(v, t, tc) { this.value = v; this.calls.push({ fn: 'setTargetAtTime', v, t, tc }); }
  cancelScheduledValues(t) { this.calls.push({ fn: 'cancelScheduledValues', t }); }
}

class MockAudioNode {
  constructor() {
    this.gain = new MockAudioParam(1);
    this.frequency = new MockAudioParam(440);
    this.detune = new MockAudioParam(0);
    this.Q = new MockAudioParam(1);
    this.threshold = new MockAudioParam(-14);
    this.knee = new MockAudioParam(30);
    this.ratio = new MockAudioParam(12);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.25);
    this.delayTime = new MockAudioParam(0);
    this.type = 'lowpass';
  }
  connect(dest) { return dest; }
  disconnect() {}
}

class MockAudioBuffer {
  constructor(ch, len, rate) {
    this._data = new Float32Array(len);
  }
  getChannelData() { return this._data; }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0.1;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode();
  }
  createGain() { return new MockAudioNode(); }
  createOscillator() { return Object.assign(new MockAudioNode(), { start: () => {}, stop: () => {} }); }
  createDynamicsCompressor() { return new MockAudioNode(); }
  createBuffer(ch, len, rate) { return new MockAudioBuffer(ch, len, rate); }
  createDelay() { return new MockAudioNode(); }
  createBiquadFilter() { return new MockAudioNode(); }
  createBufferSource() { return Object.assign(new MockAudioNode(), { start: () => {}, stop: () => {} }); }
  createStereoPanner() { return Object.assign(new MockAudioNode(), { pan: new MockAudioParam(0) }); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

class MockLocalStorage {
  constructor() { this._store = {}; }
  getItem(k) { return this._store.hasOwnProperty(k) ? this._store[k] : null; }
  setItem(k, v) { this._store[k] = String(v); }
  removeItem(k) { delete this._store[k]; }
  clear() { this._store = {}; }
}

function createBrowserEnv() {
  const elements = {};
  const getOrCreate = (id, tag = 'div', initialClass = '') => {
    if (!elements[id]) elements[id] = new MockElement(tag, id, initialClass);
    return elements[id];
  };

  // Pre-seed known elements from index.html with initial classes
  const hiddenElements = new Set([
    'hud', 'countdown', 'dangerVignette', 'dpad', 'joyBase', 'ripple',
    'screen-levels', 'screen-skins', 'screen-badges', 'screen-pause', 'screen-over', 'screen-complete',
    'modal-settings', 'modal-guide', 'modal-save', 'pane-controls', 'pane-visuals', 'pane-data'
  ]);

  const knownIds = [
    'app', 'hud', 'hudScore', 'hudBest', 'hudBestChip', 'hudCenter', 'hudStats', 'hudCombo', 'hudBar',
    'chipBar', 'btnPause', 'stage', 'game', 'countdown', 'countdownNum', 'dangerVignette',
    'dpad', 'dpBurst', 'joyBase', 'joyStick', 'ripple', 'screen-menu', 'menuSkinPreviewBtn',
    'menuSkinCanvas', 'menuSkinName', 'btnClassic', 'btnLevels', 'btnContinueGarden',
    'btnTimeAttack', 'btnZen', 'btnDaily', 'btnSkins', 'btnBadges', 'btnSettings', 'btnGuide',
    'screen-levels', 'levelGrid', 'levelTotalStars', 'levelProgFill', 'levelBiomeTabs',
    'screen-skins', 'skinHeroCanvas', 'skinHeroName', 'skinHeroDesc', 'skinFilterTabs', 'skinGrid',
    'screen-badges', 'badgeGrid', 'badgeDailyStreak', 'badgeDailyNew', 'dockBadgeCount', 'badgeFilterTabs',
    'badgeProgText', 'badgeProgBar', 'screen-pause', 'pauseStats', 'pauseSub', 'pauseTip',
    'btnResume', 'btnPauseRestart', 'btnPauseGuide', 'btnPauseSettings', 'btnPauseQuit',
    'screen-over', 'overTitle', 'overMode', 'overStats', 'overRankBadge', 'btnOverRestart',
    'btnOverShare', 'btnOverMenu', 'screen-complete', 'starsBox', 'completeScore', 'completeNextStar',
    'btnNext', 'btnReplay', 'btnCompleteMenu', 'modal-settings', 'btnCloseSettings', 'valMusic',
    'valSfx', 'setMusic', 'setSfx', 'setMute', 'setTouch', 'setWalls', 'setShake', 'setFlash',
    'setRival', 'btnResetProgress', 'btnExportSave', 'btnImportSave', 'modal-guide', 'btnCloseGuide',
    'guideContent', 'modal-save', 'saveModalTitle', 'saveModalSub', 'saveJsonArea', 'btnSaveCopy',
    'btnSaveDownload', 'btnSaveApplyImport', 'btnCloseSaveModal', 'toasts', 'menuStats',
    'subClassic', 'subLevels', 'subTimeAttack', 'subZen', 'subDaily'
  ];

  knownIds.forEach(id => {
    const tag = id === 'game' || id.endsWith('Canvas') ? 'canvas'
      : id.startsWith('btn') || id.startsWith('dp') ? 'button'
      : id.startsWith('set') ? 'input'
      : id === 'saveJsonArea' ? 'textarea' : 'div';
    const initialClass = hiddenElements.has(id) ? (id.startsWith('modal') ? 'modal hidden' : id.startsWith('screen') ? 'screen hidden' : 'hidden') : '';
    getOrCreate(id, tag, initialClass);
  });

  // Seed hudCombo and hudBar with vis-hidden to mirror index.html
  getOrCreate('hudCombo', 'div', 'hud-combo vis-hidden');
  const hudBar = getOrCreate('hudBar', 'div', 'hud-bar vis-hidden');
  const hudBarFill = new MockElement('i', '');
  hudBar.appendChild(hudBarFill);

  // Seed settings panel and tabs
  const modalSettings = getOrCreate('modal-settings', 'div', 'modal hidden');
  const settingsPanel = new MockElement('div', '', 'panel glass pop-in settings-panel');
  modalSettings.appendChild(settingsPanel);
  ['audio', 'controls', 'visuals', 'data'].forEach(tab => {
    const btn = new MockElement('button', '', `settings-tab${tab === 'audio' ? ' active' : ''}`);
    btn.dataset.tab = tab;
    settingsPanel.appendChild(btn);
  });

  // Seed guide panel and tabs
  const modalGuide = getOrCreate('modal-guide', 'div', 'modal hidden');
  const guidePanel = new MockElement('div', '', 'panel glass pop-in guide-panel');
  modalGuide.appendChild(guidePanel);
  ['prey', 'powers', 'hazards', 'tips'].forEach(tab => {
    const btn = new MockElement('button', '', `guide-tab${tab === 'prey' ? ' active' : ''}`);
    btn.dataset.tab = tab;
    guidePanel.appendChild(btn);
  });

  const rootDoc = new MockElement('html', 'root');
  const body = new MockElement('body', 'body');
  rootDoc.appendChild(body);

  const localStorage = new MockLocalStorage();

  const getComputedStyle = (el) => ({
    paddingLeft: '0px',
    paddingRight: '0px',
    paddingTop: '0px',
    paddingBottom: '0px',
    width: (el && el._rect ? el._rect.width : 600) + 'px',
    height: (el && el._rect ? el._rect.height : 600) + 'px'
  });

  const docListeners = {};
  const doc = {
    getElementById: (id) => getOrCreate(id),
    createElement: (tag) => new MockElement(tag),
    querySelectorAll: (selector) => {
      const list = Object.values(elements);
      if (selector === '.back-btn') return list.filter(e => e.classList.contains('back-btn'));
      if (selector === '.settings-tab') {
        const p = modalSettings.querySelector('.panel');
        return p ? p.querySelectorAll('.settings-tab') : [];
      }
      if (selector === '.guide-tab') {
        const p = modalGuide.querySelector('.panel');
        return p ? p.querySelectorAll('.guide-tab') : [];
      }
      if (selector.includes('.filter-tab')) return list.filter(e => e.classList.contains('filter-tab'));
      return [];
    },
    querySelector: (selector) => {
      if (selector.startsWith('#')) return getOrCreate(selector.slice(1));
      return null;
    },
    addEventListener: (type, fn) => {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (!docListeners[type]) return;
      docListeners[type] = docListeners[type].filter(l => l !== fn);
    },
    dispatchEvent: (evt) => {
      const list = docListeners[evt.type] || [];
      list.forEach(fn => fn(evt));
    },
    hidden: false,
    visibilityState: 'visible',
    body,
    activeElement: null
  };

  const winListeners = {};
  const unrefTimeout = (fn, ms, ...args) => {
    const t = setTimeout(fn, ms, ...args);
    if (t && t.unref) t.unref();
    return t;
  };
  const unrefInterval = (fn, ms, ...args) => {
    const t = setInterval(fn, ms, ...args);
    if (t && t.unref) t.unref();
    return t;
  };

  const win = {
    BS: {},
    document: doc,
    localStorage,
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    CanvasRenderingContext2D: MockCanvasContext2D,
    getComputedStyle,
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, fn) => {
      if (!winListeners[type]) winListeners[type] = [];
      winListeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (!winListeners[type]) return;
      winListeners[type] = winListeners[type].filter(l => l !== fn);
    },
    dispatchEvent: (evt) => {
      const list = winListeners[evt.type] || [];
      list.forEach(fn => fn(evt));
    },
    requestAnimationFrame: (fn) => unrefTimeout(() => fn(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout: unrefTimeout,
    clearTimeout,
    setInterval: unrefInterval,
    clearInterval,
    navigator: {
      vibrate: () => true,
      clipboard: { writeText: () => Promise.resolve() },
      share: (d) => Promise.resolve(),
      serviceWorker: { register: () => Promise.resolve() }
    },
    location: {
      protocol: 'http:',
      hostname: 'localhost',
      origin: 'http://localhost'
    },
    devicePixelRatio: 2
  };

  return { win, doc, localStorage, elements, getComputedStyle };
}

function loadGameScripts(customEnv = null) {
  const env = customEnv || createBrowserEnv();
  const win = env.win || env;
  const projectRoot = path.resolve(__dirname, '..');

  const scriptFiles = [
    'js/engine/canvas.js',
    'js/engine/gameLoop.js',
    'js/engine/inputManager.js',
    'js/engine/particleSystem.js',
    'js/audio/soundManager.js',
    'js/entities/snake.js',
    'js/entities/rival.js',
    'js/entities/food.js',
    'js/entities/powerups.js',
    'js/entities/obstacles.js',
    'js/levels/levelData.js',
    'js/ui/uiManager.js',
    'js/main.js'
  ];

  const context = vm.createContext(Object.assign({}, global, {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    AudioContext: win.AudioContext,
    webkitAudioContext: win.webkitAudioContext,
    CanvasRenderingContext2D: win.CanvasRenderingContext2D,
    getComputedStyle: win.getComputedStyle,
    navigator: win.navigator,
    location: win.location,
    matchMedia: win.matchMedia,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
    setInterval: win.setInterval,
    clearInterval: win.clearInterval,
    Date: global.Date,
    devicePixelRatio: win.devicePixelRatio || 1
  }));

  for (const relPath of scriptFiles) {
    const fullPath = path.join(projectRoot, relPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, context, { filename: relPath });
  }

  // Stop the default running loop so tests control tick manually
  if (win.BS && win.BS.loop && win.BS.loop.stop) {
    win.BS.loop.stop();
  }
  if (win.BS && win.BS.sound && win.BS.sound.stopMusic) {
    win.BS.sound.stopMusic();
  }

  return { env, BS: win.BS, win };
}

class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run(quiet = false) {
    const results = { name: this.name, passed: 0, failed: 0, total: this.tests.length, failures: [] };
    if (!quiet) {
      console.log(`\n==================================================`);
      console.log(`  RUNNING SUITE: ${this.name} (${this.tests.length} tests)`);
      console.log(`==================================================`);
    }
    for (const t of this.tests) {
      const start = Date.now();
      try {
        await t.fn();
        const duration = Date.now() - start;
        results.passed++;
        if (!quiet) console.log(`  ✓ [PASS] ${t.name} (${duration}ms)`);
      } catch (err) {
        const duration = Date.now() - start;
        results.failed++;
        results.failures.push({ name: t.name, error: err });
        if (!quiet) {
          console.log(`  ✗ [FAIL] ${t.name} (${duration}ms)`);
          console.log(`    Error: ${err.message}`);
          if (err.stack) {
            const lines = err.stack.split('\n').slice(1, 4).join('\n    ');
            console.log(`    ${lines}`);
          }
        }
      }
    }
    if (!quiet) {
      console.log(`\n  Result: ${results.passed}/${results.total} passed (${results.failed} failed)`);
    }
    return results;
  }
}

// Simple assertion helper functions
function assert(cond, msg = 'Assertion failed') {
  if (!cond) throw new Error(msg);
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ': ' : ''}Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, msg = '') {
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr !== eStr) {
    throw new Error(`${msg ? msg + ': ' : ''}Expected deep equality:\nExpected: ${eStr}\nActual:   ${aStr}`);
  }
}

function assertThrows(fn, msg = 'Expected function to throw') {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  if (!threw) throw new Error(msg);
}

module.exports = {
  createBrowserEnv,
  loadGameScripts,
  MockElement,
  MockLocalStorage,
  MockAudioContext,
  TestSuite,
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows
};
