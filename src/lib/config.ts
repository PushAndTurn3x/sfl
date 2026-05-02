/**
 * Centralized environment configuration with safe defaults.
 * All env-var access should go through this module so missing values
 * are surfaced consistently.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value === "replace_me") {
    throw new Error(
      `[config] Missing required environment variable: ${name}. ` +
        `See env.example.txt for setup instructions.`,
    );
  }
  return value;
}

function optional(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

export const config = {
  sfl: {
    baseUrl: optional(process.env.SFL_API_BASE_URL, "https://api.sunflower-land.com"),
    apiKey: process.env.SFL_API_KEY ?? "",
    farmId: process.env.SFL_FARM_ID ?? "0",
    jwt: process.env.SFL_JWT ?? "",
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
  },
  scheduler: {
    pollIntervalMinutes: Number(optional(process.env.POLL_INTERVAL_MINUTES, "5")),
    quietHoursStart: process.env.QUIET_HOURS_START ?? "",
    quietHoursEnd: process.env.QUIET_HOURS_END ?? "",
  },
  database: {
    path: optional(process.env.DATABASE_PATH, "./data/sfl.db"),
  },
};

/** Throws if any critical env var is missing. Call this at startup. */
export function assertConfig(): void {
  required("SFL_API_KEY", config.sfl.apiKey);
  required("SFL_FARM_ID", config.sfl.farmId);
  required("TELEGRAM_BOT_TOKEN", config.telegram.botToken);
  required("TELEGRAM_CHAT_ID", config.telegram.chatId);
}

/** Returns whether config is complete enough to enable notifications. */
export function isConfigComplete(): boolean {
  try {
    assertConfig();
    return true;
  } catch {
    return false;
  }
}
