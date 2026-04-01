// Lógica Principal del Dashboard

let dashboardData = {};
let coursesChartInstance = null;

// Configuración visual de Chart.js para temas oscuros
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Inter', 'sans-serif'";

const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxMu8PD4hhXwfRyKltuKMjZcULxKEJUhVZGt68yrGy5366FMc1DVnnMJEcGMX-8wnIe/exec';

// ================================================================
// SISTEMA DE AUTENTICACIÓN Y ROLES
// ================================================================

// Base de datos de usuarios base (siempre disponibles, hardcoded)
const BASE_USERS = [
    { password: 'RB1069432843191425', name: 'Wilson Varela Muñoz',           role: 'Super Administrador' },
    { password: 'RB53080821',         name: 'Espitia Cortes Jennifer Yolima', role: 'Administrador' },
    { password: 'RB52850911',         name: 'Ramirez Mora Dora Yeny',         role: 'Administrador' },
    { password: 'RB1007339915',       name: 'Laguna Leiva Valentina',          role: 'Administrador' },
    { password: 'RB1026580615',       name: 'Campo Camacho Yenny Lizeth',      role: 'Administrador' },
];

// Clave legacy de localStorage (ya no se usa para almacenar, solo para migrar si hubiera datos)
const EXTRA_USERS_KEY = 'rb_extra_users';

// Lista de usuarios extra cargados desde el backend (se llena después del fetch)
let apiExtraUsers = [];

// Usuario actual en sesión (se lee de sessionStorage al cargar)
let currentUser = null;

/** Devuelve todos los usuarios (base + extra desde el API) */
function getAllUsers() {
    return [...BASE_USERS, ...apiExtraUsers];
}

/** Busca un usuario por password (case-sensitive) */
function findUserByPassword(pw) {
    return getAllUsers().find(u => u.password === pw) || null;
}

/** Devuelve true si el usuario actual puede ver el análisis y descargar */
function isAuthorized() {
    return currentUser !== null;
}

/** Aplica restricciones de UI según el rol actual */
function applyRoleUI() {
    const badge = document.getElementById('role-badge');
    const btnDownload = document.getElementById('btn-download');
    const ratingsCard = document.querySelector('[onclick="openRatingsModal()"]');

    if (!currentUser) {
        // INVITADO
        badge.textContent = '\uD83D\uDD13 Invitado';
        badge.style.background = 'rgba(255,255,255,0.06)';
        badge.style.borderColor = 'rgba(255,255,255,0.15)';
        badge.style.color = '#979799';
        if (btnDownload) btnDownload.classList.add('hidden');
        // Tarjeta de valoraciones: no clickeable para invitados
        if (ratingsCard) {
            ratingsCard.style.cursor = 'default';
            ratingsCard.classList.remove('hover:border-[#43bff5]', 'hover:shadow-[0_0_15px_rgba(67,191,245,0.3)]', 'group');
        }
    } else {
        // USUARIO AUTENTICADO
        const roleColor = currentUser.role === 'Super Administrador'
            ? { bg: 'rgba(123,63,206,0.25)', border: 'rgba(123,63,206,0.5)', color: '#c084fc' }
            : { bg: 'rgba(67,191,245,0.15)', border: 'rgba(67,191,245,0.4)', color: '#43bff5' };

        const shortName = currentUser.name.split(' ').slice(0, 2).join(' ');
        badge.textContent = `\uD83D\uDD11 ${shortName} • ${currentUser.role}`;
        badge.style.background = roleColor.bg;
        badge.style.borderColor = roleColor.border;
        badge.style.color = roleColor.color;

        // Tarjeta de valoraciones: clickeable para usuarios autenticados
        if (ratingsCard) {
            ratingsCard.style.cursor = 'pointer';
            ratingsCard.classList.add('hover:border-[#43bff5]', 'hover:shadow-[0_0_15px_rgba(67,191,245,0.3)]', 'group');
        }

        // Mostrar botón de descarga si ya se cargó la URL
        if (btnDownload && dashboardData.kpis && dashboardData.kpis.download_url) {
            btnDownload.href = dashboardData.kpis.download_url;
            btnDownload.classList.remove('hidden');
        }
    }
}

