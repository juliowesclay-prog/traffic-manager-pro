import { redirect } from "next/navigation";

/** A verificação em duas etapas foi retirada (27/11/2026). Links antigos voltam para o painel. */
export default function MfaVerifyPage() {
  redirect("/admin");
}
