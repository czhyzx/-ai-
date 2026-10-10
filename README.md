# Glass Space · 玻璃拟态个人工作台

一个**零依赖、零构建**的纯静态网站：直接双击 `index.html` 即可在浏览器运行（无需服务器、无需打包）。

## 目录结构

```
website/
├── index.html            # 页面骨架（背景层 + 侧边栏/顶栏 + 视图容器 + 底部 Tab）
├── css/
│   └── style.css         # 全部样式：毛玻璃设计系统、动画关键帧、响应式断点
├── js/
│   ├── store.js          # 全局命名空间 GS + 工具函数 + localStorage 数据层
│   ├── background.js     # 背景系统：纯色 / CSS 渐变 / 本地图片上传
│   ├── editor.js         # 通用弹窗 + 卡片渲染 + 可视化编辑模式
│   ├── views.js          # 仪表盘 / 链接导航 / 设置 三个板块视图
│   ├── tetris.js         # 俄罗斯方块引擎 + 方块池设置 + 自定义形状绘制器
│   └── app.js            # 应用入口：初始化、路由、渲染调度、全局事件
├── _headers              # Cloudflare Pages 自定义响应头
├── wrangler.toml         # Cloudflare Pages 配置（Wrangler 直传用）
├── .gitignore
└── README.md
```

> 脚本使用**经典 `<script>` 标签**按顺序加载（非 ES Module），因此 `file://` 协议下也能正常工作。

## 部署到 Cloudflare Pages

站点是**纯静态、零构建**的，所以 Pages 不需要任何构建命令和输出目录编译。

> ⚠️ **务必排除 `.workbuddy/` 目录**：那里是本地工作笔记，不要上传到公开站点。
> Git 方式已由 `.gitignore` 自动排除；拖拽 / 命令行方式请在打包前手动删除。

### 方式 A：Dashboard 直接上传（最快，零配置）

1. 打开 <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. 给项目起名（如 `glass-space`，它会决定你的域名 `glass-space.pages.dev`）
3. 把下面这些**文件与文件夹一起拖进去**（删掉 `.workbuddy/` 后再打包）：
   ```
   index.html
   css/
   js/
   _headers
   ```
4. 点 **Deploy**，几十秒后就能拿到 `https://glass-space.pages.dev`

### 方式 B：连接 Git 仓库（推荐，后续推送自动重新部署）

1. 把仓库推到 GitHub / GitLab（`.workbuddy/` 已被 `.gitignore` 排除，不会进去）
2. Cloudflare Pages → **Create** → **Connect to Git**，选中该仓库
3. 构建配置填：
   | 配置项 | 值 |
   | --- | --- |
   | Framework preset | `None` |
   | Build command | 留空 |
   | Build output directory | `/` |
4. 保存并部署。以后每次 `git push` 都会自动触发重新部署。

### 方式 C：Wrangler 命令行直传

```bash
# 首次会引导登录 Cloudflare 账号
npx wrangler pages deploy . --project-name=glass-space
```

仓库里已放好 `wrangler.toml`（`pages_build_output_dir = "."`），所以也可以直接用 `npx wrangler pages deploy`。
若想显式排除本地笔记目录：

```bash
npx wrangler pages deploy . --project-name=glass-space --exclude .workbuddy
```

### 部署后注意

- 站点所有配置（板块、链接、自定义方块、背景）都存在**访问者浏览器的 localStorage** 里，不是服务端数据 —— 换浏览器 / 换设备看到的是各自独立的配置，清缓存会重置。
- 背景图片上传后会写入 localStorage，受 5MB 配额限制。
- 「内嵌 iframe 预览」能否生效取决于目标站点是否允许被嵌入，与托管方无关。

## 功能一览

### 视觉与交互

