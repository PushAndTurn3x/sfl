"use client";

import { useEffect, useState } from "react";

interface NotificationLog {
  id: number;
  kind: string;
  message: string;
  sentAt: number;
  success: number;
  error: string | null;
}

export default function NotificationsPage() {
  const [log, setLog] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/notifications");
    const json = await res.json();
    setLog(json.log ?? []);
    setLoading(false);
  }

  async function testTelegram() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/test-telegram", { method: "POST" });
    const json = await res.json();
    setTestResult(json.ok ? "✅ Sent! Check your Telegram." : `❌ ${json.error ?? "Failed"}`);
    setTesting(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="flex gap-2">
          <button
            onClick={testTelegram}
            disabled={testing}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {testing ? "Sending…" : "Send test"}
          </button>
          <button
            onClick={load}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90"
          >
            Refresh
          </button>
        </div>
      </div>

      {testResult && (
        <div className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-sm">
          {testResult}
        </div>
      )}

      <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500 bg-zinc-50 dark:bg-zinc-950/50">
            <tr>
              <th className="text-left px-3 py-2">Time</th>
              <th className="text-left px-3 py-2">Kind</th>
              <th className="text-left px-3 py-2">Message</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && log.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  No notifications yet.
                </td>
              </tr>
            )}
            {log.map((n) => (
              <tr key={n.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                  {new Date(n.sentAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs uppercase">{n.kind.replace("_", " ")}</td>
                <td className="px-3 py-2">{n.message}</td>
                <td className="px-3 py-2">
                  {n.success ? (
                    <span className="text-emerald-700 dark:text-emerald-300">✅</span>
                  ) : (
                    <span className="text-red-700 dark:text-red-300" title={n.error ?? ""}>
                      ❌
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
