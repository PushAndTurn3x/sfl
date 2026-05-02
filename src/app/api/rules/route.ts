import { NextResponse } from "next/server";
import { z } from "zod";
import { addRule, deleteRule, listRules, setRuleEnabled } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rules: listRules() });
}

const createSchema = z.object({
  kind: z.enum([
    "harvest_ready",
    "animal_ready",
    "resource_ready",
    "daily_reward",
    "buff_expired",
    "balance_threshold",
    "price_target",
    "custom",
  ]),
  target: z.string().optional(),
  threshold: z.number().optional(),
  enabled: z.boolean().default(true),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const rule = addRule({
    kind: parsed.data.kind,
    target: parsed.data.target,
    threshold: parsed.data.threshold,
    enabled: parsed.data.enabled ? 1 : 0,
  });
  return NextResponse.json({ rule });
}

const patchSchema = z.object({ id: z.number(), enabled: z.boolean() });

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  setRuleEnabled(parsed.data.id, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteRule(id);
  return NextResponse.json({ ok: true });
}
