# Plastics Shift — B Shift Planner

Personal offline-first PWA for **Plastics B Shift** (2026 rota).

## Schedule source

Working days and prep times come from the official CSV:

`data/b-shift-2026.csv` (also at `/data/b-shift-2026.csv` when deployed)

- **Day** · 06:00–18:00 · wake/prep from morning dog feed (04:49)  
- **Night** · 18:00–06:00 · wake/prep from afternoon dog feed (16:49)  
- Day-before warnings default **17:00** and **20:00**

## Features

- Today view with countdown and CSV prep times  
- Full month rota calendar (CSV dates)  
- Day-before reminders (default **17:00** and **20:00**)  
- Wake alarms with 6 built-in sounds  
- Overtime logging, pay estimates, YTD, days worked  
- Installable PWA — works **offline** after first load  
- Local backup/export JSON (data stays on your phone)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On your phone: open the URL (same Wi‑Fi / deployed host) → **Add to Home Screen**.

## Build

```bash
npm run build && npm start
```

## Notes on alarms

Browsers cannot guarantee wake-ups when the phone is asleep like a native alarm app. For best results:

1. Install the PWA to your home screen  
2. Allow notifications  
3. Open the app after reboots so the watchdog re-arms  
4. Optionally mirror critical wake times in your phone’s Clock app  

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Service Worker PWA
