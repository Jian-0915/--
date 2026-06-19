import os
import sys
import sqlite3
import hashlib
import random
import time
import threading
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, g, send_from_directory, send_file, Response, stream_with_context
from werkzeug.security import generate_password_hash, check_password_hash

# ============================================================
# 路径处理（关键！）
# ============================================================
if getattr(sys, 'frozen', False):
    # PyInstaller --onefile 模式：文件在 sys._MEIPASS 临时目录
    # PyInstaller --onedir 模式：文件在 sys.executable 旁的 _internal 目录
    _meipass = getattr(sys, '_MEIPASS', None)
    if _meipass and os.path.exists(os.path.join(_meipass, 'templates')):
        BASE_DIR = _meipass
    else:
        EXE_DIR = os.path.dirname(sys.executable)
        INTERNAL_DIR = os.path.join(EXE_DIR, '_internal')
        if os.path.exists(os.path.join(INTERNAL_DIR, 'templates')):
            BASE_DIR = INTERNAL_DIR
        else:
            BASE_DIR = EXE_DIR
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))
app.secret_key = os.urandom(24).hex()
DB_PATH = os.path.join(BASE_DIR, 'account_manager.db')


# ============================================================
# 数据库辅助
# ============================================================
def get_db():
    """获取数据库连接，使用 g 对象确保每个请求复用连接"""
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    """请求结束时关闭数据库连接"""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """初始化数据库：创建表和默认管理员"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 用户表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT DEFAULT '',
            role TEXT DEFAULT 'user',
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            approved_by INTEGER,
            avatar_color TEXT DEFAULT '#4A90D9'
        )
    ''')

    # 注册审批表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT DEFAULT '',
            message TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            status TEXT DEFAULT 'pending'
        )
    ''')

    # 操作日志表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            detail TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    ''')

    # 用户图片偏好表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_image_prefs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            categories TEXT DEFAULT 'landscape',
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    ''')

    # 音乐收藏表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_music_favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            song_id TEXT NOT NULL,
            song_name TEXT NOT NULL,
            artist TEXT DEFAULT '',
            album TEXT DEFAULT '',
            cover_url TEXT DEFAULT '',
            duration INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            UNIQUE(user_id, song_id)
        )
    ''')

    # 播放历史表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS music_play_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            song_id TEXT NOT NULL,
            song_name TEXT NOT NULL,
            artist TEXT DEFAULT '',
            played_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    ''')

    # 用户歌单表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            cover_url TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    ''')

    # 歌单歌曲关联表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS playlist_songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            song_id TEXT NOT NULL,
            song_name TEXT NOT NULL,
            artist TEXT DEFAULT '',
            album TEXT DEFAULT '',
            cover_url TEXT DEFAULT '',
            duration INTEGER DEFAULT 0,
            position INTEGER DEFAULT 0,
            added_at TEXT DEFAULT (datetime('now', 'localtime')),
            UNIQUE(playlist_id, song_id)
        )
    ''')

    # 创建默认管理员（仅当不存在时）
    cursor.execute("SELECT id FROM users WHERE username = 'admin'")
    if cursor.fetchone() is None:
        cursor.execute(
            "INSERT INTO users (username, password, email, role, status, avatar_color) VALUES (?, ?, ?, ?, ?, ?)",
            ('admin', generate_password_hash('admin123'), 'admin@localhost', 'admin', 'active', '#E74C3C')
        )

    conn.commit()
    conn.close()


def add_log(user_id, action, detail=''):
    """添加操作日志"""
    db = get_db()
    db.execute("INSERT INTO logs (user_id, action, detail) VALUES (?, ?, ?)",
               (user_id, action, detail))
    db.commit()


# ============================================================
# 装饰器：登录验证 / 管理员验证
# ============================================================
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        db = get_db()
        user = db.execute("SELECT role FROM users WHERE id = ?", (session['user_id'],)).fetchone()
        if not user or user['role'] != 'admin':
            return redirect(url_for('dashboard'))
        return f(*args, **kwargs)
    return decorated_function


# ============================================================
# 路由
# ============================================================
@app.route('/')
def index():
    """首页：根据登录状态重定向"""
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    """登录页面和处理"""
    if request.method == 'GET':
        if 'user_id' in session:
            return redirect(url_for('dashboard'))
        return render_template('login.html')

    # POST - 支持 JSON 和 form-data
    if request.is_json:
        data = request.get_json(silent=True) or {}
    else:
        data = request.form

    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'success': False, 'message': '用户名和密码不能为空'})

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()

    if not user or not check_password_hash(user['password'], password):
        return jsonify({'success': False, 'message': '用户名或密码错误'})

    if user['status'] != 'active':
        return jsonify({'success': False, 'message': '账户已被禁用，请联系管理员'})

    session['user_id'] = user['id']
    session['username'] = user['username']
    session['role'] = user['role']

    add_log(user['id'], '登录', f'用户 {username} 登录系统')

    return jsonify({'success': True, 'message': '登录成功', 'redirect': url_for('dashboard')})


@app.route('/logout')
def logout():
    """退出登录"""
    if 'user_id' in session:
        add_log(session['user_id'], '退出', f'用户 {session["username"]} 退出系统')
    session.clear()
    return redirect(url_for('login'))


@app.route('/register', methods=['GET', 'POST'])
def register():
    """注册页面和处理（提交审批）"""
    if request.method == 'GET':
        if 'user_id' in session:
            return redirect(url_for('dashboard'))
        return render_template('register.html')

    # POST - 支持 JSON 和 form-data
    if request.is_json:
        data = request.get_json(silent=True) or {}
    else:
        data = request.form

    username = data.get('username', '').strip()
    password = data.get('password', '')
    email = data.get('email', '').strip()
    message = data.get('message', '').strip()

    if not username or not password:
        return jsonify({'success': False, 'message': '用户名和密码不能为空'})

    if len(username) < 3 or len(username) > 20:
        return jsonify({'success': False, 'message': '用户名长度需在3-20个字符之间'})

    if len(password) < 6:
        return jsonify({'success': False, 'message': '密码长度不能少于6个字符'})

    db = get_db()

    # 检查用户名是否已存在（用户表和注册表都要检查）
    existing_user = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing_user:
        return jsonify({'success': False, 'message': '用户名已存在'})

    existing_reg = db.execute("SELECT id FROM registrations WHERE username = ? AND status = 'pending'",
                              (username,)).fetchone()
    if existing_reg:
        return jsonify({'success': False, 'message': '该用户名正在审批中，请耐心等待'})

    # 插入注册审批记录
    hashed_password = generate_password_hash(password)
    db.execute(
        "INSERT INTO registrations (username, password, email, message) VALUES (?, ?, ?, ?)",
        (username, hashed_password, email, message)
    )
    db.commit()

    return jsonify({'success': True, 'message': '注册申请已提交，请等待管理员审批'})


@app.route('/dashboard')
@login_required
def dashboard():
    """用户主页：显示个人信息、修改密码、操作日志"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()

    if not user:
        session.clear()
        return redirect(url_for('login'))

    # 获取最近操作日志
    logs = db.execute(
        "SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
        (session['user_id'],)
    ).fetchall()

    return render_template('dashboard.html', user=user, logs=logs)


