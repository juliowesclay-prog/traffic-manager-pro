import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireStaff } from "@/server/auth";
import { finishMetaConnect, META_STATE_COOKIE } from "@/server/traffic/connection";

/**
 * Retorno da tela de autorização da Meta (OAuth). Exige a equipe logada com traffic:manage e o mesmo
 * "state" do cookie desta pessoa. Volta para a tela do módulo só com um código fixo de resultado.
 */
export async function GET(request: Request) {
  const { user } = await requireStaff("traffic:manage");
  const q = new URL(request.url).searchParams;
  const jar = await cookies();
  const cookieState = jar.get(META_STATE_COOKIE)?.value ?? null;
  const r = await finishMetaConnect(
    user.id,
    {
      code: q.get("code"),
      state: q.get("state"),
      error: q.get("error"),
      errorReason: q.get("error_reason"),
    },
    cookieState,
  );
  const res = NextResponse.redirect(
    new URL(`/admin/trafego?resultado=${r.code}`, process.env.APP_URL ?? request.url),
  );
  // Apaga o cookie do state com os mesmos atributos da criação.
  res.cookies.set(META_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/admin/trafego/meta",
    maxAge: 0,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