/** Lógica del clic en el badge:
 *  - Invitado  → abre login
 *  - Admin / Super Admin → cierra sesión (con confirmación nativa)
 *  - Si Super Admin, primero ofrece abrir el panel de gestión de usuarios
 */
function handleRoleBadgeClick() {
    if (!currentUser) {
        openLoginModal();
    } else if (currentUser.role === 'Super Administrador') {
        // Menú rápido con confirm
        const choice = confirm(`Sesión activa: ${currentUser.name}\n\nSelecciona una opción:\n\n[Aceptar] → Abrir Gestión de Usuarios\n[Cancelar] → Cerrar Sesión`);
        if (choice) {
            openAddUserModal();
        } else {
            if (confirm('\u00bfSeguro que quieres cerrar sesión?')) logout();
        }
    } else {
        if (confirm(`\u00bfDeseas cerrar la sesión de ${currentUser.name}?`)) logout();
    }
}

function openLoginModal() {
    document.getElementById('login-password-input').value = '';
    document.getElementById('login-error').classList.add('hidden');
    const m = document.getElementById('login-modal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(() => document.getElementById('login-password-input').focus(), 100);
}

function closeLoginModal() {
    const m = document.getElementById('login-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

function attemptLogin() {
    const pw = document.getElementById('login-password-input').value.trim();
    const user = findUserByPassword(pw);
    if (user) {
        currentUser = user;
        sessionStorage.setItem('rb_session', JSON.stringify(user));
        closeLoginModal();
        applyRoleUI();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
        document.getElementById('login-password-input').value = '';
        document.getElementById('login-password-input').focus();
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('rb_session');
    applyRoleUI();
}

// ---- Add User Modal ----
function openAddUserModal() {
    renderUsersList();
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-password').value = '';
    document.getElementById('new-user-role').value = 'Administrador';
    document.getElementById('add-user-error').classList.add('hidden');
    const m = document.getElementById('add-user-modal');
    m.classList.remove('hidden');
    m.classList.add('flex');
}

function closeAddUserModal() {
    const m = document.getElementById('add-user-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

function renderUsersList() {
    const container = document.getElementById('users-list');
    const users = getAllUsers();
    container.innerHTML = users.map((u, i) => {
        const isExtra = i >= BASE_USERS.length;
        const roleColor = u.role === 'Super Administrador' ? '#c084fc' : '#43bff5';
        return `
            <div class="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-sm">
                <div>
                    <p class="font-medium text-white">${u.name}</p>
                    <p style="color:${roleColor}" class="text-xs">${u.role}</p>
                </div>
                ${isExtra
                    ? `<button onclick="removeExtraUser('${u.password.replace(/'/g, "\\'")}')"
                         class="text-red-400 hover:text-red-300 transition-colors text-lg leading-none" title="Eliminar">&times;</button>`
                    : '<span class="text-brand-muted text-xs">Base</span>'}
            </div>
        `;
    }).join('');
}

async function removeExtraUser(password) {
    if (!confirm('\u00bfEliminar este usuario?')) return;
    try {
        const res = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ action: 'remove_user', password: password })
        });
        const data = await res.json();
        if (data.ok) {
            apiExtraUsers = data.users;
            renderUsersList();
        } else {
            alert('Error al eliminar: ' + (data.error || 'desconocido'));
        }
    } catch(e) {
        alert('Error de red al eliminar usuario.');
    }
}

async function addNewUser() {
    const name = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-password').value.trim();
    const role = document.getElementById('new-user-role').value;
    const errEl = document.getElementById('add-user-error');

    if (!name || !password) {
        errEl.textContent = 'Por favor completa todos los campos.';
        errEl.classList.remove('hidden');
        return;
    }
    if (getAllUsers().find(u => u.password === password)) {
        errEl.textContent = 'Esa contraseña ya está en uso. Elige una diferente.';
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    // Guardar en el backend (Apps Script PropertiesService)
    try {
        const res = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ action: 'add_user', user: { name, password, role } })
        });
        const data = await res.json();
        if (data.ok) {
            apiExtraUsers = data.users;
            document.getElementById('new-user-name').value = '';
            document.getElementById('new-user-password').value = '';
            renderUsersList();
        } else {
            errEl.textContent = data.error || 'No se pudo guardar el usuario.';
            errEl.classList.remove('hidden');
        }
    } catch(e) {
        errEl.textContent = 'Error de red al guardar. Intenta de nuevo.';
        errEl.classList.remove('hidden');
    }
}