@app.route('/profile')
@login_required
def profile():
    """个人信息页面"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()
    logs = db.execute(
        "SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
        (session['user_id'],)
    ).fetchall()
    return render_template('profile.html', user=user, logs=logs)


@app.route('/entertainment')
@login_required
def entertainment():
    """娱乐板块主页"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()
    return render_template('entertainment.html', user=user)


# ============================================================
# 音乐播放器
# ============================================================

# 模拟音乐数据库 - 热门歌曲
MOCK_SONGS = [
    {"id": "1", "name": "晴天", "artist": "周杰伦", "album": "叶惠美", "duration": 269, "cover": "https://picsum.photos/seed/music1/300/300"},
    {"id": "2", "name": "稻香", "artist": "周杰伦", "album": "魔杰座", "duration": 223, "cover": "https://picsum.photos/seed/music2/300/300"},
    {"id": "3", "name": "夜曲", "artist": "周杰伦", "album": "十一月的萧邦", "duration": 226, "cover": "https://picsum.photos/seed/music3/300/300"},
    {"id": "4", "name": "告白气球", "artist": "周杰伦", "album": "周杰伦的床边故事", "duration": 215, "cover": "https://picsum.photos/seed/music4/300/300"},
    {"id": "5", "name": "演员", "artist": "薛之谦", "album": "初学者", "duration": 261, "cover": "https://picsum.photos/seed/music5/300/300"},
    {"id": "6", "name": "认真的雪", "artist": "薛之谦", "album": "薛之谦", "duration": 261, "cover": "https://picsum.photos/seed/music6/300/300"},
    {"id": "7", "name": "体面", "artist": "于文文", "album": "前任3：再见前任", "duration": 282, "cover": "https://picsum.photos/seed/music7/300/300"},
    {"id": "8", "name": "说散就散", "artist": "袁娅维", "album": "前任3：再见前任", "duration": 243, "cover": "https://picsum.photos/seed/music8/300/300"},
    {"id": "9", "name": "光年之外", "artist": "G.E.M.邓紫棋", "album": "Passengers", "duration": 235, "cover": "https://picsum.photos/seed/music9/300/300"},
    {"id": "10", "name": "泡沫", "artist": "G.E.M.邓紫棋", "album": "Xposed", "duration": 258, "cover": "https://picsum.photos/seed/music10/300/300"},
    {"id": "11", "name": "成都", "artist": "赵雷", "album": "无法长大", "duration": 335, "cover": "https://picsum.photos/seed/music11/300/300"},
    {"id": "12", "name": "理想", "artist": "赵雷", "album": "无法长大", "duration": 316, "cover": "https://picsum.photos/seed/music12/300/300"},
    {"id": "13", "name": "平凡之路", "artist": "朴树", "album": "猎户星座", "duration": 302, "cover": "https://picsum.photos/seed/music13/300/300"},
    {"id": "14", "name": "生如夏花", "artist": "朴树", "album": "生如夏花", "duration": 270, "cover": "https://picsum.photos/seed/music14/300/300"},
    {"id": "15", "name": "后来", "artist": "刘若英", "album": "我等你", "duration": 341, "cover": "https://picsum.photos/seed/music15/300/300"},
    {"id": "16", "name": "小幸运", "artist": "田馥甄", "album": "我的少女时代", "duration": 262, "cover": "https://picsum.photos/seed/music16/300/300"},
    {"id": "17", "name": "岁月神偷", "artist": "金玟岐", "album": "完美世界", "duration": 258, "cover": "https://picsum.photos/seed/music17/300/300"},
    {"id": "18", "name": "起风了", "artist": "买辣椒也用券", "album": "起风了", "duration": 310, "cover": "https://picsum.photos/seed/music18/300/300"},
    {"id": "19", "name": "南山南", "artist": "马頔", "album": "孤岛", "duration": 294, "cover": "https://picsum.photos/seed/music19/300/300"},
    {"id": "20", "name": "斑马斑马", "artist": "宋冬野", "album": "安和桥北", "duration": 273, "cover": "https://picsum.photos/seed/music20/300/300"},
]


