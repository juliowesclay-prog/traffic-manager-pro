/**
 * Conferência da configuração de PRODUÇÃO (entrega 7.1). O servidor não sobe com APP_ENV=production
 * se algum item de segurança estiver faltando ou em modo de desenvolvimento ("falha fechada").
 * Nunca mostra o valor de um segredo: só o nome da variável e o problema.
 */

type Env = Record<string, string | undefined>;

const PLACEHOLDER = /^__.*__$|^troque|^changeme|^exemplo/i;

function key32(env: Env, name: string, problems: string[]) {
  const v = env[name];
  if (!v || PLACEHOLDER.test(v)) return problems.push(`${name} não configurada.`);
  let bytes = 0;
  try {
    bytes = atob(v).length;
  } catch {
    bytes = 0;
  }
  if (bytes !== 32) problems.push(`${name} deve ter 32 bytes em base64.`);
}

function secret(env: Env, name: string, problems: string[], min = 32) {
  const v = env[name];
  if (!v || PLACEHOLDER.test(v)) problems.push(`${name} não configurado.`);
  else if (v.length < min) problems.push(`${name} curto demais (mínimo ${min} caracteres).`);
}

/**
 * Login do administrador preenchido SÓ EM TESTE LOCAL (DEV_PREFILL_LOGIN=true): nunca em produção e
 * só quando o endereço da página é o próprio computador (localhost, 127.0.0.1 ou [::1]).
 */
export function prefillLoginAllowed(env: Env, host: string | null | undefined): boolean {
  if (env.APP_ENV === "production" || env.DEV_PREFILL_LOGIN?.trim() !== "true") return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host ?? "");
}

export function productionConfigProblems(env: Env): string[] {
  if (env.APP_ENV !== "production") return [];
  const problems: string[] = [];

  if (!env.APP_URL?.startsWith("https://")) problems.push("APP_URL precisa começar com https://.");

  key32(env, "DATA_ENCRYPTION_KEY", problems);
  key32(env, "HASH_PEPPER", problems);
  if (env.DATA_ENCRYPTION_KEY && env.DATA_ENCRYPTION_KEY === env.HASH_PEPPER)
    problems.push("DATA_ENCRYPTION_KEY e HASH_PEPPER precisam ser diferentes.");

  secret(env, "CRON_SECRET", problems);

  // IP do visitante: sem proxies confiáveis configurados, todos os visitantes parecem o mesmo IP e um
  // único abuso bloquearia o login de todo mundo. Expor o servidor direto exige dizer isso explicitamente.
  const hops = Number(env.TRUST_PROXY_HOPS ?? "");
  if (!Number.isInteger(hops) || hops < 0)
    problems.push("TRUST_PROXY_HOPS deve ser um número inteiro (proxies na frente do site).");
  else if (hops === 0 && env.TRUST_PROXY_NONE !== "true")
    problems.push(
      "TRUST_PROXY_HOPS=0 em produção: informe o número de proxies da hospedagem, ou TRUST_PROXY_NONE=true se o site recebe o visitante direto.",
    );

  if (env.DEV_PREFILL_LOGIN?.trim())
    problems.push(
      "DEV_PREFILL_LOGIN (login de teste preenchido) não pode existir em produção: apague a variável.",
    );

  // Meta: se ligada, só a Meta real e com as credenciais do app.
  if (env.META_PROVIDER === "simulado") problems.push("META_PROVIDER=simulado é só para desenvolvimento.");
  if (env.META_PROVIDER === "meta") {
    if (!/^\d{5,25}$/.test(env.META_APP_ID ?? "")) problems.push("META_APP_ID não configurado.");
    secret(env, "META_APP_SECRET", problems, 24);
  }
  // IA analista: opcional; se ligada, só o Claude real e com a chave.
  if (env.AI_PROVIDER === "simulado") problems.push("AI_PROVIDER=simulado é só para desenvolvimento.");
  if (env.AI_PROVIDER === "claude" && !/^sk-ant-/.test(env.ANTHROPIC_API_KEY ?? ""))
    problems.push("ANTHROPIC_API_KEY não configurada (chave da API do Claude).");
  return problems;
}
