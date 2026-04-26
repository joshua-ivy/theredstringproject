import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    app: "the-red-string-project",
    checked_at: new Date().toISOString()
  });
}
