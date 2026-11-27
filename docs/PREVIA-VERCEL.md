# Prévia de teste na Vercel

Link de teste com dados **DEMO**, Meta e IA **simuladas**. Não é produção: nada fala com o Facebook
de verdade e nada é cobrado.

## Criar (uma vez, pelo site da Vercel)

1. vercel.com → **Add New → Project** → importar o repositório `traffic-manager-pro` do GitHub.
2. **Root Directory**: `apps/web` (o resto a Vercel detecta: Next.js, pnpm, `apps/web/vercel.json`).
3. Em **Environment Variables**, criar três (só ficam no cofre da Vercel):
   - `SEGREDO_MESTRE`: uma frase longa inventada na hora (32+ caracteres). Não precisa decorar; só não pode mudar depois.
   - `SEED_ADMIN_EMAIL`: o e-mail de quem vai entrar.
   - `SEED_ADMIN_PASSWORD`: a senha desse acesso (12+ caracteres).
4. **Deploy**. O primeiro vai falhar sem banco: é esperado.
5. No projeto → **Storage → Create Database → Neon** (plano gratuito, região São Paulo se houver) → conectar ao projeto. Ela cria `DATABASE_URL` sozinha.
6. **Deployments → Redeploy**. O build aplica o banco, cria o superadministrador e as empresas DEMO.

## Entrar

Abra `https://<projeto>.vercel.app/admin/entrar` com o e-mail e a senha do passo 3. No primeiro acesso,
leia o QR Code com um aplicativo autenticador (Google Authenticator, Microsoft Authenticator).

## Como funciona

- `scripts/vercel-build.sh`: migrations (conexão direta do Neon), seed do admin e das empresas DEMO (sem usuários de demonstração), build.
- `packages/db/src/hosted-env.ts`: só com `VERCEL=1` e fora de `APP_ENV=production`; deriva as chaves internas do `SEGREDO_MESTRE` e liga os modos simulados.
- Região das funções: `gru1` (São Paulo). Sem rotina automática a cada 30 s (no plano gratuito a Vercel só agenda 1 vez por dia): use **Atualizar agora** nas telas.
- Custo: Vercel Hobby e Neon Free, gratuitos para teste. Para uso real da empresa, a Vercel exige o plano Pro (US$ 20/mês por pessoa).
