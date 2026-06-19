/**
 * AJAX 统一导航系统
 * 所有页面统一使用 innerHTML 替换 <main> 内容
 * 音乐播放不中断：floatingPlayer.audio 是 JS 对象，不在 DOM 中
 * 悬浮播放器 UI 挂载在 document.body 上，不受 innerHTML 替换影响
 */
(function() {
    'use strict';

    // 需要跳过的脚本（已加载，不重复执行）
    const SKIP_SCRIPTS = ['floating_player.js', 'ajax_nav.js', 'app.js'];

    // 拦截链接点击
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        // 跳过外部链接
        if (href.startsWith('http://') || href.startsWith('https://')) return;
        // 跳过锚点、JS、邮件
        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
        // 登出链接正常跳转
        if (href.includes('/logout')) return;
        // 下载链接跳过
        if (link.hasAttribute('download')) return;

        // 内部链接：拦截并使用 AJAX 加载
        e.preventDefault();
        navigateTo(href);
    });

    // 主页路径（侧边栏可见）
    const HOME_URLS = ['/', '/dashboard'];

    // 判断是否为主页
    function isHomePage(url) {
        return HOME_URLS.some(h => url === h || url.endsWith(h));
    }

    async function navigateTo(url) {
        try {
            const response = await fetch(url, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin'
            });

            if (response.redirected) {
                window.location.href = response.url;
                return;
            }

            if (!response.ok) throw new Error('HTTP ' + response.status);

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const newMain = doc.querySelector('main.main-content');

            const main = document.querySelector('main.main-content');
            if (main && newMain) {
                main.innerHTML = newMain.innerHTML;
            }

            // 注入页面特有的内联样式
            injectPageStyles(doc, url);

            // 执行脚本
            executeScripts(doc, main);

            // 侧边栏自动隐藏/显示：主页显示，子板块隐藏
            if (isHomePage(url)) {
                document.body.classList.remove('sidebar-hidden');
            } else {
                document.body.classList.add('sidebar-hidden');
            }

            // 更新侧边栏激活状态
            updateSidebarActiveState(url);

            // 触发事件
            window.dispatchEvent(new CustomEvent('pageNavigated', { detail: { url: url } }));

            // 更新 URL
            history.pushState({ url: url }, '', url);

        } catch (error) {
            console.error('导航失败:', error);
            window.location.href = url;
        }
    }

    function executeScripts(doc, container) {
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const src = script.getAttribute('src');
            if (src) {
                const filename = src.split('/').pop();
                if (SKIP_SCRIPTS.includes(filename)) return;
                const newScript = document.createElement('script');
                newScript.src = src;
                container.appendChild(newScript);
            } else {
                const newScript = document.createElement('script');
                newScript.textContent = script.textContent;
                container.appendChild(newScript);
            }
        });
    }

    // 注入页面特有的内联样式
    function injectPageStyles(doc, url) {
        // 移除之前注入的页面样式（避免累积）
        document.querySelectorAll('style[data-page-style]').forEach(el => el.remove());

        const styles = doc.querySelectorAll('head style');
        styles.forEach(style => {
            const newStyle = document.createElement('style');
            newStyle.setAttribute('data-page-style', url);
            newStyle.textContent = style.textContent;
            document.head.appendChild(newStyle);
        });
    }

    function updateSidebarActiveState(url) {
        const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
        navItems.forEach(item => {
            const href = item.getAttribute('href');
            if (href && url.includes(href)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // 处理浏览器前进/后退
    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.url) {
            navigateTo(e.state.url);
        }
    });

    // 暴露导航函数
    window.AjaxNav = { navigateTo: navigateTo };

    // 初始化
    history.replaceState({ url: window.location.pathname }, '', window.location.pathname);
})();
