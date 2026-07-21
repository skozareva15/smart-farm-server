// =====================================================================
// In-memory store (Mongoose-подобни модели).
// Без външна MongoDB - данните живеят в паметта на процеса за демото.
// =====================================================================
const { randomUUID } = require("crypto");

// ============================================================
// Геозона (фиксирана за демото - район Пловдив)
// ============================================================
const GEOFENCE = {
    lat: 42.03857239587454, //42.03250, 
    lng: 24.314092376122726, //24.30336, 
  radius: 100, // метри
};

// ============================================================
// Утилити - Haversine формула
// ============================================================
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function randomPointInRadius(centerLat, centerLng, radiusMeters) {
  const r = radiusMeters * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  const dLat = (r * Math.cos(theta)) / 111320;
  const dLng =
    (r * Math.sin(theta)) /
    (111320 * Math.cos((centerLat * Math.PI) / 180));
  return { lat: centerLat + dLat, lng: centerLng + dLng };
}

function generateWeightHistory(baseKg) {
  const points = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const t = now - i * 24 * 60 * 60 * 1000;
    const drift = (Math.sin(i / 4) + Math.random() * 0.6 - 0.3) * 1.5;
    points.push({ t, kg: +(baseKg + drift).toFixed(2) });
  }
  return points;
}

// ============================================================
// Animal "model"
// ============================================================
const TYPE_BASE_WEIGHT = { Sheep: 65, Cow: 480, Horse: 520, Goat: 55 };
const TYPE_BASE_PULSE  = { Sheep: 75, Cow: 65,  Horse: 38,  Goat: 80 };
const TYPE_BASE_TEMP   = { Sheep: 39.1, Cow: 38.6, Horse: 37.8, Goat: 39.0 };

function makeAnimal({ name, collarId, type }) {
  const pos = randomPointInRadius(GEOFENCE.lat, GEOFENCE.lng, GEOFENCE.radius * 0.7);
  return {
    id: "AN-" + Math.floor(Math.random() * 9000 + 1000),
    name,
    collarId,
    type,
    lat: pos.lat,
    lng: pos.lng,
    battery: Math.floor(60 + Math.random() * 40),
    gsm: Math.floor(3 + Math.random() * 3),
    pulse: TYPE_BASE_PULSE[type] ?? 70,
    temperature: TYPE_BASE_TEMP[type] ?? 38.8,
    status: "NORMAL",
    statusReason: "",
    weightHistory: generateWeightHistory(TYPE_BASE_WEIGHT[type] ?? 60),
    updatedAt: Date.now(),
  };
}

// ============================================================
// State
// ============================================================
const state = {
  animals: [
    makeAnimal({ name: "Бялка",     collarId: "CLR-1001", type: "Sheep" }),
    makeAnimal({ name: "Чернушка",  collarId: "CLR-1002", type: "Sheep" }),
    makeAnimal({ name: "Рогата",    collarId: "CLR-1003", type: "Cow"   }),
    makeAnimal({ name: "Юнак",      collarId: "CLR-1004", type: "Horse" }),
    makeAnimal({ name: "Бела",      collarId: "CLR-1005", type: "Goat"  }),
  ],
  alerts: [],
};

// ============================================================
// CRUD operations
// ============================================================
const Animal = {
  find: () => state.animals,
  findById: (id) => state.animals.find((a) => a.id === id),
  create: ({ name, collarId, type }) => {
    if (!name || !collarId || !type) throw new Error("Липсват полета");
    if (!TYPE_BASE_WEIGHT[type]) throw new Error("Невалиден вид животно");
    const animal = makeAnimal({ name, collarId, type });
    state.animals.push(animal);
    return animal;
  },
  deleteById: (id) => {
    const idx = state.animals.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    state.animals.splice(idx, 1);
    return true;
  },
  updateTelemetry: (collarId, payload) => {
    const a = state.animals.find((x) => x.collarId === collarId);
    if (!a) return null;
    const { lat, lng, battery, gsm, weightKg, pulse, temperature } = payload || {};
    if (typeof lat === "number")        a.lat = lat;
    if (typeof lng === "number")        a.lng = lng;
    if (typeof battery === "number")    a.battery = battery;
    if (typeof gsm === "number")        a.gsm = gsm;
    if (typeof pulse === "number")      a.pulse = pulse;
    if (typeof temperature === "number") a.temperature = temperature;
    if (typeof weightKg === "number") {
      a.weightHistory.push({ t: Date.now(), kg: weightKg });
      if (a.weightHistory.length > 60) a.weightHistory.shift();
    }
    a.updatedAt = Date.now();
    return a;
  },
};

const Alert = {
  find: () => state.alerts,
  create: ({ animalId, animalName, level, message }) => {
    const alert = {
      id: randomUUID(),
      animalId,
      animalName,
      level, // "info" | "warning" | "critical"
      message,
      ts: Date.now(),
    };
    state.alerts.unshift(alert);
    if (state.alerts.length > 50) state.alerts.length = 50;
    return alert;
  },
  clear: () => { state.alerts.length = 0; },
};

module.exports = {
  Animal,
  Alert,
  GEOFENCE,
  haversineMeters,
  randomPointInRadius,
  TYPE_BASE_PULSE,
  TYPE_BASE_TEMP,
};
