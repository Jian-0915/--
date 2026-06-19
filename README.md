# 悦己 - 个人管理系统

一个基于 Flask + PyWebView 的桌面端个人管理系统，集成网易云音乐搜索播放、图片库浏览、娱乐视频等功能，支持悬浮播放控制器实现跨页面后台播放。

## 主要功能

### 音乐播放器
- **在线搜索**：接入网易云音乐 API，搜索全网歌曲
- **完整播放控制**：播放/暂停、上一首/下一首、进度条拖拽、音量调节、静音
- **播放模式**：随机播放、单曲循环、列表循环、顺序播放
- **悬浮播放控制器**：离开音乐页面后，底部自动显示悬浮控制器，音乐不中断
- **歌词显示**：支持同步歌词展示
- **收藏与历史**：歌曲收藏、播放历史记录
- **自建歌单**：创建和管理个人歌单
- **排行榜**：热歌榜、新歌榜、飙升榜等
- **状态持久化**：播放状态通过 localStorage 保存，刷新不丢失

### 图片库
- **8 大分类**：风景、自然、建筑、人文、动物、美食、旅行、科技
- **本地缓存**：图片自动下载到本地，离线可浏览
- **偏好设置**：自定义关注的图片分类
- **图片预览**：点击放大查看

### 娱乐板块
- **视频播放**：嵌入多个在线视频平台
- **游戏中心**：内置小游戏

### 用户系统
- **注册审批**：新用户注册需管理员审批
- **登录认证**：基于 Session 的身份验证
- **个人资料**：头像颜色、密码修改
- **角色管理**：管理员 / 普通用户

### 管理后台
- **用户管理**：启用/禁用、删除用户、重置密码
- **注册审批**：审批新用户注册申请

## 技术栈

| 类别 | 技术 |
|------|------|
| 后端框架 | Flask 3.1.3 |
| 前端 | HTML5 + CSS3 + 原生 JavaScript |
| 桌面端 | PyWebView 4.2.2（Windows EdgeChromium 内核） |
| 数据库 | SQLite |
| 密码加密 | Werkzeug generate_password_hash |
| 音乐 API | 网易云音乐公开接口（后端代理，解决 CORS） |
| 打包工具 | PyInstaller |
| 图片处理 | Pillow |

## 项目结构

```
src/
├── app.py                      # Flask 应用主入口（路由、API、数据库）
├── AccountManager.spec          # PyInstaller 打包配置
├── requirements.txt             # Python 依赖
├── .gitignore
├── static/
│   ├── css/
│   │   └── style.css           # 全局样式（含悬浮播放器样式）
│   ├── js/
│   │   ├── app.js              # 主应用逻辑
│   │   ├── ajax_nav.js         # AJAX 无刷新导航系统
│   │   ├── floating_player.js   # 悬浮播放控制器组件
│   │   ├── login.js            # 登录页面逻辑
│   │   ├── register.js         # 注册页面逻辑
│   │   ├── admin.js            # 管理后台逻辑
│   │   └── particles.js        # 登录页粒子动画
│   └── gallery_images/         # 图片库本地缓存
│       ├── landscape/          # 风景
│       ├── nature/             # 自然
│       ├── food/               # 美食
│       └── ...
└── templates/
    ├── login.html              # 登录页面
    ├── register.html           # 注册页面
    ├── dashboard.html          # 仪表盘（主页）
    ├── profile.html            # 个人资料
    ├── music_player.html       # 音乐播放器
    ├── gallery.html            # 图片库
    ├── gallery_prefs.html      # 图片库偏好设置
    ├── entertainment.html      # 娱乐板块
    └── admin.html              # 管理后台
```

## 部署步骤

### 方式一：开发环境运行

**环境要求**：Python 3.10+

1. **克隆仓库**
   ```bash
   git clone https://github.com/Jian-0915/--.git
   cd --/src
   ```

