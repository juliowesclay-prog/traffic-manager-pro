import { productionConfigProblems } from "@tmp/core";

// Só no runtime Node.js (importado por instrumentation.ts).
const problems = productionConfigProblems(process.env);
if (problems.length) {
  const list = problems.map((p) => `  - ${p}`).join("\n");
  throw new Error(`Configuração de produção incompleta; o servidor não vai subir:\n${list}`);
}
