/**
 * 用户主页逻辑 - 修改密码等
 */

(function () {
    const changePasswordForm = document.getElementById('changePasswordForm');
    const passwordMessage = document.getElementById('passwordMessage');

    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const old_password = document.getElementById('old_password').value;
            const new_password = document.getElementById('new_password').value;
            const confirm_new_password = document.getElementById('confirm_new_password').value;

            if (!old_password || !new_password || !confirm_new_password) {
                showPasswordMessage('请填写所有字段', 'error');
                return;
            }

            try {
                const response = await fetch('/change_password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ old_password, new_password, confirm_password: confirm_new_password })
                });

                const data = await response.json();

                if (data.success) {
                    showPasswordMessage(data.message, 'success');
                    changePasswordForm.reset();
                    showToast(data.message, 'success');
                } else {
                    showPasswordMessage(data.message, 'error');
                }
            } catch (err) {
                showPasswordMessage('网络错误，请重试', 'error');
            }
        });
    }

    function showPasswordMessage(msg, type) {
        passwordMessage.textContent = msg;
        passwordMessage.className = 'form-message ' + type;
    }
})();

/**
 * Toast 通知
 */
function showToast(message, type) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * 侧边栏滑入滑出动画
 */
(function () {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    // 侧边栏显示函数
    function showSidebar() {
        if (!sidebar || !mainContent) return;
        
        // 移除隐藏类，添加滑入动画
        document.body.classList.remove('sidebar-hidden');
        
        // 添加滑入动画类
        sidebar.classList.remove('slide-out');
        sidebar.classList.add('slide-in');
        
        // 主内容区淡入
        mainContent.classList.remove('fade-out');
        mainContent.classList.add('fade-in');
        
        // 动画结束后移除动画类
        setTimeout(() => {
            sidebar.classList.remove('slide-in');
            mainContent.classList.remove('fade-in');
        }, 500);
    }

    // 侧边栏隐藏函数
    function hideSidebar() {
        if (!sidebar || !mainContent) return;
        
        // 添加滑出动画
        sidebar.classList.remove('slide-in');
        sidebar.classList.add('slide-out');
        
        // 主内容区淡出
        mainContent.classList.remove('fade-in');
        mainContent.classList.add('fade-out');
        
        // 动画结束后添加隐藏类
        setTimeout(() => {
            document.body.classList.add('sidebar-hidden');
            sidebar.classList.remove('slide-out');
            mainContent.classList.remove('fade-out');
        }, 500);
    }

    // 切换侧边栏显示状态
    function toggleSidebar() {
        if (document.body.classList.contains('sidebar-hidden')) {
            showSidebar();
        } else {
            hideSidebar();
        }
    }

    // 暴露全局方法供其他地方调用
    window.showSidebar = showSidebar;
    window.hideSidebar = hideSidebar;
    window.toggleSidebar = toggleSidebar;
})();

/**
 * 页面切换动画
 */
(function () {
    const navItems = document.querySelectorAll('.nav-item');
    const mainContent = document.querySelector('.main-content');

    // 为导航链接添加平滑过渡效果
    navItems.forEach(item => {
        const link = item.querySelector('a') || item;
        if (link.tagName === 'A' && link.href) {
            link.addEventListener('click', function (e) {
                // 阻止默认跳转
                e.preventDefault();
                const href = this.href;

                // 添加淡出动画
                if (mainContent) {
                    mainContent.classList.add('fade-out');
                }

                // 动画结束后跳转
                setTimeout(() => {
                    window.location.href = href;
                }, 400);
            });
        }
    });

    // 页面加载时添加淡入动画
    document.addEventListener('DOMContentLoaded', function () {
        if (mainContent) {
            mainContent.classList.add('fade-in');
            
            setTimeout(() => {
                mainContent.classList.remove('fade-in');
            }, 500);
        }
        
        // 检查是否需要显示侧边栏（主页默认隐藏，需要滑入）
        const body = document.body;
        if (body.classList.contains('sidebar-hidden')) {
            // 延迟一段时间后触发侧边栏滑入动画
            setTimeout(() => {
                showSidebar();
            }, 200);
        }
    });
})();

/**
 * 导航项点击动画效果
 */
(function () {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function () {
            // 添加点击动画
            this.style.transform = 'scale(0.95)';
            
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
})();
