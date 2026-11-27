// Rotina periódica de desenvolvimento: a cada 30 s pede ao site para rodar, em cada empresa, a
// sincronização automática com a Meta e o envio das conversões. Em produção, use o agendador da
// hospedagem chamando a mesma rota.
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";

const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const url = `${process.env.APP_URL ?? env.APP_URL ?? "http://localhost:3300"}/api/internal/tarefas`;
const secret = process.env.CRON_SECRET ?? env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET ausente (rode pnpm env:init)");
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(url, { method: "POST", headers: { "x-tarefa-secret": secret } });
    const body = await res.json();
    for (const [empresa, r] of Object.entries(body.empresas ?? {}))
      if (r.anuncios !== "nao_era_hora" || r.limpeza)
        console.warn(new Date().toISOString(), empresa, JSON.stringify(r));
  } catch (error) {
    console.error(new Date().toISOString(), "falha ao chamar a rotina:", error.message);
  }
}
await tick();
setInterval(tick, 30_000);
