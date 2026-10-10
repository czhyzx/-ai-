/* =========================================================
   background.js —— 背景系统
   支持：纯色 / CSS 渐变（内置预设）/ 本地图片上传
   所有选择实时生效并持久化到 localStorage
   ========================================================= */
(function (global) {
  'use strict';

  const GS = global.GS;
  const { util, store, GRADIENTS } = GS;

  const BG = {
    el: {},

    init() {
      this.el = {
        base:  document.getElementById('bgBase'),
        image: document.getElementById('bgImage'),
        orbs:  document.getElementById('bgOrbs'),
      };
      this.apply();
    },

    /** 根据 settings 应用全部背景相关样式 */
    apply() {
      const s = store.settings();

      // 1) 玻璃参数 & 强调色
      const root = document.documentElement.style;
      root.setProperty('--blur', s.blur + 'px');
      root.setProperty('--glass-alpha', String(s.glassAlpha));
      root.setProperty('--accent', s.accent);
      root.setProperty('--accent-2', s.accent2);

      // 2) 底色 / 渐变 / 图片
      const img = store.getBgImage();
      if (s.bgType === 'image' && img) {
        this.el.base.style.background = s.bgSolid || '#eef1fb';
        this.el.image.style.backgroundImage = 'url("' + img + '")';
        this.el.image.classList.add('on');
        this.el.orbs.classList.add('hide');
      } else {
        this.el.image.classList.remove('on');
        this.el.image.style.backgroundImage = '';
        this.el.orbs.classList.remove('hide');
        if (s.bgType === 'solid') {
          this.el.base.style.background = s.bgSolid;
        } else {
          this.el.base.style.background = GRADIENTS[s.bgGradient] || GRADIENTS.aurora;
        }
      }

      // 深色背景下让文字仍然可读：给 body 增加一层浅色磨砂遮罩
      const dark = this._isDarkBackground(s, img);
      document.getElementById('bgMask').style.background = dark
        ? 'linear-gradient(180deg,rgba(255,255,255,.30),rgba(255,255,255,.42))'
        : 'radial-gradient(120% 80% at 50% 0%,rgba(255,255,255,.18),rgba(255,255,255,0) 60%),linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.34))';
    },

    _isDarkBackground(s, img) {
      if (s.bgType === 'image') return !!img; // 图片背景一律加亮遮罩，保证玻璃可读
      if (s.bgType === 'solid') return this._luma(s.bgSolid) < 0.45;
      return s.bgGradient === 'midnight' || s.bgGradient === 'graphite';
    },

    _luma(hex) {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
      if (!m) return 1;
      const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    },

    /**
     * 处理用户选择的本地图片：
     * 先按最大边长压缩再转 dataURL，避免超出 localStorage 5MB 配额
     */
    handleFile(file, onDone) {
      if (!file) return;
      if (!/^image\//.test(file.type)) { util.toast('请选择图片文件', 'err'); return; }

      const reader = new FileReader();
      reader.onload = function (e) {
        const src = e.target.result;
        const img = new Image();
        img.onload = function () {
          const MAX = 1600;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));

          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          let dataUrl = '';
          try { dataUrl = cv.toDataURL('image/jpeg', 0.82); }
          catch (err) { util.toast('图片处理失败', 'err'); return; }

          if (store.setBgImage(dataUrl)) {
            const s = store.settings();
            s.bgType = 'image';
            store.save();
            BG.apply();
            util.toast('背景已更新（已压缩至 ' + Math.round(dataUrl.length / 1024) + 'KB）', 'ok');
            if (onDone) onDone();
          }
        };
        img.onerror = function () { util.toast('图片读取失败', 'err'); };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },

    clearImage() {
      store.clearBgImage();
      const s = store.settings();
      if (s.bgType === 'image') s.bgType = 'gradient';
      store.save();
      this.apply();
    },
  };

  GS.background = BG;

})(window);
