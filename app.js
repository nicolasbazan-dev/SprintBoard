/**
 * ==========================================================================
 * SPRINTBOARD — app.js
 * Autenticación real con localStorage, multi-proyectos, Kanban completo
 * ==========================================================================
 */

// ──────────────────────────────────────────────
// HELPERS DE AUTENTICACIÓN
// ──────────────────────────────────────────────

/** Hash simple (djb2) — suficiente para datos locales sin servidor */
function hashPassword(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

function getUsers() {
    return JSON.parse(localStorage.getItem('sb_users')) || {};
}

function saveUsers(users) {
    localStorage.setItem('sb_users', JSON.stringify(users));
}

function getSession() {
    return localStorage.getItem('sb_session'); // guarda el username activo
}

function setSession(username) {
    localStorage.setItem('sb_session', username);
}

function clearSession() {
    localStorage.removeItem('sb_session');
}

// ──────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ──────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3500);
}

// ──────────────────────────────────────────────
// ESTADO GLOBAL
// ──────────────────────────────────────────────

class TaskBoardState {
    constructor(username) {
        this.username = username;
        const storageKey = `sb_data_${username}`;
        const saved = JSON.parse(localStorage.getItem(storageKey));

        if (saved) {
            this.projects = saved.projects;
            this.currentProjectId = saved.currentProjectId;
            this.profile = saved.profile;
        } else {
            const pid = 'p1';
            this.projects = {
                [pid]: { id: pid, name: 'Mi Primer Proyecto', tasks: [], logs: [] }
            };
            this.currentProjectId = pid;
            this.profile = {
                role: 'Software Developer',
                desc: 'Construyendo el futuro web un componente a la vez.',
                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop'
            };
        }

        this.renderAll = () => {};
    }

    get storageKey() { return `sb_data_${this.username}`; }

    save() {
        localStorage.setItem(this.storageKey, JSON.stringify({
            projects: this.projects,
            currentProjectId: this.currentProjectId,
            profile: this.profile
        }));
        this.renderAll();
    }

    get currentProject() {
        return this.projects[this.currentProjectId];
    }

    addLog(message) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.currentProject.logs.unshift({ time: timestamp, text: `${this.username}: ${message}` });
        this.save();
    }

    setRenderEngine(fn) { this.renderAll = fn; }
}

let state = null;

// ──────────────────────────────────────────────
// DRAG AND DROP
// ──────────────────────────────────────────────

let draggedTaskId = null;

function setupDragAndDrop() {
    document.querySelectorAll('.column-body').forEach(column => {
        column.addEventListener('dragover', e => e.preventDefault());
        column.addEventListener('dragenter', () => column.classList.add('drag-over'));
        column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
        column.addEventListener('drop', e => {
            e.preventDefault();
            column.classList.remove('drag-over');
            const targetStatus = column.parentElement.dataset.status;
            if (draggedTaskId) {
                moveTask(draggedTaskId, targetStatus);
                draggedTaskId = null;
            }
        });
    });
}

// ──────────────────────────────────────────────
// LÓGICA DE NEGOCIO
// ──────────────────────────────────────────────

function moveTask(taskId, targetStatus) {
    const task = state.currentProject.tasks.find(t => t.id === taskId);
    if (!task) return;

    if ((targetStatus === 'testing' || targetStatus === 'completed') && task.dependency) {
        const dep = state.currentProject.tasks.find(t => t.id === task.dependency);
        if (dep && dep.status !== 'completed') {
            showToast(`"${task.title}" depende de "${dep.title}" (aún no finalizada).`, 'warning');
            return;
        }
    }

    const oldStatus = task.status;
    task.status = targetStatus;
    state.addLog(`Movió "${task.title}" → ${targetStatus}`);
    showToast(`Tarea movida a ${statusLabel(targetStatus)}`, 'success');
}

function statusLabel(s) {
    return { pending: 'Pendiente', 'in-progress': 'En Progreso', testing: 'Testing', completed: 'Finalizado' }[s] || s;
}

function isOverdue(deadline) {
    if (!deadline) return false;
    return new Date(deadline + 'T00:00:00') < new Date();
}

// ──────────────────────────────────────────────
// RENDERIZADO
// ──────────────────────────────────────────────