@app.route('/music')
@login_required
def music_player():
    """音乐播放器页面"""
    return render_template('music_player.html')


@app.route('/music/api/audio/<song_id>')
@login_required
def music_api_audio(song_id):
    """动态生成音频并返回WAV流"""
    import wave
    import struct
    import math

    sample_rate = 44100
    # 每首歌生成10秒音频片段
    duration = 10

    # 根据song_id生成不同的旋律参数
    seed = int(song_id) if song_id.isdigit() else hash(song_id)
    rng = random.Random(seed)

    # 生成旋律：使用五声音阶的频率
    pentatonic = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00]
    note_duration = 0.4  # 每个音符0.4秒

    samples = []
    total_samples = int(sample_rate * duration)
    t = 0

    while t < total_samples:
        # 随机选择音符
        freq = rng.choice(pentatonic)
        # 添加一些变化
        freq *= rng.choice([0.5, 1.0, 1.0, 2.0])

        note_samples = int(sample_rate * note_duration)
        for i in range(min(note_samples, total_samples - len(samples))):
            ti = i / sample_rate
            # 正弦波 + 轻微泛音
            val = 0.5 * math.sin(2 * math.pi * freq * ti)
            val += 0.15 * math.sin(2 * math.pi * freq * 2 * ti)
            # 包络（淡入淡出）
            envelope = min(1.0, min(i / 200, (note_samples - i) / 200))
            val *= envelope * 0.4  # 音量
            samples.append(val)

        t += note_samples

    # 生成WAV文件到内存
    import io
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for s in samples:
            packed = struct.pack('<h', max(-32767, min(32767, int(s * 32767))))
            wf.writeframes(packed)

    buf.seek(0)
    return send_file(buf, mimetype='audio/wav', as_attachment=False,
                     download_name=f'song_{song_id}.wav')


@app.route('/music/api/songs')
@login_required
def music_api_songs():
    """获取歌曲列表API"""
    keyword = request.args.get('keyword', '').lower()
    if keyword:
        songs = [s for s in MOCK_SONGS if keyword in s['name'].lower() or keyword in s['artist'].lower()]
    else:
        songs = MOCK_SONGS
    return jsonify({'success': True, 'songs': songs})


# ============================================================
# 网易云音乐 API 代理（解决CORS问题）
# ============================================================
import requests as http_requests

NETEASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://music.163.com',
    'Cookie': 'MUSIC_U=00'
}


def _get_netease_session():
    """创建带默认请求头的会话，供网易云相关接口复用。"""
    sess = http_requests.Session()
    sess.headers.update(NETEASE_HEADERS)
    return sess


@app.route('/music/api/search')
@login_required
def music_api_search():
    """搜索网易云音乐"""
    keyword = request.args.get('q', '').strip()
    if not keyword:
        return jsonify({'success': False, 'msg': '请输入搜索关键词'})

    try:
        resp = http_requests.post(
            'https://music.163.com/api/search/get/web',
            data={'s': keyword, 'type': 1, 'offset': 0, 'limit': 30},
            headers=NETEASE_HEADERS,
            timeout=10
        )
        data = resp.json()
        songs = []
        if data.get('code') == 200 and 'result' in data:
            for item in data['result'].get('songs', []):
                artists = ' / '.join(a['name'] for a in item.get('artists', []))
                album = item.get('album', {}).get('name', '')
                songs.append({
                    'id': str(item['id']),
                    'name': item['name'],
                    'artist': artists,
                    'album': album,
                    'duration': item.get('duration', 0) // 1000,
                    'cover': item.get('album', {}).get('picUrl', '')
                })
        return jsonify({'success': True, 'songs': songs})
    except Exception as e:
        return jsonify({'success': False, 'msg': f'搜索失败: {str(e)}'})


@app.route('/music/api/song_url/<song_id>')
@login_required
def music_api_song_url(song_id):
    """获取歌曲播放URL"""
    try:
        # 使用网易云外链接口获取播放地址
        resp = http_requests.get(
            f'https://music.163.com/song/media/outer/url?id={song_id}',
            headers=NETEASE_HEADERS,
            allow_redirects=False,
            timeout=10
        )
        # 外链接口会302重定向到实际音频地址
        if resp.status_code == 302:
            url = resp.headers.get('Location', '')
            return jsonify({'success': True, 'url': url})
        elif resp.status_code == 200:
            return jsonify({'success': True, 'url': f'https://music.163.com/song/media/outer/url?id={song_id}.mp3'})
        else:
            return jsonify({'success': False, 'msg': f'获取播放地址失败 (HTTP {resp.status_code})'})
    except Exception as e:
        return jsonify({'success': False, 'msg': f'获取播放地址失败: {str(e)}'})


