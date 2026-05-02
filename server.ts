/**
 * Custom Next.js server that also boots the background scheduler.
 *
 * Railway runs a single process per service, so we co-locate the cron job
 * with the HTTP server. For multi-instance deployments you'd want to split
 * these (e.g. dedicated worker service + a lock).
 */

import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";

// Load .env / .env.local BEFORE importing modules that read process.env at import time.
const dev = process.env.NODE_ENV !== "production";
loadEnvConfig(process.cwd(), dev);

const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

async function main() {
  // Dynamic imports happen AFTER env is loaded so config sees the real values.
  const { default: next } = await import("next");
  const { startScheduler } = await import("./src/lib/scheduler");

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();
  createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    try {
      startScheduler();
    } catch (e) {
      console.error("[server] Failed to start scheduler:", e);
    }
  });
}

main().catch((e) => {
  console.error("[server] Fatal:", e);
  process.exit(1);
});
