/**
 * Minimal Telegram Bot API wrapper. We only need `sendMessage`.
 * Docs: https://core.telegram.org/bots/api#sendmessage
 */

import { config } from "./config";

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegramMessage(text: string): Promise<SendResult> {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    return { ok: false, error: "Telegram credentials not configured" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Convenience: escape HTML special chars for Telegram HTML parse mode. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
