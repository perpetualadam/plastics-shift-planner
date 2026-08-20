/* Plastics Shift service worker — offline cache + durable schedule checks */
const CACHE = "plastics-shift-v2";
const SCHEDULE_URL = "/__plastics_schedule__";
const FIRED_URL = "/__plastics_fired__";
const PRECACHE = [
  "/",
  "/calendar",
  "/pay",
  "/alarms",
  "/settings",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/** @type {{ id: string, at: string, type: string, title: string, body: string }[]} */
let schedule = [];
/** @type {Set<string>} */
let fired = new Set();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await loadPersistedState();
      await checkSchedule();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Never serve internal schedule keys as real pages
  const url = new URL(request.url);
  if (url.pathname === SCHEDULE_URL || url.pathname === FIRED_URL) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && request.url.startsWith(self.location.origin)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "SYNC_SCHEDULE") {
    schedule = Array.isArray(data.events) ? data.events : [];
    if (Array.isArray(data.firedIds)) {
      for (const id of data.firedIds) fired.add(id);
    }
    event.waitUntil(
      (async () => {
        await persistState();
        await checkSchedule();
      })(),
    );
  }

  if (data.type === "CHECK_NOW") {
    event.waitUntil(checkSchedule());
  }
});

async function persistState() {
  const cache = await caches.open(CACHE);
  await cache.put(
    SCHEDULE_URL,
    new Response(JSON.stringify(schedule), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }),
  );
  await cache.put(
    FIRED_URL,
    new Response(JSON.stringify(Array.from(fired)), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }),
  );
}

async function loadPersistedState() {
  try {
    const cache = await caches.open(CACHE);
    const scheduleRes = await cache.match(SCHEDULE_URL);
    if (scheduleRes) {
      const parsed = await scheduleRes.json();
      if (Array.isArray(parsed)) schedule = parsed;
    }
    const firedRes = await cache.match(FIRED_URL);
    if (firedRes) {
      const parsed = await firedRes.json();
      if (Array.isArray(parsed)) fired = new Set(parsed);
    }
  } catch {
    // ignore corrupt cache
  }
}

async function checkSchedule() {
  if (!schedule.length) await loadPersistedState();
  const now = Date.now();
  let changed = false;

  // Drop fired ids older than 14 days (ids embed dates; prune by map size via re-sync)
  for (const event of schedule) {
    const at = Date.parse(event.at);
    if (Number.isNaN(at)) continue;
    const delta = at - now;
    // 3-minute window — SW timers are throttled; still best-effort only
    if (delta <= 0 && delta > -180_000 && !fired.has(event.id)) {
      fired.add(event.id);
      changed = true;
      try {
        await self.registration.showNotification(event.title, {
          body: event.body,
          tag: event.id,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          requireInteraction: true,
          data: { url: event.type === "wake" ? "/alarms" : "/" },
        });
      } catch {
        // Permission or platform blocked notification
      }
    }
  }

  if (changed) await persistState();
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

// Best-effort poll while the SW is alive. Phones often kill this while asleep —
// the page watchdog + catch-up on open cover the rest.
setInterval(() => {
  void checkSchedule();
}, 30_000);
