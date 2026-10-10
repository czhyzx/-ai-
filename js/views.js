/* =========================================================
   views.js —— 各板块视图：仪表盘 / 链接导航 / 设置 / 通用内容板块
   ========================================================= */
(function (global) {
  'use strict';

  const GS = global.GS;
  const { util, store, GRADIENTS, GRADIENT_NAMES } = GS;
  const esc = util.esc;

  GS.views = GS.views || {};
  GS.mount = GS.mount || {};

  /** 编辑模式下显示的「插入网页」工具条 */
  function insertBar(section) {
    if (!store.settings().editMode || section.type === 'settings') return '';
    return '<div class="section-head"><span class="spacer" style="flex:1"></span>' +
           '<button class="btn btn-sm" data-insert>＋ 插入网页</button></div>';
  }
  GS.insertBar = insertBar;

  /* =======================================================
     仪表盘 / 主页
     ======================================================= */
  GS.views.dashboard = function (section) {
    const hour = new Date().getHours();
    const greet = hour < 6 ? '夜深了，注意休息' : hour < 11 ? '早上好，新的一天' :
                  hour < 14 ? '中午好' : hour < 18 ? '下午好' : hour < 23 ? '晚上好' : '夜深了';

    const sections = store.sections();
    const linkCount = sections.reduce(function (n, s) {
      return n + ((s.items || []).filter(function (i) { return i.type !== 'embed'; }).length);
    }, 0);
    const embedCount = sections.reduce(function (n, s) {
      return n + ((s.items || []).filter(function (i) { return i.type === 'embed'; }).length);
    }, 0);
    const t = store.tetris();

    const stats = [
      ['📦', sections.length, '板块数量'],
      ['🔗', linkCount, '外链卡片'],
      ['🖼', embedCount, '内嵌网页'],
      ['🧱', (t.customShapes || []).length, '自定义方块'],
      ['🏆', t.highScore || 0, '方块最高分'],
      ['👣', store.data.stats.visits || 0, '累计访问'],
    ].map(function (s) {
      return '<div class="stat glass-soft"><span class="stat-ico">' + s[0] + '</span>' +
             '<div><div class="stat-val">' + esc(s[1]) + '</div><div class="stat-key">' + esc(s[2]) + '</div></div></div>';
    }).join('');

    // 最近链接（取链接板块的前 6 条外链）
    const linkSec = store.sectionById('links');
    const recent = linkSec ? (linkSec.items || []).slice(0, 6) : [];
    const recentHtml = recent.length
      ? '<div class="grid grid-cards">' + recent.map(function (it) { return GS.items.render(it); }).join('') + '</div>'
      : '<div class="empty">还没有链接，去「链接导航」板块或开启编辑模式添加。</div>';

    const quick = sections.map(function (s) {
      return '<div class="quick" data-jump="' + esc(s.id) + '">' + esc(s.icon || '🧩') + ' ' + esc(s.title) + '</div>';
    }).join('');

    return '' +
      '<div class="hero">' +
        '<h2>' + esc(greet) + ' 👋</h2>' +
        '<p>这是一个纯静态的玻璃拟态工作台 —— 所有配置都保存在你的浏览器本地。</p>' +
        '<div class="hero-clock"><span class="t" id="clockTime">--:--:--</span><span class="d" id="clockDate"></span></div>' +
      '</div>' +

      '<div class="stat-grid" style="margin-top:16px">' + stats + '</div>' +

      '<div class="panel" style="margin-top:16px">' +
        '<div class="panel-title">⚡ 快速跳转</div>' +
        '<div class="quick-row">' + quick + '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-title">🔗 常用链接 <span class="sub">来自「链接导航」板块</span></div>' +
        '<div data-recent>' + recentHtml + '</div>' +
      '</div>' +

      (section.items && section.items.length
        ? '<div class="panel"><div class="panel-title">🧩 本板块内容</div>' + GS.items.renderList(section) + '</div>'
        : '') +

      insertBar(section);
  };

  GS.mount.dashboard = function (root) {
    const t = root.querySelector('#clockTime');
    const d = root.querySelector('#clockDate');
    const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    const tick = function () {
      const now = new Date();
      const p = function (n) { return ('0' + n).slice(-2); };
      if (t) t.textContent = p(now.getHours()) + ':' + p(now.getMinutes()) + ':' + p(now.getSeconds());
      if (d) d.textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + WEEK[now.getDay()];
    };
    tick();
    const timer = setInterval(tick, 1000);

    root.addEventListener('click', function (e) {
      const q = e.target.closest('[data-jump]');
      if (q) GS.app.setActive(q.getAttribute('data-jump'));
    });

    return function unmount() { clearInterval(timer); };
  };

  /* =======================================================
     链接导航 / 通用内容板块
     ======================================================= */
  GS.views.links = function (section) {
    return insertBar(section) + GS.items.renderList(section);
  };

  GS.mount.links = function () { return null; };

  /* =======================================================
     设置
     ======================================================= */
  GS.views.settings = function () {
    const s = store.settings();
    const bgImg = store.getBgImage();

    const presets = Object.keys(GRADIENTS).map(function (k) {
      return '<div><div class="preset' + (s.bgGradient === k ? ' active' : '') + '" data-preset="' + k + '" ' +
             'style="background:' + GRADIENTS[k] + '"></div><div class="preset-name">' + esc(GRADIENT_NAMES[k]) + '</div></div>';
    }).join('');

    return '' +
      '<div class="panel">' +
        '<div class="panel-title">🎨 背景设置 <span class="sub">实时生效，自动保存</span></div>' +
        '<div class="bg-preview" id="bgPreview"></div>' +

        '<div class="chip-row" style="margin-bottom:14px" id="bgTypeChips">' +
          '<span class="chip' + (s.bgType === 'solid' ? ' active' : '') + '" data-bgtype="solid">纯色</span>' +
          '<span class="chip' + (s.bgType === 'gradient' ? ' active' : '') + '" data-bgtype="gradient">CSS 渐变</span>' +
          '<span class="chip' + (s.bgType === 'image' ? ' active' : '') + '" data-bgtype="image">本地图片</span>' +
        '</div>' +

        '<div data-bg-pane="solid"' + (s.bgType === 'solid' ? '' : ' hidden') + '>' +
          '<div class="row"><span style="font-size:12px;color:var(--text-2)">选择颜色</span>' +
            '<input type="color" id="solidColor" value="' + esc(s.bgSolid) + '">' +
            '<input class="input" id="solidHex" style="max-width:130px" value="' + esc(s.bgSolid) + '">' +
          '</div>' +
        '</div>' +

        '<div data-bg-pane="gradient"' + (s.bgType === 'gradient' ? '' : ' hidden') + '>' +
          '<div class="preset-grid">' + presets + '</div>' +
        '</div>' +

        '<div data-bg-pane="image"' + (s.bgType === 'image' ? '' : ' hidden') + '>' +
          '<input type="file" id="bgFile" accept="image/*" hidden>' +
          '<div class="data-actions">' +
            '<button class="btn" id="btnUploadBg">上传本地图片</button>' +
            '<button class="btn btn-ghost" id="btnClearBg"' + (bgImg ? '' : ' disabled') + '>移除图片</button>' +
          '</div>' +
          '<p style="margin:10px 0 0;font-size:11.5px;color:var(--text-3);line-height:1.7">' +
            '图片会在本地压缩后存入 localStorage（约 5MB 上限）。若提示空间不足，请换一张更小的图片。</p>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-title">✨ 玻璃与配色</div>' +
        '<div class="field"><label>毛玻璃模糊强度：<b id="blurVal">' + s.blur + '</b> px</label>' +
          '<input type="range" id="blurRange" min="0" max="40" step="1" value="' + s.blur + '"></div>' +
        '<div class="field"><label>玻璃透明度：<b id="alphaVal">' + Number(s.glassAlpha).toFixed(2) + '</b></label>' +
          '<input type="range" id="alphaRange" min="0.15" max="0.9" step="0.05" value="' + s.glassAlpha + '"></div>' +
        '<div class="row">' +
          '<label class="check" style="padding-left:0"><span class="check-label">主色</span>' +
            '<input type="color" id="accentColor" value="' + esc(s.accent) + '"></label>' +
          '<label class="check"><span class="check-label">副色</span>' +
            '<input type="color" id="accent2Color" value="' + esc(s.accent2) + '"></label>' +
          '<button class="btn btn-ghost btn-sm" id="btnResetLook">恢复默认</button>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-title">🗂 数据管理</div>' +
        '<p style="margin:0 0 12px;font-size:12px;color:var(--text-3);line-height:1.7">' +
          '所有数据保存在当前浏览器的 localStorage 中，不会上传。清理浏览器数据会导致配置丢失，建议定期导出备份。</p>' +
        '<div class="data-actions">' +
          '<button class="btn btn-ghost" id="btnExport">导出配置 JSON</button>' +
          '<button class="btn btn-ghost" id="btnImport">导入配置 JSON</button>' +
          '<button class="btn btn-danger" id="btnResetAll">清空全部数据</button>' +
        '</div>' +
        '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel-title">ℹ️ 关于</div>' +
        '<p style="margin:0;font-size:12.5px;color:var(--text-2);line-height:1.9">' +
          '<b>Glass Space</b> · 纯静态玻璃拟态工作台<br>' +
          '技术栈：HTML5 + CSS3 + 原生 JavaScript（ES6+），零依赖、零构建，双击 index.html 即可运行。<br>' +
          '特性：毛玻璃视觉 / 响应式双端 / 可视化编辑（改标题、拖排序、插网页）/ 可自定义方块池的俄罗斯方块。' +
        '</p>' +
      '</div>';
  };

  GS.mount.settings = function (root) {
    const s = store.settings();

    /** 更新背景预览小窗 */
    const updatePreview = function () {
      const el = root.querySelector('#bgPreview');
      if (!el) return;
      const img = store.getBgImage();
      if (s.bgType === 'image' && img) {
        el.style.background = '#fff url("' + img + '") center/cover no-repeat';
      } else if (s.bgType === 'solid') {
        el.style.background = s.bgSolid;
      } else {
        el.style.background = GRADIENTS[s.bgGradient] || GRADIENTS.aurora;
      }
    };
    updatePreview();

    const showPane = function (type) {
      util.$$('[data-bg-pane]', root).forEach(function (p) {
        p.hidden = p.getAttribute('data-bg-pane') !== type;
      });
    };

    const onClick = function (e) {
      // 背景类型
      const bt = e.target.closest('#bgTypeChips .chip');
      if (bt) {
        const type = bt.getAttribute('data-bgtype');
        if (type === 'image' && !store.getBgImage()) {
          util.toast('请先上传一张图片', 'warn');
          root.querySelector('#bgFile').click();
          return;
        }
        s.bgType = type;
        store.save();
        GS.background.apply();
        util.$$('#bgTypeChips .chip', root).forEach(function (c) { c.classList.remove('active'); });
        bt.classList.add('active');
        showPane(type);
        updatePreview();
        return;
      }
      // 渐变预设
      const p = e.target.closest('[data-preset]');
      if (p) {
        s.bgGradient = p.getAttribute('data-preset');
        store.save();
        GS.background.apply();
        util.$$('[data-preset]', root).forEach(function (c) { c.classList.remove('active'); });
        p.classList.add('active');
        updatePreview();
        return;
      }
      // 上传 / 移除 / 恢复默认
      if (e.target.closest('#btnUploadBg')) { root.querySelector('#bgFile').click(); return; }
      if (e.target.closest('#btnClearBg')) {
        GS.background.clearImage();
        const c = root.querySelector('#btnClearBg'); if (c) c.disabled = true;
        util.$$('#bgTypeChips .chip', root).forEach(function (c2) {
          c2.classList.toggle('active', c2.getAttribute('data-bgtype') === s.bgType);
        });
        showPane(s.bgType); updatePreview();
        util.toast('已移除背景图片', 'ok');
        return;
      }
      if (e.target.closest('#btnResetLook')) {
        s.blur = 18; s.glassAlpha = 0.55; s.accent = '#5b6cff'; s.accent2 = '#9b5bff';
        store.save(); GS.background.apply(); GS.app.renderAll();
        util.toast('已恢复默认外观', 'ok');
        return;
      }
      // 数据管理
      if (e.target.closest('#btnExport')) {
        const blob = new Blob([store.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'glass-space-config.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        util.toast('已导出配置文件', 'ok');
        return;
      }
      if (e.target.closest('#btnImport')) { root.querySelector('#importFile').click(); return; }
      if (e.target.closest('#btnResetAll')) {
        GS.modal.confirm('清空全部数据', '将删除所有板块、链接、自定义方块与背景设置，并恢复默认状态。建议先导出备份。', function () {
          store.reset();
          GS.background.apply();
          GS.app.renderAll();
          util.toast('已恢复出厂设置', 'ok');
        }, true);
      }
    };
    root.addEventListener('click', onClick);

    const onInput = function (e) {
      const el = e.target;
      if (el.id === 'solidColor' || el.id === 'solidHex') {
        let v = el.value;
        if (el.id === 'solidHex' && !/^#[0-9a-fA-F]{6}$/.test(v)) return;
        s.bgSolid = v; s.bgType = 'solid';
        if (el.id === 'solidColor') { const h = root.querySelector('#solidHex'); if (h) h.value = v; }
        store.save(); GS.background.apply(); updatePreview();
      } else if (el.id === 'blurRange') {
        s.blur = parseInt(el.value, 10);
        root.querySelector('#blurVal').textContent = s.blur;
        store.save(); GS.background.apply();
      } else if (el.id === 'alphaRange') {
        s.glassAlpha = parseFloat(el.value);
        root.querySelector('#alphaVal').textContent = s.glassAlpha.toFixed(2);
        store.save(); GS.background.apply();
      } else if (el.id === 'accentColor') {
        s.accent = el.value; store.save(); GS.background.apply();
      } else if (el.id === 'accent2Color') {
        s.accent2 = el.value; store.save(); GS.background.apply();
      }
    };
    root.addEventListener('input', onInput);

    // 背景图片上传
    root.querySelector('#bgFile').addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      GS.background.handleFile(f, function () {
        s.bgType = 'image';
        util.$$('#bgTypeChips .chip', root).forEach(function (c) {
          c.classList.toggle('active', c.getAttribute('data-bgtype') === 'image');
        });
        showPane('image');
        const clr = root.querySelector('#btnClearBg'); if (clr) clr.disabled = false;
        updatePreview();
      });
      e.target.value = '';
    });

    // 导入配置
    root.querySelector('#importFile').addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = function (ev) {
        if (store.importJSON(ev.target.result)) {
          GS.background.apply();
          GS.app.renderAll();
          util.toast('导入成功', 'ok');
        }
      };
      r.readAsText(f);
      e.target.value = '';
    });

    return null;
  };

})(window);
