import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { connection } from "next/server";
import type { CSSProperties, ReactNode } from "react";
import { getSiteSettings } from "@/lib/settings";
import "./globals.css";

// Fontes baixadas no build e servidas pelo próprio app (sem chamada ao Google no navegador).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3300"),
    title: { default: `${s.name} — ${s.tagline}`, template: `%s | ${s.name}` },
    description: "Gestão de tráfego pago sincronizada com a Meta (Facebook e Instagram Ads).",
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0E1422" };

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
    <html lang="pt-BR" style={style} className={`${inter.variable} ${sora.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-5 focus:py-4 focus:text-base focus:font-bold focus:text-navy"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
