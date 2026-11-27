/**
 * Roda uma vez quando o servidor sobe. Em produção, confere a configuração de segurança e se recusa
 * a subir se algo estiver faltando (ver docs/SEGURANCA.md). Não imprime valores de segredos.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
