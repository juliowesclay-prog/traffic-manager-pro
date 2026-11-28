# Traffic Manager Pro — segurança e LGPD

## Acesso
- E-mail + senha (Argon2id, mínimo 12, senhas comuns recusadas) para toda a equipe. A verificação em duas etapas (autenticador) foi retirada por decisão do usuário em 27/11/2026; para compensar, valem o bloqueio por tentativas, a sessão curta e a trava de aprovação nas ações que aumentam o gasto. Pode voltar no futuro (o código do autenticador continua em `packages/core/src/totp.ts`).
- 5 senhas erradas bloqueiam a conta por 15 min. Limites de tentativas por IP e por conta.
- Sessão: token aleatório de 256 bits (no banco só o hash), `HttpOnly`, `SameSite=Lax`, `Secure` e prefixo `__Host-` em produção; 12 h no máximo, 30 min sem uso; trocada a cada login.
- Permissões sempre conferidas no servidor (`requireStaff`, `requireCompanyStaff`, `apiGuard`).

## Empresas
- Cada usuário só abre as empresas liberadas para ele; os dados de uma empresa nunca aparecem em outra (ver [ARQUITETURA.md](ARQUITETURA.md)). Testado de ponta a ponta.
- Chaves da API: mostradas uma única vez; no banco só o hash com pepper; comparação em tempo constante; revogáveis; no máximo 10 ativas por empresa.

## Dados
- Token da Meta cifrado com AES-256-GCM. Chaves (`DATA_ENCRYPTION_KEY`, `HASH_PEPPER`) só no `.env`/cofre.
- A fonte de vendas não recebe dados pessoais; para a Meta vai só o código do clique (`fbc`) e um identificador com hash. O `fbclid` é apagado após 90 dias.
- A IA recebe só números agregados e nomes de campanhas/anúncios.
- Auditoria de login, trocas de empresa, chaves, conexões, ações e configurações.

## Navegador
- CSP com nonce por requisição, `frame-ancestors 'none'`, HSTS, `nosniff`. Formulários por Server Actions (recusam outra origem).
- `TRUST_PROXY_HOPS`: em produção, configure o número real de proxies na frente do site.

## Regras
- Ações na Meta que aumentam o gasto só com aprovação de outra pessoa, com teto diário (trava também no banco).
- Nada de cobrança, publicação ou alteração em produção sem autorização expressa.