@app.route('/music/api/favorites', methods=['GET', 'POST', 'DELETE'])
@login_required
def music_api_favorites():
    """收藏管理API"""
    db = get_db()
    user_id = session['user_id']

    if request.method == 'GET':
        favorites = db.execute(
            "SELECT * FROM user_music_favorites WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        return jsonify({'success': True, 'favorites': [dict(f) for f in favorites]})

    elif request.method == 'POST':
        data = request.get_json()
        try:
            db.execute('''
                INSERT OR REPLACE INTO user_music_favorites
                (user_id, song_id, song_name, artist, album, cover_url, duration)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (user_id, data['song_id'], data['song_name'], data.get('artist', ''),
                  data.get('album', ''), data.get('cover_url', ''), data.get('duration', 0)))
            db.commit()
            return jsonify({'success': True, 'message': '已添加到收藏'})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)})

    elif request.method == 'DELETE':
        song_id = request.args.get('song_id')
        db.execute("DELETE FROM user_music_favorites WHERE user_id = ? AND song_id = ?",
                   (user_id, song_id))
        db.commit()
        return jsonify({'success': True, 'message': '已取消收藏'})


@app.route('/music/api/history', methods=['GET', 'POST'])
@login_required
def music_api_history():
    """播放历史API"""
    db = get_db()
    user_id = session['user_id']

    if request.method == 'GET':
        history = db.execute(
            "SELECT * FROM music_play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 50",
            (user_id,)
        ).fetchall()
        return jsonify({'success': True, 'history': [dict(h) for h in history]})

    elif request.method == 'POST':
        data = request.get_json()
        db.execute('''
            INSERT INTO music_play_history (user_id, song_id, song_name, artist)
            VALUES (?, ?, ?, ?)
        ''', (user_id, data['song_id'], data['song_name'], data.get('artist', '')))
        db.commit()
        return jsonify({'success': True})


# ---------- 排行榜 ----------
@app.route('/music/api/ranking')
@login_required
def music_api_ranking():
    """获取网易云音乐排行榜"""
    rank_type = request.args.get('type', 'hot')
    rank_map = {
        'hot': '19723756',       # 飙升榜
        'new': '3778678',        # 新歌榜
        'pop': '991319590',      # 热歌榜
        'classic': '71384707',   # 经典500
        'electronic': '10596661', # 电子榜
        'uk': '745956610',       # UK榜
    }
    list_id = rank_map.get(rank_type, '19723756')
    try:
        resp = http_requests.get(
            'https://music.163.com/api/playlist/detail',
            params={'id': list_id, 'limit': 50},
            headers=NETEASE_HEADERS,
            timeout=10
        )
        data = resp.json()
        songs = []
        if data.get('code') == 200 and 'result' in data:
            for item in data['result'].get('tracks', []):
                artists = ' / '.join(a['name'] for a in item.get('artists', []))
                album = item.get('album', {}).get('name', '')
                songs.append({
                    'id': str(item['id']),
                    'name': item['name'],
                    'artist': artists,
                    'album': album,
                    'duration': item.get('duration', 0) // 1000,
                    'cover': item.get('album', {}).get('picUrl', '')
                })
        return jsonify({'success': True, 'songs': songs})
    except Exception as e:
        return jsonify({'success': False, 'msg': f'获取排行榜失败: {str(e)}'})


# ---------- 歌词 ----------
@app.route('/music/api/lyric')
@login_required
def music_api_lyric():
    """获取歌词"""
    song_id = request.args.get('id', '')
    if not song_id:
        return jsonify({'success': False, 'msg': '缺少歌曲ID'})
    try:
        resp = http_requests.get(
            'https://music.163.com/api/song/lyric',
            params={'id': song_id, 'lv': '1', 'tv': '-1'},
            headers=NETEASE_HEADERS,
            timeout=10
        )
        data = resp.json()
        return jsonify(data)
    except Exception as e:
        return jsonify({'success': False, 'msg': f'获取歌词失败: {str(e)}'})


# ---------- 歌单管理 ----------
@app.route('/music/api/playlists', methods=['GET', 'POST'])
@login_required
def music_api_playlists():
    """歌单管理"""
    db = get_db()
    user_id = session['user_id']

    if request.method == 'GET':
        playlists = db.execute(
            "SELECT * FROM user_playlists WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,)
        ).fetchall()
        result = []
        for p in playlists:
            pd = dict(p)
            count = db.execute(
                "SELECT COUNT(*) as cnt FROM playlist_songs WHERE playlist_id = ?", (pd['id'],)
            ).fetchone()['cnt']
            pd['song_count'] = count
            result.append(pd)
        return jsonify({'success': True, 'playlists': result})

    elif request.method == 'POST':
        data = request.get_json()
        try:
            db.execute('''
                INSERT INTO user_playlists (user_id, name, description, cover_url)
                VALUES (?, ?, ?, ?)
            ''', (user_id, data.get('name', '未命名歌单'), data.get('description', ''),
                  data.get('cover_url', '')))
            db.commit()
            return jsonify({'success': True, 'message': '歌单创建成功'})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)})


@app.route('/music/api/playlists/<int:playlist_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def music_api_playlist_detail(playlist_id):
    """歌单详情"""
    db = get_db()
    user_id = session['user_id']

    if request.method == 'GET':
        playlist = db.execute(
            "SELECT * FROM user_playlists WHERE id = ? AND user_id = ?",
            (playlist_id, user_id)
        ).fetchone()
        if not playlist:
            return jsonify({'success': False, 'msg': '歌单不存在'})
        songs = db.execute(
            "SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY position ASC, added_at ASC",
            (playlist_id,)
        ).fetchall()
        return jsonify({'success': True, 'playlist': dict(playlist), 'songs': [dict(s) for s in songs]})

    elif request.method == 'PUT':
        data = request.get_json()
        db.execute("UPDATE user_playlists SET name=?, description=? WHERE id=? AND user_id=?",
                   (data.get('name'), data.get('description'), playlist_id, user_id))
        db.commit()
        return jsonify({'success': True, 'message': '歌单已更新'})

    elif request.method == 'DELETE':
        db.execute("DELETE FROM playlist_songs WHERE playlist_id = ?", (playlist_id,))
        db.execute("DELETE FROM user_playlists WHERE id = ? AND user_id = ?", (playlist_id, user_id))
        db.commit()
        return jsonify({'success': True, 'message': '歌单已删除'})


@app.route('/music/api/playlists/<int:playlist_id>/songs', methods=['POST', 'DELETE'])
@login_required
def music_api_playlist_songs(playlist_id):
    """歌单歌曲管理"""
    db = get_db()
    user_id = session['user_id']

    playlist = db.execute(
        "SELECT id FROM user_playlists WHERE id = ? AND user_id = ?",
        (playlist_id, user_id)
    ).fetchone()
    if not playlist:
        return jsonify({'success': False, 'msg': '歌单不存在'})

    if request.method == 'POST':
        data = request.get_json()
        try:
            max_pos = db.execute(
                "SELECT MAX(position) as mp FROM playlist_songs WHERE playlist_id = ?",
                (playlist_id,)
            ).fetchone()['mp'] or 0
            db.execute('''
                INSERT OR REPLACE INTO playlist_songs
                (playlist_id, song_id, song_name, artist, album, cover_url, duration, position)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (playlist_id, data['song_id'], data['song_name'], data.get('artist', ''),
                  data.get('album', ''), data.get('cover_url', ''), data.get('duration', 0), max_pos + 1))
            db.execute("UPDATE user_playlists SET updated_at = datetime('now', 'localtime') WHERE id = ?", (playlist_id,))
            db.commit()
            return jsonify({'success': True, 'message': '已添加到歌单'})
        except Exception as e:
            return jsonify({'success': False, 'message': str(e)})

    elif request.method == 'DELETE':
        song_id = request.args.get('song_id')
        db.execute("DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?",
                   (playlist_id, song_id))
        db.execute("UPDATE user_playlists SET updated_at = datetime('now', 'localtime') WHERE id = ?", (playlist_id,))
        db.commit()
        return jsonify({'success': True, 'message': '已从歌单移除'})


# ---------- 音频代理 ----------
@app.route('/music/api/audio_proxy/<song_id>')
@login_required
def music_api_audio_proxy(song_id):
    """音频流代理，解决跨域问题"""
    try:
        sess = _get_netease_session()
        resp = sess.get(
            f'https://music.163.com/song/media/outer/url?id={song_id}.mp3',
            timeout=15,
            allow_redirects=True,
            stream=True
        )
        resp.raise_for_status()

        def generate():
            for chunk in resp.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk

        return Response(
            stream_with_context(generate()),
            mimetype=resp.headers.get('Content-Type', 'audio/mpeg'),
            headers={'Accept-Ranges': 'bytes'}
        )
    except Exception as e:
        return f'Error: {str(e)}', 500


@app.route('/admin')
@admin_required
def admin():
    """管理员面板：统计、审批列表、用户管理表格、系统日志"""
    db = get_db()

    # 统计数据
    total_users = db.execute("SELECT COUNT(*) as count FROM users").fetchone()['count']
    active_users = db.execute("SELECT COUNT(*) as count FROM users WHERE status = 'active'").fetchone()['count']
    pending_regs = db.execute("SELECT COUNT(*) as count FROM registrations WHERE status = 'pending'").fetchone()['count']
    total_logs = db.execute("SELECT COUNT(*) as count FROM logs").fetchone()['count']

    # 待审批列表
    registrations = db.execute(
        "SELECT * FROM registrations WHERE status = 'pending' ORDER BY created_at DESC"
    ).fetchall()

    # 用户管理表格
    users = db.execute(
        "SELECT * FROM users ORDER BY created_at DESC"
    ).fetchall()

    # 系统日志（最近50条）
    logs = db.execute(
        "SELECT l.*, u.username FROM logs l LEFT JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT 50"
    ).fetchall()

    return render_template('admin.html',
                           total_users=total_users,
                           active_users=active_users,
                           pending_regs=pending_regs,
                           pending_count=pending_regs,
                           total_logs=total_logs,
                           registrations=registrations,
                           users=users,
                           logs=logs)


@app.route('/admin/approve/<int:reg_id>', methods=['POST'])
@admin_required
def approve_registration(reg_id):
    """审批注册申请（approve/reject）"""
    db = get_db()
    data = request.get_json(silent=True) or {}
    action = data.get('action', '')  # 'approve' 或 'reject'

    reg = db.execute("SELECT * FROM registrations WHERE id = ?", (reg_id,)).fetchone()
    if not reg:
        return jsonify({'success': False, 'message': '注册记录不存在'})

    if reg['status'] != 'pending':
        return jsonify({'success': False, 'message': '该申请已被处理'})

    if action == 'approve':
        # 检查用户名是否已存在
        existing = db.execute("SELECT id FROM users WHERE username = ?", (reg['username'],)).fetchone()
        if existing:
            db.execute("UPDATE registrations SET status = 'rejected' WHERE id = ?", (reg_id,))
            db.commit()
            return jsonify({'success': False, 'message': '用户名已存在，无法通过审批'})

        # 创建用户
        db.execute(
            "INSERT INTO users (username, password, email, role, status, approved_by) VALUES (?, ?, ?, 'user', 'active', ?)",
            (reg['username'], reg['password'], reg['email'], session['user_id'])
        )
        db.execute("UPDATE registrations SET status = 'approved' WHERE id = ?", (reg_id,))
        db.commit()

        new_user = db.execute("SELECT id FROM users WHERE username = ?", (reg['username'],)).fetchone()
        add_log(session['user_id'], '审批通过', f'批准用户 {reg["username"]} 的注册申请')
        if new_user:
            add_log(new_user['id'], '账户创建', f'账户由管理员审批创建')

        return jsonify({'success': True, 'message': f'已批准用户 {reg["username"]} 的注册申请'})

    elif action == 'reject':
        db.execute("UPDATE registrations SET status = 'rejected' WHERE id = ?", (reg_id,))
        db.commit()
        add_log(session['user_id'], '审批拒绝', f'拒绝用户 {reg["username"]} 的注册申请')
        return jsonify({'success': True, 'message': f'已拒绝用户 {reg["username"]} 的注册申请'})

    else:
        return jsonify({'success': False, 'message': '无效的操作类型'})


@app.route('/admin/user/<int:user_id>/toggle', methods=['POST'])
@admin_required
def toggle_user(user_id):
    """启用/禁用用户"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'})

    if user['role'] == 'admin':
        return jsonify({'success': False, 'message': '不能禁用管理员账户'})

    new_status = 'disabled' if user['status'] == 'active' else 'active'
    db.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, user_id))
    db.commit()

    action_text = '禁用' if new_status == 'disabled' else '启用'
    add_log(session['user_id'], f'用户{action_text}', f'{action_text}了用户 {user["username"]}')
    add_log(user_id, '账户状态变更', f'账户被{action_text}')

    return jsonify({'success': True, 'message': f'已{action_text}用户 {user["username"]}'})


@app.route('/admin/user/<int:user_id>/delete', methods=['POST'])
@admin_required
def delete_user(user_id):
    """删除用户"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'})

    if user['role'] == 'admin':
        return jsonify({'success': False, 'message': '不能删除管理员账户'})

    if user_id == session['user_id']:
        return jsonify({'success': False, 'message': '不能删除自己的账户'})

    username = user['username']
    db.execute("DELETE FROM logs WHERE user_id = ?", (user_id,))
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()

    add_log(session['user_id'], '删除用户', f'删除了用户 {username}')

    return jsonify({'success': True, 'message': f'已删除用户 {username}'})


@app.route('/admin/user/<int:user_id>/reset_password', methods=['POST'])
@admin_required
def reset_password(user_id):
    """重置用户密码为默认密码 123456"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'})

    new_password = '123456'
    hashed = generate_password_hash(new_password)
    db.execute("UPDATE users SET password = ? WHERE id = ?", (hashed, user_id))
    db.commit()

    add_log(session['user_id'], '重置密码', f'重置了用户 {user["username"]} 的密码')
    add_log(user_id, '密码重置', f'密码被管理员重置')

    return jsonify({'success': True, 'message': f'已将用户 {user["username"]} 的密码重置为 123456'})


@app.route('/change_password', methods=['POST'])
@login_required
def change_password():
    """修改自己的密码"""
    data = request.get_json(silent=True) or {}
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')
    confirm_password = data.get('confirm_password', '')

    if not old_password or not new_password or not confirm_password:
        return jsonify({'success': False, 'message': '所有字段都必须填写'})

    if len(new_password) < 6:
        return jsonify({'success': False, 'message': '新密码长度不能少于6个字符'})

    if new_password != confirm_password:
        return jsonify({'success': False, 'message': '两次输入的新密码不一致'})

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()

    if not check_password_hash(user['password'], old_password):
        return jsonify({'success': False, 'message': '原密码错误'})

    hashed = generate_password_hash(new_password)
    db.execute("UPDATE users SET password = ? WHERE id = ?", (hashed, session['user_id']))
    db.commit()

    add_log(session['user_id'], '修改密码', '用户修改了自己的密码')

    return jsonify({'success': True, 'message': '密码修改成功'})


# ============================================================
# 图片画廊功能
# ============================================================
@app.route('/gallery')
@login_required
def gallery():
    """图片画廊主页"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()

    # 检查用户是否已设置偏好
    pref = db.execute("SELECT * FROM user_image_prefs WHERE user_id = ?", (session['user_id'],)).fetchone()

    if not pref:
        # 首次使用，跳转到偏好设置页面
        return redirect(url_for('gallery_prefs'))

    return render_template('gallery.html', user=user, categories=IMAGE_CATEGORIES)


@app.route('/gallery/prefs', methods=['GET', 'POST'])
@login_required
def gallery_prefs():
    """图片偏好设置页面"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()

    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        categories = data.get('categories', ['landscape'])
        if isinstance(categories, str):
            categories = [categories]

        categories_str = ','.join(categories)

        # 保存或更新偏好
        existing = db.execute("SELECT id FROM user_image_prefs WHERE user_id = ?",
                              (session['user_id'],)).fetchone()
        if existing:
            db.execute("UPDATE user_image_prefs SET categories = ? WHERE user_id = ?",
                       (categories_str, session['user_id']))
        else:
            db.execute("INSERT INTO user_image_prefs (user_id, categories) VALUES (?, ?)",
                       (session['user_id'], categories_str))
        db.commit()

        add_log(session['user_id'], '设置图片偏好', f'设置了图片偏好: {categories_str}')
        return jsonify({'success': True, 'message': '偏好设置已保存'})

    return render_template('gallery_prefs.html', user=user, categories=IMAGE_CATEGORIES)


# ============================================================
# 图片画廊功能
# ============================================================

IMAGE_CATEGORIES = {
    'landscape': '风景',
    'nature': '自然',
    'architecture': '建筑',
    'people': '人文',
    'animals': '动物',
    'food': '美食',
    'travel': '旅行',
    'technology': '科技'
}

# 每个分类对应的中文搜索关键词
CATEGORY_KEYWORDS = {
    'landscape': ['风景 山水', '自然风光', '日落 海景', '雪山 湖泊'],
    'nature': ['花草 自然', '森林 绿植', '秋叶 落叶', '春天 花开'],
    'architecture': ['建筑 城市', '古建筑 寺庙', '现代建筑 摩天楼', '桥梁 设计'],
    'people': ['人文 街拍', '人物 肖像', '传统 民俗', '城市 生活'],
    'animals': ['可爱 猫咪', '动物 狗', '野生动物', '鸟类 花鸟'],
    'food': ['美食 菜品', '甜点 蛋糕', '水果 餐饮', '中餐 美食'],
    'travel': ['旅游 景点', '海滩 度假', '古镇 旅行', '城市 夜景'],
    'technology': ['科技 电脑', '数码 产品', '机器人 AI', '代码 编程']
}


def _get_local_images(category):
    """递归获取某分类下所有本地图片的相对路径"""
    cat_dir = os.path.join(BASE_DIR, 'static', 'gallery_images', category)
    images = []
    if not os.path.exists(cat_dir):
        return images
    for root, dirs, files in os.walk(cat_dir):
        for f in files:
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                full_path = os.path.join(root, f)
                if os.path.getsize(full_path) > 5000:
                    rel_path = os.path.relpath(full_path, os.path.join(BASE_DIR, 'static'))
                    images.append(rel_path.replace('\\', '/'))
    return images


def _clear_category_cache(category):
    """清空某分类的本地缓存图片"""
    cat_dir = os.path.join(BASE_DIR, 'static', 'gallery_images', category)
    if not os.path.exists(cat_dir):
        return
    for root, dirs, files in os.walk(cat_dir):
        for f in files:
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                try:
                    os.remove(os.path.join(root, f))
                except:
                    pass


def _crawl_keyword_task(category, keyword, keyword_dir, max_num=12):
    """单个关键词的爬取任务（在线程中运行）"""
    from icrawler.builtin import BingImageCrawler
    os.makedirs(keyword_dir, exist_ok=True)

    try:
        crawler = BingImageCrawler(
            storage={'root_dir': keyword_dir},
            parser_threads=2,
            downloader_threads=4,
        )
        crawler.crawl(keyword=keyword, max_num=max_num)
    except Exception:
        pass


def _crawl_images_for_category_async(category, keywords, max_num=12):
    """后台异步爬取某分类的所有关键词图片，每个关键词独立线程"""
    save_dir = os.path.join(BASE_DIR, 'static', 'gallery_images', category)
    os.makedirs(save_dir, exist_ok=True)

    threads = []
    for keyword in keywords:
        keyword_dir = os.path.join(save_dir, keyword.replace(' ', '_'))
        t = threading.Thread(
            target=_crawl_keyword_task,
            args=(category, keyword, keyword_dir, max_num),
            daemon=True
        )
        t.start()
        threads.append(t)

    return threads


def _generate_picsum_images(categories, count_per_cat=12):
    """生成 picsum 占位图片 URL（首次访问快速显示）"""
    images = []
    for cat in categories:
        for i in range(count_per_cat):
            seed = f"{cat}_{i}_{random.randint(1000, 9999)}"
            width = random.choice([400, 600, 800])
            height = random.choice([300, 400, 500, 600])
            images.append({
                'id': f"img_{len(images)}",
                'url': f"https://picsum.photos/seed/{seed}/{width}/{height}",
                'category': cat,
                'title': f"{IMAGE_CATEGORIES.get(cat, '风景')} #{i+1}",
                'source': 'picsum'
            })
    random.shuffle(images)
    return images


# 记录正在爬取的分类，避免重复爬取
_crawling_locks = threading.Lock()
_crawling_categories = set()


@app.route('/gallery/api/images')
@login_required
def gallery_api_images():
    """
    获取图片列表API
    策略：
    1. 本地有 icrawler 缓存 → 直接返回本地图片
    2. 本地没有缓存 → 返回 picsum 占位图 + 后台启动 icrawler 爬取
    """
    db = get_db()
    pref = db.execute("SELECT * FROM user_image_prefs WHERE user_id = ?",
                      (session['user_id'],)).fetchone()

    if not pref:
        return jsonify({'success': False, 'message': '未设置图片偏好'})

    categories = pref['categories'].split(',') if pref['categories'] else ['landscape']

    # 检查每个分类是否有足够的本地图片（阈值：每个分类至少4张）
    has_local = True
    for cat in categories:
        local_count = len(_get_local_images(cat))
        if local_count < 4:
            has_local = False
            break

    if has_local:
        # 本地有缓存，直接返回 icrawler 图片
        images = []
        for cat in categories:
            local_imgs = _get_local_images(cat)
            random.shuffle(local_imgs)
            for img_path in local_imgs[:12]:
                images.append({
                    'id': f"img_{len(images)}",
                    'url': f"/static/{img_path}",
                    'category': cat,
                    'title': f"{IMAGE_CATEGORIES.get(cat, '风景')} #{len(images)+1}",
                    'source': 'local'
                })
        random.shuffle(images)
        return jsonify({'success': True, 'images': images, 'source': 'local'})

    else:
        # 首次/缓存不足：返回 picsum 占位图 + 后台启动 icrawler 爬取
        with _crawling_locks:
            for cat in categories:
                if cat in _crawling_categories:
                    continue
                _crawling_categories.add(cat)
                keywords = CATEGORY_KEYWORDS.get(cat, ['风景'])
                # 启动后台线程爬取，每个关键词独立线程
                threads = _crawl_images_for_category_async(cat, keywords, max_num=12)
                # 启动一个守护线程来清理 _crawling_categories
                def cleanup(cat=cat, threads=threads):
                    for t in threads:
                        t.join(timeout=300)
                    _crawling_categories.discard(cat)
                threading.Thread(target=cleanup, daemon=True).start()

        images = _generate_picsum_images(categories)
        return jsonify({'success': True, 'images': images, 'source': 'picsum'})


@app.route('/gallery/api/refresh', methods=['POST'])
@login_required
def gallery_api_refresh():
    """
    刷新图片API - 清空旧缓存并重新爬取新图片
    返回 picsum 占位图 + 后台启动 icrawler 重新爬取
    """
    db = get_db()
    pref = db.execute("SELECT * FROM user_image_prefs WHERE user_id = ?",
                      (session['user_id'],)).fetchone()

    if not pref:
        return jsonify({'success': False, 'message': '未设置图片偏好'})

    categories = pref['categories'].split(',') if pref['categories'] else ['landscape']

    # 清空旧缓存并重新爬取
    with _crawling_locks:
        for cat in categories:
            if cat in _crawling_categories:
                continue
            _crawling_categories.add(cat)

            # 清空旧缓存
            _clear_category_cache(cat)

            keywords = CATEGORY_KEYWORDS.get(cat, ['风景'])
            # 启动后台线程爬取新图片
            threads = _crawl_images_for_category_async(cat, keywords, max_num=12)

            # 启动一个守护线程来清理
            def cleanup(cat=cat, threads=threads):
                for t in threads:
                    t.join(timeout=300)
                _crawling_categories.discard(cat)
            threading.Thread(target=cleanup, daemon=True).start()

    # 返回 picsum 占位图（立即响应）
    images = _generate_picsum_images(categories)
    return jsonify({'success': True, 'images': images, 'source': 'picsum', 'refreshing': True})


@app.route('/gallery/api/status')
@login_required
def gallery_api_status():
    """
    查询后台爬取状态API
    返回当前正在爬取的分类和本地缓存状态
    """
    db = get_db()
    pref = db.execute("SELECT * FROM user_image_prefs WHERE user_id = ?",
                      (session['user_id'],)).fetchone()

    if not pref:
        return jsonify({'success': False, 'message': '未设置图片偏好'})

    categories = pref['categories'].split(',') if pref['categories'] else ['landscape']

    status = {}
    all_done = True
    for cat in categories:
        is_crawling = cat in _crawling_categories
        local_count = len(_get_local_images(cat))
        has_enough = local_count >= 4
        if is_crawling or not has_enough:
            all_done = False
        status[cat] = {
            'crawling': is_crawling,
            'local_count': local_count,
            'has_enough': has_enough
        }

    return jsonify({
        'success': True,
        'status': status,
        'all_done': all_done,
        'crawling_categories': list(_crawling_categories)
    })


# ============================================================
# 启动
# ============================================================
def run_server():
    """启动 Flask 服务器（在后台线程中运行）"""
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)

if __name__ == '__main__':
    init_db()
    
    # 检查是否是打包后的应用（通过 sys.frozen 判断）
    import sys
    if getattr(sys, 'frozen', False):
        # 打包后的桌面应用：启动 webview 窗口
        import webview
        import threading
        
        # 在后台线程启动 Flask 服务器
        server_thread = threading.Thread(target=run_server, daemon=True)
        server_thread.start()
        
        # 等待服务器启动
        import time
        time.sleep(1)
        
        # 创建 webview 窗口
        webview.create_window(
            '栖云阁 - 个人管理系统',
            'http://127.0.0.1:5000/',
            width=1200,
            height=800,
            resizable=True
        )
        webview.start()
    else:
        # 开发模式：直接启动 Flask 服务器
        app.run(host='127.0.0.1', port=5000, debug=True)
