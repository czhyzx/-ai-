/* =========================================================
   app.js —— 应用入口：初始化、路由渲染、全局事件
   ========================================================= */
(function (global) {
  'use strict';

  const GS = global.GS;
  const { util, store, editor } = GS;

  const app = {
    activeId: 'home',
    unmountFn: null,

    init() {
      // 1) 载入本地数据
      store.load();
      if (!store.sectionById(store.data.activeId)) store.data.activeId = store.sections()[0].id;
      this.activeId = store.data.activeId;

      // 2) 访问统计
      const st = store.data.stats;
      st.visits = (st.visits || 0) + 1;
      st.lastVisit = new Date().toISOString();
      store.save();

      // 3) 背景
      GS.background.init();

      // 4) 编辑模式 UI 同步
      this.syncEditUI();

      // 5) 首次渲染
      this.renderAll();

      // 6) 全局事件
      this.bindGlobal();
    },

    /* -------------------- 渲染 -------------------- */

    syncEditUI() {
      const on = !!store.settings().editMode;
      document.body.classList.toggle('editing', on);
      const tg = document.getElementById('editToggle');
      if (tg) tg.checked = on;
      const flag = document.getElementById('editFlag');
      if (flag) flag.hidden = !on;
      const add = document.getElementById('btnAddSection');
      if (add) add.hidden = !on;
    },

    /** 只重绘导航（避免打断当前交互） */
    renderNavOnly() { editor.renderNav(); },

    /** 重绘导航 + 当前板块 */
    renderAll() {
      this.syncEditUI();
      editor.renderNav();
      this.renderView();
    },

    renderView() {
      // 回收上一个板块的资源（定时器、监听、rAF）
      if (typeof this.unmountFn === 'function') {
        try { this.unmountFn(); } catch (e) {}
        this.unmountFn = null;
      }

      const section = store.sectionById(this.activeId) || store.sections()[0];
      this.activeId = section.id;

      const view = document.getElementById('view');
      const renderer = GS.views[section.type] || GS.views.links;
      view.innerHTML = renderer(section);

      // 重放入场动画
      view.classList.remove('slide-up');
      void view.offsetWidth;
      view.classList.add('slide-up');

      document.getElementById('topTitle').textContent = section.title;

      // 挂载板块逻辑
      const mounter = GS.mount[section.type];
      this.unmountFn = mounter ? mounter(view, section) : null;

      // 卡片交互（编辑 / 删除 / 拖拽排序）
      editor.bindCards(view);
    },

    setActive(id) {
      if (!store.sectionById(id)) return;
      this.activeId = id;
      store.data.activeId = id;
      store.save();
      this.renderAll();
      global.scrollTo({ top: 0, behavior: 'smooth' });
    },

    /* -------------------- 全局事件 -------------------- */
    bindGlobal() {
      editor.bindNav();

      // 编辑模式开关
      document.getElementById('editToggle').addEventListener('change', function (e) {
        editor.toggle(e.target.checked);
      });

      // 新建板块
      document.getElementById('btnAddSection').addEventListener('click', function () {
        editor.openSectionDialog();
      });

      // 「插入网页」按钮（事件委托，随板块重渲染自动生效）
      document.getElementById('view').addEventListener('click', function (e) {
        const btn = e.target.closest('[data-insert]');
        if (!btn) return;
        const sec = store.sectionById(app.activeId);
        if (sec) editor.openItemDialog(sec, null);
      });

      // 快捷键：Ctrl/Cmd + E 切换编辑模式
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
          e.preventDefault();
          document.getElementById('editToggle').checked = !store.settings().editMode;
          editor.toggle();
        }
      });

      // 页面隐藏时自动暂停游戏，避免后台空转
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && GS.tetrisGame && GS.tetrisGame.state === 'playing') {
          GS.tetrisGame.pause();
        }
      });
    },
  };

  GS.app = app;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { app.init(); });
  } else {
    app.init();
  }

})(window);