function renderApp() {
    if (document.getElementById('app-container').classList.contains('hidden')) return;

    const tasks = state.currentProject.tasks;
    const searchQuery = document.getElementById('search-input').value.toLowerCase();
    const filterPriority = document.getElementById('filter-priority').value;
    const filterAssignee = document.getElementById('filter-assignee').value;

    const cols = {
        pending: document.getElementById('col-pending'),
        'in-progress': document.getElementById('col-in-progress'),
        testing: document.getElementById('col-testing'),
        completed: document.getElementById('col-completed'),
    };
    Object.values(cols).forEach(c => c.innerHTML = '');

    document.getElementById('current-project-title').innerText = state.currentProject.name;

    const assignees = new Set();
    let completedCount = 0;
    let pendingCount = 0;

    tasks.forEach(task => {
        assignees.add(task.assignee);
        if (task.status === 'completed') completedCount++;
        if (task.status === 'pending') pendingCount++;

        const matchSearch = task.title.toLowerCase().includes(searchQuery) || task.desc.toLowerCase().includes(searchQuery);
        const matchPriority = filterPriority === 'all' || task.priority === filterPriority;
        const matchAssignee = filterAssignee === 'all' || task.assignee === filterAssignee;

        if (!matchSearch || !matchPriority || !matchAssignee) return;

        const card = document.createElement('div');
        card.className = 'task-card';
        card.draggable = true;
        card.dataset.id = task.id;

        let depHtml = '';
        if (task.dependency) {
            const dep = tasks.find(t => t.id === task.dependency);
            if (dep) depHtml = `<span class="dependency-badge">⛓️ Bloqueado por: ${dep.title}</span>`;
        }

        const overdue = isOverdue(task.deadline) && task.status !== 'completed';
        const deadlineHtml = `<span class="${overdue ? 'deadline-overdue' : ''}">📅 ${task.deadline}${overdue ? ' ⚠️' : ''}</span>`;

        card.innerHTML = `
            <span class="task-priority-tag priority-${task.priority}">${task.priority}</span>
            ${depHtml}
            <h4>${task.title}</h4>
            <p>${task.desc}</p>
            <div class="task-meta">
                <span class="task-assignee">👤 ${task.assignee}</span>
                ${deadlineHtml}
            </div>
            <div class="task-actions">
                <button onclick="openEditTask('${task.id}')">✏️ Editar</button>
                <button onclick="deleteTask('${task.id}')" class="btn-delete-task">🗑️ Eliminar</button>
            </div>
        `;

        card.addEventListener('dragstart', () => {
            card.classList.add('dragging');
            draggedTaskId = task.id;
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));

        if (cols[task.status]) cols[task.status].appendChild(card);
    });

    // Contadores columnas
    document.getElementById('count-pending').innerText = cols.pending.children.length;
    document.getElementById('count-in-progress').innerText = cols['in-progress'].children.length;
    document.getElementById('count-testing').innerText = cols.testing.children.length;
    document.getElementById('count-completed').innerText = cols.completed.children.length;

    // Filtro de responsables
    const selectAssignee = document.getElementById('filter-assignee');
    const curSel = selectAssignee.value;
    selectAssignee.innerHTML = '<option value="all">Todos los responsables</option>';
    assignees.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        if (name === curSel) opt.selected = true;
        selectAssignee.appendChild(opt);
    });

    // Métricas
    const total = tasks.length;
    document.getElementById('metric-total').innerText = total;
    document.getElementById('metric-pending').innerText = pendingCount;
    document.getElementById('metric-completed').innerText = completedCount;
    const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    document.getElementById('metric-progress-text').innerText = `${pct}%`;
    document.getElementById('metric-progress-bar').style.width = `${pct}%`;

    // Historial
    const logContainer = document.getElementById('activity-log');
    logContainer.innerHTML = '';
    state.currentProject.logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `<strong>[${log.time}]</strong> ${log.text}`;
        logContainer.appendChild(item);
    });

    // Perfil en sidebar
    document.getElementById('profile-name').innerText = state.username;
    document.getElementById('profile-role').innerText = state.profile.role;
    document.getElementById('profile-desc').innerText = state.profile.desc;
    document.getElementById('profile-img').src = state.profile.avatar;
}

// ──────────────────────────────────────────────
// CRUD TAREAS
// ──────────────────────────────────────────────

function openEditTask(id) {
    const task = state.currentProject.tasks.find(t => t.id === id);
    if (!task) return;
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-input-title').value = task.title;
    document.getElementById('task-input-desc').value = task.desc;
    document.getElementById('task-input-assignee').value = task.assignee;
    document.getElementById('task-input-priority').value = task.priority;
    document.getElementById('task-input-deadline').value = task.deadline;
    populateDependencySelect(task.id, task.dependency);
    document.getElementById('modal-task-title').innerText = 'Editar Tarea';
    document.getElementById('task-modal').classList.remove('hidden');
}

