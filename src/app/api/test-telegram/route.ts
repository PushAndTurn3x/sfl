import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await sendTelegramMessage(
    "<b>🌻 SFL Optimizer</b>\n✅ Halo Master, ini pesan tes — bot kamu sudah terhubung dengan benar!",
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
