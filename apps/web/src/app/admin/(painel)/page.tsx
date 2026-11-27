import { redirect } from "next/navigation";

/** A entrada do painel é o Gestor de Tráfego. */
export default function PanelHome() {
  redirect("/admin/trafego");
}
