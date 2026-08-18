import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "/config.js";

const $ = id => document.getElementById(id);
const nowIso = () => new Date().toISOString();
const uuid = () => {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};
const clone = value => structuredClone(value);

const keys = {
  activities: "stolen-minutes-ledger-v2",
  fragments: "stolen-minutes-fragments-v1",
  active: "stolen-minutes-active-v1",
  health: "stolen-minutes-health-v1",
  foods: "stolen-minutes-foods-v1",
  deletedHealth: "stolen-minutes-deleted-health-v1",
  deletedFoods: "stolen-minutes-deleted-foods-v1",
  deletedFragments: "stolen-minutes-deleted-fragments-v1"
};

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

let localWriteFailed = false;
const saveLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    localWriteFailed = true;
    console.warn("Local storage write failed", error);
    return false;
  }
};

const removeLocal = key => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("Local storage removal failed", error);
  }
};

const DB_NAME = "stolen-minutes-durable-v1";
const DB_STORE = "state";
let dbPromise = null;
let durableWrite = Promise.resolve();

function openDb() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise(resolve => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      console.warn("IndexedDB unavailable", error);
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("IndexedDB unavailable", request.error);
      resolve(null);
    };
  });

  return dbPromise;
}

async function dbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

async function dbPut(key, value) {
  const db = await openDb();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.warn("IndexedDB write failed", tx.error);
      localWriteFailed = true;
      resolve();
    };
  });
}

let activities = load(keys.activities, []);
let fragments = load(keys.fragments, []);
let active = load(keys.active, null);
let health = load(keys.health, []);
let foods = load(keys.foods, []);
let deletedHealth = load(keys.deletedHealth, []);
let deletedFoods = load(keys.deletedFoods, []);
let deletedFragments = load(keys.deletedFragments, []);
let mealDraft = [];
let session = null;
let syncing = false;
let ticker = null;
let recognition = null;
let captureMode = null;
let captureStartedAt = null;
let captureTranscript = "";
let captureHandled = false;
let storageCheckAt = 0;

const configured = SUPABASE_URL?.startsWith("https://") &&
  SUPABASE_PUBLISHABLE_KEY &&
  !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
})[char]);