function deleteTask(id) {
    const idx = state.currentProject.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const title = state.currentProject.tasks[idx].title;
    state.currentProject.tasks.splice(idx, 1);
    state.currentProject.tasks.forEach(t => { if (t.dependency === id) t.dependency = ''; });
    state.addLog(`Eliminó la tarea "${title}"`);
    showToast(`Tarea "${title}" eliminada`, 'info');
}

function populateDependencySelect(excludeId = null, currentDepId = '') {
    const select = document.getElementById('task-input-dependency');
    select.innerHTML = '<option value="">Ninguna</option>';
    state.currentProject.tasks.forEach(t => {
        if (t.id === excludeId) return;
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.innerText = t.title;
        if (t.id === currentDepId) opt.selected = true;
        select.appendChild(opt);
    });
}

// ──────────────────────────────────────────────
// PROYECTOS
// ──────────────────────────────────────────────

function renderProjectsGrid() {
    const grid = document.getElementById('projects-list');
    grid.innerHTML = '';
    Object.values(state.projects).forEach(proj => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
            <div class="project-card-body">
                <div>
                    <h4>📁 ${proj.name}</h4>
                    <p>${proj.tasks.length} tarea${proj.tasks.length !== 1 ? 's' : ''}</p>
                </div>
                <button class="btn-delete-project" title="Eliminar proyecto" data-id="${proj.id}">🗑️</button>
            </div>
        `;
        card.querySelector('.project-card-body').addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-project')) return;
            state.currentProjectId = proj.id;
            document.getElementById('project-selector-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            state.save();
        });
        card.querySelector('.btn-delete-project').addEventListener('click', (e) => {
            e.stopPropagation();
            if (Object.keys(state.projects).length <= 1) {
                showToast('Debe haber al menos un proyecto.', 'warning');
                return;
            }
            delete state.projects[proj.id];
            // Si era el proyecto activo, cambiar al primero disponible
            if (state.currentProjectId === proj.id) {
                state.currentProjectId = Object.keys(state.projects)[0];
            }
            state.save();
            renderProjectsGrid();
            showToast(`Proyecto "${proj.name}" eliminado.`, 'info');
        });
        grid.appendChild(card);
    });
}

// ──────────────────────────────────────────────
// BOOTSTRAP DE LA APP TRAS LOGIN
// ──────────────────────────────────────────────

function bootApp(username) {
    state = new TaskBoardState(username);
    state.setRenderEngine(renderApp);
    setupDragAndDrop();
    renderApp();
}

// ──────────────────────────────────────────────
// EVENT LISTENERS
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // ── Toggle Login / Registro ──
    document.getElementById('toggle-to-register').addEventListener('click', () => {
        document.getElementById('login-panel').classList.add('hidden');
        document.getElementById('register-panel').classList.remove('hidden');
    });
    document.getElementById('toggle-to-login').addEventListener('click', () => {
        document.getElementById('register-panel').classList.add('hidden');
        document.getElementById('login-panel').classList.remove('hidden');
    });

    // ── Formulario de Registro ──
    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;

        if (password !== confirm) {
            showAuthError('register', 'Las contraseñas no coinciden.');
            return;
        }
        if (password.length < 4) {
            showAuthError('register', 'La contraseña debe tener al menos 4 caracteres.');
            return;
        }

        const users = getUsers();
        if (users[username]) {
            showAuthError('register', 'Ese nombre de usuario ya está en uso.');
            return;
        }

        users[username] = { passwordHash: hashPassword(password) };
        saveUsers(users);
        setSession(username);
        hideAuthError('register');

        document.getElementById('login-screen').classList.add('hidden');
        bootApp(username);
        renderProjectsGrid();
        document.getElementById('project-selector-screen').classList.remove('hidden');
        showToast(`¡Bienvenido/a, ${username}! Cuenta creada.`, 'success');
    });

    // ── Formulario de Login ──
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        const users = getUsers();
        const user = users[username];

        if (!user || user.passwordHash !== hashPassword(password)) {
            showAuthError('login', 'Usuario o contraseña incorrectos.');
            // Sacudir el formulario
            const card = document.querySelector('.login-card');
            card.classList.add('shake');
            card.addEventListener('animationend', () => card.classList.remove('shake'), { once: true });
            return;
        }

        hideAuthError('login');
        setSession(username);
        document.getElementById('login-screen').classList.add('hidden');
        bootApp(username);
        renderProjectsGrid();
        document.getElementById('project-selector-screen').classList.remove('hidden');
        showToast(`¡Bienvenido/a de nuevo, ${username}!`, 'success');
    });

    // ── Crear Proyecto ──
    document.getElementById('btn-create-project').addEventListener('click', () => {
        const input = document.getElementById('new-project-name');
        const name = input.value.trim();
        if (!name) return;
        const newId = 'p_' + Date.now();
        state.projects[newId] = { id: newId, name, tasks: [], logs: [] };
        input.value = '';
        state.save();
        renderProjectsGrid();
        showToast(`Proyecto "${name}" creado.`, 'success');
    });

    // ── Modal Tareas ──
    document.getElementById('btn-open-task-modal').addEventListener('click', () => {
        document.getElementById('task-form').reset();
        document.getElementById('task-id').value = '';
        populateDependencySelect();
        document.getElementById('modal-task-title').innerText = 'Nueva Tarea';
        document.getElementById('task-modal').classList.remove('hidden');
    });
    document.getElementById('btn-close-task-modal').addEventListener('click', () => {
        document.getElementById('task-modal').classList.add('hidden');
    });
    document.getElementById('task-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('task-modal'))
            document.getElementById('task-modal').classList.add('hidden');
    });

    document.getElementById('task-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('task-id').value;
        const taskData = {
            title: document.getElementById('task-input-title').value,
            desc: document.getElementById('task-input-desc').value,
            assignee: document.getElementById('task-input-assignee').value,
            priority: document.getElementById('task-input-priority').value,
            deadline: document.getElementById('task-input-deadline').value,
            dependency: document.getElementById('task-input-dependency').value,
        };

        if (id) {
            Object.assign(state.currentProject.tasks.find(t => t.id === id), taskData);
            state.addLog(`Actualizó la tarea "${taskData.title}"`);
            showToast('Tarea actualizada.', 'success');
        } else {
            taskData.id = 't_' + Date.now();
            taskData.status = 'pending';
            state.currentProject.tasks.push(taskData);
            state.addLog(`Creó la tarea "${taskData.title}"`);
            showToast('Tarea creada.', 'success');
        }
        document.getElementById('task-modal').classList.add('hidden');
        state.save();
    });

    // ── Modal Perfil ──
    document.getElementById('btn-edit-profile').addEventListener('click', () => {
        document.getElementById('edit-profile-name').value = state.username;
        document.getElementById('edit-profile-role').value = state.profile.role;
        document.getElementById('edit-profile-desc').value = state.profile.desc;
        document.getElementById('profile-modal').classList.remove('hidden');
    });
    document.getElementById('btn-close-profile-modal').addEventListener('click', () => {
        document.getElementById('profile-modal').classList.add('hidden');
    });
    document.getElementById('profile-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('profile-modal'))
            document.getElementById('profile-modal').classList.add('hidden');
    });
    document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        state.profile.role = document.getElementById('edit-profile-role').value;
        state.profile.desc = document.getElementById('edit-profile-desc').value;
        document.getElementById('profile-modal').classList.add('hidden');
        state.addLog('Actualizó su perfil.');
        showToast('Perfil actualizado.', 'success');
    });

    // ── Avatar ──
    document.getElementById('avatar-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            state.profile.avatar = reader.result;
            state.save();
            showToast('Avatar actualizado.', 'success');
        };
        reader.readAsDataURL(file);
    });

    // ── Filtros ──
    document.getElementById('search-input').addEventListener('input', renderApp);
    document.getElementById('filter-priority').addEventListener('change', renderApp);
    document.getElementById('filter-assignee').addEventListener('change', renderApp);

    // ── Navegación ──
    document.getElementById('btn-back-projects').addEventListener('click', () => {
        document.getElementById('app-container').classList.add('hidden');
        renderProjectsGrid();
        document.getElementById('project-selector-screen').classList.remove('hidden');
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        clearSession();
        state = null;
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('project-selector-screen').classList.add('hidden');
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();
        document.getElementById('register-panel').classList.add('hidden');
        document.getElementById('login-panel').classList.remove('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        showToast('Sesión cerrada.', 'info');
    });

    // ── Verificar sesión existente al cargar ──
    const savedSession = getSession();
    if (savedSession && getUsers()[savedSession]) {
        document.getElementById('login-screen').classList.add('hidden');
        bootApp(savedSession);
        renderProjectsGrid();
        document.getElementById('project-selector-screen').classList.remove('hidden');
    }
});

// ── Helpers de error en formularios de auth ──
function showAuthError(form, msg) {
    const el = document.getElementById(`${form}-error`);
    el.textContent = msg;
    el.classList.remove('hidden');
}
function hideAuthError(form) {
    document.getElementById(`${form}-error`).classList.add('hidden');
}