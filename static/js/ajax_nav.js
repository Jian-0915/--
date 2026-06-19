/**
 * AJAX 导航系统
 * 拦截页面内链接点击，通过 AJAX 加载新页面内容
 * 只替换 <aside> 和 <main> 区域，保留 <body> 上的持久元素（audio、悬浮播放器）
 * 从而实现跨页面音乐不中断播放
 */
(function() {
    'use strict';

    // 需要跳过的脚本（已加载，不重复执行）
    const SKIP_SCRIPTS = ['floating_player.js', 'ajax_nav.js'];

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

    // 处理浏览器前进/后退
    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.url) {
            loadPage(e.state.url, false);
        }
    });

    // 导航到指定URL
    function navigateTo(url) {
        loadPage(url, true);
    }

    // 加载页面
    async function loadPage(url, pushState) {
        try {
            // 显示加载状态
            const main = document.querySelector('main');
            if (main) {
                main.style.opacity = '0.5';
                main.style.pointerEvents = 'none';
            }

            const response = await fetch(url, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin'
            });

            if (response.redirected) {
                window.location.href = response.url;
                return;
            }

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 更新标题
            document.title = doc.title;

            // 替换 <aside> 侧边栏
            const newAside = doc.querySelector('aside.sidebar');
            const oldAside = document.querySelector('aside.sidebar');
            if (newAside && oldAside) {
                oldAside.innerHTML = newAside.innerHTML;
            }

            // 替换 <main> 主内容区域
            const newMain = doc.querySelector('main.main-content');
            if (newMain && main) {
                main.innerHTML = newMain.innerHTML;
                main.style.opacity = '1';
                main.style.pointerEvents = '';
            }

            // 注入页面特有的 <style>（来自 <head> 和 <body>）
            const allStyles = [...doc.querySelectorAll('head style'), ...doc.querySelectorAll('body > style')];
            allStyles.forEach(styleEl => {
                const styleContent = styleEl.textContent.trim();
                if (styleContent) {
                    // 检查是否已存在相同样式
                    const existing = document.querySelectorAll('style');
                    let exists = false;
                    existing.forEach(s => {
                        if (s.textContent.trim() === styleContent) exists = true;
                    });
                    if (!exists) {
                        document.head.appendChild(styleEl.cloneNode(true));
                    }
                }
            });

            // 执行页面脚本
            const scripts = doc.querySelectorAll('script');
            for (let i = 0; i < scripts.length; i++) {
                const script = scripts[i];
                const src = script.getAttribute('src');

                if (src) {
                    // 外部脚本：跳过 floating_player.js 和 ajax_nav.js
                    const filename = src.split('/').pop();
                    if (SKIP_SCRIPTS.includes(filename)) continue;

                    // 重新执行外部脚本：先移除旧的，再添加新的
                    const oldScript = document.querySelector('script[src*="' + filename + '"]');
                    if (oldScript) oldScript.remove();

                    const newScript = document.createElement('script');
                    newScript.src = src;
                    document.body.appendChild(newScript);
                } else {
                    // 内联脚本：重新执行
                    const newScript = document.createElement('script');
                    newScript.textContent = script.textContent;
                    document.body.appendChild(newScript);
                }
            }

            // 更新 URL
            if (pushState) {
                history.pushState({ url: url }, '', url);
            }

            // 滚动到顶部
            window.scrollTo(0, 0);

            // 触发页面导航完成事件
            window.dispatchEvent(new CustomEvent('pageNavigated', { detail: { url: url } }));

        } catch (error) {
            console.error('AJAX导航失败:', error);
            // 失败时回退到正常跳转
            window.location.href = url;
        }
    }

    // 暴露导航函数供外部调用
    window.AjaxNav = {
        navigateTo: navigateTo
    };

    // 初始化时记录当前URL
    history.replaceState({ url: window.location.pathname }, '', window.location.pathname);
})();
