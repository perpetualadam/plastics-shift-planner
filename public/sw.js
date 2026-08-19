/* Plastics Shift service worker — offline cache + scheduled notification checks */
const CACHE = "plastics-shift-v1";
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

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

/** @type {{ id: string, at: string, type: string, title: string, body: string }[]} */
let schedule = [];
const fired = new Set();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SYNC_SCHEDULE") {
    schedule = event.data.events || [];
  }
});

async function checkSchedule() {
  const now = Date.now();
  for (const event of schedule) {
    const at = Date.parse(event.at);
    if (Number.isNaN(at)) continue;
    const delta = at - now;
    if (delta <= 0 && delta > -120000 && !fired.has(event.id)) {
      fired.add(event.id);
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
        // ignore
      }
    }
  }
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

setInterval(() => {
  void checkSchedule();
}, 30000);
