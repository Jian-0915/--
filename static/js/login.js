/**
 * 登录页面逻辑
 * 点击登录后整个卡片消散
 * 成功 -> 跳转主页
 * 失败 -> 粒子重新组合回卡片，显示错误信息
 */

(function () {
    const form = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginCard = document.getElementById('loginCard');
    const loginContainer = document.getElementById('loginContainer');
    const errorDiv = document.getElementById('loginError');

    if (!form) return;

    let isAnimating = false; // 防止动画期间重复提交

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (isAnimating) return;

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!username || !password) {
            showError('请输入用户名和密码');
            shakeCard();
            return;
        }

        // 显示加载状态
        setButtonLoading(true);
        clearError();

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                // 登录成功 - 整个卡片消散，然后跳转
                triggerDissolveAndRedirect();
            } else {
                // 登录失败 - 整个卡片消散，然后重组回来并显示错误
                triggerDissolveAndReform(data.message);
            }
        } catch (err) {
            // 网络错误 - 整个卡片消散，然后重组回来
            triggerDissolveAndReform('网络错误，请重试');
        }
    });

    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.className = 'error-message';
        errorDiv.style.opacity = '1';
    }

    function clearError() {
        errorDiv.textContent = '';
        errorDiv.style.opacity = '0';
    }

    function setButtonLoading(loading) {
        const btnText = loginBtn.querySelector('.btn-text');
        const btnLoader = loginBtn.querySelector('.btn-loader');

        if (loading) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline-flex';
            loginBtn.disabled = true;
            loginBtn.style.opacity = '0.8';
        } else {
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
            loginBtn.disabled = false;
            loginBtn.style.opacity = '1';
        }
    }

    /**
     * 卡片抖动效果（输入验证失败时）
     */
    function shakeCard() {
        loginCard.style.animation = 'none';
        loginCard.offsetHeight; // 触发重排
        loginCard.style.animation = 'cardShake 0.5s ease';
    }

    /**
     * 登录成功：整个卡片消散 -> 跳转
     */
    function triggerDissolveAndRedirect() {
        isAnimating = true;
        const cardRect = loginCard.getBoundingClientRect();

        // 1. 卡片模糊消散
        loginCard.classList.add('dissolving');

        // 2. 同时生成粒子从卡片位置飞散
        createDissolveParticles(cardRect, 120, 500);

        // 3. 消散完毕后跳转
        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 1600);
    }

    /**
     * 登录失败：整个卡片消散 -> 粒子回聚 -> 卡片重组 -> 显示错误
     */
    function triggerDissolveAndReform(errorMessage) {
        isAnimating = true;
        const cardRect = loginCard.getBoundingClientRect();

        // 1. 卡片模糊消散
        loginCard.classList.add('dissolving');

        // 2. 生成粒子从卡片位置飞散
        const particles = createDissolveParticles(cardRect, 100, 0);

        // 3. 粒子飞散后，回聚到原位
        setTimeout(() => {
            particles.forEach(p => {
                const originX = parseFloat(p.dataset.originX);
                const originY = parseFloat(p.dataset.originY);
                const originSize = parseFloat(p.dataset.originSize);

                p.style.transition = 'all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                p.style.left = originX + 'px';
                p.style.top = originY + 'px';
                p.style.width = originSize + 'px';
                p.style.height = originSize + 'px';
                p.style.opacity = '0';
                p.style.transform = 'scale(1)';
            });
        }, 800);

        // 4. 粒子回聚完毕，移除粒子，卡片重组出现
        setTimeout(() => {
            particles.forEach(p => {
                if (p.parentNode) p.parentNode.removeChild(p);
            });

            // 卡片重组动画
            loginCard.classList.remove('dissolving');
            loginCard.classList.add('reforming');

            setTimeout(() => {
                loginCard.classList.remove('reforming');
                isAnimating = false;
            }, 600);

            // 显示错误信息
            showError(errorMessage);
            setButtonLoading(false);
        }, 1700);
    }

    /**
     * 创建消散粒子
     * @returns {Array} 粒子元素数组
     */
    function createDissolveParticles(rect, count, flyDelay) {
        const particles = [];
        const colors = [
            'rgba(99, 102, 241, ',   // primary
            'rgba(139, 92, 246, ',   // secondary
            'rgba(129, 140, 248, ',  // primary-light
            'rgba(168, 85, 247, ',   // purple
            'rgba(196, 181, 253, ',  // light purple
            'rgba(99, 102, 241, ',   // primary (repeat for more purple tones)
            'rgba(236, 72, 153, ',   // pink accent
        ];

        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'dissolve-particle';

            const size = Math.random() * 8 + 2;
            const x = rect.left + Math.random() * rect.width;
            const y = rect.top + Math.random() * rect.height;
            const colorBase = colors[Math.floor(Math.random() * colors.length)];
            const opacity = Math.random() * 0.8 + 0.4;

            // 保存原始位置（用于回聚）
            el.dataset.originX = x;
            el.dataset.originY = y;
            el.dataset.originSize = size;

            el.style.width = size + 'px';
            el.style.height = size + 'px';
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.background = colorBase + opacity + ')';
            el.style.boxShadow = '0 0 ' + (size * 2) + 'px ' + colorBase + (opacity * 0.5) + ')';
            el.style.transition = 'none';
            el.style.opacity = '1';

            document.body.appendChild(el);
            particles.push(el);

            // 随机方向飞散
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 350 + 150;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance - 80;
            const duration = Math.random() * 500 + 500;
            const delay = Math.random() * 300 + flyDelay;

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    el.style.transition = `all ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms`;
                    el.style.transform = `translate(${dx}px, ${dy}px) scale(0)`;
                    el.style.opacity = '0';
                });
            });
        }

        return particles;
    }
})();
