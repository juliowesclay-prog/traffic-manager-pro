import type { Metadata } from "next";
import { LoginView } from "@/components/auth/access-views";

export const metadata: Metadata = { title: "Entrar no painel" };

export default function StaffLoginPage() {
  return <LoginView area="admin" />;
}