// ================================================================
// END SISTEMA DE AUTENTICACIÓN
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Restaurar sesión previa si existe
    const savedSession = sessionStorage.getItem('rb_session');
    if (savedSession) {
        try { currentUser = JSON.parse(savedSession); } catch(e) { currentUser = null; }
    }
    applyRoleUI();
    fetchDashboardData();

    // Cerrar modales al clicar el overlay
    document.getElementById('login-modal').addEventListener('click', function(e) {
        if (e.target === this) closeLoginModal();
    });
    document.getElementById('add-user-modal').addEventListener('click', function(e) {
        if (e.target === this) closeAddUserModal();
    });
});

async function fetchDashboardData() {
    try {
        const response = await fetch(API_ENDPOINT);
        if (!response.ok) throw new Error('Error al conectar con la API');
        
        dashboardData = await response.json();
        
        updateKPIs(dashboardData.kpis);
        renderChart(dashboardData.courses);
        renderTable(dashboardData.courses);
        renderAreasTable(dashboardData.areas);
        
        // Populate new Global Rating KPIs
        animateValue('kpi-avg-rating', 0, dashboardData.kpis.average_rating || 0, 2500, '', true);
        animateValue('kpi-rating-count', 0, dashboardData.kpis.ratings_count || 0, 2500, '', false);
        animateValue('kpi-rating-participation', 0, dashboardData.kpis.rating_participation || 0, 2500, '%', true);

        // Populate gender stats
        const gs = dashboardData.gender_stats;
        if (gs) {
            animateValue('kpi-f-avg',      0, gs.femenino.avg               || 0, 2500, '', true);
            animateValue('kpi-f-count',    0, gs.femenino.count             || 0, 2500, '', false);
            animateValue('kpi-f-pct',      0, gs.femenino.pct               || 0, 2500, '%', true);
            animateValue('kpi-f-enrolled', 0, gs.femenino.enrolled          || 0, 2500, '', false);
            animateValue('kpi-f-part',     0, gs.femenino.participation_rate || 0, 2500, '%', true);
            animateValue('kpi-m-avg',      0, gs.masculino.avg               || 0, 2500, '', true);
            animateValue('kpi-m-count',    0, gs.masculino.count             || 0, 2500, '', false);
            animateValue('kpi-m-pct',      0, gs.masculino.pct               || 0, 2500, '%', true);
            animateValue('kpi-m-enrolled', 0, gs.masculino.enrolled          || 0, 2500, '', false);
            animateValue('kpi-m-part',     0, gs.masculino.participation_rate || 0, 2500, '%', true);
        }
        
        // Update the last updated time from Google Sheets
        document.getElementById('last-update').innerText = dashboardData.kpis.last_updated || 'Desconocido';

        // Cargar usuarios extra desde el API
        if (dashboardData.extra_users && Array.isArray(dashboardData.extra_users)) {
            apiExtraUsers = dashboardData.extra_users;
        }

        // Botón de descarga: solo visible para usuarios autenticados
        const btnDownload = document.getElementById('btn-download');
        if (btnDownload && dashboardData.kpis.download_url) {
            btnDownload.href = dashboardData.kpis.download_url;
            if (isAuthorized()) btnDownload.classList.remove('hidden');
        }

        // Volver a aplicar UI de roles después de cargar datos
        // (por si el badge necesita los datos del download_url)
        applyRoleUI();

        // Show online indicator
        const indicator = document.getElementById('online-indicator');
        if(indicator) indicator.classList.remove('hidden');
        
        const errorToast = document.getElementById('error-toast');
        if(errorToast) errorToast.classList.add('hidden');

    } catch (error) {
        console.error("No se pudieron cargar los datos", error);
        const indicator = document.getElementById('online-indicator');
        if(indicator) indicator.classList.add('hidden');
        
        const errorToast = document.getElementById('error-toast');
        if(errorToast) {
            errorToast.classList.remove('hidden');
            document.getElementById('error-text').innerText = `Error: ${error.message}`;
        }
    }
}

