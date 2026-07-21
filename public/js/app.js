// =====================================================================
// IoT Мониторинг на добитък - Vanilla JS клиент
// Карта (Leaflet), графики (Chart.js), polling към Express REST API
// =====================================================================

const API = {
    animals: () => fetch("/api/animals").then(r => r.json()),
    alerts: () => fetch("/api/alerts").then(r => r.json()),
    geofence: () => fetch("/api/geofence").then(r => r.json()),
    register: (data) => fetch("/api/animals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    }).then(r => r.json()),
    simStart: () => fetch("/api/simulation/start", { method: "POST" }).then(r => r.json()),
    simStop: () => fetch("/api/simulation/stop", { method: "POST" }).then(r => r.json()),
    breach: () => fetch("/api/simulation/breach", { method: "POST" }).then(r => r.json()),
};

const TYPE_LABEL = { Sheep: "Овца", Cow: "Крава", Horse: "Кон", Goat: "Коза" };
const STATUS_LABEL = {
    NORMAL: "НОРМАЛНО", ALARM: "ТРЕВОГА", OFFLINE: "ОФЛАЙН",
    WARNING: "ВНИМАНИЕ", CRITICAL: "ИЗВЪН ЗОНАТА",
};
const COLORS = { Sheep: "#10b981", Cow: "#f59e0b", Horse: "#6366f1", Goat: "#ec4899" };

const state = {
    animals: [],
    alerts: [],
    geofence: null,
    selectedId: null,
    simulating: false, // Променяме от true на false
};

// =====================================================================
// Карта
// =====================================================================
let map, geofenceCircle;
const markers = new Map();

function makeIcon(type, critical) {
    const color = critical ? "#ef4444" : (COLORS[type] || "#64748b");
    const letter = (type || "?")[0];
    return L.divIcon({
        html: `<div style="background:${color}" class="${critical ? "pulse" : ""}">${letter}</div>`,
        className: "livestock-marker",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });
}

function initMap() {
    map = L.map("map").setView([state.geofence.lat, state.geofence.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    geofenceCircle = L.circle([state.geofence.lat, state.geofence.lng], {
        radius: state.geofence.radius,
        color: "#22c55e", weight: 2,
        fillColor: "#22c55e", fillOpacity: 0.08,
        dashArray: "6 6",
    }).addTo(map);
}

function syncMarkers() {
    const seen = new Set();
    for (const a of state.animals) {
        seen.add(a.id);
        const critical = a.status === "CRITICAL";
        const icon = makeIcon(a.type, critical);
        if (markers.has(a.id)) {
            const m = markers.get(a.id);
            m.setLatLng([a.lat, a.lng]);
            m.setIcon(icon);
            m.getPopup()?.setContent(popupHtml(a));

            // ✨ АВТОМАТИЧНО ЦЕНТРИРАНЕ: Картата следва избраното животно (ESP32 координатите)
            //if (a.id === state.selectedId) {
            //    map.setView([a.lat, a.lng], map.getZoom());
            //}
        } else {
            const m = L.marker([a.lat, a.lng], { icon })
                .addTo(map)
                .bindPopup(popupHtml(a))
                .on("click", () => { state.selectedId = a.id; renderHealth(); });
            markers.set(a.id, m);
        }
    }
    for (const [id, m] of markers) {
        if (!seen.has(id)) { map.removeLayer(m); markers.delete(id); }
    }
}

function popupHtml(a) {
    return `<div style="font-size:13px">
    <div><strong>${a.name}</strong> <span style="color:#6b7280">(${a.id})</span></div>
    <div>Вид: ${TYPE_LABEL[a.type] || a.type}</div>
    <div>Статус: ${STATUS_LABEL[a.status]}</div>
    ${a.statusReason ? `<div>Бележка: ${a.statusReason}</div>` : ""}
    <div>Батерия: ${a.battery}%</div>
    <div>Пулс: ${a.pulse ?? "—"} bpm</div>
    <div>Темп.: ${a.temperature?.toFixed?.(1) ?? "—"} °C</div>
  </div>`;
}

// =====================================================================
// Известия
// =====================================================================
function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `преди ${s}с`;
    if (s < 3600) return `преди ${Math.floor(s / 60)}мин`;
    return `преди ${Math.floor(s / 3600)}ч`;
}

function renderAlerts() {
    const list = document.getElementById("alertsList");
    document.getElementById("alertsCount").textContent = `${state.alerts.length} известия`;
    if (state.alerts.length === 0) {
        list.innerHTML = `<p class="muted" style="text-align:center;padding:1rem">Няма известия.</p>`;
        return;
    }
    list.innerHTML = state.alerts.map(a => `
    <div class="alert-item ${a.level}">
      <div class="alert-row">
        <strong>${a.animalName}</strong>
        <span class="alert-time">${timeAgo(a.ts)}</span>
      </div>
      <div class="muted" style="margin-top:.25rem">${a.message}</div>
    </div>`).join("");
}

// =====================================================================
// Таблица с животни
// =====================================================================
function renderAnimalsTable() {
    const tbody = document.querySelector("#animalsTable tbody");
    tbody.innerHTML = state.animals.map(a => {
        const lastKg = a.weightHistory[a.weightHistory.length - 1]?.kg;
        return `<tr data-id="${a.id}">
      <td><div><strong>${a.name}</strong></div><div class="id-mono">${a.id}</div></td>
      <td class="id-mono">${a.collarId}</td>
      <td>${TYPE_LABEL[a.type] || a.type}</td>
      <td>${a.battery}%</td>
      <td>${a.gsm}/5</td>
      <td>${lastKg ? lastKg.toFixed(1) + " кг" : "—"}</td>
      <td>
        <span class="status-badge status-${a.status}">${STATUS_LABEL[a.status]}</span>
        ${a.statusReason ? `<div class="muted small">${a.statusReason}</div>` : ""}
      </td>
    </tr>`;
    }).join("");
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            state.selectedId = tr.dataset.id;
            switchTab("health");
            renderHealth();
        });
    });
}