- **响应式双端**：桌面端侧边栏 + 移动端底部 Tab 导航（≤880px 自动切换），移动端支持触摸与长按连发。
- **毛玻璃（Glassmorphism）**：容器、导航栏、弹窗、游戏区全部使用半透明背景 + `backdrop-filter: blur()` + 饱和度提升；背景分 4 层（底色 / 漂浮光晕球 / 自定义图片 / 磨砂遮罩）营造层次感；不支持 `backdrop-filter` 的浏览器自动降级为高不透明度背景。
- **动画**：`fadeIn / slideUp / scaleIn / popIn / shimmer / floatOrb` 等；按钮点击 `scale` 反馈、卡片悬停上浮、板块切换入场动画。
- **背景自定义**：设置面板可切换**纯色 / CSS 渐变（8 种预设）/ 本地图片**，实时生效并持久化；上传的图片会在本地压缩（最长边 1600px，JPEG 0.82）后存入 localStorage，避免超出配额。

### 页面结构与可视化编辑

- 板块：【主页/仪表盘】【链接导航】【俄罗斯方块】【设置】，可自由新增板块。
- **编辑模式**（右上角开关，快捷键 `Ctrl/⌘ + E`）：
  - 板块标题**就地编辑**（侧边栏直接点改）
  - 板块**拖拽排序** + ↑↓ 按钮排序（移动端友好）
  - **插入网页**：输入 URL → 生成带 favicon 的**外链按钮**，或**内嵌 iframe 预览**（带 X-Frame-Options 限制提示与"新窗口打开"兜底入口）
  - 卡片可编辑、删除、拖拽排序
  - 所有修改自动写入 localStorage，刷新不丢失

### 俄罗斯方块（重点模块）

- 完整玩法：开始/暂停、计分、消除行数、**等级速度递增**（每 10 行升 1 级，下落间隔 800ms → 最快 90ms）、**下一个方块预览**、**落点预测**、消行闪烁动画、最高分记录。
- 操作：键盘 `← →` 移动 / `↑` 旋转 / `↓` 软降 / `空格` 硬降 / `P` 暂停 / `R` 重开；移动端提供触摸按钮（左右支持长按连发）。
- **游戏设置**：
  - **落点预测开关**：默认开启，在棋盘上用半透明轮廓标出当前方块的最终落点；可随时关闭。
  - **画布大小**：`自适应`（跟随窗口/屏幕自动取最大可行尺寸）或手动指定格子边长 `14–44 px`，另附「紧凑 20 / 标准 28 / 大 36」快捷档；手动值会因可用空间不足而自动收敛，不会撑破布局（移动端会预留触摸按钮空间）。
- **方块池设置**：
  - **基础**：勾选/取消经典 7 种（I / O / T / S / Z / J / L），只有被勾选的才会参与随机下落（洗牌袋随机，不会出现长时间缺某块）。
  - **进阶**：4×4 或 5×5 **网格绘制工具**，点击格子绘制任意形状，右侧实时显示**自动计算出的全部旋转状态**（旋转矩阵 + 自动去重）；保存后该形状立即加入下落池，参与随机、旋转（含墙踢）与碰撞检测。
  - 自定义方块数据存入 `localStorage`，可逐个删除。

### 数据与设置

- 设置面板提供：背景、毛玻璃模糊强度、玻璃透明度、主/副强调色、配置**导出/导入 JSON**、**清空全部数据**。

## 本地存储键

| Key              | 说明                            |
| ---------------- | ----------------------------- |
| `gs_data_v1`     | 板块、卡片、方块池、自定义方块、落点预测开关、画布尺寸、外观设置、统计 |
| `gs_bg_image_v1` | 背景图片（压缩后的 dataURL，单独存放避免挤爆配额） |

## 浏览器要求

Chrome / Edge / Firefox / Safari 现代版本。毛玻璃效果需要 `backdrop-filter`（Chrome 76+、Safari 9+ `-webkit-`、Firefox 103+）。

## 说明

- 内嵌预览依赖目标站点是否允许被 iframe 嵌入，被拒绝时会显示提示并提供新窗口打开入口。
- favicon 使用公共 favicon 服务，加载失败时自动回退为首字母彩色头像。
