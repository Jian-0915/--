/**
 * 悬浮播放控制器
 * 创建持久的 audio 对象和悬浮播放器 UI
 * audio 对象是 JS 对象（不在 DOM 中），悬浮播放器 UI 挂载在 body 上
 * 两者都不在 <main> 内，AJAX 导航时不会被销毁，音乐持续播放
 */
class FloatingPlayer {
    constructor() {
        this.audio = null;
        this.currentSong = null;
        this.playlist = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.volume = 0.7;
        this.isMuted = false;
        this.repeatMode = "off";
        this.isShuffle = false;
        this.init();
    }

    init() {
        this.createAudio();
        this.loadState();
        this.createPlayerUI();
        this.setupEventListeners();
        this.updateUI();
        // 如果有保存的歌曲，恢复显示
        if (this.currentSong) {
            this.showPlayer();
        }
        // 监听 AJAX 导航，自动切换悬浮播放器可见性
        this._setupNavObserver();
    }

    _setupNavObserver() {
        // 监听 popstate（浏览器前进/后退）
        window.addEventListener('popstate', () => {
            setTimeout(() => this.refreshVisibility(), 100);
        });
        // 监听自定义导航事件（ajax_nav.js 触发）
        window.addEventListener('pageNavigated', () => {
            setTimeout(() => this.refreshVisibility(), 100);
        });
        // 监听 URL 变化（MutationObserver 监听 pathname）
        let lastPath = window.location.pathname;
        const checkNav = () => {
            if (window.location.pathname !== lastPath) {
                lastPath = window.location.pathname;
                setTimeout(() => this.refreshVisibility(), 100);
            }
            requestAnimationFrame(checkNav);
        };
        requestAnimationFrame(checkNav);
    }

    createAudio() {
        this.audio = new Audio();
        this.audio.volume = this.volume;
        this.audio.addEventListener("timeupdate", () => this.updateProgress());
        this.audio.addEventListener("ended", () => this.handleSongEnd());
        this.audio.addEventListener("loadedmetadata", () => this.updateDuration());
        this.audio.addEventListener("error", (e) => {
            console.error("Audio error:", e);
        });
        this.audio.addEventListener("play", () => {
            this.isPlaying = true;
            this.updatePlayIcon();
            this.showPlayer();
        });
        this.audio.addEventListener("pause", () => {
            this.isPlaying = false;
            this.updatePlayIcon();
        });
    }