// =====================================================================
// Мониторинг (Chart.js) - Тегло / Пулс / Температура
// =====================================================================
let weightChart, pulseChart, tempChart;
const vitalsSeries = new Map(); // id -> { t:[], pulse:[], temp:[] }

function pushVitals(a) {
    let s = vitalsSeries.get(a.id);
    if (!s) { s = { t: [], pulse: [], temp: [] }; vitalsSeries.set(a.id, s); }
    s.t.push(Date.now());
    s.pulse.push(a.pulse ?? 0);
    s.temp.push(a.temperature ?? 0);
    const MAX = 40;
    if (s.t.length > MAX) { s.t.shift(); s.pulse.shift(); s.temp.shift(); }
}

function makeLineChart(canvasId, label, color) {
    return new Chart(document.getElementById(canvasId), {
        type: "line",
        data: {
            labels: [], datasets: [{
                label, data: [], borderColor: color,
                backgroundColor: color + "22",
                tension: 0.3, fill: true, pointRadius: 0,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: false } },
            plugins: { legend: { display: false } },
        },
    });
}

function renderHealth() {
    const sel = document.getElementById("healthSelect");
    sel.innerHTML = state.animals.map(a =>
        `<option value="${a.id}">${a.name} — ${TYPE_LABEL[a.type] || a.type}</option>`
    ).join("");
    if (!state.selectedId || !state.animals.some(a => a.id === state.selectedId)) {
        state.selectedId = state.animals[0]?.id;
    }
    sel.value = state.selectedId || "";
    sel.onchange = () => { state.selectedId = sel.value; renderHealth(); };

    const a = state.animals.find(x => x.id === state.selectedId);
    if (!a) return;

    const lastKg = a.weightHistory[a.weightHistory.length - 1]?.kg ?? 0;
    document.getElementById("healthStats").innerHTML = `
    <div class="stat-box"><div class="label">Статус</div><div class="value">${STATUS_LABEL[a.status]}</div></div>
    <div class="stat-box"><div class="label">Тегло (кг)</div><div class="value">${lastKg.toFixed(1)} кг</div></div>
    <div class="stat-box"><div class="label">Пулс (bpm)</div><div class="value">${a.pulse ?? "—"} bpm</div></div>
    <div class="stat-box"><div class="label">Темп. (°C)</div><div class="value">${(a.temperature ?? 0).toFixed(1)} °C</div></div>
    <div class="stat-box"><div class="label">Батерия</div><div class="value">${a.battery}%</div></div>
    <div class="stat-box"><div class="label">Сигнал</div><div class="value">${a.gsm}/5</div></div>`;

    const wLabels = a.weightHistory.map(p =>
        new Date(p.t).toLocaleDateString("bg-BG", { month: "short", day: "numeric" })
    );
    const wData = a.weightHistory.map(p => p.kg);

    if (!weightChart) weightChart = makeLineChart("weightChart", "Тегло (кг)", "#2563eb");
    weightChart.data.labels = wLabels;
    weightChart.data.datasets[0].data = wData;
    weightChart.update("none");

    const s = vitalsSeries.get(a.id) || { t: [], pulse: [], temp: [] };
    const tLabels = s.t.map(t => new Date(t).toLocaleTimeString("bg-BG", { hour12: false }));

    if (!pulseChart) pulseChart = makeLineChart("pulseChart", "Пулс (bpm)", "#ef4444");
    pulseChart.data.labels = tLabels;
    pulseChart.data.datasets[0].data = s.pulse;
    pulseChart.update("none");

    if (!tempChart) tempChart = makeLineChart("tempChart", "Темп. (°C)", "#f59e0b");
    tempChart.data.labels = tLabels;
    tempChart.data.datasets[0].data = s.temp;
    tempChart.update("none");

    const note = document.getElementById("healthNote");
    note.innerHTML = "";
    if (a.status === "WARNING") {
        note.innerHTML = `<div class="note-warning"><strong>ВНИМАНИЕ: Възможно заболяване.</strong> ${a.statusReason}</div>`;
    } else if (a.status === "CRITICAL") {
        note.innerHTML = `<div class="note-critical"><strong>ИЗВЪН ЗОНАТА: Нарушение на ограда.</strong> ${a.statusReason}</div>`;
    }
}

