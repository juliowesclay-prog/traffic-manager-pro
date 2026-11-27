import { redirect } from "next/navigation";

/** O Traffic Manager Pro não tem site público: a raiz leva ao painel. */
export default function Home() {
  redirect("/admin");
}
