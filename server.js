// =====================================================================
// IoT Система за мониторинг на добитък
// Монолитен Node.js + Express.js сървър
// =====================================================================
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const {
  Animal,
  Alert,
  GEOFENCE,
  haversineMeters,
  TYPE_BASE_PULSE,
  TYPE_BASE_TEMP,
} = require("./models/store");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// =====================================================================
// REST API
// =====================================================================

// --- Animals -----------------------------------------------------------
app.get("/api/animals", (_req, res) => res.json(Animal.find()));

app.get("/api/animals/:id", (req, res) => {
  const a = Animal.findById(req.params.id);
  if (!a) return res.status(404).json({ error: "Животното не е намерено" });
  res.json(a);
});

app.post("/api/animals", (req, res) => {
  try {
    const animal = Animal.create(req.body);
    res.status(201).json(animal);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/animals/:id", (req, res) => {
  const ok = Animal.deleteById(req.params.id);
  if (!ok) return res.status(404).json({ error: "Животното не е намерено" });
  res.json({ ok: true });
});

// --- Alerts ------------------------------------------------------------
app.get("/api/alerts", (_req, res) => res.json(Alert.find()));

// --- Geofence ----------------------------------------------------------
app.get("/api/geofence", (_req, res) => res.json(GEOFENCE));

// --- Telemetry (готов за реален ESP32) --------------------------------
// POST { collarId, lat, lng, battery, gsm, weightKg, pulse, temperature }
// Добавяме този ред, за да хващаме и двата адреса:
app.post("/api/update", (req, res) => {
    const updated = Animal.updateTelemetry(req.body.collarId || req.body.id, req.body);
    if (!updated) return res.status(404).json({ error: "Неизвестен нашийник" });
    evaluateAnimal(updated);
    res.json({ ok: true, animal: updated });
});

// Твоят оригинален ред (остава си под него):
app.post("/api/telemetry", (req, res) => {
    const updated = Animal.updateTelemetry(req.body.collarId || req.body.id, req.body);
    if (!updated) return res.status(404).json({ error: "Неизвестен нашийник" });
    evaluateAnimal(updated);
    res.json({ ok: true, animal: updated });
});

// =====================================================================
// Симулация (server-side, обновяване на всеки 1.5 секунди)
// =====================================================================
let simInterval = null;

function evaluateAnimal(a) {
  const distance = haversineMeters(GEOFENCE.lat, GEOFENCE.lng, a.lat, a.lng);
  const outside = distance > GEOFENCE.radius;
  const lastKg = a.weightHistory[a.weightHistory.length - 1]?.kg ?? 0;
  const prevKg = a.weightHistory[a.weightHistory.length - 8]?.kg ?? lastKg;
  const weightLossPct = ((prevKg - lastKg) / (prevKg || 1)) * 100;

  let status = "NORMAL";
  let reason = "";

  if (a.battery <= 0 || a.gsm === 0) {
    status = "OFFLINE";
    reason = "Нашийникът е офлайн — липсва обхват";
  } else if (outside) {
    status = "CRITICAL";
    const over = Math.round(distance - GEOFENCE.radius);
    reason = `Напусната геозона (${over} м от пасището)`;
  } else if (weightLossPct > 4) {
    status = "WARNING";
    reason = `Загуба на тегло ${weightLossPct.toFixed(1)}% за 7 дни`;
  } else if (a.battery < 20) {
    status = "ALARM";
    reason = "Ниска батерия";
  }

  if (status !== a.status) {
    a.status = status;
    a.statusReason = reason;
    if (status === "CRITICAL") {
      Alert.create({
        animalId: a.id, animalName: a.name,
        level: "critical", message: reason,
      });
    } else if (status === "WARNING") {
      Alert.create({
        animalId: a.id, animalName: a.name,
        level: "warning", message: reason,
      });
    } else if (status === "ALARM") {
      Alert.create({
        animalId: a.id, animalName: a.name,
        level: "warning", message: "Батерия под 20%",
      });
    } else if (status === "OFFLINE") {
      Alert.create({
        animalId: a.id, animalName: a.name,
        level: "critical", message: "Нашийникът е офлайн — липсва обхват",
      });
    }
  } else {
    a.statusReason = reason;
  }
}

function simulationTick() {
  for (const a of Animal.find()) {
    // Случайно движение ~3-8 метра
    const stepM = 3 + Math.random() * 5;
    const theta = Math.random() * 2 * Math.PI;
    a.lat += (stepM * Math.cos(theta)) / 111320;
    a.lng +=
      (stepM * Math.sin(theta)) /
      (111320 * Math.cos((a.lat * Math.PI) / 180));

    // Бавно изпразване на батерията
    if (Math.random() < 0.05) a.battery = Math.max(0, a.battery - 1);

    // Реалистична еволюция на пулс и телесна температура
    const basePulse = TYPE_BASE_PULSE[a.type] ?? 70;
    const baseTemp  = TYPE_BASE_TEMP[a.type]  ?? 38.8;
    a.pulse = Math.max(
      20,
      Math.round(((a.pulse ?? basePulse) * 0.7 + basePulse * 0.3) + (Math.random() * 6 - 3)),
    );
    a.temperature = +(
      ((a.temperature ?? baseTemp) * 0.85 + baseTemp * 0.15) + (Math.random() * 0.3 - 0.15)
    ).toFixed(1);

    // Малки колебания на теглото
    const lastKg = a.weightHistory[a.weightHistory.length - 1]?.kg ?? 0;
    const newKg = +(lastKg + (Math.random() * 0.4 - 0.2)).toFixed(2);
    a.weightHistory.push({ t: Date.now(), kg: newKg });
    if (a.weightHistory.length > 60) a.weightHistory.shift();

    a.updatedAt = Date.now();
    evaluateAnimal(a);
  }
}

app.post("/api/simulation/start", (_req, res) => {
  if (!simInterval) simInterval = setInterval(simulationTick, 1500);
  res.json({ running: true });
});

app.post("/api/simulation/stop", (_req, res) => {
  if (simInterval) { clearInterval(simInterval); simInterval = null; }
  res.json({ running: false });
});

app.post("/api/simulation/breach", (_req, res) => {
  const animals = Animal.find();
  if (animals.length === 0) return res.status(400).json({ error: "Няма животни" });
  const a = animals[Math.floor(Math.random() * animals.length)];
  const overshoot = GEOFENCE.radius + 80;
  const theta = Math.random() * 2 * Math.PI;
  a.lat = GEOFENCE.lat + (overshoot * Math.cos(theta)) / 111320;
  a.lng =
    GEOFENCE.lng +
    (overshoot * Math.sin(theta)) /
      (111320 * Math.cos((GEOFENCE.lat * Math.PI) / 180));
  evaluateAnimal(a);
  res.json({ ok: true, animal: a });
});

// =====================================================================
// HTML рутове
// =====================================================================
app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html")),
);
app.get("/dashboard", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "dashboard.html")),
);

// 404
app.use((_req, res) => res.status(404).json({ error: "Не е намерено" }));

// =====================================================================
// Стартиране на сървъра + автоматична симулация
// =====================================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  IoT Livestock Monitor`);
    console.log(`  Сървърът е стартиран на всички интерфейси (0.0.0.0) на порт: ${PORT}`);
    console.log(`  Локален достъп: http://localhost:${PORT}\n`);
  // Стартирай симулацията автоматично, за да са динамични данните при защитата.
  //simInterval = setInterval(simulationTick, 1500);
});
