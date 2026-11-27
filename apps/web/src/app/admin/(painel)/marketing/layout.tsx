import type { ReactNode } from "react";
import { MarketingTabs } from "./marketing-tabs";

/** Casca do módulo Marketing: abas das seções. Cada página confere login, permissão e empresa. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingTabs />
      {children}
    </>
  );
}
