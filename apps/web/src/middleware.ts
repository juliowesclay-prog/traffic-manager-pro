import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy com nonce por requisição: só executam scripts emitidos pelo próprio
 * Next.js nesta resposta. Bloqueia scripts injetados (XSS), uso do site dentro de iframes de terceiros
 * e envio de formulários para outros domínios.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Estilos inline são usados pelo React/Next (atributo style); não executam código.
    `style-src 'self' 'unsafe-inline'`,
    // Miniaturas dos anúncios (Gestor de Tráfego) vêm dos servidores de imagem da Meta.
    `img-src 'self' data: blob: https://*.fbcdn.net`,
    `font-src 'self'`,
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|brand/|icon.svg|favicon.ico).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
