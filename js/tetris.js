/* =========================================================
   tetris.js —— 俄罗斯方块（核心模块）
   1) 矩阵工具：裁剪 / 顺时针旋转 / 自动生成旋转状态（旋转矩阵）
   2) 游戏引擎：开始暂停、计分、等级速度递增、下一个预览、幽灵落点
   3) 方块池设置：经典 7 种勾选 + 4x4 / 5x5 网格绘制自定义形状
   自定义形状同样参与随机下落、旋转与碰撞，并存入 localStorage
   ========================================================= */
(function (global) {
  'use strict';

  const GS = global.GS;
  const { util, store } = GS;
  const esc = util.esc;

  /* =======================================================
     1. 矩阵工具
     ======================================================= */
  const COLS = 10;
  const ROWS = 20;

  /** 经典 7 种方块（基础矩阵 + 配色） */
  const CLASSIC = {
    I: { name: 'I 长条', color: '#38bdf8', matrix: [[1, 1, 1, 1]] },
    O: { name: 'O 方块', color: '#fbbf24', matrix: [[1, 1], [1, 1]] },
    T: { name: 'T 形',   color: '#a78bfa', matrix: [[1, 1, 1], [0, 1, 0]] },
    S: { name: 'S 形',   color: '#34d399', matrix: [[0, 1, 1], [1, 1, 0]] },
    Z: { name: 'Z 形',   color: '#fb7185', matrix: [[1, 1, 0], [0, 1, 1]] },
    J: { name: 'J 形',   color: '#60a5fa', matrix: [[1, 0, 0], [1, 1, 1]] },
    L: { name: 'L 形',   color: '#fb923c', matrix: [[0, 0, 1], [1, 1, 1]] },
  };
  const CLASSIC_ORDER = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  /** 裁剪掉全空的行和列，让形状保持紧凑 */
  function trim(m) {
    let rows = m.filter(function (r) { return r.some(function (v) { return v; }); });
    if (!rows.length) return [[0]];
    const w = rows[0].length;
    const keep = [];
    for (let c = 0; c < w; c++) {
      if (rows.some(function (r) { return r[c]; })) keep.push(c);
    }
    return rows.map(function (r) { return keep.map(function (c) { return r[c]; }); });
  }

  /** 顺时针旋转 90°：out[row][col] = m[h-1-col][row] */
  function rotateCW(m) {
    const h = m.length, w = m[0].length;
    const out = [];
    for (let c = 0; c < w; c++) {
      const row = [];
      for (let r = h - 1; r >= 0; r--) row.push(m[r][c]);
      out.push(row);
    }
    return trim(out);
  }

  function keyOf(m) { return m.map(function (r) { return r.join(''); }).join('/'); }

  /**
   * 自动生成某个形状的全部旋转状态（最多 4 个，自动去重）
   * 自定义形状保存后即通过本函数参与旋转与碰撞
   */
  function buildStates(m) {
    const out = [];
    let cur = trim(m);
    for (let i = 0; i < 4; i++) {
      const k = keyOf(cur);
      if (!out.some(function (s) { return s.k === k; })) out.push({ k: k, m: cur });
      cur = rotateCW(cur);
    }
    return out.map(function (s) { return s.m; });
  }

  /** 矩阵 → 迷你 SVG 预览 */
  function svgOf(m, color, cell) {
    const c = cell || 12;
    const h = m.length, w = m[0].length;
    let rects = '';
    for (let r = 0; r < h; r++) {
      for (let col = 0; col < w; col++) {
        if (m[r][col]) {
          rects += '<rect x="' + (col * c + 1) + '" y="' + (r * c + 1) + '" width="' + (c - 2) + '" height="' + (c - 2) + '" rx="2.5" fill="' + color + '"/>';
        }
      }
    }
    return '<svg viewBox="0 0 ' + (w * c) + ' ' + (h * c) + '" width="' + (w * c) + '" height="' + (h * c) + '" aria-hidden="true">' + rects + '</svg>';
  }

  /** 依据「经典勾选 + 自定义形状」构建当前生效的方块池 */
  function buildPool() {
    const t = store.tetris();
    const list = [];
    CLASSIC_ORDER.forEach(function (k) {
      if (t.pool[k]) {
        list.push({ id: 'classic_' + k, name: CLASSIC[k].name, color: CLASSIC[k].color, states: buildStates(CLASSIC[k].matrix), classic: k });
      }
    });
    (t.customShapes || []).forEach(function (s) {
      if (!s || !Array.isArray(s.matrix) || !s.matrix.length) return;
      const st = buildStates(s.matrix);
      if (!st.length || !st[0].some(function (r) { return r.some(function (v) { return v; }); })) return;
      list.push({ id: s.id, name: s.name || '自定义', color: s.color || '#6366f1', states: st, custom: true, source: s });
    });
    return list;
  }

  /* =======================================================
     2. 游戏引擎
     ======================================================= */
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const CLEAR_ANIM_MS = 220;

  class Tetris {
    constructor(opts) {
      this.canvas = opts.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.nextCanvas = opts.nextCanvas;
      this.nextCtx = this.nextCanvas ? this.nextCanvas.getContext('2d') : null;
      this.overlay = opts.overlay;
      this.onHud = opts.onHud || function () {};

      this.cell = 26;
      this.dpr = Math.min(2, global.devicePixelRatio || 1);
      this.state = 'idle';     // idle | playing | paused | clearing | over
      this.raf = 0;
      this.lastTs = 0;
      this.dropTimer = 0;
      this.clearing = null;

      this.reset();
    }

    /* ---------- 生命周期 ---------- */
    reset() {
      this.board = [];
      for (let r = 0; r < ROWS; r++) this.board.push(new Array(COLS).fill(null));
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.state = 'idle';
      this.piece = null;
      this.bag = [];
      this.refreshPool();
      this.nextShape = this.pick();
      this.dropTimer = 0;
      this.clearing = null;
      this.updateHud();
      this.updateOverlay();
      this.resize();
      this.draw();
      this.drawNext();
    }

    start() {
      if (this.state === 'playing') return;
      if (this.state === 'over') { this.reset(); }
      if (!this.pool.length) { util.toast('方块池为空，已恢复全部经典方块', 'warn'); this.enableAllClassic(); }
      this.state = 'playing';
      this.updateOverlay();
      this.updateHud();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.updateOverlay();
      this.updateHud();
    }

    toggle() {
      if (this.state === 'playing') this.pause();
      else this.start();
    }

    /** 重开一局 */
    restart() { this.reset(); this.start(); }

    /** 重新读取方块池配置 */
    refreshPool() {
      this.pool = buildPool();
      this.bag = [];
      if (!this.pool.length) { this.enableAllClassic(); this.pool = buildPool(); }
      if (this.nextShape && !this.pool.some(function (p) { return p.id === this.nextShape.id; }, this)) {
        this.nextShape = this.pick();
      }
      this.drawNext();
    }

    enableAllClassic() {
      const p = store.tetris().pool;
      CLASSIC_ORDER.forEach(function (k) { p[k] = true; });
      store.save();
    }

    /* ---------- 随机（洗牌袋，避免长时间不出某种方块） ---------- */
    pick() {
      if (!this.pool.length) return null;
      if (!this.bag.length) {
        this.bag = this.pool.slice();
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = tmp;
        }
      }
      return this.bag.pop();
    }

    spawn() {
      const sh = this.nextShape || this.pick();
      this.nextShape = this.pick();
      if (!sh) { this.gameOver(); return; }
      const m = sh.states[0];
      this.piece = {
        shape: sh, rot: 0, matrix: m,
        x: Math.floor((COLS - m[0].length) / 2),
        y: 0,
      };
      if (this.collide(m, this.piece.x, this.piece.y)) {
        // 顶部放不下 → 游戏结束
        this.piece = null;
        this.gameOver();
      }
      this.drawNext();
    }

    /* ---------- 碰撞 / 移动 / 旋转 ---------- */
    collide(m, px, py) {
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (!m[r][c]) continue;
          const bx = px + c, by = py + r;
          if (bx < 0 || bx >= COLS || by >= ROWS) return true;
          if (by >= 0 && this.board[by][bx]) return true;
        }
      }
      return false;
    }

    move(dx) {
      if (this.state !== 'playing' || !this.piece) return false;
      const p = this.piece;
      if (!this.collide(p.matrix, p.x + dx, p.y)) { p.x += dx; this.draw(); return true; }
      return false;
    }

    /** 顺时针旋转，带简易墙踢（wall kick） */
    rotate() {
      if (this.state !== 'playing' || !this.piece) return false;
      const p = this.piece;
      const states = p.shape.states;
      const nextRot = (p.rot + 1) % states.length;
      const nm = states[nextRot];
      const kicks = [0, -1, 1, -2, 2];
      for (let i = 0; i < kicks.length; i++) {
        const nx = p.x + kicks[i];
        if (!this.collide(nm, nx, p.y)) {
          p.rot = nextRot; p.matrix = nm; p.x = nx;
          this.draw();
          return true;
        }
      }
      return false;
    }

    softDrop() {
      if (this.state !== 'playing' || !this.piece) return false;
      const p = this.piece;
      if (this.collide(p.matrix, p.x, p.y + 1)) { this.lock(); return false; }
      p.y += 1;
      this.score += 1;
      this.updateHud();
      this.draw();
      return true;
    }

    hardDrop() {
      if (this.state !== 'playing' || !this.piece) return;
      let d = 0;
      while (!this.collide(this.piece.matrix, this.piece.x, this.piece.y + 1)) {
        this.piece.y += 1; d++;
      }
      this.score += d * 2;
      this.updateHud();
      this.lock();
    }

    /** 幽灵落点（预览最终落下的位置） */
    ghostY() {
      if (!this.piece) return 0;
      let y = this.piece.y;
      while (!this.collide(this.piece.matrix, this.piece.x, y + 1)) y++;
      return y;
    }

    /** 固化方块 → 消行 → 生成下一个 */
    lock() {
      const p = this.piece;
      if (!p) return;
      for (let r = 0; r < p.matrix.length; r++) {
        for (let c = 0; c < p.matrix[r].length; c++) {
          if (!p.matrix[r][c]) continue;
          const by = p.y + r, bx = p.x + c;
          if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) this.board[by][bx] = p.shape.color;
        }
      }
      this.piece = null;

      const full = [];
      for (let r = 0; r < ROWS; r++) {
        if (this.board[r].every(function (v) { return v; })) full.push(r);
      }
      if (full.length) {
        this.state = 'clearing';
        this.clearing = { rows: full, start: 0 };
      } else {
        this.spawn();
      }
      this.updateHud();
      this.draw();
    }

    finishClear() {
      const rows = this.clearing.rows.slice().sort(function (a, b) { return a - b; });
      for (let i = 0; i < rows.length; i++) this.board.splice(rows[i], 1);
      for (let i = 0; i < rows.length; i++) this.board.unshift(new Array(COLS).fill(null));

      const n = rows.length;
      this.score += LINE_SCORE[n] * this.level;
      this.lines += n;
      const newLevel = Math.min(20, Math.floor(this.lines / 10) + 1);
      if (newLevel !== this.level) {
        this.level = newLevel;
        util.toast('升级！当前等级 ' + this.level, 'ok', 1400);
      }
      this.clearing = null;
      this.state = 'playing';

      const t = store.tetris();
      if (this.score > (t.highScore || 0)) { t.highScore = this.score; store.save(); }

      this.spawn();
      this.updateHud();
      this.draw();
    }

    gameOver() {
      this.state = 'over';
      const t = store.tetris();
      if (this.score > (t.highScore || 0)) { t.highScore = this.score; store.save(); }
      this.updateHud();
      this.updateOverlay();
    }

    /** 当前等级对应的下落间隔（毫秒），等级越高越快 */
    dropInterval() {
      return Math.max(90, 800 - (this.level - 1) * 62);
    }

    /** 是否显示落点预测（可在游戏设置中开关，默认开启） */
    showGhost() {
      return store.tetris().showGhost !== false;
    }

    /** 用户手动指定的格子边长；0 表示自适应 */
    manualCell() {
      const v = store.tetris().cellSize;
      return (typeof v === 'number' && v > 0) ? v : 0;
    }

    /* ---------- 主循环 ---------- */
    update(dt) {
      if (this.state === 'playing') {
        this.dropTimer += dt;
        if (this.dropTimer >= this.dropInterval()) {
          this.dropTimer = 0;
          const p = this.piece;
          if (!p) { this.spawn(); }
          else if (this.collide(p.matrix, p.x, p.y + 1)) { this.lock(); }
          else { p.y += 1; this.draw(); }
        }
      } else if (this.state === 'clearing') {
        if (!this.clearing.start) this.clearing.start = performance.now();
        if (performance.now() - this.clearing.start >= CLEAR_ANIM_MS) this.finishClear();
      }
    }

    loop(ts) {
      this.raf = requestAnimationFrame(this.loop.bind(this));
      const dt = this.lastTs ? ts - this.lastTs : 0;
      this.lastTs = ts;
      this.update(dt);
      this.draw();
    }

    startLoop() { if (!this.raf) { this.lastTs = 0; this.raf = requestAnimationFrame(this.loop.bind(this)); } }
    stopLoop() { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } }

    /* ---------- HUD ---------- */
    updateHud() {
      const t = store.tetris();
      this.onHud({
        score: this.score,
        lines: this.lines,
        level: this.level,
        high: Math.max(t.highScore || 0, this.score),
        state: this.state,
      });
    }

    updateOverlay() {
      const ov = this.overlay;
      if (!ov) return;
      if (this.state === 'playing') { ov.classList.remove('show'); ov.innerHTML = ''; return; }
      let big = '准备开始', small = '点击「开始」或按空格键', btn = '开始游戏';
      if (this.state === 'paused') { big = '已暂停'; small = '按 P 或点击按钮继续'; btn = '继续'; }
      else if (this.state === 'over') { big = '游戏结束'; small = '本局得分 ' + this.score + ' · 共消除 ' + this.lines + ' 行'; btn = '再来一局'; }
      ov.innerHTML =
        '<div class="big">' + esc(big) + '</div>' +
        '<div class="small">' + esc(small) + '</div>' +
        '<button class="btn" data-game-act="' + (this.state === 'paused' ? 'resume' : 'startover') + '">' + esc(btn) + '</button>';
      ov.classList.add('show');
    }

    /* ---------- 渲染 ---------- */
    /**
     * 计算画布尺寸
     * - cellSize = 0（默认）：自适应，按舞台宽度与视口高度自动取最大可行格子
     * - cellSize > 0：用户手动指定格子边长（px），仍会被可用宽高夹住以避免撑破布局
     */
    resize() {
      const wrap = this.canvas.parentElement;
      const stage = this.canvas.closest ? this.canvas.closest('.game-stage') : null;
      const ref = stage || wrap;
      const availW = ((ref && ref.clientWidth) || 300) - 36; // 减去舞台内边距
      const maxByW = Math.floor(availW / COLS);
      // 移动端要留出下方触摸按钮的空间，因此高度占比更小；
      // 手动模式放宽上限，让用户可以选更大的画布（超出部分靠页面滚动）
      const isMobile = global.innerWidth < 880;
      const manual = this.manualCell();
      const hRatio = isMobile ? (manual ? 0.62 : 0.46) : (manual ? 0.85 : 0.66);
      const maxByH = Math.floor(global.innerHeight * hRatio / ROWS);

      let cell;
      if (manual) {
        cell = Math.max(12, Math.min(manual, maxByW, maxByH));
      } else {
        cell = Math.max(12, Math.min(maxByW, maxByH));
      }
      this.cell = cell;

      const w = COLS * cell, h = ROWS * cell;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (this.nextCanvas) {
        const n = 4, nc = 18;
        this.nextCanvas.style.width = (n * nc) + 'px';
        this.nextCanvas.style.height = (n * nc) + 'px';
        this.nextCanvas.width = Math.round(n * nc * this.dpr);
        this.nextCanvas.height = Math.round(n * nc * this.dpr);
        this.nextCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
      this.draw();
      this.drawNext();
    }

    _roundRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    _cell(ctx, cx, cy, color, alpha) {
      const s = this.cell, pad = Math.max(1, s * 0.06), size = s - pad * 2;
      const x = cx * s + pad, y = cy * s + pad;
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      const grd = ctx.createLinearGradient(x, y, x + size, y + size);
      grd.addColorStop(0, color);
      grd.addColorStop(1, this._shade(color, -0.22));
      ctx.fillStyle = grd;
      this._roundRect(ctx, x, y, size, size, s * 0.22);
      ctx.fill();
      // 高光
      ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.35;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      this._roundRect(ctx, x + size * 0.16, y + size * 0.14, size * 0.42, size * 0.22, size * 0.1);
      ctx.fill();
      ctx.restore();
    }

    _shade(hex, amt) {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#888');
      if (!m) return hex;
      const f = function (v) {
        const n = parseInt(v, 16);
        const c = util.clamp(Math.round(n + 255 * amt), 0, 255);
        return ('0' + c.toString(16)).slice(-2);
      };
      return '#' + f(m[1]) + f(m[2]) + f(m[3]);
    }

    draw() {
      const ctx = this.ctx, s = this.cell;
      ctx.clearRect(0, 0, COLS * s, ROWS * s);

      // 网格
      ctx.strokeStyle = 'rgba(25,29,51,.07)';
      ctx.lineWidth = 1;
      for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, ROWS * s); ctx.stroke(); }
      for (let j = 1; j < ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * s); ctx.lineTo(COLS * s, j * s); ctx.stroke(); }

      // 已固定的方块
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (this.board[r][c]) this._cell(ctx, c, r, this.board[r][c], 1);
        }
      }

      // 幽灵落点（可用设置面板开关）
      // 注意：必须叠加 piece.x 偏移，否则轮廓会被固定画在最左侧列
      if (this.showGhost() && this.piece && this.state === 'playing') {
        const gy = this.ghostY();
        // 方块已贴底时不再重复描边，避免与实体方块重叠产生视觉噪点
        if (gy > this.piece.y) {
          const m = this.piece.matrix;
          ctx.save();
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = this.piece.shape.color;
          ctx.lineWidth = 2;
          for (let r = 0; r < m.length; r++) {
            for (let c = 0; c < m[r].length; c++) {
              if (!m[r][c]) continue;
              const y = gy + r, x = this.piece.x + c;
              if (y < 0) continue;
              this._roundRect(ctx, x * s + s * 0.12, y * s + s * 0.12, s * 0.76, s * 0.76, s * 0.2);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }

      // 当前方块
      if (this.piece) {
        const m = this.piece.matrix;
        for (let r = 0; r < m.length; r++) {
          for (let c = 0; c < m[r].length; c++) {
            if (!m[r][c]) continue;
            const y = this.piece.y + r;
            if (y < 0) continue;
            this._cell(ctx, this.piece.x + c, y, this.piece.shape.color, 1);
          }
        }
      }

      // 消行闪烁
      if (this.state === 'clearing' && this.clearing) {
        const p = this.clearing.start ? (performance.now() - this.clearing.start) / CLEAR_ANIM_MS : 0;
        ctx.save();
        ctx.globalAlpha = 0.85 * (1 - util.clamp(p, 0, 1)) + 0.15;
        ctx.fillStyle = '#ffffff';
        this.clearing.rows.forEach(function (r) { ctx.fillRect(0, r * s, COLS * s, s); });
        ctx.restore();
      }
    }

    drawNext() {
      if (!this.nextCtx) return;
      const ctx = this.nextCtx, cs = 18;
      ctx.clearRect(0, 0, 4 * cs, 4 * cs);
      if (!this.nextShape) return;
      const m = this.nextShape.states[0];
      const ox = (4 - m[0].length) / 2, oy = (4 - m.length) / 2;

      const s = this.cell;
      this.cell = cs; // 复用 _cell 需要临时替换尺寸
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (m[r][c]) this._cell(ctx, ox + c, oy + r, this.nextShape.color, 1);
        }
      }
      this.cell = s;
    }
  }

  /* =======================================================
     3. 自定义形状绘制器（4x4 / 5x5 网格）
     ======================================================= */
  const drawer = {
    size: 4,
    grid: null,
    color: '#6366f1',
    name: '',

    init(size) {
      this.setSize(size || 4);
    },
    setSize(n) {
      this.size = n;
      this.grid = [];
      for (let r = 0; r < n; r++) this.grid.push(new Array(n).fill(0));
    },
    toggle(r, c) { this.grid[r][c] = this.grid[r][c] ? 0 : 1; },
    hasCell() { return this.grid.some(function (r) { return r.some(function (v) { return v; }); }); },
  };
  drawer.init(4); // 默认 4×4 网格

  function drawerGridHtml() {
    const n = drawer.size;
    let h = '<div class="draw-grid" id="drawGrid" style="grid-template-columns:repeat(' + n + ',auto)">';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        h += '<button type="button" class="draw-cell' + (drawer.grid[r][c] ? ' on' : '') + '" data-r="' + r + '" data-c="' + c + '" aria-label="格子 ' + (r + 1) + '-' + (c + 1) + '"></button>';
      }
    }
    return h + '</div>';
  }

  function rotationPreviewHtml() {
    if (!drawer.hasCell()) {
      return '<p style="margin:0;font-size:12px;color:var(--text-3)">点击左侧格子绘制形状，这里会实时显示系统自动计算出的各个旋转状态。</p>';
    }
    const states = buildStates(drawer.grid);
    return '<div class="rot-preview">' + states.map(function (m, i) {
      return '<div class="rot-item">' + svgOf(m, drawer.color, 11) + '<span>状态 ' + (i + 1) + '</span></div>';
    }).join('') + '</div>';
  }

  /* =======================================================
     4. 视图：俄罗斯方块板块
     ======================================================= */
  GS.views = GS.views || {};
  GS.mount = GS.mount || {};

  GS.views.tetris = function (section) {
    const t = store.tetris();
    const cellSize = (typeof t.cellSize === 'number' && t.cellSize > 0) ? t.cellSize : 0;
    const classicHtml = CLASSIC_ORDER.map(function (k) {
      const on = !!t.pool[k];
      return '<label class="check" title="' + esc(CLASSIC[k].name) + '">' +
               '<input type="checkbox" data-pool="' + k + '"' + (on ? ' checked' : '') + '>' +
               '<span class="box"></span>' +
               '<span class="check-label">' + svgOf(CLASSIC[k].matrix, CLASSIC[k].color, 11) + ' ' + k + '</span>' +
             '</label>';
    }).join('');

    const savedHtml = (t.customShapes || []).length
      ? t.customShapes.map(function (s) {
          const m = buildStates(s.matrix)[0];
          return '<div class="saved-item">' + svgOf(m, s.color, 11) +
                   '<div class="saved-meta"><b>' + esc(s.name) + '</b><span>' + m.length + '×' + m[0].length +
                   ' · ' + buildStates(s.matrix).length + ' 个旋转态</span></div>' +
                   '<button class="icon-btn danger" data-shape-del="' + esc(s.id) + '" title="删除">✕</button>' +
                 '</div>';
        }).join('')
      : '<p style="margin:0;font-size:12px;color:var(--text-3)">还没有自定义方块，用下面的网格画一个吧。</p>';

    return '' +
      '<div class="game-layout">' +
        '<div class="game-stage">' +
          '<div class="board-wrap">' +
            '<canvas id="tetrisCanvas"></canvas>' +
            '<div class="board-overlay" id="tetrisOverlay"></div>' +
          '</div>' +
          '<div class="touch-pad">' +
            '<button class="btn btn-ghost" data-game-act="left">←</button>' +
            '<button class="btn btn-ghost" data-game-act="rotate">⟳</button>' +
            '<button class="btn btn-ghost" data-game-act="down">↓</button>' +
            '<button class="btn btn-ghost" data-game-act="right">→</button>' +
            '<button class="btn" data-game-act="drop">⤓</button>' +
          '</div>' +
        '</div>' +

        '<div class="game-side">' +
          '<div class="score-box">' +
            '<div class="panel-title" style="margin-bottom:8px">战绩</div>' +
            '<div class="score-row"><span class="k">得分</span><span class="v" id="tScore">0</span></div>' +
            '<div class="score-row"><span class="k">最高分</span><span class="v hi" id="tHigh">' + esc(t.highScore || 0) + '</span></div>' +
            '<div class="score-row"><span class="k">消除行数</span><span class="v" id="tLines">0</span></div>' +
            '<div class="score-row"><span class="k">等级 / 速度</span><span class="v" id="tLevel">1</span></div>' +
          '</div>' +

          '<div class="score-box next-box">' +
            '<canvas id="tetrisNext"></canvas>' +
            '<span class="next-label">下一个</span>' +
          '</div>' +

          '<div class="score-box">' +
            '<div class="game-btns">' +
              '<button class="btn" id="btnStart">开始</button>' +
              '<button class="btn btn-ghost" id="btnReset">重置</button>' +
            '</div>' +
            '<div class="key-help" style="margin-top:10px">' +
              '<kbd>←</kbd><kbd>→</kbd> 移动 · <kbd>↑</kbd> 旋转 · <kbd>↓</kbd> 软降<br>' +
              '<kbd>空格</kbd> 硬降 · <kbd>P</kbd> 暂停 · <kbd>R</kbd> 重开' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ---- 游戏设置：落点预测开关 + 画布尺寸 ---- */
      '<div class="panel">' +
        '<div class="panel-title">⚙️ 游戏设置 <span class="sub">即时生效，自动保存</span></div>' +
        '<div class="grid grid-2">' +

          '<div class="gs-box">' +
            '<div class="gs-title">落点预测（幽灵方块）</div>' +
            '<label class="switch">' +
              '<input type="checkbox" id="ghostToggle"' + (t.showGhost !== false ? ' checked' : '') + '>' +
              '<span class="switch-track"><span class="switch-dot"></span></span>' +
              '<span class="switch-text">' + (t.showGhost !== false ? '已开启' : '已关闭') + '</span>' +
            '</label>' +
            '<p class="gs-hint">开启后会在棋盘上用半透明轮廓标出当前方块<b>最终落下的位置</b>，方便精确对位；关闭后画面更简洁。</p>' +
          '</div>' +

          '<div class="gs-box">' +
            '<div class="gs-title">画布大小</div>' +
            '<div class="chip-row" id="cellChips">' +
              '<span class="chip' + (cellSize <= 0 ? ' active' : '') + '" data-cell="0">自适应</span>' +
              '<span class="chip' + (cellSize === 20 ? ' active' : '') + '" data-cell="20">紧凑 20</span>' +
              '<span class="chip' + (cellSize === 28 ? ' active' : '') + '" data-cell="28">标准 28</span>' +
              '<span class="chip' + (cellSize === 36 ? ' active' : '') + '" data-cell="36">大 36</span>' +
            '</div>' +
            '<div class="field" style="margin-top:12px;margin-bottom:6px">' +
              '<label>格子边长：<b id="cellVal">自适应</b></label>' +
              '<input type="range" id="cellRange" min="14" max="44" step="1" ' +
                'value="' + (cellSize > 0 ? cellSize : 28) + '"' + (cellSize <= 0 ? ' disabled' : '') + '>' +
            '</div>' +
            '<p class="gs-hint" id="cellInfo"></p>' +
          '</div>' +

        '</div>' +
      '</div>' +

      /* ---- 方块池设置 ---- */
      '<div class="panel pool-panel">' +
        '<div class="panel-title">🧱 方块池设置 <span class="sub">勾选决定哪些方块会参与随机下落</span></div>' +

        '<div style="margin-bottom:16px">' +
          '<div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px">经典 7 种</div>' +
          '<div class="chip-row" id="poolClassic">' + classicHtml + '</div>' +
        '</div>' +

        '<div style="height:1px;background:var(--line);margin:0 0 16px"></div>' +

        '<div class="panel-title" style="margin-bottom:12px">✏️ 自定义方块 <span class="sub">画一个形状，它会自动参与下落、旋转与碰撞</span></div>' +

        '<div class="drawer-layout">' +
          '<div>' +
            '<div class="chip-row" style="margin-bottom:10px" id="sizeChips">' +
              '<span class="chip' + (drawer.size === 4 ? ' active' : '') + '" data-size="4">4 × 4</span>' +
              '<span class="chip' + (drawer.size === 5 ? ' active' : '') + '" data-size="5">5 × 5</span>' +
            '</div>' +
            '<div id="drawerWrap">' + drawerGridHtml() + '</div>' +
            '<div class="row" style="margin-top:10px">' +
              '<label class="check" style="padding-left:0"><span class="check-label">颜色</span>' +
                '<input type="color" id="shapeColor" value="' + esc(drawer.color) + '"></label>' +
              '<button class="btn btn-ghost btn-sm" id="btnClearGrid">清空网格</button>' +
            '</div>' +
            '<div class="field" style="margin-top:10px">' +
              '<label>形状名称（可留空）</label>' +
              '<input class="input" id="shapeName" placeholder="例如：小拐杖" value="' + esc(drawer.name) + '">' +
            '</div>' +
            '<button class="btn btn-block" id="btnSaveShape">保存为自定义方块</button>' +
          '</div>' +

          '<div>' +
            '<div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px">旋转状态预览（自动计算）</div>' +
            '<div id="rotPreview">' + rotationPreviewHtml() + '</div>' +
            '<div style="font-size:12px;font-weight:600;color:var(--text-2);margin:18px 0 8px">已保存的自定义方块</div>' +
            '<div class="saved-list" id="savedShapes">' + savedHtml + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      (GS.insertBar ? GS.insertBar(section) : '') +
      GS.items.renderList(section);
  };

  /* =======================================================
     5. 挂载 / 卸载
     ======================================================= */
  GS.mount.tetris = function (root, section) {
    const canvas = root.querySelector('#tetrisCanvas');
    if (!canvas) return null;

    const hud = {
      score: root.querySelector('#tScore'),
      high: root.querySelector('#tHigh'),
      lines: root.querySelector('#tLines'),
      level: root.querySelector('#tLevel'),
    };

    // 注意：构造函数内会回调 onHud，因此先声明变量再赋值，避免 TDZ
    let game = null;
    game = new GS.Tetris({
      canvas: canvas,
      nextCanvas: root.querySelector('#tetrisNext'),
      overlay: root.querySelector('#tetrisOverlay'),
      onHud: function (s) {
        if (hud.score) hud.score.textContent = s.score;
        if (hud.high) hud.high.textContent = s.high;
        if (hud.lines) hud.lines.textContent = s.lines;
        if (hud.level) {
          const speed = game ? (1000 / game.dropInterval()).toFixed(1) : '-';
          hud.level.textContent = s.level + ' 级 · ' + speed + ' 格/秒';
        }
        const btn = root.querySelector('#btnStart');
        if (btn) btn.textContent = (s.state === 'playing') ? '暂停' : (s.state === 'paused' ? '继续' : '开始');
      },
    });

    GS.tetrisGame = game;
    game.startLoop();
    /** 只刷新右侧旋转预览（点格子时用，避免整块网格重建导致焦点/悬停丢失） */
    const refreshRot = function () {
      const rp = root.querySelector('#rotPreview');
      if (rp) rp.innerHTML = rotationPreviewHtml();
    };
    /** 重建绘制网格 + 旋转预览（切换尺寸 / 清空时用） */
    const refreshDrawer = function () {
      const wrap = root.querySelector('#drawerWrap');
      if (wrap) wrap.innerHTML = drawerGridHtml();
      refreshRot();
    };
    const refreshSaved = function () {
      GS.app.renderAll(); // 列表涉及游戏池刷新，整体重渲染最稳妥
    };

    /* ---- 游戏设置：落点预测 + 画布尺寸 ---- */
    const ghostToggle = root.querySelector('#ghostToggle');
    const cellRange = root.querySelector('#cellRange');
    const cellVal = root.querySelector('#cellVal');
    const cellInfo = root.querySelector('#cellInfo');
    const cellChips = util.$$('#cellChips .chip', root);
    const t = store.tetris();

    /** 同步「画布大小」控件显示。game 尚未构造完成时直接跳过 */
    function syncCellUI() {
      if (!game) return;
      const manual = game.manualCell();
      if (cellRange) {
        cellRange.disabled = !manual;
        cellRange.value = manual || util.clamp(game.cell, 14, 44);
      }
      if (cellVal) cellVal.textContent = manual ? (manual + ' px') : ('自适应（' + game.cell + ' px）');
      if (cellInfo) {
        cellInfo.innerHTML = '当前画布 <b>' + (COLS * game.cell) + ' × ' + (ROWS * game.cell) + '</b> px' +
          (manual ? '，页面空间不足时会自动收敛到可容纳的最大尺寸。' : '，随窗口 / 屏幕自动调整。');
      }
      cellChips.forEach(function (c) {
        c.classList.toggle('active', parseInt(c.getAttribute('data-cell'), 10) === manual);
      });
    }

    /** 设置格子边长；0 表示自适应 */
    function setCellSize(v) {
      t.cellSize = Math.max(0, Math.round(v || 0));
      store.save();
      game.resize();
      syncCellUI();
    }

    if (ghostToggle) {
      ghostToggle.addEventListener('change', function () {
        t.showGhost = ghostToggle.checked;
        store.save();
        const txt = ghostToggle.parentNode.querySelector('.switch-text');
        if (txt) txt.textContent = ghostToggle.checked ? '已开启' : '已关闭';
        game.draw();
        util.toast('落点预测已' + (ghostToggle.checked ? '开启' : '关闭'), 'ok', 1400);
      });
    }
    if (cellRange) {
      cellRange.addEventListener('input', function () { setCellSize(parseInt(cellRange.value, 10)); });
    }
    cellChips.forEach(function (c) {
      c.addEventListener('click', function () {
        setCellSize(parseInt(c.getAttribute('data-cell'), 10));
      });
    });
    syncCellUI(); // 初始化显示当前画布尺寸

    /* ---- 事件绑定 ---- */
    const onClick = function (e) {
      // 游戏控制
      const g = e.target.closest('[data-game-act]');
      if (g) {
        const act = g.getAttribute('data-game-act');
        if (act === 'left') game.move(-1);
        else if (act === 'right') game.move(1);
        else if (act === 'down') game.softDrop();
        else if (act === 'rotate') game.rotate();
        else if (act === 'drop') game.hardDrop();
        else if (act === 'startover') { game.restart(); }
        else if (act === 'resume') { game.start(); }
        return;
      }
      // 网格绘制
      const cell = e.target.closest('.draw-cell');
      if (cell) {
        drawer.toggle(parseInt(cell.getAttribute('data-r'), 10), parseInt(cell.getAttribute('data-c'), 10));
        cell.classList.toggle('on');   // 就地反馈，不重建网格
        refreshRot();
        return;
      }
      // 网格尺寸
      const sz = e.target.closest('#sizeChips .chip');
      if (sz) {
        drawer.setSize(parseInt(sz.getAttribute('data-size'), 10));
        util.$$('#sizeChips .chip', root).forEach(function (c) { c.classList.remove('active'); });
        sz.classList.add('active');
        refreshDrawer();
        return;
      }
      // 删除自定义形状
      const del = e.target.closest('[data-shape-del]');
      if (del) {
        const id = del.getAttribute('data-shape-del');
        const t = store.tetris();
        const i = t.customShapes.findIndex(function (s) { return s.id === id; });
        if (i >= 0) {
          GS.modal.confirm('删除自定义方块', '确定删除这个自定义方块吗？', function () {
            t.customShapes.splice(i, 1);
            store.save();
            if (game) game.refreshPool();
            GS.app.renderAll();
            util.toast('已删除', 'ok', 1400);
          }, true);
        }
      }
    };
    root.addEventListener('click', onClick);

    const onChange = function (e) {
      // 经典方块勾选
      const cb = e.target.closest('[data-pool]');
      if (cb) {
        const k = cb.getAttribute('data-pool');
        const t = store.tetris();
        t.pool[k] = cb.checked;
        if (!Object.keys(t.pool).some(function (kk) { return t.pool[kk]; })) {
          cb.checked = true; t.pool[k] = true;
          util.toast('至少保留一个方块', 'warn', 1800);
        }
        store.save();
        game.refreshPool();
        GS.app.renderNavOnly();
        return;
      }
      if (e.target.id === 'shapeColor') { drawer.color = e.target.value; refreshDrawer(); return; }
      if (e.target.id === 'shapeName') { drawer.name = e.target.value; }
    };
    root.addEventListener('change', onChange);
    root.addEventListener('input', function (e) {
      if (e.target.id === 'shapeColor') { drawer.color = e.target.value; refreshDrawer(); }
    });

    // 按钮
    root.querySelector('#btnStart').addEventListener('click', function () { game.toggle(); });
    root.querySelector('#btnReset').addEventListener('click', function () {
      game.reset();
      util.toast('已重置', 'ok', 1300);
    });
    root.querySelector('#btnClearGrid').addEventListener('click', function () {
      drawer.setSize(drawer.size); refreshDrawer();
    });
    root.querySelector('#btnSaveShape').addEventListener('click', function () {
      drawer.name = (root.querySelector('#shapeName').value || '').trim();
      if (!drawer.hasCell()) { util.toast('请先在网格中绘制形状', 'warn'); return; }
      const t = store.tetris();
      t.customShapes = t.customShapes || [];
      t.customShapes.push({
        id: util.uid('sh'),
        name: drawer.name || ('自定义 ' + (t.customShapes.length + 1)),
        color: drawer.color,
        matrix: drawer.grid.map(function (r) { return r.slice(); }),
      });
      store.save();
      game.refreshPool();
      util.toast('已加入方块池', 'ok');
      refreshSaved();
    });

    /* ---- 键盘 ---- */
    const onKey = function (e) {
      if (GS.modal.current) return;                       // 弹窗打开时不响应
      if (document.activeElement && document.activeElement.tagName === 'INPUT' &&
          document.activeElement.type !== 'color') return;
      const k = e.key;
      if (k === 'ArrowLeft') { game.move(-1); e.preventDefault(); }
      else if (k === 'ArrowRight') { game.move(1); e.preventDefault(); }
      else if (k === 'ArrowDown') { game.softDrop(); e.preventDefault(); }
      else if (k === 'ArrowUp') { game.rotate(); e.preventDefault(); }
      else if (k === ' ') { game.hardDrop(); e.preventDefault(); }
      else if (k === 'p' || k === 'P') { game.toggle(); }
      else if (k === 'r' || k === 'R') { game.restart(); }
    };
    document.addEventListener('keydown', onKey);

    /* ---- 触摸长按连发（左右移动 / 软降） ---- */
    let repeatTimer = null;
    const startRepeat = function (act) {
      stopRepeat();
      const fire = function () {
        if (act === 'left') game.move(-1);
        else if (act === 'right') game.move(1);
        else if (act === 'down') game.softDrop();
      };
      fire();
      repeatTimer = setInterval(fire, 110);
    };
    const stopRepeat = function () { if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; } };
    root.addEventListener('pointerdown', function (e) {
      const b = e.target.closest('[data-game-act]');
      if (!b) return;
      const a = b.getAttribute('data-game-act');
      if (a === 'left' || a === 'right' || a === 'down') startRepeat(a);
    });
    root.addEventListener('pointerup', stopRepeat);
    root.addEventListener('pointercancel', stopRepeat);
    root.addEventListener('pointerleave', stopRepeat);

    /* ---- 尺寸自适应 ---- */
    const stage = canvas.closest('.game-stage') || canvas.parentElement;
    const ro = new ResizeObserver(util.debounce(function () { game.resize(); syncCellUI(); }, 120));
    ro.observe(stage);
    global.addEventListener('resize', util.debounce(function () { game.resize(); syncCellUI(); }, 160));

    /* ---- 卸载：回收定时器与监听 ---- */
    return function unmount() {
      game.stopLoop();
      stopRepeat();
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      if (GS.tetrisGame === game) GS.tetrisGame = null;
    };
  };

  GS.Tetris = Tetris;
  GS.tetrisUtil = { buildStates, rotateCW, trim, svgOf, buildPool, CLASSIC, CLASSIC_ORDER, COLS, ROWS };

})(window);