// =====================================================================
// Регистрация
// =====================================================================
function bindRegisterForm() {
    const form = document.getElementById("registerForm");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const payload = { name: fd.get("name"), collarId: fd.get("collarId"), type: fd.get("type") };
        const res = await API.register(payload);
        if (res.error) { alert(res.error); return; }
        form.reset();
        const status = document.getElementById("registerStatus");
        status.hidden = false;
        setTimeout(() => (status.hidden = true), 2000);
        await refreshAll();
    });
}

// =====================================================================
// Tabs
// =====================================================================
function switchTab(name) {
    document.querySelectorAll(".tab").forEach(t =>
        t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(p =>
        p.classList.toggle("active", p.id === `tab-${name}`));
    if (name === "dashboard" && map) setTimeout(() => map.invalidateSize(), 50);
    if (name === "health") renderHealth();
}

// =====================================================================
// Симулация
// =====================================================================
function bindSimulationControls() {
    const startBtn = document.getElementById("simStartBtn");
    const stopBtn = document.getElementById("simStopBtn");
    const status = document.getElementById("simStatus");

    function setSimulating(on) {
        state.simulating = on;
        startBtn.hidden = on;
        stopBtn.hidden = !on;
        status.hidden = !on;
    }
    // Сменяме това на false и казваме на сървъра да спре симулацията веднага
    setSimulating(false);

    startBtn.addEventListener("click", async () => { await API.simStart(); setSimulating(true); });
    stopBtn.addEventListener("click", async () => { await API.simStop(); setSimulating(false); });
    document.getElementById("breachBtn")
        .addEventListener("click", async () => { await API.breach(); await refreshAll(); });
}

// =====================================================================
// Refresh
// =====================================================================
async function refreshAll() {
    const [animals, alerts] = await Promise.all([API.animals(), API.alerts()]);
    state.animals = animals;
    state.alerts = alerts;
    if (!state.selectedId && animals.length) state.selectedId = animals[0].id;
    for (const a of animals) pushVitals(a);
    if (map) syncMarkers();
    renderAlerts();
    renderAnimalsTable();
    if (document.getElementById("tab-health").classList.contains("active")) renderHealth();
}

// =====================================================================
// Bootstrap
// =====================================================================
async function init() {
    state.geofence = await API.geofence();
    initMap();
    bindRegisterForm();
    bindSimulationControls();

    document.querySelectorAll(".tab").forEach(t =>
        t.addEventListener("click", () => switchTab(t.dataset.tab)));
    document.getElementById("refreshBtn").addEventListener("click", refreshAll);

    await refreshAll();
    setInterval(refreshAll, 1500);
}

document.addEventListener("DOMContentLoaded", init);