function animateValue(elementOrId, start, end, duration, formatStr = "", isFloat = false) {
    let el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el) return;
    
    // If end value is undefined, null, or invalid, set it to 0
    if (isNaN(end) || end === null || end === undefined) end = 0;

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        let current = start + easeOut * (end - start);
        
        if (isFloat) {
            el.innerText = current.toFixed(1) + formatStr;
        } else {
            el.innerText = Math.floor(current) + formatStr;
        }
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            if (isFloat) el.innerText = end.toFixed(1) + formatStr;
            else el.innerText = end + formatStr;
        }
    };
    window.requestAnimationFrame(step);
}

function updateKPIs(kpis) {
    animateValue('kpi-participation', 0, kpis.participation_rate, 2500, '%', true);
    animateValue('kpi-approval', 0, kpis.approval_rate, 2500, '%', true);
    animateValue('kpi-courses', 0, kpis.total_courses, 2500, '', false);
    animateValue('kpi-attendees', 0, kpis.total_attendees, 2500, '', false);
    
    if (kpis.global_started !== undefined) animateValue('kpi-part-count', 0, kpis.global_started, 2500, '', false);
    if (kpis.global_approved !== undefined) animateValue('kpi-appr-count', 0, kpis.global_approved, 2500, '', false);
}

function renderChart(courses) {
    const ctx = document.getElementById('coursesChart').getContext('2d');
    
    const labels = courses.map(c => c.name);
    const participationData = courses.map(c => c.participation);
    const approvalData = courses.map(c => c.approval);

    if (coursesChartInstance) {
        coursesChartInstance.destroy();
    }

    const gradientPart = ctx.createLinearGradient(0, 0, 0, 400);
    gradientPart.addColorStop(0, '#13b8ff');
    gradientPart.addColorStop(1, '#003e58');

    const gradientAppr = ctx.createLinearGradient(0, 0, 0, 400);
    gradientAppr.addColorStop(0, '#00ff22');
    gradientAppr.addColorStop(1, '#01326c');

    coursesChartInstance = new Chart(ctx, {
        type: 'bar',
        plugins: [ChartDataLabels],
        data: {
            labels: labels,
            datasets: [
                {
                    label: '% Participación',
                    data: courses.map(() => 0),
                    backgroundColor: gradientPart,
                    borderColor: '#43bff5',
                    borderWidth: {top: 1, right: 0, bottom: 0, left: 0},
                    borderRadius: 4
                },
                {
                    label: '% Aprobación',
                    data: courses.map(() => 0),
                    backgroundColor: gradientAppr,
                    borderColor: '#7fb5d8',
                    borderWidth: {top: 1, right: 0, bottom: 0, left: 0},
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            layout: {
                padding: {
                    top: 30
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    titleColor: '#43bff5',
                    bodyColor: '#ffffff63',
                    borderColor: 'rgba(255, 255, 255, 0.05)',
                    borderWidth: 1
                },
                datalabels: {
                    color: '#43bff5',
                    anchor: 'end',
                    align: 'top',
                    offset: 2,
                    clip: false,
                    font: function(context) {
                        // Calcular tamaño dinámico según número de barras
                        var count = context.chart.data.labels ? context.chart.data.labels.length : 1;
                        var chartWidth = context.chart.width || 800;
                        // Ancho disponible por grupo de barras
                        var barGroupWidth = chartWidth / count;
                        // Cada grupo tiene 2 barras, así que ancho por barra
                        var barWidth = barGroupWidth / 2;
                        // Texto típico: "33.5" → 4 chars → queremos que quepan en barWidth
                        // Aproximamos: 1 char ≈ 0.6 * fontSize en pixeles
                        var fontSize = Math.floor(barWidth / (4 * 0.65));
                        fontSize = Math.max(7, Math.min(fontSize, 11));
                        return {
                            size: fontSize,
                            weight: 'bold',
                            family: "'Inter', sans-serif"
                        };
                    },
                    formatter: function(value) {
                        return value.toFixed(1);
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 110,
                    grid: {
                        color: '#08aac30e',
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 9 },
                        callback: function(value) {
                            return value <= 100 ? value + '%' : '';
                        }
                    },
                    afterFit: function(axis) {
                        // Limitar ancho del eje Y para maximizar espacio de barras
                        axis.width = 38;
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    let startTime = null;
    const duration = 2500;
    
    const animateChart = (timestamp) => {
        if (!startTime) startTime = timestamp;
        let progress = Math.min((timestamp - startTime) / duration, 1);
        let easeOut = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        
        coursesChartInstance.data.datasets[0].data = participationData.map(v => v * easeOut);
        coursesChartInstance.data.datasets[1].data = approvalData.map(v => v * easeOut);
        
        coursesChartInstance.update('none');
        
        if (progress < 1) {
            window.requestAnimationFrame(animateChart);
        } else {
            coursesChartInstance.data.datasets[0].data = participationData;
            coursesChartInstance.data.datasets[1].data = approvalData;
            coursesChartInstance.update('none');
        }
    };
    window.requestAnimationFrame(animateChart);
}

function renderTable(courses) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (courses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-brand-muted">No se encontraron cursos.</td></tr>`;
        return;
    }

    courses.forEach(c => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-800/30 transition-colors course-row";
        tr.dataset.name = c.name.toLowerCase();
        
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-white">${c.name}</td>
            <td class="px-6 py-4 text-center text-gray-300 font-medium table-number-int" data-val="${c.enrolled}">0</td>
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="text-right font-bold text-[#43bff5] table-number-float" data-val="${c.participation}">0.0%</span>
                    <div class="table-progress-bar">
                        <div class="table-progress-fill participation-fill" style="width: 0%" data-target-width="${c.participation}%"></div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="text-right font-bold text-[#7fb5d8] table-number-float" data-val="${c.approval}">0.0%</span>
                    <div class="table-progress-bar">
                        <div class="table-progress-fill approval-fill" style="width: 0%" data-target-width="${c.approval}%"></div>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const intElems = tbody.querySelectorAll('.table-number-int');
    intElems.forEach(el => animateValue(el, 0, parseFloat(el.getAttribute('data-val')), 2500, '', false));
    
    const floatElems = tbody.querySelectorAll('.table-number-float');
    floatElems.forEach(el => animateValue(el, 0, parseFloat(el.getAttribute('data-val')), 2500, '%', true));

    // Animar barras de progreso usando requestAnimationFrame
    setTimeout(() => {
        const fills = document.querySelectorAll('#table-body .table-progress-fill');
        fills.forEach(fill => {
            fill.style.width = fill.getAttribute('data-target-width');
        });
    }, 100);
}


function renderAreasTable(areas) {
    const tbody = document.getElementById('areas-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!areas || areas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-brand-muted">No se encontraron áreas.</td></tr>`;
        return;
    }

    areas.forEach((a, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-800/30 transition-colors cursor-pointer group";
        tr.onclick = () => openModal(index);
        
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-white group-hover:text-brand-primary transition-colors flex items-center space-x-2">
                <svg class="w-4 h-4 text-brand-muted group-hover:text-brand-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                <span>${a.name}</span>
            </td>
            <td class="px-6 py-4 text-center text-gray-300 font-medium area-number-int" data-val="${a.enrolled}">0</td>
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="text-right font-bold text-[#43bff5] area-number-float" data-val="${a.participation}">0.0%</span>
                    <div class="table-progress-bar">
                        <div class="table-progress-fill participation-fill" style="width: 0%" data-target-width="${a.participation}%"></div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="text-right font-bold text-[#7fb5d8] area-number-float" data-val="${a.approval}">0.0%</span>
                    <div class="table-progress-bar">
                        <div class="table-progress-fill approval-fill" style="width: 0%" data-target-width="${a.approval}%"></div>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const intAreaElems = tbody.querySelectorAll('.area-number-int');
    intAreaElems.forEach(el => animateValue(el, 0, parseFloat(el.getAttribute('data-val')), 2500, '', false));
    
    const floatAreaElems = tbody.querySelectorAll('.area-number-float');
    floatAreaElems.forEach(el => animateValue(el, 0, parseFloat(el.getAttribute('data-val')), 2500, '%', true));

    setTimeout(() => {
        const areaFills = document.querySelectorAll('#areas-table-body .table-progress-fill');
        areaFills.forEach(fill => {
            if (fill.hasAttribute('data-target-width')) {
                fill.style.width = fill.getAttribute('data-target-width');
            }
        });
    }, 100);
}

function openModal(areaIndex) {
    const area = dashboardData.areas[areaIndex];
    document.getElementById('modal-title').innerText = `Participantes: ${area.name}`;
    
    const tbody = document.getElementById('modal-tbody');
    tbody.innerHTML = '';
    
    if (!area.participants || area.participants.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-4 text-center text-brand-muted">No hay participantes registrados.</td></tr>`;
    } else {
        area.participants.forEach(p => {
            let s = (p.status || '').toString().trim().toLowerCase();
            let statusColor = 'text-[#979799]'; // default
            
            if (s === 'aprobado' || s === 'aprobados') {
                statusColor = 'text-[#21ed13] font-bold drop-shadow-[0_0_6px_rgba(33,237,19,0.5)]';
            } else if (s === 'reprobado' || s === 'reprobados') {
                statusColor = 'text-red-400 font-medium';
            } else if (s === 'finalizado' || s === 'finalizados') {
                statusColor = 'text-[#43bff5] font-medium';
            } else if (s === 'inscrito' || s === 'inscritos') {
                statusColor = 'text-yellow-400 font-medium';
            } else if (s === 'en curso' || s === 'en_curso') {
                statusColor = 'text-[#7fb5d8] font-medium';
            }
            
            const tr = document.createElement('tr');
            tr.className = "hover:bg-white/5 transition-colors";
            tr.innerHTML = `
                <td class="px-6 py-3 font-medium text-white">${p.name}</td>
                <td class="px-6 py-3 text-[#7fb5d8]">${p.course}</td>
                <td class="px-6 py-3 ${statusColor}">${p.status || 'Sin Estado'}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    const modal = document.getElementById('participants-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('participants-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function openRatingsModal() {
    // PERMISO: si es invitado, simplemente no hacer nada (sin mostrar el login)
    if (!isAuthorized()) return;
    if (!dashboardData.kpis) return;
    
    document.getElementById('modal-avg-rating').innerHTML = `${Number(dashboardData.kpis.average_rating || 0).toFixed(1)} <svg class="w-6 h-6 text-brand-primary" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>`;
    document.getElementById('modal-rating-count').innerText = dashboardData.kpis.ratings_count || 0;
    document.getElementById('modal-rating-participation').innerText = `${Number(dashboardData.kpis.rating_participation || 0).toFixed(1)}%`;
    
    if (dashboardData.ai_insights) {
        document.getElementById('ai-positive-text').innerText = dashboardData.ai_insights.positive || "No hay comentarios positivos suficientes.";
        document.getElementById('ai-improvement-text').innerText = dashboardData.ai_insights.improvement || "No se detectaron alertas críticas u oportunidades de mejora.";
    }
    
    const modal = document.getElementById('ratings-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeRatingsModal() {
    const modal = document.getElementById('ratings-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// Asegurar que los modales se cierren al hacer clic afuera
document.addEventListener('DOMContentLoaded', () => {
    const pModal = document.getElementById('participants-modal');
    if (pModal) {
        pModal.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }
    
    const rModal = document.getElementById('ratings-modal');
    if (rModal) {
        rModal.addEventListener('click', function(e) {
            if (e.target === this) closeRatingsModal();
        });
    }
});
