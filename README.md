# Plastics Shift — B Shift Planner

Personal offline-first PWA for **Plastics B Shift** (yellow boxes on the 2026 rota).

## Pattern

- **2 day shifts** · 06:00–18:00  
- **2 night shifts** · 18:00–06:00  
- **3 days off**  
- Anchored to the printed 2026 Plastics rota (first day block: **3–4 Jan 2026**)

## Features

- Today view with countdown and wake time  
- Full month rota calendar  
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
