# Account Manager

一个基于 Flask + WebView 开发的桌面端账户管理系统，集成音乐播放器、图片库、娱乐等功能模块。

## 功能特性

### 🎵 音乐播放器
- 在线搜索网易云音乐
- 音乐播放控制（播放/暂停、上一首/下一首）
- 进度条拖拽定位
- 音量控制与静音
- 随机播放模式
- 循环模式（单曲循环/列表循环/无循环）
- **悬浮播放控制器**：离开音乐页面后底部显示悬浮控制器，音乐继续播放不中断
- 播放状态持久化

### 🖼️ 图片库
- 分类浏览图片（自然风光、花草自然、风景山水等）
- 图片预览与收藏
- 支持图片搜索

### 🎮 娱乐板块
- 视频播放器（支持多个在线视频平台）
- 游戏中心

### 👤 用户管理
- 用户注册与登录
- 个人资料管理
- 密码修改

### 🔧 管理后台
- 用户管理
- 系统设置

## 技术栈

- **后端**: Flask 3.1.3
- **前端**: HTML5 + CSS3 + JavaScript
- **UI框架**: 自定义现代化界面
- **桌面端**: PyWebView 4.2.2
- **数据库**: SQLite
- **打包工具**: PyInstaller

## 项目结构

```
src/
├── app.py                 # Flask 应用入口
├── AccountManager.spec    # PyInstaller 打包配置
├── account_manager.db     # SQLite 数据库
├── requirements.txt       # Python 依赖
├── static/
│   ├── css/
│   │   └── style.css      # 全局样式（含悬浮播放器样式）
│   ├── js/
│   │   ├── app.js         # 主应用逻辑
│   │   ├── ajax_nav.js    # AJAX 导航系统
│   │   ├── floating_player.js  # 悬浮播放器组件
│   │   ├── login.js       # 登录逻辑
│   │   ├── register.js    # 注册逻辑
│   │   ├── admin.js       # 管理后台逻辑
│   │   └── particles.js   # 粒子动画效果
│   └── gallery_images/    # 图片库资源
└── templates/
    ├── login.html         # 登录页面
    ├── register.html      # 注册页面
    ├── dashboard.html     # 仪表盘
    ├── profile.html       # 个人资料
    ├── music_player.html  # 音乐播放器
    ├── gallery.html       # 图片库
    ├── gallery_prefs.html # 图片库设置
    ├── entertainment.html # 娱乐板块
    └── admin.html         # 管理后台
```

## 部署说明

### 开发环境

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd AccountManager/src
   ```

2. **创建虚拟环境**
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # Linux/Mac
   source venv/bin/activate
   ```

3. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

4. **运行开发服务器**
   ```bash
   python app.py
   ```

5. **访问应用**
   打开浏览器访问 `http://localhost:5000`

### 打包桌面应用

1. **安装 PyInstaller**
   ```bash
   pip install pyinstaller
   ```

2. **执行打包**
   ```bash
   pyinstaller AccountManager.spec
   ```

3. **获取可执行文件**
   打包后的 `AccountManager.exe` 位于 `dist/` 目录

## 使用说明

### 默认账户

- **用户名**: admin
- **密码**: admin123

### 悬浮播放控制器

1. 进入「娱乐板块」→「音乐播放器」
2. 在搜索框输入歌曲名称搜索
3. 点击歌曲开始播放
4. 切换到其他页面（如仪表盘、个人中心）
5. 底部会自动显示悬浮播放控制器
6. 点击悬浮控制器的展开按钮可返回音乐播放器

## 核心实现

### AJAX 导航系统
通过 AJAX 加载新页面内容，只替换 `<main>` 区域，保留页面头部、侧边栏和悬浮播放器，实现无刷新页面切换。

### 悬浮播放器
- Audio 对象作为全局对象存在，不受页面切换影响
- 悬浮控制器 UI 挂载在 `<body>` 上，不在 `<main>` 内
- 离开音乐页面时自动显示，进入音乐页面时自动隐藏

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 注意事项

- 音乐搜索功能依赖网易云音乐 API，使用时请遵守相关服务条款
- 建议在网络环境良好的情况下使用在线音乐功能