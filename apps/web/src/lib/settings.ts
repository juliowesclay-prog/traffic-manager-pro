import { cache } from "react";

export interface BrandColors {
  navy: string;
  red: string;
  saving: string;
}

export interface SiteSettings {
  name: string;
  tagline: string;
  logoUrl: string;
  colors: BrandColors;
}

/** Marca do Traffic Manager Pro (fixa no código; personalização por empresa fica para o SaaS). */
export const BRAND: SiteSettings = {
  name: "Traffic Manager Pro",
  tagline: "Tráfego pago sincronizado com a Meta",
  logoUrl: "/brand/logo.svg",
  colors: { navy: "#10204A", red: "#C90201", saving: "#0E7A3E" },
};

export const getSiteSettings = cache(async (): Promise<SiteSettings> => BRAND);
