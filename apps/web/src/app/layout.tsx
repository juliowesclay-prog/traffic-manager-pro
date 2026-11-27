import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource-variable/montserrat/wght.css";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { CSSProperties, ReactNode } from "react";
import { getSiteSettings } from "@/lib/settings";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3300"),
    title: { default: `${s.name} — ${s.tagline}`, template: `%s | ${s.name}` },
    description: "Gestão de tráfego pago sincronizada com a Meta (Facebook e Instagram Ads).",
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10204A" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Renderização por requisição: necessária para o nonce da CSP (middleware.ts) e para a marca
  // configurada no painel aparecer na hora, sem novo deploy.
  await connection();
  const { colors } = await getSiteSettings();
  const style = {
    "--brand-navy": colors.navy,
    "--brand-red": colors.red,
    "--brand-saving": colors.saving,
  } as CSSProperties;

  return (
    <html lang="pt-BR" style={style}>
      <body className="min-h-dvh antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-5 focus:py-4 focus:text-lg focus:font-bold focus:text-navy"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
