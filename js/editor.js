/* =========================================================
   editor.js —— 可视化编辑模式
   1) 通用弹窗组件 GS.modal
   2) 卡片（链接 / 内嵌网页）渲染 GS.items
   3) 编辑模式：标题就地编辑、板块/卡片拖拽排序、插入网页、新建板块
   ========================================================= */
(function (global) {
  'use strict';

  const GS = global.GS;
  const { util, store } = GS;
  const esc = util.esc;

  /* =======================================================
     1. 弹窗
     ======================================================= */
  const modal = {
    current: null,

    open(opts) {
      this.close();

      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML =
        '<div class="modal">' +
          '<h3>' + esc(opts.title || '') + '</h3>' +
          '<div class="modal-body">' + (opts.body || '') + '</div>' +
          '<div class="modal-foot">' +
            '<button class="btn btn-ghost" data-act="cancel">' + esc(opts.cancelText || '取消') + '</button>' +
            '<button class="btn' + (opts.danger ? ' btn-danger' : '') + '" data-act="ok">' + esc(opts.okText || '确定') + '</button>' +
          '</div>' +
        '</div>';

      document.getElementById('modalRoot').appendChild(mask);
      this.current = mask;

      const body = mask.querySelector('.modal-body');

      mask.addEventListener('click', function (e) {
        if (e.target === mask) { modal.close(); return; }
        const act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'cancel') { modal.close(); }
        else if (act === 'ok') {
          if (!opts.onOk || opts.onOk(body, mask) !== false) modal.close();
        }
      });

      const onKey = function (e) {
        if (e.key === 'Escape') { modal.close(); document.removeEventListener('keydown', onKey); }
      };
      document.addEventListener('keydown', onKey);

      if (opts.onMount) opts.onMount(body, mask);
      const first = body.querySelector('input,select,textarea');
      if (first) setTimeout(function () { first.focus(); }, 60);

      return mask;
    },

    close() {
      if (this.current) { this.current.remove(); this.current = null; }
    },

    confirm(title, msg, onOk, danger) {
      this.open({
        title: title,
        body: '<p style="margin:0;font-size:13.5px;line-height:1.7;color:var(--text-2)">' + esc(msg) + '</p>',
        okText: danger ? '删除' : '确定',
        danger: !!danger,
        onOk: onOk,
      });
    },
  };

  /* =======================================================
     2. 卡片渲染（链接按钮 / iframe 内嵌预览）
     ======================================================= */
  const items = {

    /** 单张卡片 HTML */
    render(item) {
      const editing = store.settings().editMode;
      const url = util.safeUrl(item.url) || '';
      const host = util.hostOf(url);
      const fav = util.faviconUrl(url);

      const avatar = fav
        ? '<img class="favicon" src="' + esc(fav) + '" alt="" ' +
          'onerror="this.remove();var f=this.parentNode.querySelector(\'.favicon-fb\');if(f)f.style.display=\'grid\';">'
        : '';
      const fallback =
        '<span class="favicon-fb" style="background:' + util.hashColor(host || item.title) +
        ';' + (fav ? 'display:none;' : '') + '">' + esc((item.title || host || '?').trim().charAt(0).toUpperCase()) + '</span>';

      let inner = '';

      if (item.type === 'embed') {
        // —— 内嵌 iframe 预览 ——
        inner =
          '<div class="embed-head">' + avatar + fallback +
            '<div style="flex:1;min-width:0">' +
              '<div class="link-title">' + esc(item.title || host || '网页预览') + '</div>' +
              '<div class="link-url">' + esc(host) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="embed-frame">' +
            '<iframe src="' + esc(url) + '" loading="lazy" referrerpolicy="no-referrer" ' +
            'sandbox="allow-scripts allow-same-origin allow-popups allow-forms" ' +
            'title="' + esc(item.title || host) + '"></iframe>' +
          '</div>' +
          '<p class="embed-hint">若上方为空白，说明该站点设置了 <b>X-Frame-Options</b> 或 <b>CSP frame-ancestors</b> 禁止被嵌入，' +
          '请点击右上角 ↗ 在新标签页打开。</p>';
      } else {
        // —— 带图标的外链按钮 ——
        inner =
          '<div class="card-body">' + avatar + fallback +
            '<div style="flex:1;min-width:0">' +
              '<div class="link-title">' + esc(item.title || host || '链接') + '</div>' +
              '<div class="link-url">' + esc(host || url) + '</div>' +
            '</div>' +
          '</div>' +
          '<span class="card-ext">↗</span>';
      }

      const toolbar = editing
        ? '<div class="card-toolbar">' +
            '<button class="icon-btn" data-card-act="edit" title="编辑">✎</button>' +
            '<button class="icon-btn danger" data-card-act="del" title="删除">✕</button>' +
          '</div>'
        : (item.type === 'embed'
            ? '<div class="card-toolbar"><a class="icon-btn" href="' + esc(url) + '" target="_blank" rel="noopener" title="新窗口打开">↗</a></div>'
            : '');

      // 内嵌预览用 <div>（避免 <a> 嵌套 <a> 与误触跳转），外链用 <a>
      const isEmbed = item.type === 'embed';
      const tag = isEmbed ? 'div' : 'a';
      const attrs = isEmbed ? '' : ' href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"';

      return '<' + tag + ' class="card link-card' + (isEmbed ? ' embed-card' : '') + '"' + attrs +
             ' draggable="' + (editing ? 'true' : 'false') + '" data-id="' + esc(item.id) + '">' +
             toolbar + inner +
             '</' + tag + '>';
    },

    /** 一整段卡片列表 HTML */
    renderList(section) {
      if (!section.items || !section.items.length) {
        return '<div class="empty">这里还没有内容' +
               (store.settings().editMode ? '，点击上方「＋ 插入网页」添加一个吧' : '') + '</div>';
      }
      return '<div class="grid grid-cards" data-items>' +
        section.items.map(function (it) { return items.render(it); }).join('') +
        '</div>';
    },
  };

  /* =======================================================
     3. 编辑模式
     ======================================================= */
  const editor = {

    isOn() { return !!store.settings().editMode; },

    /** 切换编辑模式 */
    toggle(on) {
      const s = store.settings();
      s.editMode = (on === undefined) ? !s.editMode : !!on;
      store.save();
      document.body.classList.toggle('editing', s.editMode);
      document.getElementById('editFlag').hidden = !s.editMode;
      document.getElementById('btnAddSection').hidden = !s.editMode;
      GS.app.renderAll();
      util.toast(s.editMode ? '已进入编辑模式' : '已退出编辑模式', s.editMode ? 'warn' : 'ok', 1600);
    },

    /* ---------- 插入 / 编辑网页 ---------- */

    /**
     * @param {object} section 当前板块
     * @param {object|null} item 传入则为编辑，否则为新建
     */
    openItemDialog(section, item) {
      const isEdit = !!item;
      const data = item || { title: '', url: '', type: 'link' };

      const bodyHtml =
        '<div class="field"><label>网页地址（支持 http / https，缺省自动补 https://）</label>' +
          '<input class="input" name="url" placeholder="例如：https://example.com" value="' + esc(data.url) + '"></div>' +
        '<div class="field"><label>显示名称（留空自动取域名）</label>' +
          '<input class="input" name="title" placeholder="例如：我的博客" value="' + esc(data.title) + '"></div>' +
        '<div class="field"><label>插入方式</label>' +
          '<div class="chip-row" data-mode>' +
            '<span class="chip' + (data.type !== 'embed' ? ' active' : '') + '" data-val="link">🔗 外链按钮</span>' +
            '<span class="chip' + (data.type === 'embed' ? ' active' : '') + '" data-val="embed">🖼 内嵌预览（iframe）</span>' +
          '</div>' +
        '</div>' +
        '<p style="margin:0;font-size:11.5px;color:var(--text-3);line-height:1.7">' +
          '提示：部分站点（如百度、知乎、Google）禁止被 iframe 嵌入，此时请选择「外链按钮」。</p>';

      modal.open({
        title: isEdit ? '编辑网页卡片' : '插入网页',
        body: bodyHtml,
        okText: isEdit ? '保存' : '插入',
        onMount: function (body) {
          const chips = util.$$('[data-mode] .chip', body);
          chips.forEach(function (c) {
            c.addEventListener('click', function () {
              chips.forEach(function (x) { x.classList.remove('active'); });
              c.classList.add('active');
            });
          });
        },
        onOk: function (body) {
          const rawUrl = body.querySelector('[name=url]').value;
          const url = util.safeUrl(rawUrl);
          if (!url) { util.toast('请输入有效的 http(s) 地址', 'err'); return false; }

          const title = body.querySelector('[name=title]').value.trim() || util.hostOf(url) || '未命名';
          const active = body.querySelector('[data-mode] .chip.active');
          const type = active ? active.getAttribute('data-val') : 'link';

          if (isEdit) {
            item.url = url; item.title = title; item.type = type;
          } else {
            section.items = section.items || [];
            section.items.push({ id: util.uid('it'), title: title, url: url, type: type, icon: '' });
          }
          store.save();
          GS.app.renderAll();
          util.toast(isEdit ? '已保存' : '已插入', 'ok', 1500);
        },
      });
    },

    removeItem(section, itemId) {
      const idx = section.items.findIndex(function (i) { return i.id === itemId; });
      if (idx < 0) return;
      const it = section.items[idx];
      modal.confirm('删除卡片', '确定删除「' + it.title + '」吗？此操作不可撤销。', function () {
        section.items.splice(idx, 1);
        store.save();
        GS.app.renderAll();
        util.toast('已删除', 'ok', 1400);
      }, true);
    },

    /* ---------- 新建板块 ---------- */
    openSectionDialog() {
      const ICONS = ['🧩', '📁', '📚', '🛠', '🎵', '📷', '💡', '🚀', '🌐', '🗂'];
      const bodyHtml =
        '<div class="field"><label>板块名称</label>' +
          '<input class="input" name="title" placeholder="例如：学习资料" value="新板块"></div>' +
        '<div class="field"><label>板块图标</label>' +
          '<div class="chip-row" data-icon>' +
            ICONS.map(function (ic, i) {
              return '<span class="chip' + (i === 0 ? ' active' : '') + '" data-val="' + ic + '">' + ic + '</span>';
            }).join('') +
          '</div>' +
        '</div>';

      modal.open({
        title: '新建板块',
        body: bodyHtml,
        okText: '创建',
        onMount: function (body) {
          const chips = util.$$('[data-icon] .chip', body);
          chips.forEach(function (c) {
            c.addEventListener('click', function () {
              chips.forEach(function (x) { x.classList.remove('active'); });
              c.classList.add('active');
            });
          });
        },
        onOk: function (body) {
          const title = body.querySelector('[name=title]').value.trim() || '新板块';
          const ic = body.querySelector('[data-icon] .chip.active');
          const sec = {
            id: util.uid('sec'),
            title: title,
            icon: ic ? ic.getAttribute('data-val') : '🧩',
            type: 'links',     // 自定义板块默认为「内容板块」，可插入网页
            items: [],
            locked: false,
          };
          store.sections().push(sec);
          store.save();
          GS.app.setActive(sec.id);
          util.toast('板块已创建', 'ok', 1500);
        },
      });
    },

    removeSection(section) {
      if (section.locked) { util.toast('核心板块不可删除', 'warn'); return; }
      modal.confirm('删除板块', '确定删除板块「' + section.title + '」及其全部内容吗？', function () {
        const list = store.sections();
        const i = list.indexOf(section);
        if (i >= 0) list.splice(i, 1);
        store.save();
        GS.app.setActive('home');
        util.toast('板块已删除', 'ok', 1400);
      }, true);
    },

    /* ---------- 板块排序 ---------- */
    moveSection(index, dir) {
      const list = store.sections();
      if (store.move(list, index, index + dir)) {
        store.save();
        GS.app.renderAll();
      }
    },

    /* ---------- 侧边栏导航渲染（含编辑控件） ---------- */
    renderNav() {
      const list = store.sections();
      const activeId = store.data.activeId;
      const editing = this.isOn();

      const navHtml = list.map(function (sec, i) {
        const ctrl = editing
          ? '<span class="nav-ctrl">' +
              '<button class="icon-btn" data-nav-act="up"   data-i="' + i + '" title="上移" style="width:24px;height:24px;flex:0 0 24px;font-size:11px">↑</button>' +
              '<button class="icon-btn" data-nav-act="down" data-i="' + i + '" title="下移" style="width:24px;height:24px;flex:0 0 24px;font-size:11px">↓</button>' +
              (sec.locked ? '' : '<button class="icon-btn danger" data-nav-act="del" data-i="' + i + '" title="删除板块" style="width:24px;height:24px;flex:0 0 24px;font-size:11px">✕</button>') +
            '</span>'
          : '';

        return '<div class="nav-item' + (sec.id === activeId ? ' active' : '') + '" ' +
               'data-id="' + esc(sec.id) + '" data-i="' + i + '" ' +
               (editing ? 'draggable="true"' : '') + '>' +
                 '<span class="nav-ico">' + esc(sec.icon || '🧩') + '</span>' +
                 '<span class="nav-label" ' + (editing ? 'contenteditable="true" spellcheck="false"' : '') +
                   ' draggable="false">' + esc(sec.title) + '</span>' +
                 ctrl +
               '</div>';
      }).join('');

      document.getElementById('navList').innerHTML = navHtml;

      // 底部 Tab（移动端）
      document.getElementById('tabbar').innerHTML = list.map(function (sec) {
        return '<div class="tab-item' + (sec.id === activeId ? ' active' : '') + '" data-id="' + esc(sec.id) + '">' +
               '<span class="t-ico">' + esc(sec.icon || '🧩') + '</span>' +
               '<span>' + esc(sec.title) + '</span></div>';
      }).join('');
    },

    /** 绑定导航区事件（点击切换 / 就地改标题 / 排序 / 拖拽） */
    bindNav() {
      const nav = document.getElementById('navList');
      const tab = document.getElementById('tabbar');

      const jump = function (e) {
        const el = e.target.closest('[data-id]');
        if (!el || !nav.contains(el)) return;
        if (e.target.closest('[data-nav-act]')) return;      // 排序按钮不触发切换
        if (e.target.classList.contains('nav-label') && editor.isOn()) return; // 编辑标题时不切换
        GS.app.setActive(el.getAttribute('data-id'));
      };
      nav.addEventListener('click', jump);
      tab.addEventListener('click', function (e) {
        const el = e.target.closest('[data-id]');
        if (el) GS.app.setActive(el.getAttribute('data-id'));
      });

      // —— 排序 / 删除 ——
      nav.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-nav-act]');
        if (!btn) return;
        e.stopPropagation();
        const i = parseInt(btn.getAttribute('data-i'), 10);
        const act = btn.getAttribute('data-nav-act');
        if (act === 'up') editor.moveSection(i, -1);
        else if (act === 'down') editor.moveSection(i, 1);
        else if (act === 'del') editor.removeSection(store.sections()[i]);
      });

      // —— 标题就地编辑 ——
      nav.addEventListener('input', util.debounce(function (e) {
        const label = e.target;
        if (!label.classList.contains('nav-label')) return;
        const wrap = label.closest('[data-i]');
        const i = parseInt(wrap.getAttribute('data-i'), 10);
        const sec = store.sections()[i];
        if (!sec) return;
        sec.title = label.textContent.trim() || '未命名';
        store.save();
        document.getElementById('topTitle').textContent = sec.title;
        GS.app.renderNavOnly();
      }, 400));

      nav.addEventListener('keydown', function (e) {
        if (e.target.classList.contains('nav-label') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      });

      // —— 拖拽排序（桌面端） ——
      let dragIdx = -1;
      nav.addEventListener('dragstart', function (e) {
        const item = e.target.closest('.nav-item');
        if (!item || !editor.isOn()) { e.preventDefault(); return; }
        dragIdx = parseInt(item.getAttribute('data-i'), 10);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(dragIdx)); } catch (err) {}
      });
      nav.addEventListener('dragover', function (e) {
        if (dragIdx < 0) return;
        e.preventDefault();
        const over = e.target.closest('.nav-item');
        util.$$('.nav-item', nav).forEach(function (n) { n.classList.remove('drag-over'); });
        if (over) over.classList.add('drag-over');
      });
      nav.addEventListener('drop', function (e) {
        const over = e.target.closest('.nav-item');
        if (!over || dragIdx < 0) return;
        e.preventDefault();
        const to = parseInt(over.getAttribute('data-i'), 10);
        const list = store.sections();
        if (store.move(list, dragIdx, to)) { store.save(); GS.app.renderAll(); }
        dragIdx = -1;
      });
      nav.addEventListener('dragend', function () {
        dragIdx = -1;
        util.$$('.nav-item', nav).forEach(function (n) { n.classList.remove('dragging', 'drag-over'); });
      });
    },

    /* ---------- 卡片交互（编辑 / 删除 / 拖拽排序） ---------- */
    bindCards(root) {
      const zone = root.querySelector('[data-items]');
      if (!zone) return;

      zone.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-card-act]');
        if (btn) {
          e.preventDefault(); e.stopPropagation();
          const card = btn.closest('[data-id]');
          const itemId = card.getAttribute('data-id');
          const sec = store.sectionById(GS.app.activeId);
          if (!sec) return;
          const item = sec.items.filter(function (i) { return i.id === itemId; })[0];
          if (!item) return;
          if (btn.getAttribute('data-card-act') === 'edit') editor.openItemDialog(sec, item);
          else editor.removeItem(sec, itemId);
          return;
        }
        // 编辑模式下阻止跳转，避免误触
        if (editor.isOn()) { e.preventDefault(); }
      });

      // 卡片拖拽排序
      let dragId = null;
      zone.addEventListener('dragstart', function (e) {
        const card = e.target.closest('.card[data-id]');
        if (!card || !editor.isOn()) { e.preventDefault(); return; }
        dragId = card.getAttribute('data-id');
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      zone.addEventListener('dragover', function (e) {
        if (!dragId) return;
        e.preventDefault();
        const over = e.target.closest('.card[data-id]');
        util.$$('.card', zone).forEach(function (c) { c.classList.remove('drag-over'); });
        if (over && over.getAttribute('data-id') !== dragId) over.classList.add('drag-over');
      });
      zone.addEventListener('drop', function (e) {
        const over = e.target.closest('.card[data-id]');
        if (!over || !dragId) return;
        e.preventDefault();
        const sec = store.sectionById(GS.app.activeId);
        if (!sec) return;
        const from = sec.items.findIndex(function (i) { return i.id === dragId; });
        const to = sec.items.findIndex(function (i) { return i.id === over.getAttribute('data-id'); });
        if (store.move(sec.items, from, to)) { store.save(); GS.app.renderAll(); }
        dragId = null;
      });
      zone.addEventListener('dragend', function () {
        dragId = null;
        util.$$('.card', zone).forEach(function (c) { c.classList.remove('dragging', 'drag-over'); });
      });
    },
  };

  GS.modal = modal;
  GS.items = items;
  GS.editor = editor;

})(window);