const pad = number => String(number).padStart(2, "0");
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localInput = iso => {
  const date = iso ? new Date(iso) : new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const duration = milliseconds => {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`;
};
const elapsed = milliseconds => {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setMode(mode) {
  document.querySelectorAll(".view").forEach(view => {
    view.hidden = view.id !== `${mode}View`;
  });
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });
  if (mode === "diabetes") renderHealth();
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => setMode(tab.dataset.mode);
});

function cloud(message, state = "") {
  $("cloudStatus").textContent = message;
  $("dot").className = `dot ${state}`;
}

function renderAuth() {
  $("signedOut").hidden = !!session;
  $("signedIn").hidden = !session;
  $("account").textContent = session?.user?.email || "Signed in";

  if (!configured) cloud("Supabase is not configured.", "warn");
  else if (!navigator.onLine) cloud("Offline. New records remain safe on this device.", "warn");
  else if (session) cloud("Signed in. Database sync is active.", "ok");
  else cloud("Sign in to sync records privately across devices.");
}

async function login() {
  const email = $("email").value.trim();
  if (!email) return cloud("Enter your email.", "warn");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin }
  });
  cloud(error ? error.message : "Check your email for the login link.", error ? "warn" : "ok");
}

function merge(local, remote) {
  const map = new Map(local.map(item => [item.id, item]));
  remote.forEach(item => {
    const existing = map.get(item.id);
    if (!existing || new Date(item.updatedAt) >= new Date(existing.updatedAt)) {
      map.set(item.id, item);
    }
  });
  return [...map.values()];
}

async function syncDeleteQueue(table, ids) {
  if (!ids.length) return [];
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw error;
  return [];
}

async function syncCloud() {
  if (!supabase || !session || syncing || !navigator.onLine) return;
  syncing = true;
  cloud("Syncing…");

  try {
    const uid = session.user.id;

    deletedHealth = await syncDeleteQueue("health_events", deletedHealth);
    deletedFoods = await syncDeleteQueue("foods", deletedFoods);
    deletedFragments = await syncDeleteQueue("fragments", deletedFragments);
    await persist();

    if (activities.length) {
      const { error } = await supabase.from("activities").upsert(activities.map(item => ({
        id: item.id,
        user_id: uid,
        activity: item.activity,
        started_at: item.startedAt,
        ended_at: item.endedAt,
        elapsed_ms: item.elapsedMs,
        updated_at: item.updatedAt || item.endedAt
      })));
      if (error) throw error;
    }

    if (fragments.length) {
      const { error } = await supabase.from("fragments").upsert(fragments.map(item => ({
        id: item.id,
        user_id: uid,
        fragment_code: item.fragmentCode,
        title: item.title,
        body: item.body,
        tags: item.tags,
        created_at: item.createdAt,
        updated_at: item.updatedAt
      })));
      if (error) throw error;
    }

    if (health.length) {
      const { error } = await supabase.from("health_events").upsert(health.map(item => ({
        id: item.id,
        user_id: uid,
        event_type: item.type,
        occurred_at: item.occurredAt,
        value_numeric: item.value ?? null,
        unit: item.unit || null,
        context: item.context || null,
        notes: item.notes || null,
        details: item.details || {},
        updated_at: item.updatedAt
      })));
      if (error) throw error;
    }

    if (foods.length) {
      const { error } = await supabase.from("foods").upsert(foods.map(item => ({
        id: item.id,
        user_id: uid,
        canonical_name: item.name,
        aliases: item.aliases || [],
        preferred_portion: item.portion || null,
        carbs_g: item.carbs === "" || item.carbs == null ? null : Number(item.carbs),
        usage_count: item.usageCount || 0,
        last_used_at: item.lastUsedAt || null,
        updated_at: item.updatedAt
      })));
      if (error) throw error;
    }

    const [activityResult, fragmentResult, healthResult, foodResult] = await Promise.all([
      supabase.from("activities").select("*"),
      supabase.from("fragments").select("*"),
      supabase.from("health_events").select("*"),
      supabase.from("foods").select("*")
    ]);

    for (const result of [activityResult, fragmentResult, healthResult, foodResult]) {
      if (result.error) throw result.error;
    }

    activities = merge(activities, activityResult.data.map(row => ({
      id: row.id,
      activity: row.activity,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      elapsedMs: Number(row.elapsed_ms),
      updatedAt: row.updated_at
    })));

    fragments = merge(fragments, fragmentResult.data
      .filter(row => !deletedFragments.includes(row.id))
      .map(row => ({
        id: row.id,
        fragmentCode: row.fragment_code,
        title: row.title,
        body: row.body,
        tags: row.tags || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })));

    health = merge(health, healthResult.data
      .filter(row => !deletedHealth.includes(row.id))
      .map(row => ({
        id: row.id,
        type: row.event_type,
        occurredAt: row.occurred_at,
        value: row.value_numeric,
        unit: row.unit,
        context: row.context,
        notes: row.notes,
        details: row.details || {},
        updatedAt: row.updated_at
      })));

    foods = merge(foods, foodResult.data
      .filter(row => !deletedFoods.includes(row.id))
      .map(row => ({
        id: row.id,
        name: row.canonical_name,
        aliases: row.aliases || [],
        portion: row.preferred_portion || "",
        carbs: row.carbs_g ?? "",
        usageCount: row.usage_count || 0,
        lastUsedAt: row.last_used_at,
        updatedAt: row.updated_at,
        source: "personal"
      })));

    await persist();
    renderAll();
    cloud(`Synced ${activities.length + fragments.length + health.length + foods.length} records.`, "ok");
    setCaptureStatus("Saved on this device and synced to the database.", "ok");
  } catch (error) {
    cloud(`Sync failed: ${error.message}`, "warn");
    setCaptureStatus("Saved on this device. Database sync will retry when available.", "warn");
  } finally {
    syncing = false;
  }
}

function persist() {
  localWriteFailed = false;
  saveLocal(keys.activities, activities);
  saveLocal(keys.fragments, fragments);
  saveLocal(keys.health, health);
  saveLocal(keys.foods, foods);
  saveLocal(keys.deletedHealth, deletedHealth);
  saveLocal(keys.deletedFoods, deletedFoods);
  saveLocal(keys.deletedFragments, deletedFragments);
  if (active) saveLocal(keys.active, active);
  else removeLocal(keys.active);

  const snapshot = {
    activities: clone(activities),
    fragments: clone(fragments),
    health: clone(health),
    foods: clone(foods),
    deletedHealth: clone(deletedHealth),
    deletedFoods: clone(deletedFoods),
    deletedFragments: clone(deletedFragments),
    active: active ? clone(active) : null
  };

  durableWrite = durableWrite
    .then(() => Promise.all([
      dbPut(keys.activities, snapshot.activities),
      dbPut(keys.fragments, snapshot.fragments),
      dbPut(keys.health, snapshot.health),
      dbPut(keys.foods, snapshot.foods),
      dbPut(keys.deletedHealth, snapshot.deletedHealth),
      dbPut(keys.deletedFoods, snapshot.deletedFoods),
      dbPut(keys.deletedFragments, snapshot.deletedFragments),
      dbPut(keys.active, snapshot.active)
    ]))
    .then(() => checkStoragePressure())
    .catch(error => {
      localWriteFailed = true;
      console.warn("Durable write failed", error);
      showStorageWarning("This device could not save reliably. Export your health records now.");
    });

  if (localWriteFailed) {
    showStorageWarning("This device could not save reliably. Export your health records now.");
  }

  return durableWrite;
}

async function hydrateDurableState() {
  const [a, f, h, fd, dh, df, dfr, ac] = await Promise.all([
    dbGet(keys.activities),
    dbGet(keys.fragments),
    dbGet(keys.health),
    dbGet(keys.foods),
    dbGet(keys.deletedHealth),
    dbGet(keys.deletedFoods),
    dbGet(keys.deletedFragments),
    dbGet(keys.active)
  ]);

  if (Array.isArray(a)) activities = merge(activities, a);
  if (Array.isArray(f)) fragments = merge(fragments, f);
  if (Array.isArray(h)) health = merge(health, h);
  if (Array.isArray(fd)) foods = merge(foods, fd);
  if (Array.isArray(dh)) deletedHealth = [...new Set([...deletedHealth, ...dh])];
  if (Array.isArray(df)) deletedFoods = [...new Set([...deletedFoods, ...df])];
  if (Array.isArray(dfr)) deletedFragments = [...new Set([...deletedFragments, ...dfr])];
  if (ac && (!active || new Date(ac.startedAt) >= new Date(active.startedAt))) active = ac;

  health = health.filter(item => !deletedHealth.includes(item.id));
  foods = foods.filter(item => !deletedFoods.includes(item.id));
  fragments = fragments.filter(item => !deletedFragments.includes(item.id));
  await persist();
}

function appDataBytes() {
  return new Blob([JSON.stringify({ activities, fragments, health, foods })]).size;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function showStorageWarning(message) {
  $("storageWarning").hidden = false;
  $("storageWarningText").textContent = message;
}

async function checkStoragePressure(force = false) {
  if (!force && Date.now() - storageCheckAt < 60000) return;
  storageCheckAt = Date.now();

  if (localWriteFailed) {
    showStorageWarning("Local storage writes are failing. Export your records now.");
    return;
  }

  if (!navigator.storage?.estimate) return;

  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return;
    const ratio = usage / quota;
    const remaining = quota - usage;
    const appSize = appDataBytes();
    $("storageDetails").textContent = `Browser storage: ${Math.round(ratio * 100)}% used. App records: ${formatBytes(appSize)}.`;

    if (ratio >= 0.8 || remaining < 20 * 1024 * 1024) {
      showStorageWarning(`Device storage for this PWA is getting low (${Math.round(ratio * 100)}% used). Export your health records now.`);
    }
  } catch (error) {
    console.warn("Storage estimate unavailable", error);
  }
}

// Timer
function renderTimer() {
  if (active) {
    $("record").textContent = "STOP";
    $("record").classList.add("running");
    $("activityLabel").textContent = active.activity || "Name the activity";
    clearInterval(ticker);
    ticker = setInterval(() => {
      $("timer").textContent = elapsed(Date.now() - new Date(active.startedAt));
    }, 500);
  } else {
    $("record").textContent = "START";
    $("record").classList.remove("running");
    $("activityLabel").textContent = "Press, then name the activity";
    $("timer").textContent = "00:00:00";
    clearInterval(ticker);
  }

  const today = dateKey(new Date());
  const items = activities
    .filter(item => dateKey(new Date(item.startedAt)) === today)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  $("todayTotal").textContent = duration(items.reduce((sum, item) => sum + item.elapsedMs, 0));
  const weekCutoff = Date.now() - 7 * 86400000;
  const weekly = activities.filter(item => new Date(item.startedAt).getTime() >= weekCutoff);
  const byActivity = weekly.reduce((map, item) => map.set(item.activity, (map.get(item.activity) || 0) + item.elapsedMs), new Map());
  const top = [...byActivity.entries()].sort((a, b) => b[1] - a[1])[0];
  $("weekTimeTotal").textContent = duration(weekly.reduce((sum, item) => sum + item.elapsedMs, 0));
  $("weekTopActivity").textContent = top ? `Most recorded: ${top[0]} · ${duration(top[1])}` : "No completed time entries this week.";
  $("activityList").innerHTML = items.length
    ? items.map(item => `
      <div class="item">
        <div class="item-head">
          <span class="item-title">${esc(item.activity)}</span>
          <strong>${duration(item.elapsedMs)}</strong>
        </div>
        <div class="meta">${new Date(item.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
      </div>`).join("")
    : '<div class="empty">No entries today.</div>';
}

$("record").onclick = async () => {
  if (active) {
    activities.push({
      id: active.id,
      activity: active.activity || "Unlabelled activity",
      startedAt: active.startedAt,
      endedAt: nowIso(),
      elapsedMs: Date.now() - new Date(active.startedAt),
      updatedAt: nowIso()
    });
    active = null;
    await persist();
    renderTimer();
    syncCloud();
  } else {
    active = { id: uuid(), activity: "", startedAt: nowIso() };
    await persist();
    $("activityFallback").hidden = false;
    renderTimer();
    $("activityInput").focus();
  }
};

$("applyActivity").onclick = async () => {
  if (active && $("activityInput").value.trim()) {
    active.activity = $("activityInput").value.trim();
    await persist();
    $("activityFallback").hidden = true;
    $("activityInput").value = "";
    renderTimer();
  }
};

// Fragments
function renderFragments() {
  $("fragmentList").innerHTML = fragments.length
    ? [...fragments]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(fragment => `
        <article class="item">
          <div class="item-title">${esc(fragment.fragmentCode)} — ${esc(fragment.title)}</div>
          <div class="fragment-body">${esc(fragment.body)}</div>
          <div class="meta">${esc((fragment.tags || []).join(", "))}</div>
          <div class="toolbar"><button class="btn danger" data-del-fragment="${fragment.id}">Delete</button></div>
        </article>`).join("")
    : '<div class="empty">No fragments yet.</div>';
}

$("exportFragmentDraft").onclick = () => {
  const body = $("fragmentBody").value.trim();
  if (!body) return;
  download(`quiet-timer-fragment-${dateKey(new Date())}.json`, "application/json", JSON.stringify({
    schema: "bloody-daves/suite-transfer/v1",
    kind: "fragment-draft",
    source: "quiet-timer",
    createdAt: nowIso(),
    payload: { title: $("fragmentTitle").value.trim() || "Quiet Timer note", body, tags: $("fragmentTags").value.split(",").map(value => value.trim()).filter(Boolean) }
  }, null, 2));
};

$("fragmentForm").onsubmit = async event => {
  event.preventDefault();
  const number = fragments.length + 1;
  fragments.push({
    id: uuid(),
    fragmentCode: `F${String(number).padStart(3, "0")}`,
    title: $("fragmentTitle").value.trim() || "Untitled fragment",
    body: $("fragmentBody").value.trim(),
    tags: $("fragmentTags").value.split(",").map(value => value.trim()).filter(Boolean),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  event.target.reset();
  await persist();
  renderFragments();
  syncCloud();
};

$("fragmentList").onclick = async event => {
  const id = event.target.dataset.delFragment;
  if (!id || !confirm("Delete this fragment?")) return;
  fragments = fragments.filter(item => item.id !== id);
  deletedFragments = [...new Set([...deletedFragments, id])];
  await persist();
  renderFragments();
  syncCloud();
};

// Diabetes rapid capture
const commonFoods = [
  { name: "toast", aliases: ["bread", "slice of bread"], portion: "1 slice", carbs: 15 },
  { name: "banana", aliases: ["bananas"], portion: "1 medium", carbs: 23 },
  { name: "apple", aliases: ["apples"], portion: "1 medium", carbs: 19 },
  { name: "orange", aliases: ["oranges"], portion: "1 medium", carbs: 15 },
  { name: "rice", aliases: ["cooked rice"], portion: "1 cup", carbs: 45 },
  { name: "pasta", aliases: ["spaghetti", "noodles"], portion: "1 cup cooked", carbs: 43 },
  { name: "potato", aliases: ["potatoes", "baked potato"], portion: "1 medium", carbs: 37 },
  { name: "porridge", aliases: ["oats", "oatmeal"], portion: "1 cup cooked", carbs: 27 },
  { name: "milk", aliases: ["cup of milk"], portion: "1 cup", carbs: 12 },
  { name: "yoghurt", aliases: ["yogurt"], portion: "1 tub", carbs: 12 },
  { name: "egg", aliases: ["eggs"], portion: "1 egg", carbs: 0.6 },
  { name: "cereal", aliases: ["breakfast cereal"], portion: "1 bowl", carbs: 30 },
  { name: "sandwich", aliases: ["sandwiches"], portion: "1 sandwich", carbs: 30 },
  { name: "pizza", aliases: ["slice of pizza"], portion: "1 slice", carbs: 36 },
  { name: "fruit juice", aliases: ["juice", "orange juice", "apple juice"], portion: "1 cup", carbs: 26 },
  { name: "biscuit", aliases: ["biscuits", "cookie", "cookies"], portion: "1", carbs: 10 },
  { name: "chips", aliases: ["crisps", "potato chips"], portion: "1 small packet", carbs: 25 },
  { name: "coffee", aliases: ["black coffee"], portion: "1 cup", carbs: 0 },
  { name: "tea", aliases: ["black tea"], portion: "1 cup", carbs: 0 }
];

const numberWords = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5
};

function setCaptureStatus(message, state = "") {
  $("captureStatus").textContent = message;
  $("captureStatus").className = `capture-status ${state}`;
}

function openCaptureDialog(mode) {
  captureMode = mode;
  captureStartedAt = new Date();
  captureTranscript = "";
  captureHandled = false;
  $("captureText").value = "";
  $("captureDialogTitle").textContent = mode === "glucose"
    ? "Speak glucose reading"
    : mode === "food"
      ? "Speak food"
      : "Speak event and time";
  $("captureDialogHint").textContent = mode === "event"
    ? 'Example: “I had a hypo at 3am.” The spoken time is used.'
    : "The time is captured when you pressed the button.";
  $("captureDialog").showModal();
  startRecognition();
}

function startRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $("captureListening").textContent = "Speech recognition is unavailable here. Type the words, then press Save.";
    $("captureText").focus();
    return;
  }

  if (recognition) {
    try { recognition.abort(); } catch {}
  }

  recognition = new Recognition();
  recognition.lang = "en-AU";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  $("captureListening").textContent = "Listening…";

  recognition.onresult = event => {
    let text = "";
    for (let index = 0; index < event.results.length; index += 1) {
      text += `${event.results[index][0].transcript} `;
    }
    captureTranscript = text.trim();
    $("captureText").value = captureTranscript;
  };

  recognition.onerror = event => {
    $("captureListening").textContent = event.error === "not-allowed"
      ? "Microphone permission was denied. Type the words, then press Save."
      : "Speech stopped. Type or correct the words, then press Save.";
  };

  recognition.onend = async () => {
    if (captureHandled) return;
    const text = $("captureText").value.trim();
    if (!text) {
      $("captureListening").textContent = "Nothing was heard. Tap Try again or type the words.";
      return;
    }
    $("captureListening").textContent = "Saving…";
    captureHandled = true;
    const saved = await saveSpokenCapture(captureMode, text, captureStartedAt);
    if (!saved) captureHandled = false;
    if (saved && $("captureDialog").open) $("captureDialog").close();
  };

  try {
    recognition.start();
  } catch (error) {
    console.warn("Speech recognition failed to start", error);
    $("captureListening").textContent = "Type the words, then press Save.";
  }
}

function parseGlucose(text) {
  const match = text.replace(/,/g, ".").match(/(?:glucose|sugar|bgl|reading|is|was|at)?\s*(\d{1,3}(?:\.\d+)?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 50) return null;
  const context = /fast/i.test(text)
    ? "fasting"
    : /before/i.test(text)
      ? "before meal"
      : /after/i.test(text)
        ? "after meal"
        : /bed/i.test(text)
          ? "bedtime"
          : "unspecified";
  return { value, context };
}

function quantityFromText(text) {
  const numeric = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (numeric) return Number(numeric[1]);
  const word = Object.keys(numberWords).find(key => new RegExp(`\\b${key}\\b`, "i").test(text));
  return word ? numberWords[word] : 1;
}

function normaliseFoodPhrase(text) {
  return text
    .toLowerCase()
    .replace(/\b(i|we)\s+(ate|had|have|eaten)\b/g, "")
    .replace(/\b(for|at)\s+(breakfast|lunch|dinner|tea|snack)\b/g, "")
    .replace(/\b(approximately|about|roughly)\b/g, "")
    .replace(/[.?!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsFoodTerm(text, term) {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)${escaped}(?:$|\\b)`, "i").test(text);
}

function matchPersonalFood(segment) {
  return foods.find(food => {
    const terms = [food.name, ...(food.aliases || [])];
    return terms.some(term => containsFoodTerm(segment, term));
  });
}

function matchCommonFood(segment) {
  return commonFoods.find(food => [food.name, ...food.aliases].some(term => containsFoodTerm(segment, term)));
}

function findOrCreateFood(name, reference = null) {
  const cleaned = name.trim();
  const lower = cleaned.toLowerCase();
  const found = foods.find(food => food.name.toLowerCase() === lower ||
    (food.aliases || []).some(alias => alias.toLowerCase() === lower));
  if (found) return found;

  const food = {
    id: uuid(),
    name: reference?.name || cleaned.replace(/^\d+(?:\.\d+)?\s*/, "").trim(),
    aliases: reference?.aliases || [],
    portion: reference?.portion || "1 serving",
    carbs: reference?.carbs ?? "",
    usageCount: 0,
    lastUsedAt: null,
    updatedAt: nowIso(),
    source: reference ? "common reference" : "spoken entry"
  };
  foods.push(food);
  return food;
}

function parseFoodItems(text) {
  const cleaned = normaliseFoodPhrase(text);
  const segments = cleaned.split(/,|\band\b|\bplus\b|\bwith\b/).map(value => value.trim()).filter(Boolean);
  const sourceSegments = segments.length ? segments : [cleaned];

  return sourceSegments.map(segment => {
    const quantity = quantityFromText(segment);
    let food = matchPersonalFood(segment);
    let source = "personal memory";

    if (!food) {
      const reference = matchCommonFood(segment);
      if (reference) {
        food = findOrCreateFood(reference.name, reference);
        source = "common reference";
      } else {
        food = findOrCreateFood(segment);
        source = "needs review";
      }
    }

    food.usageCount = (food.usageCount || 0) + 1;
    food.lastUsedAt = nowIso();
    food.updatedAt = nowIso();

    const baseCarbs = food.carbs === "" || food.carbs == null ? null : Number(food.carbs);
    const carbs = Number.isFinite(baseCarbs) ? Number((baseCarbs * quantity).toFixed(1)) : null;

    return {
      foodId: food.id,
      name: food.name,
      quantity,
      portion: quantity === 1 ? food.portion || "1 serving" : `${quantity} × ${food.portion || "serving"}`,
      carbs,
      source
    };
  }).filter(item => item.name);
}

function parseSpokenEventTime(text, referenceDate) {
  const base = new Date(referenceDate);
  let date = new Date(base);
  let matchedPhrase = "";
  let explicitDay = false;

  const ago = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|half)\s+(minute|minutes|hour|hours|day|days)\s+ago\b/i);
  if (ago) {
    const amount = Number(ago[1]) || numberWords[ago[1].toLowerCase()] || 1;
    const unit = ago[2].toLowerCase();
    const milliseconds = unit.startsWith("minute")
      ? amount * 60000
      : unit.startsWith("hour")
        ? amount * 3600000
        : amount * 86400000;
    return { date: new Date(base.getTime() - milliseconds), phrase: ago[0] };
  }

  if (/\byesterday\b/i.test(text)) {
    date.setDate(date.getDate() - 1);
    matchedPhrase = "yesterday";
    explicitDay = true;
  } else if (/\blast night\b/i.test(text)) {
    date.setDate(date.getDate() - (base.getHours() < 12 ? 1 : 0));
    matchedPhrase = "last night";
    explicitDay = true;
  } else {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const weekdayIndex = weekdays.findIndex(day => new RegExp(`\\b(?:last\\s+)?${day}\\b`, "i").test(text));
    if (weekdayIndex >= 0) {
      let difference = (base.getDay() - weekdayIndex + 7) % 7;
      if (difference === 0 || new RegExp(`\\blast\\s+${weekdays[weekdayIndex]}\\b`, "i").test(text)) difference ||= 7;
      date.setDate(date.getDate() - difference);
      matchedPhrase = weekdays[weekdayIndex];
      explicitDay = true;
    }
  }

  const time = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (time) {
    let hour = Number(time[1]);
    const minute = Number(time[2] || 0);
    const meridiem = time[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (!meridiem && hour <= 7 && /\b(night|overnight|early morning|morning)\b/i.test(text)) {
      // Keep early hours as morning.
    }
    date.setHours(hour, minute, 0, 0);
    matchedPhrase = `${matchedPhrase}${matchedPhrase ? " " : ""}${time[0]}`.trim();

    if (!explicitDay && date.getTime() > base.getTime() + 5 * 60000) {
      date.setDate(date.getDate() - 1);
    }
  }

  if (!time && !matchedPhrase) return { date: base, phrase: "current time (no spoken time found)" };
  return { date, phrase: matchedPhrase || "spoken time" };
}

async function saveSpokenCapture(mode, text, pressedAt) {
  const timestamp = pressedAt || new Date();
  let event;

  if (mode === "glucose") {
    const parsed = parseGlucose(text);
    if (!parsed) {
      $("captureListening").textContent = "No valid glucose number was found. Say or type a value such as 6.8.";
      return false;
    }
    event = {
      id: uuid(),
      type: "glucose",
      occurredAt: timestamp.toISOString(),
      value: parsed.value,
      unit: "mmol/L",
      context: parsed.context,
      notes: text,
      details: { transcript: text, capture: "speech", timestampSource: "button press" },
      updatedAt: nowIso()
    };
  } else if (mode === "food") {
    const items = parseFoodItems(text);
    if (!items.length) {
      $("captureListening").textContent = "No food was identified. Say or type the meal again.";
      return false;
    }
    const known = items.filter(item => Number.isFinite(item.carbs));
    const totalCarbs = Number(known.reduce((sum, item) => sum + item.carbs, 0).toFixed(1));
    event = {
      id: uuid(),
      type: "meal",
      occurredAt: timestamp.toISOString(),
      value: known.length ? totalCarbs : null,
      unit: known.length ? "g carbohydrate" : null,
      context: null,
      notes: text,
      details: {
        transcript: text,
        capture: "speech",
        timestampSource: "button press",
        items,
        totalCarbs: known.length ? totalCarbs : null,
        carbohydrateStatus: known.length === items.length ? "estimated" : known.length ? "partial estimate" : "needs review"
      },
      updatedAt: nowIso()
    };
  } else {
    const interpreted = parseSpokenEventTime(text, timestamp);
    event = {
      id: uuid(),
      type: "event",
      occurredAt: interpreted.date.toISOString(),
      value: null,
      unit: null,
      context: null,
      notes: text,
      details: {
        transcript: text,
        capture: "speech",
        timestampSource: "transcription",
        interpretedTimePhrase: interpreted.phrase,
        recordedAt: timestamp.toISOString()
      },
      updatedAt: nowIso()
    };
  }

  health.push(event);
  await persist();
  renderHealth();

  const summary = mode === "food"
    ? event.details.totalCarbs == null
      ? "Food saved. Carbohydrates need review."
      : `Food saved with ${event.details.totalCarbs} g estimated carbohydrate.`
    : mode === "event"
      ? `Event saved at ${new Date(event.occurredAt).toLocaleString()}.`
      : `Glucose ${event.value} mmol/L saved.`;

  setCaptureStatus(`${summary} Stored on this device.`, event.details?.carbohydrateStatus === "needs review" ? "warn" : "ok");
  await syncCloud();
  return true;
}

$("glucoseCapture").onclick = () => openCaptureDialog("glucose");
$("foodCapture").onclick = () => openCaptureDialog("food");
$("eventCapture").onclick = () => openCaptureDialog("event");
$("captureRetry").onclick = () => {
  captureHandled = false;
  startRecognition();
};
$("captureCancel").onclick = () => {
  captureHandled = true;
  if (recognition) {
    try { recognition.abort(); } catch {}
  }
  $("captureDialog").close();
};
$("captureForm").onsubmit = async event => {
  event.preventDefault();
  if (captureHandled) return;
  const text = $("captureText").value.trim();
  if (!text) return;
  captureHandled = true;
  if (recognition) {
    try { recognition.abort(); } catch {}
  }
  const saved = await saveSpokenCapture(captureMode, text, captureStartedAt);
  if (!saved) captureHandled = false;
  if (saved) $("captureDialog").close();
};

// Manual/edit form
function switchHealthFields() {
  const type = $("healthType").value;
  $("glucoseFields").hidden = type !== "glucose";
  $("mealFields").hidden = type !== "meal";
  $("eventFields").hidden = type !== "event";
}

$("healthType").onchange = switchHealthFields;

function renderMealDraft() {
  $("mealItems").innerHTML = mealDraft.map((item, index) => `
    <div class="food-row">
      <strong>${esc(item.name)}</strong>
      <input class="field" data-portion="${index}" value="${esc(item.portion)}">
      <input class="field food-carbs" type="number" step="0.1" min="0" data-carbs="${index}" value="${esc(item.carbs ?? "")}" placeholder="carbs g">
      <button class="btn danger" type="button" data-remove-food="${index}">×</button>
    </div>`).join("");
}

function renderFoodSuggestions() {
  const query = $("foodSearch").value.toLowerCase();
  const matches = [...foods]
    .filter(food => !query || food.name.toLowerCase().includes(query) ||
      (food.aliases || []).some(alias => alias.toLowerCase().includes(query)))
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    .slice(0, 6);
  $("foodSuggestions").innerHTML = matches
    .map(food => `<button type="button" data-add-food="${food.id}">${esc(food.name)}</button>`)
    .join("");
}

function addFoodToDraft(food) {
  mealDraft.push({
    foodId: food.id,
    name: food.name,
    portion: food.portion || "1 serving",
    carbs: food.carbs === "" ? null : food.carbs,
    source: "personal memory"
  });
  food.usageCount = (food.usageCount || 0) + 1;
  food.lastUsedAt = nowIso();
  food.updatedAt = nowIso();
  persist();
  renderFoodSuggestions();
}

$("foodSearch").oninput = renderFoodSuggestions;
$("addFood").onclick = () => {
  const name = $("foodSearch").value.trim();
  if (!name) return;
  addFoodToDraft(findOrCreateFood(name));
  $("foodSearch").value = "";
  renderMealDraft();
  renderFoodSuggestions();
};
$("foodSuggestions").onclick = event => {
  const food = foods.find(item => item.id === event.target.dataset.addFood);
  if (!food) return;
  addFoodToDraft(food);
  renderMealDraft();
};
$("mealItems").oninput = event => {
  const index = Number(event.target.dataset.portion ?? event.target.dataset.carbs);
  if (event.target.dataset.portion !== undefined) mealDraft[index].portion = event.target.value;
  if (event.target.dataset.carbs !== undefined) mealDraft[index].carbs = event.target.value === "" ? null : Number(event.target.value);
};
$("mealItems").onclick = event => {
  if (event.target.dataset.removeFood === undefined) return;
  mealDraft.splice(Number(event.target.dataset.removeFood), 1);
  renderMealDraft();
};

function resetHealthForm() {
  $("healthForm").reset();
  $("healthId").value = "";
  $("healthTime").value = localInput();
  mealDraft = [];
  renderMealDraft();
  $("manualCard").hidden = true;
  $("healthFormTitle").textContent = "Edit record";
}

$("showManual").onclick = () => {
  $("manualCard").hidden = false;
  $("healthTime").value = localInput();
  switchHealthFields();
  $("manualCard").scrollIntoView({ behavior: "smooth" });
};
$("cancelHealth").onclick = resetHealthForm;

$("healthForm").onsubmit = async event => {
  event.preventDefault();
  const id = $("healthId").value || uuid();
  const type = $("healthType").value;
  const existing = health.find(item => item.id === id);
  const items = clone(mealDraft);
  const knownCarbs = items.filter(item => item.carbs !== null && item.carbs !== "" && Number.isFinite(Number(item.carbs)));
  const totalCarbs = knownCarbs.length
    ? Number(knownCarbs.reduce((sum, item) => sum + Number(item.carbs), 0).toFixed(1))
    : null;

  const record = {
    id,
    type,
    occurredAt: new Date($("healthTime").value).toISOString(),
    value: type === "glucose"
      ? Number($("glucoseValue").value)
      : type === "meal"
        ? totalCarbs
        : null,
    unit: type === "glucose" ? "mmol/L" : type === "meal" && totalCarbs != null ? "g carbohydrate" : null,
    context: type === "glucose" ? $("glucoseContext").value : null,
    notes: $("healthNotes").value.trim(),
    details: type === "meal"
      ? { ...(existing?.details || {}), items, totalCarbs }
      : type === "event"
        ? { ...(existing?.details || {}), timestampSource: "manually edited" }
        : existing?.details || {},
    updatedAt: nowIso()
  };

  health = health.filter(item => item.id !== id);
  health.push(record);
  await persist();
  resetHealthForm();
  renderHealth();
  setCaptureStatus("Record saved on this device.", "ok");
  await syncCloud();
};

function eventSummary(event) {
  if (event.type === "glucose") {
    return `<strong>${esc(event.value ?? "—")} mmol/L</strong>${event.context && event.context !== "unspecified" ? ` · ${esc(event.context)}` : ""}`;
  }
  if (event.type === "meal") {
    const total = event.details?.totalCarbs ?? event.value;
    return `<strong>Food${total != null ? ` · ${esc(total)} g estimated carbohydrate` : " · carbohydrate review needed"}</strong>
      <div>${(event.details?.items || []).map(item => `<span class="pill">${esc(item.name)}${item.carbs != null && item.carbs !== "" ? ` · ${esc(item.carbs)}g` : " · ?"}</span>`).join("")}</div>`;
  }
  if (event.type === "event") {
    return `<strong>Event</strong>${event.details?.interpretedTimePhrase ? `<div class="meta">Time from speech: ${esc(event.details.interpretedTimePhrase)}</div>` : ""}`;
  }
  return `<strong>${esc(event.type[0].toUpperCase() + event.type.slice(1))}</strong>`;
}

function sevenDaySummary() {
  const cutoff = Date.now() - 7 * 86400000;
  const recent = health.filter(item => new Date(item.occurredAt).getTime() >= cutoff);
  const glucose = recent.filter(item => item.type === "glucose" && Number.isFinite(Number(item.value))).map(item => Number(item.value));
  const meals = recent.filter(item => item.type === "meal");
  const carbTotal = meals.reduce((sum, item) => sum + (Number(item.details?.totalCarbs ?? item.value) || 0), 0);
  return {
    average: glucose.length ? (glucose.reduce((sum, value) => sum + value, 0) / glucose.length).toFixed(1) : "—",
    readings: glucose.length,
    carbs: Number(carbTotal.toFixed(1))
  };
}

function renderHealth() {
  const sorted = [...health].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const latest = sorted.find(item => item.type === "glucose" && item.value != null);
  const summary = sevenDaySummary();

  $("latestGlucose").textContent = latest ? latest.value : "—";
  $("sevenDayGlucose").textContent = summary.average;
  $("sevenDayReadings").textContent = summary.readings;
  $("sevenDayCarbs").textContent = summary.carbs;

  $("healthTimeline").innerHTML = sorted.length
    ? sorted.map(item => `
      <article class="item event">
        <div class="event-icon">${item.type === "glucose" ? "G" : item.type === "meal" ? "F" : "E"}</div>
        <div>
          ${eventSummary(item)}
          ${item.notes ? `<div class="meta">${esc(item.notes)}</div>` : ""}
          <div class="meta">${new Date(item.occurredAt).toLocaleString()}</div>
        </div>
        <div class="toolbar event-actions">
          <button class="btn" data-edit-health="${item.id}">Edit</button>
          <button class="btn danger" data-del-health="${item.id}">Delete</button>
        </div>
      </article>`).join("")
    : '<div class="empty">No diabetes records yet.</div>';

  $("foodLibrary").innerHTML = foods.length
    ? [...foods]
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .map(food => `
        <div class="item">
          <div class="item-head">
            <div>
              <div class="item-title">${esc(food.name)}</div>
              <div class="meta">${esc(food.portion || "No usual portion")}${food.carbs !== "" && food.carbs != null ? ` · ${esc(food.carbs)}g carbohydrate` : " · carbohydrate unknown"}</div>
            </div>
            <div class="row compact-actions">
              <button class="btn" data-edit-food="${food.id}">Edit</button>
              <button class="btn danger" data-delete-food="${food.id}">Delete</button>
            </div>
          </div>
        </div>`).join("")
    : '<div class="empty">Foods are remembered after a food capture.</div>';

  renderFoodSuggestions();
}

$("healthTimeline").onclick = async event => {
  const editId = event.target.dataset.editHealth;
  const deleteId = event.target.dataset.delHealth;

  if (deleteId && confirm("Delete this diabetes record?")) {
    health = health.filter(item => item.id !== deleteId);
    deletedHealth = [...new Set([...deletedHealth, deleteId])];
    await persist();
    renderHealth();
    setCaptureStatus("Record deleted on this device. Database deletion will sync.", "ok");
    syncCloud();
    return;
  }

  if (!editId) return;
  const item = health.find(record => record.id === editId);
  if (!item) return;

  $("manualCard").hidden = false;
  $("healthFormTitle").textContent = "Edit record";
  $("healthId").value = item.id;
  $("healthType").value = item.type;
  $("healthTime").value = localInput(item.occurredAt);
  $("glucoseValue").value = item.value ?? "";
  $("glucoseContext").value = item.context || "unspecified";
  $("healthNotes").value = item.notes || "";
  mealDraft = item.details?.items ? clone(item.details.items) : [];
  switchHealthFields();
  renderMealDraft();
  $("manualCard").scrollIntoView({ behavior: "smooth" });
};

$("foodLibrary").onclick = async event => {
  const editId = event.target.dataset.editFood;
  const deleteId = event.target.dataset.deleteFood;

  if (deleteId) {
    const food = foods.find(item => item.id === deleteId);
    if (!food || !confirm(`Delete “${food.name}” from personal food memory? Existing meal records will remain.`)) return;
    foods = foods.filter(item => item.id !== deleteId);
    deletedFoods = [...new Set([...deletedFoods, deleteId])];
    await persist();
    renderHealth();
    setCaptureStatus("Food memory deleted. Database deletion will sync.", "ok");
    syncCloud();
    return;
  }

  if (!editId) return;
  const food = foods.find(item => item.id === editId);
  if (!food) return;
  $("foodId").value = food.id;
  $("foodName").value = food.name;
  $("foodAliases").value = (food.aliases || []).join(", ");
  $("foodPortion").value = food.portion || "";
  $("foodCarbs").value = food.carbs ?? "";
  $("editFoodDialog").showModal();
};

$("cancelFoodEdit").onclick = () => $("editFoodDialog").close();

$("foodForm").onsubmit = async event => {
  event.preventDefault();
  const food = foods.find(item => item.id === $("foodId").value);
  if (!food) return;
  food.name = $("foodName").value.trim();
  food.aliases = $("foodAliases").value.split(",").map(value => value.trim()).filter(Boolean);
  food.portion = $("foodPortion").value.trim();
  food.carbs = $("foodCarbs").value === "" ? "" : Number($("foodCarbs").value);
  food.updatedAt = nowIso();
  await persist();
  $("editFoodDialog").close();
  renderHealth();
  syncCloud();
};

function exportHealthJson() {
  download(
    `diabetes-${dateKey(new Date())}.json`,
    "application/json",
    JSON.stringify({
      app: "Stolen Minutes Diabetes",
      version: 2,
      exportedAt: nowIso(),
      healthEvents: health,
      foods
    }, null, 2)
  );
  setCaptureStatus("Health data exported as JSON.", "ok");
}

function exportWeeklyReview() {
  const summary = sevenDaySummary();
  const cutoff = Date.now() - 7 * 86400000;
  const records = health.filter(item => new Date(item.occurredAt).getTime() >= cutoff).map(item => ({ type: item.type, occurredAt: item.occurredAt, notes: item.notes || "" }));
  download(`quiet-timer-7-day-review-${dateKey(new Date())}.json`, "application/json", JSON.stringify({ schema: "bloody-daves/quiet-timer-review/v1", createdAt: nowIso(), summary: { readings: summary.readings, glucoseAverage: summary.average, estimatedCarbs: summary.carbs }, records }, null, 2));
  setCaptureStatus("7-day review exported as JSON.", "ok");
}

function exportHealthCsv() {
  const rows = [[
    "type",
    "occurred_at",
    "value",
    "unit",
    "context",
    "notes",
    "total_carbs_g",
    "details"
  ], ...health.map(item => [
    item.type,
    item.occurredAt,
    item.value ?? "",
    item.unit ?? "",
    item.context ?? "",
    item.notes ?? "",
    item.details?.totalCarbs ?? "",
    JSON.stringify(item.details || {})
  ])];
  download(
    `diabetes-${dateKey(new Date())}.csv`,
    "text/csv",
    rows.map(row => row.map(csvCell).join(",")).join("\n")
  );
  setCaptureStatus("Health data exported as CSV.", "ok");
}

$("exportHealth").onclick = exportHealthJson;
$("exportHealthCsv").onclick = exportHealthCsv;
$("exportWeekReview").onclick = exportWeeklyReview;
$("storageExport").onclick = exportHealthJson;
$("dismissStorageWarning").onclick = () => { $("storageWarning").hidden = true; };
$("checkStorage").onclick = () => checkStoragePressure(true);

$("exportActivities").onclick = () => {
  const rows = [["activity", "started_at", "ended_at", "elapsed_ms"],
    ...activities.map(item => [item.activity, item.startedAt, item.endedAt, item.elapsedMs])];
  download("stolen-minutes.csv", "text/csv", rows.map(row => row.map(csvCell).join(",")).join("\n"));
};

$("login").onclick = login;
$("sync").onclick = syncCloud;
$("logout").onclick = async () => {
  await supabase.auth.signOut({ scope: "local" });
  session = null;
  renderAuth();
};

function renderAll() {
  $("todayLabel").textContent = new Date().toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  renderAuth();
  renderTimer();
  renderFragments();
  renderHealth();
}

async function init() {
  await hydrateDurableState();
  renderAll();

  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch {}
  }
  await checkStoragePressure(true);

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    session = data.session;
    renderAuth();
    if (session) await syncCloud();
    supabase.auth.onAuthStateChange((_event, newSession) => {
      session = newSession;
      renderAuth();
      if (newSession) setTimeout(syncCloud, 0);
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(error => console.warn("Service worker registration failed", error));
  }
}

window.addEventListener("online", () => {
  renderAuth();
  syncCloud();
});
window.addEventListener("offline", renderAuth);
window.addEventListener("pagehide", () => persist());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persist();
});

init();
