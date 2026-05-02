import { NextResponse } from "next/server";
import { computeYieldRows } from "@/lib/yield-analyzer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await computeYieldRows();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
