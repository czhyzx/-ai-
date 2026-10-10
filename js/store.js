/* =========================================================
   store.js —— 全局命名空间 / 工具函数 / localStorage 数据层
   ========================================================= */
(function (global) {
  'use strict';

  const GS = (global.GS = global.GS || {});

  /* ------------------------- 常量 ------------------------- */
  const DATA_KEY = 'gs_data_v1';   // 站点主数据
  const BG_KEY   = 'gs_bg_image_v1'; // 背景图片（dataURL，单独存放避免挤爆配额）

  /* ------------------------- 工具函数 ------------------------- */
  const util = {
    /** 生成短唯一 ID */
    uid(prefix) {
      return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    /** HTML 转义，防止用户输入破坏结构 */
    esc(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /** 节流/防抖 */
    debounce(fn, wait) {
      let t = null;
      return function () {
        const args = arguments, ctx = this;
        clearTimeout(t);
        t = setTimeout(() => fn.apply(ctx, args), wait || 250);
      };
    },

    clamp(v, min, max) { return Math.min(max, Math.max(min, v)); },

    $ (sel, root) { return (root || document).querySelector(sel); },
    $$ (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },

    /**
     * 规范化并校验 URL：只允许 http / https，防止 javascript: 等注入
     * @returns {string|null}
     */
    safeUrl(raw) {
      if (!raw) return null;
      let s = String(raw).trim();
      if (!s) return null;
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
      let u;
      try { u = new URL(s); } catch (e) { return null; }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.href;
    },

    /** 取主机名（用于 favicon 与展示） */
    hostOf(url) {
      try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
    },

    /** 由字符串生成稳定色值，用于 favicon 兜底字母头像 */
    hashColor(str) {
      let h = 0;
      for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
      const hue = h % 360;
      return 'hsl(' + hue + ',68%,58%)';
    },

    /** favicon 服务地址（失败时回退到字母头像） */
    faviconUrl(url) {
      const h = util.hostOf(url);
      if (!h) return '';
      // Google s2 favicon 服务；被墙或失败时在 <img onerror> 中降级
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(h) + '&sz=64';
    },

    /** 轻提示 */
    toast(msg, type, ms) {
      const root = document.getElementById('toastRoot');
      if (!root) return;
      const el = document.createElement('div');
      el.className = 'toast ' + (type || '');
      el.textContent = msg;
      root.appendChild(el);
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 320);
      }, ms || 2200);
    },
  };

  /* ------------------------- 默认数据 ------------------------- */

  /** 内置 CSS 渐变预设 */
  const GRADIENTS = {
    aurora:   'linear-gradient(135deg,#a5b4fc 0%,#c4b5fd 42%,#93c5fd 72%,#fbcfe8 100%)',
    sunset:   'linear-gradient(135deg,#ff9a9e 0%,#fad0c4 50%,#fbc2eb 100%)',
    ocean:    'linear-gradient(135deg,#89f7fe 0%,#66a6ff 100%)',
    forest:   'linear-gradient(135deg,#d4fc79 0%,#96e6a1 100%)',
    midnight: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#0f172a 100%)',
    peach:    'linear-gradient(135deg,#ffecd2 0%,#fcb69f 100%)',
    mint:     'linear-gradient(135deg,#e0c3fc 0%,#8ec5fc 100%)',
    graphite: 'linear-gradient(135deg,#4b5563 0%,#111827 100%)',
  };
  const GRADIENT_NAMES = {
    aurora: '极光', sunset: '晚霞', ocean: '海蓝', forest: '森野',
    midnight: '午夜', peach: '蜜桃', mint: '薄荷', graphite: '石墨',
  };

  /** 默认板块（locked=true 的为核心板块，不可删除，但可重命名 / 排序） */
  function defaultSections() {
    return [
      { id: 'home',     title: '主页',       icon: '🏠', type: 'dashboard', items: [], locked: true },
      { id: 'links',    title: '链接导航',   icon: '🔗', type: 'links',     items: defaultLinks(), locked: true },
      { id: 'game',     title: '俄罗斯方块', icon: '🎮', type: 'tetris',    items: [], locked: true },
      { id: 'settings', title: '设置',       icon: '⚙️', type: 'settings',  items: [], locked: true },
    ];
  }

  function defaultLinks() {
    const raw = [
      ['MDN 文档',   'https://developer.mozilla.org/zh-CN/'],
      ['GitHub',     'https://github.com'],
      ['Can I use',  'https://caniuse.com'],
      ['CodePen',    'https://codepen.io'],
      ['CSS-Tricks', 'https://css-tricks.com'],
      ['StackOverflow', 'https://stackoverflow.com'],
    ];
    return raw.map(function (pair) {
      return { id: util.uid('it'), title: pair[0], url: pair[1], type: 'link', icon: '' };
    });
  }

  function defaultData() {
    return {
      version: 1,
      settings: {
        bgType: 'gradient',        // 'solid' | 'gradient' | 'image'
        bgSolid: '#e9edff',
        bgGradient: 'aurora',
        blur: 18,
        glassAlpha: 0.55,
        accent: '#5b6cff',
        accent2: '#9b5bff',
        editMode: false,
      },
      sections: defaultSections(),
      tetris: {
        pool: { I: true, O: true, T: true, S: true, Z: true, J: true, L: true },
        customShapes: [],   // [{id,name,color,matrix:number[][]}]
        highScore: 0,
        showGhost: true,    // 落点预测开关
        cellSize: 0,        // 画布格子边长(px)，0 = 自适应
      },
      stats: { visits: 0, lastVisit: '' },
      activeId: 'home',
    };
  }

  /* ------------------------- 数据层 ------------------------- */
  const store = {
    data: defaultData(),

    /** 读取并合并（做一次结构补全，兼容旧版本数据） */
    load() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(DATA_KEY) || 'null'); } catch (e) { saved = null; }

      const base = defaultData();
      if (saved && typeof saved === 'object') {
        base.settings = Object.assign(base.settings, saved.settings || {});
        base.tetris   = Object.assign(base.tetris,   saved.tetris   || {});
        base.tetris.pool = Object.assign(base.tetris.pool || {}, (saved.tetris && saved.tetris.pool) || {});
        base.tetris.customShapes = Array.isArray(base.tetris.customShapes) ? base.tetris.customShapes : [];
        base.stats    = Object.assign(base.stats,    saved.stats    || {});
        base.activeId = saved.activeId || 'home';
        if (Array.isArray(saved.sections) && saved.sections.length) {
          base.sections = saved.sections.map(function (s) {
            return Object.assign({ id: util.uid('sec'), title: '新板块', icon: '🧩', type: 'links', items: [] }, s);
          });
        }
      }
      this.data = base;
      return base;
    },

    save() {
      try {
        localStorage.setItem(DATA_KEY, JSON.stringify(this.data));
      } catch (e) {
        util.toast('本地存储空间不足，部分设置可能未保存', 'err', 3200);
      }
    },

    reset() {
      this.data = defaultData();
      this.save();
      try { localStorage.removeItem(BG_KEY); } catch (e) {}
    },

    /* —— 便捷读写 —— */
    sections() { return this.data.sections; },
    sectionById(id) {
      return this.data.sections.filter(function (s) { return s.id === id; })[0] || null;
    },
    settings() { return this.data.settings; },
    tetris() { return this.data.tetris; },

    /** 移动数组元素（用于板块/卡片排序） */
    move(list, from, to) {
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return false;
      list.splice(to, 0, list.splice(from, 1)[0]);
      return true;
    },

    /* —— 背景图片（单独 key） —— */
    getBgImage() { try { return localStorage.getItem(BG_KEY) || ''; } catch (e) { return ''; } },
    setBgImage(dataUrl) {
      try { localStorage.setItem(BG_KEY, dataUrl); return true; }
      catch (e) { util.toast('图片过大，无法保存到本地存储', 'err', 3000); return false; }
    },
    clearBgImage() { try { localStorage.removeItem(BG_KEY); } catch (e) {} },

    /* —— 导入 / 导出 —— */
    exportJSON() { return JSON.stringify(this.data, null, 2); },
    importJSON(text) {
      try {
        const obj = JSON.parse(text);
        if (!obj || !Array.isArray(obj.sections)) throw new Error('格式不正确');
        localStorage.setItem(DATA_KEY, JSON.stringify(obj));
        this.load();
        return true;
      } catch (e) {
        util.toast('导入失败：' + e.message, 'err', 3000);
        return false;
      }
    },
  };

  GS.util = util;
  GS.store = store;
  GS.GRADIENTS = GRADIENTS;
  GS.GRADIENT_NAMES = GRADIENT_NAMES;
  GS.KEYS = { DATA_KEY, BG_KEY };

})(window);
