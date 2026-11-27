import type { Metadata } from "next";
import { MfaEnrollView } from "@/components/auth/access-views";

export const metadata: Metadata = { title: "Configurar autenticador" };

export default function MfaEnrollPage() {
  return <MfaEnrollView area="admin" />;
}
