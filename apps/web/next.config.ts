import path from "node:path";
import type { NextConfig } from "next";

// Cabeçalhos de segurança base. A CSP com nonce é aplicada por requisição em src/middleware.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Câmera só no próprio site (leitura do QR Code da carteirinha pelo parceiro).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Isola a janela de páginas de outros sites (window.opener) e impede que outros sites embutam nossos arquivos.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Build de produção local em pasta própria (NEXT_DIST_DIR=.next-prod), para não brigar com o `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // O lint roda pelo `pnpm lint` (ESLint flat config da raiz), não durante o build.
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@tmp/core", "@tmp/db"],
  serverExternalPackages: ["@prisma/client", "@node-rs/argon2"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // O service worker nunca fica em cache no navegador: atualizações chegam na hora.
      // Carteirinha sem internet: página estática com política própria (só scripts do próprio site).
      {
        source: "/carteirinha-offline.:ext(html|js)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
