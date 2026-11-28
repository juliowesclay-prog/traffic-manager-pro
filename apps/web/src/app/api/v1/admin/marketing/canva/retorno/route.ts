import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireCompanyStaff } from "@/server/auth";
import { CANVA_STATE_COOKIE, finishCanvaConnect } from "@/server/marketing/canva";

/** Volta da autorização do Canva (OAuth + PKCE). Mesmo usuário e mesmo "state" do cookie. */
export async function GET(request: Request) {
  const { user } = await requireCompanyStaff("marketing:manage");
  const q = new URL(request.url).searchParams;
  const jar = await cookies();
  const code = await finishCanvaConnect(
    user.id,
    { code: q.get("code"), state: q.get("state"), error: q.get("error") },
    jar.get(CANVA_STATE_COOKIE)?.value ?? null,
  );
  const res = NextResponse.redirect(
    new URL(`/admin/marketing/canva?resultado=${code}`, process.env.APP_URL ?? request.url),
  );
  res.cookies.set(CANVA_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/admin/marketing/canva",
    maxAge: 0,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
