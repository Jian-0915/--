/**
 * 注册页面逻辑
 */

(function () {
    const form = document.getElementById('registerForm');
    const messageDiv = document.getElementById('registerMessage');

    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirm_password = document.getElementById('confirm_password').value;
        const message = document.getElementById('message').value.trim();

        if (!username || !password || !confirm_password) {
            showMessage('请填写必填字段', 'error');
            return;
        }

        // 按钮加载状态
        const btn = form.querySelector('.login-btn');
        const btnText = btn.querySelector('.btn-text');
        const originalText = btnText.textContent;
        btnText.textContent = '提交中...';
        btn.disabled = true;
        btn.style.opacity = '0.8';

        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, confirm_password, message })
            });

            const data = await response.json();

            if (data.success) {
                showMessage(data.message, 'success');
                btnText.textContent = '已提交';
                btn.style.background = 'linear-gradient(135deg, #10b981, #14b8a6)';

                // 3秒后跳转到登录页
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2500);
            } else {
                showMessage(data.message, 'error');
                btnText.textContent = originalText;
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        } catch (err) {
            showMessage('网络错误，请重试', 'error');
            btnText.textContent = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    });

    function showMessage(msg, type) {
        messageDiv.textContent = msg;
        messageDiv.className = 'error-message ' + type;
        messageDiv.style.opacity = '1';
    }
})();
