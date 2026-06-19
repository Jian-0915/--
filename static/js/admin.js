/**
 * 管理员面板逻辑
 */

// Toast 通知
function showToast(message, type) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 模态框
function openModal(title, bodyHTML) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHTML;
    overlay.classList.add('active');
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('active');
}

// 点击遮罩关闭
document.addEventListener('click', function (e) {
    if (e.target.id === 'modalOverlay') {
        closeModal();
    }
});

function initAdminPage() {
    document.querySelectorAll('[data-avatar-color]').forEach(el => {
        const color = el.getAttribute('data-avatar-color');
        if (color) {
            el.style.backgroundColor = color;
        }
    });

    document.addEventListener('click', function (e) {
        const button = e.target.closest('.admin-action');
        if (!button) return;

        const action = button.dataset.action;
        if (!action) return;

        if (action === 'approval') {
            const regId = button.dataset.regId;
            const approval = button.dataset.approval;
            if (regId && approval) {
                handleApproval(regId, approval);
            }
        } else if (action === 'toggle-user') {
            const userId = button.dataset.userId;
            if (userId) {
                toggleUser(userId);
            }
        } else if (action === 'reset-password') {
            const userId = button.dataset.userId;
            const username = button.dataset.username;
            if (userId && username) {
                showResetPassword(userId, username);
            }
        } else if (action === 'delete-user') {
            const userId = button.dataset.userId;
            const username = button.dataset.username;
            if (userId && username) {
                deleteUser(userId, username);
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', initAdminPage);

/**
 * 处理注册审批
 */
async function handleApproval(regId, action) {
    const actionText = action === 'approve' ? '通过' : '拒绝';
    const actionColor = action === 'approve' ? 'success' : 'danger';

    let bodyHTML = `
        <p style="color: var(--gray); margin-bottom: 20px;">确定要${actionText}该注册申请吗？</p>
    `;

    if (action === 'reject') {
        bodyHTML += `
            <div class="form-group" style="margin-bottom: 16px;">
                <label>拒绝原因（选填）</label>
                <input type="text" id="rejectReason" placeholder="请输入拒绝原因" style="
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(148, 163, 184, 0.15);
                    border-radius: 8px;
                    padding: 10px 14px;
                    color: white;
                    font-size: 0.9rem;
                    outline: none;
                    width: 100%;
                    font-family: inherit;
                ">
            </div>
        `;
    }

    bodyHTML += `
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="btn" onclick="closeModal()" style="background: var(--dark-3); color: white;">取消</button>
            <button class="btn btn-${actionColor}" onclick="confirmApproval(${regId}, '${action}')">确认${actionText}</button>
        </div>
    `;

    openModal('审批确认', bodyHTML);
}

async function confirmApproval(regId, action) {
    const reason = document.getElementById('rejectReason');
    const reasonValue = reason ? reason.value.trim() : '';

    const payload = { action };
    if (reasonValue) payload.reason = reasonValue;

    try {
        const response = await fetch(`/admin/approve/${regId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            closeModal();

            // 移除审批项
            const regItem = document.getElementById(`reg-${regId}`);
            if (regItem) {
                regItem.style.transition = 'all 0.4s ease';
                regItem.style.opacity = '0';
                regItem.style.transform = 'translateX(30px)';
                setTimeout(() => regItem.remove(), 400);
            }

            // 刷新页面更新计数
            setTimeout(() => location.reload(), 800);
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('操作失败，请重试', 'error');
    }
}

/**
 * 切换用户状态（启用/禁用）
 */
async function toggleUser(userId) {
    try {
        const response = await fetch(`/admin/user/${userId}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            setTimeout(() => location.reload(), 600);
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('操作失败', 'error');
    }
}

/**
 * 删除用户
 */
function deleteUser(userId, username) {
    const bodyHTML = `
        <p style="color: var(--gray); margin-bottom: 8px;">确定要删除用户 <strong style="color: white;">${username}</strong> 吗？</p>
        <p style="color: var(--danger); font-size: 0.85rem; margin-bottom: 20px;">此操作不可撤销，该用户的所有数据将被永久删除。</p>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="btn" onclick="closeModal()" style="background: var(--dark-3); color: white;">取消</button>
            <button class="btn btn-danger" onclick="confirmDeleteUser(${userId})">确认删除</button>
        </div>
    `;

    openModal('删除用户', bodyHTML);
}

async function confirmDeleteUser(userId) {
    try {
        const response = await fetch(`/admin/user/${userId}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            closeModal();

            const row = document.getElementById(`user-row-${userId}`);
            if (row) {
                row.style.transition = 'all 0.4s ease';
                row.style.opacity = '0';
                row.style.transform = 'translateX(-30px)';
                setTimeout(() => row.remove(), 400);
            }

            setTimeout(() => location.reload(), 800);
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('操作失败', 'error');
    }
}

/**
 * 重置用户密码
 */
function showResetPassword(userId, username) {
    const bodyHTML = `
        <p style="color: var(--gray); margin-bottom: 16px;">为用户 <strong style="color: white;">${username}</strong> 设置新密码</p>
        <div class="form-group" style="margin-bottom: 16px;">
            <label>新密码</label>
            <input type="password" id="newPasswordInput" placeholder="请输入新密码（至少6位）" style="
                background: rgba(15, 23, 42, 0.6);
                border: 1px solid rgba(148, 163, 184, 0.15);
                border-radius: 8px;
                padding: 10px 14px;
                color: white;
                font-size: 0.9rem;
                outline: none;
                width: 100%;
                font-family: inherit;
            ">
        </div>
        <div id="resetMsg" style="font-size: 0.85rem; min-height: 20px; margin-bottom: 12px;"></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="btn" onclick="closeModal()" style="background: var(--dark-3); color: white;">取消</button>
            <button class="btn btn-info" onclick="confirmResetPassword(${userId})">确认重置</button>
        </div>
    `;

    openModal('重置密码', bodyHTML);
}

async function confirmResetPassword(userId) {
    const input = document.getElementById('newPasswordInput');
    const msgDiv = document.getElementById('resetMsg');
    const newPassword = input.value.trim();

    if (!newPassword || newPassword.length < 6) {
        msgDiv.textContent = '密码长度至少6个字符';
        msgDiv.style.color = 'var(--danger)';
        return;
    }

    try {
        const response = await fetch(`/admin/user/${userId}/reset_password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_password: newPassword })
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            closeModal();
        } else {
            msgDiv.textContent = data.message;
            msgDiv.style.color = 'var(--danger)';
        }
    } catch (err) {
        msgDiv.textContent = '操作失败';
        msgDiv.style.color = 'var(--danger)';
    }
}
