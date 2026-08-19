"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAppData } from "@/hooks/useAppData";
import {
  dismissAlarm,
  ensureNotificationPermission,
  startNotificationWatchdog,
  type ScheduledEvent,
} from "@/lib/notifications";

const NAV = [
  { href: "/", label: "Today", icon: "◉" },
  { href: "/calendar", label: "Rota", icon: "▦" },
  { href: "/pay", label: "Pay", icon: "£" },
  { href: "/alarms", label: "Alarms", icon: "◎" },
  { href: "/settings", label: "More", icon: "☰" },
];

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getOnlineServerSnapshot() {
  return true;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, setData } = useAppData();
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot);
  const [alarm, setAlarm] = useState<ScheduledEvent | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const stop = startNotificationWatchdog(() => data.settings);
    return stop;
  }, [data.settings]);

  useEffect(() => {
    const onRing = (e: Event) => {
      const detail = (e as CustomEvent<ScheduledEvent>).detail;
      setAlarm(detail);
    };
    const onDismiss = () => setAlarm(null);
    window.addEventListener("shift-alarm-ring", onRing);
    window.addEventListener("shift-alarm-dismiss", onDismiss);
    return () => {
      window.removeEventListener("shift-alarm-ring", onRing);
      window.removeEventListener("shift-alarm-dismiss", onDismiss);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <div className="app-root">
      <div className="app-glow" aria-hidden />
      <header className="topbar">
        <div>
          <p className="brand">{data.settings.plantName}</p>
          <p className="brand-sub">{data.settings.shiftName} · 2-2-3</p>
        </div>
        <div className="topbar-right">
          <span className={`pill ${online ? "online" : "offline"}`}>
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </header>

      {!data.notificationPermissionAsked && (
        <div className="banner">
          <div>
            <strong>Enable reminders</strong>
            <p>Day-before alerts at 5pm &amp; 8pm, plus wake alarms.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await ensureNotificationPermission();
              setData({ ...data, notificationPermissionAsked: true });
            }}
          >
            Allow
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setData({ ...data, notificationPermissionAsked: true })}
          >
            Later
          </button>
        </div>
      )}

      {installPrompt && !data.installedHintDismissed && (
        <div className="banner install">
          <div>
            <strong>Install on your phone</strong>
            <p>Add to home screen for offline use &amp; faster alarms.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await installPrompt.prompt();
              setInstallPrompt(null);
              setData({ ...data, installedHintDismissed: true });
            }}
          >
            Install
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setInstallPrompt(null);
              setData({ ...data, installedHintDismissed: true });
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="main">{children}</main>

      <nav className="bottom-nav" aria-label="Primary">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {alarm && (
        <div className="alarm-overlay" role="alertdialog" aria-modal="true">
          <div className="alarm-card">
            <p className="alarm-kicker">Wake alarm</p>
            <h2>{alarm.title}</h2>
            <p>{alarm.body}</p>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                dismissAlarm();
                setAlarm(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