2. **创建并激活虚拟环境**
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # macOS / Linux
   source venv/bin/activate
   ```

3. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

4. **启动应用**
   ```bash
   python app.py
   ```

5. **访问应用**

   浏览器打开 `http://127.0.0.1:5000`

### 方式二：打包为桌面应用

1. **安装 PyInstaller**
   ```bash
   pip install pyinstaller
   ```

2. **执行打包**
   ```bash
   pyinstaller AccountManager.spec
   ```

3. **运行桌面应用**

   打包完成后，`dist/AccountManager.exe` 即为独立可执行文件，双击运行即可打开桌面窗口。

   > 打包模式会自动启动 Flask 后台服务并打开 WebView 窗口，无需浏览器。

## 使用说明

### 默认账户

首次运行时自动创建管理员账户：

| 字段 | 值 |
|------|-----|
| 用户名 | `admin` |
| 密码 | `admin123` |

### 音乐播放器使用

1. 登录后点击侧边栏「娱乐板块」→「音乐播放器」
2. 在搜索框输入歌曲或歌手名称，按回车搜索
3. 点击搜索结果中的歌曲即可播放
4. 使用播放器界面控制播放、调整音量、切换模式

### 悬浮播放控制器

1. 在音乐播放器页面播放歌曲后
2. 点击侧边栏导航到其他页面（如仪表盘、图片库）
3. 页面底部自动出现悬浮播放控制器
4. 可通过悬浮控制器进行播放/暂停、切歌、调节音量等操作
5. 点击右侧展开按钮可返回音乐播放器页面

## 核心实现

### AJAX 无刷新导航

通过 [ajax_nav.js](static/js/ajax_nav.js) 拦截页面内链接点击，使用 AJAX 加载新页面内容，只替换 `<main>` 区域。页面头部、侧边栏和悬浮播放器不受影响，实现无刷新切换。

### 悬浮播放控制器

- Audio 对象作为全局 JS 对象，不挂载在 DOM 中，页面切换时不被销毁
- 悬浮控制器 UI 挂载在 `<body>` 上，位于 `<main>` 之外
- 离开音乐页面时自动显示悬浮控制器
- 进入音乐页面时自动隐藏，由主播放器界面接管
- 播放状态通过 `localStorage` 持久化保存

### 网易云音乐 API 代理

后端通过 Flask 代理网易云音乐 API 请求，解决浏览器 CORS 限制：

- `/music/api/search` — 歌曲搜索
- `/music/api/song_url/<song_id>` — 获取播放地址
- `/music/api/lyric` — 获取歌词
- `/music/api/ranking` — 排行榜
- `/music/api/audio_proxy/<song_id>` — 音频流代理

## API 接口概览

| 接口 | 方法 | 说明 |
|------|------|------|
| `/login` | GET/POST | 登录 |
| `/register` | GET/POST | 注册 |
| `/logout` | GET | 退出登录 |
| `/dashboard` | GET | 仪表盘 |
| `/music` | GET | 音乐播放器页面 |
| `/music/api/search` | GET | 搜索歌曲 |
| `/music/api/song_url/<id>` | GET | 获取播放地址 |
| `/music/api/favorites` | GET/POST/DELETE | 收藏管理 |
| `/music/api/history` | GET/POST | 播放历史 |
| `/music/api/playlists` | GET/POST | 歌单管理 |
| `/gallery` | GET | 图片库页面 |
| `/gallery/api/images` | GET | 获取图片 |
| `/admin` | GET | 管理后台 |

## 注意事项

- 音乐搜索功能依赖网易云音乐公开 API，仅供学习交流使用
- 首次使用图片库时，图片会自动从网络下载到本地缓存
- 建议在网络环境良好的情况下首次使用，以便下载图片资源
- 打包后的应用数据库文件位于可执行文件同级的 `_internal` 目录

## 许可证

MIT License

Copyright (c) 2026 Jian-0915
