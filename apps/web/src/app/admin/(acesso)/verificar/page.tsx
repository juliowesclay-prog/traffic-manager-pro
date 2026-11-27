import type { Metadata } from "next";
import { MfaVerifyView } from "@/components/auth/access-views";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default function MfaVerifyPage() {
  return <MfaVerifyView area="admin" />;
}
