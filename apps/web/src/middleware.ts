import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy com nonce por requisição: só executam scripts emitidos pelo próprio
 * Next.js nesta resposta. Bloqueia scripts injetados (XSS), uso do site dentro de iframes de terceiros
 * e envio de formulários para outros domínios.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const files = storageOrigin();

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Estilos inline são usados pelo React/Next (atributo style); não executam código.
    `style-src 'self' 'unsafe-inline'`,
    // Miniaturas dos anúncios (Gestor de Tráfego) vêm dos servidores de imagem da Meta.
    `img-src 'self' data: blob: https://*.fbcdn.net https://*.canva.com${files}`,
    // Vídeos do Marketing: do próprio site ou, com o R2, por link temporário assinado.
    `media-src 'self' blob:${files}`,
    `font-src 'self'`,
    `connect-src 'self'${files}${dev ? " ws: wss:" : ""}`,
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

/** Origem do armazenamento R2 (envio e exibição direta por link assinado), ou "" sem R2. */
function storageOrigin(): string {
  if (process.env.STORAGE_DRIVER !== "r2") return "";
  try {
    const acct = process.env.R2_ACCOUNT_ID ?? "";
    const raw =
      process.env.R2_ENDPOINT ||
      (/^[a-f0-9]{32}$/i.test(acct) ? `https://${acct}.r2.cloudflarestorage.com` : "");
    return raw ? ` ${new URL(raw).origin}` : "";
  } catch {
    return "";
  }
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|brand/|icon.svg|favicon.ico).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