    loadState() {
        const savedState = localStorage.getItem("floatingPlayerState");
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                this.currentIndex = state.currentIndex || 0;
                this.volume = state.volume !== undefined ? state.volume : 0.7;
                this.isMuted = state.isMuted || false;
                this.repeatMode = state.repeatMode || "off";
                this.isShuffle = state.isShuffle || false;
                if (state.currentSong) {
                    this.currentSong = state.currentSong;
                }
            } catch (e) {
                console.error("Failed to load player state:", e);
            }
        }
    }

    saveState() {
        const state = {
            currentIndex: this.currentIndex,
            currentSong: this.currentSong,
            volume: this.volume,
            isMuted: this.isMuted,
            repeatMode: this.repeatMode,
            isShuffle: this.isShuffle
        };
        localStorage.setItem("floatingPlayerState", JSON.stringify(state));
    }

    createPlayerUI() {
        // 如果已存在悬浮播放器，不重复创建
        if (document.getElementById('floatingPlayer')) {
            this.elements = {
                player: document.getElementById("floatingPlayer"),
                cover: document.getElementById("playerCover"),
                title: document.getElementById("playerTitle"),
                artist: document.getElementById("playerArtist"),
                progressBar: document.getElementById("progressBar"),
                progressFill: document.getElementById("progressFill"),
                progressTime: document.getElementById("progressTime"),
                shuffleBtn: document.getElementById("shuffleBtn"),
                prevBtn: document.getElementById("prevBtn"),
                playBtn: document.getElementById("playBtn"),
                playIcon: document.getElementById("playIcon"),
                nextBtn: document.getElementById("nextBtn"),
                repeatBtn: document.getElementById("repeatBtn"),
                volumeIcon: document.getElementById("volumeIcon"),
                volumeBar: document.getElementById("volumeBar"),
                volumeFill: document.getElementById("volumeFill"),
                expandBtn: document.getElementById("expandBtn")
            };
            return;
        }

        const playerHTML = `<div class="floating-player hidden" id="floatingPlayer">
                <div class="player-cover" id="playerCover">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    </svg>
                </div>
                <div class="player-info">
                    <div class="player-title" id="playerTitle">未选择歌曲</div>
                    <div class="player-artist" id="playerArtist"></div>
                </div>
                <div class="player-progress">
                    <div class="progress-bar" id="progressBar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <span class="progress-time" id="progressTime">00:00 / 00:00</span>
                </div>
                <div class="player-controls">
                    <button class="player-btn player-shuffle" id="shuffleBtn" title="随机播放">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="16 3 21 3 21 8"/><path d="M4 20h16"/><path d="M21 15h-5.5a3.5 3.5 0 0 0 0 7h2a5.5 5.5 0 0 1 0-11H21"/><polyline points="8 4 3 4 3 9"/><path d="M20 4H8"/><path d="M3 9h5.5a3.5 3.5 0 0 1 0-7h-2a5.5 5.5 0 0 0 0 11H3"/>
                        </svg>
                    </button>
                    <button class="player-btn" id="prevBtn" title="上一首">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="19 20 9 12 19 4 19 20"/><polygon points="5 20 15 12 5 4 5 20"/>
                        </svg>
                    </button>
                    <button class="player-btn play-btn" id="playBtn" title="播放/暂停">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="playIcon">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                    </button>
                    <button class="player-btn" id="nextBtn" title="下一首">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 4 15 12 5 20 5 4"/><polygon points="19 4 9 12 19 20 19 4"/>
                        </svg>
                    </button>
                    <button class="player-btn player-repeat" id="repeatBtn" title="循环模式">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 12 16 12 19 9 12 12 19 15 16 12"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                        </svg>
                    </button>
                </div>
                <div class="player-volume">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="volume-icon" id="volumeIcon">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    </svg>
                    <div class="volume-bar" id="volumeBar">
                        <div class="volume-fill" id="volumeFill"></div>
                    </div>
                </div>
                <button class="player-expand" id="expandBtn" title="展开播放器">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                    </svg>
                </button>
            </div>`;
        // 挂载到 body 上，不在 <main> 内，AJAX 导航时不会被销毁
        document.body.insertAdjacentHTML("beforeend", playerHTML);
        this.elements = {
            player: document.getElementById("floatingPlayer"),
            cover: document.getElementById("playerCover"),
            title: document.getElementById("playerTitle"),
            artist: document.getElementById("playerArtist"),
            progressBar: document.getElementById("progressBar"),
            progressFill: document.getElementById("progressFill"),
            progressTime: document.getElementById("progressTime"),
            shuffleBtn: document.getElementById("shuffleBtn"),
            prevBtn: document.getElementById("prevBtn"),
            playBtn: document.getElementById("playBtn"),
            playIcon: document.getElementById("playIcon"),
            nextBtn: document.getElementById("nextBtn"),
            repeatBtn: document.getElementById("repeatBtn"),
            volumeIcon: document.getElementById("volumeIcon"),
            volumeBar: document.getElementById("volumeBar"),
            volumeFill: document.getElementById("volumeFill"),
            expandBtn: document.getElementById("expandBtn")
        };
    }

    setupEventListeners() {
        this.elements.playBtn.addEventListener("click", () => this.togglePlay());
        this.elements.prevBtn.addEventListener("click", () => this.playPrev());
        this.elements.nextBtn.addEventListener("click", () => this.playNext());
        this.elements.shuffleBtn.addEventListener("click", () => this.toggleShuffle());
        this.elements.repeatBtn.addEventListener("click", () => this.toggleRepeat());
        this.elements.volumeIcon.addEventListener("click", () => this.toggleMute());
        this.elements.progressBar.addEventListener("click", (e) => this.seekTo(e));
        this.elements.volumeBar.addEventListener("click", (e) => this.setVolume(e));
        this.elements.expandBtn.addEventListener("click", () => this.expandPlayer());
        window.addEventListener("beforeunload", () => this.saveState());
    }

    togglePlay() {
        if (!this.currentSong) return;
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (!this.audio.src) return;
        this.audio.play().catch(e => console.error("Play error:", e));
    }

    pause() {
        this.audio.pause();
    }

    playPrev() {
        if (this.playlist.length === 0) return;
        let i = this.isShuffle
            ? Math.floor(Math.random() * this.playlist.length)
            : (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        this.playSong(this.playlist[i], i);
    }

    playNext() {
        if (this.playlist.length === 0) return;
        let i = this.isShuffle
            ? Math.floor(Math.random() * this.playlist.length)
            : (this.currentIndex + 1) % this.playlist.length;
        this.playSong(this.playlist[i], i);
    }

    // 通过悬浮播放器播放歌曲（需要先获取URL）
    async playSong(song, index) {
        this.currentSong = song;
        this.currentIndex = index !== undefined ? index : this.playlist.findIndex(s => s.id === song.id);
        if (this.currentIndex === -1) {
            this.playlist.push(song);
            this.currentIndex = this.playlist.length - 1;
        }

        try {
            const resp = await fetch('/music/api/song_url/' + song.id);
            const data = await resp.json();
            if (data.success) {
                this.audio.src = data.url;
                this.audio.play().catch(e => console.error("Play error:", e));
            }
        } catch (e) {
            console.error("获取播放地址失败:", e);
        }

        this.updateUI();
        this.saveState();

        fetch("/music/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ song_id: song.id, song_name: song.name, artist: song.artist })
        }).catch(() => {});
    }

    handleSongEnd() {
        if (this.repeatMode === "one") {
            this.audio.currentTime = 0;
            this.play();
        } else if (this.repeatMode === "all" || this.currentIndex < this.playlist.length - 1) {
            this.playNext();
        } else {
            this.pause();
        }
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        this.elements.shuffleBtn.classList.toggle("active", this.isShuffle);
        this.saveState();
    }

    toggleRepeat() {
        const modes = ["off", "all", "one"];
        const idx = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(idx + 1) % modes.length];
        this.elements.repeatBtn.classList.remove("active", "one-time");
        if (this.repeatMode !== "off") this.elements.repeatBtn.classList.add("active");
        if (this.repeatMode === "one") this.elements.repeatBtn.classList.add("one-time");
        this.saveState();
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.audio.muted = this.isMuted;
        this.updateVolumeIcon();
        this.saveState();
    }

    setVolume(e) {
        const rect = this.elements.volumeBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.volume = Math.max(0, Math.min(1, percent));
        this.audio.volume = this.volume;
        this.isMuted = false;
        this.audio.muted = false;
        this.updateVolumeUI();
        this.saveState();
    }

    seekTo(e) {
        if (!this.currentSong || !this.audio.duration) return;
        const rect = this.elements.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.audio.currentTime = this.audio.duration * percent;
    }

    updateProgress() {
        if (!this.currentSong || !this.audio.duration) return;
        const percent = this.audio.currentTime / this.audio.duration;
        this.elements.progressFill.style.width = percent * 100 + "%";
        this.elements.progressTime.textContent = this.formatTime(this.audio.currentTime) + " / " + this.formatTime(this.audio.duration);
    }

    updateDuration() {
        if (!this.audio.duration) return;
        this.elements.progressTime.textContent = this.formatTime(this.audio.currentTime) + " / " + this.formatTime(this.audio.duration);
    }

    formatTime(seconds) {
        seconds = Math.floor(seconds || 0);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m.toString().padStart(2, "0") + ":" + s.toString().padStart(2, "0");
    }

    updatePlayIcon() {
        this.elements.playIcon.innerHTML = this.isPlaying
            ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
            : '<polygon points="5 3 19 12 5 21 5 3"/>';
    }

    updateVolumeIcon() {
        if (this.isMuted || this.volume === 0) {
            this.elements.volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="23" y2="15"/>';
        } else if (this.volume < 0.5) {
            this.elements.volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
        } else {
            this.elements.volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
        }
    }

    updateVolumeUI() {
        this.elements.volumeFill.style.width = this.volume * 100 + "%";
        this.updateVolumeIcon();
    }

    updateUI() {
        if (!this.currentSong) {
            this.elements.title.textContent = "未选择歌曲";
            this.elements.artist.textContent = "";
            this.elements.cover.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
            return;
        }
        this.elements.title.textContent = this.currentSong.name;
        this.elements.artist.textContent = this.currentSong.artist;
        if (this.currentSong.cover) {
            this.elements.cover.innerHTML = '<img src="' + this.currentSong.cover + '" alt="" style="width:100%;height:100%;object-fit:cover;">';
        } else {
            this.elements.cover.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
        }
        this.updateVolumeUI();
        this.updatePlayIcon();
        this.updateRepeatUI();
        this.updateShuffleUI();
    }

    updateRepeatUI() {
        this.elements.repeatBtn.classList.remove("active", "one-time");
        if (this.repeatMode !== "off") this.elements.repeatBtn.classList.add("active");
        if (this.repeatMode === "one") this.elements.repeatBtn.classList.add("one-time");
    }

    updateShuffleUI() {
        this.elements.shuffleBtn.classList.toggle("active", this.isShuffle);
    }

    showPlayer() {
        if (!this.currentSong) return;
        // 悬浮播放器始终显示（包括音乐页面），提供一致的播放控制
        this.elements.player.classList.remove("hidden");
    }

    hidePlayer() {
        this.elements.player.classList.add("hidden");
    }

    isOnMusicPage() {
        return window.location.pathname === '/music';
    }

    /** 根据当前页面自动决定显示或隐藏悬浮播放器 */
    refreshVisibility() {
        if (this.isOnMusicPage()) {
            this.hidePlayer();
        } else if (this.currentSong) {
            this.showPlayer();
        }
    }

    expandPlayer() {
        // 通过 AJAX 导航到音乐页面
        if (window.AjaxNav) {
            window.AjaxNav.navigateTo('/music');
        } else {
            window.location.href = "/music";
        }
    }
}

// 初始化：只在第一次加载时创建实例，AJAX 导航时跳过
let floatingPlayer = null;
if (!window.floatingPlayer) {
    document.addEventListener("DOMContentLoaded", () => {
        floatingPlayer = new FloatingPlayer();
        window.floatingPlayer = floatingPlayer;
    });
} else {
    floatingPlayer = window.floatingPlayer;
}
window.FloatingPlayer = FloatingPlayer;