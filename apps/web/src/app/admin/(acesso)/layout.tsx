import type { ReactNode } from "react";
import { AccessShell } from "@/components/auth/access-views";

export default function AdminAccessLayout({ children }: { children: ReactNode }) {
  return <AccessShell area="admin">{children}</AccessShell>;
}
