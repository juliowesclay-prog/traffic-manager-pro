/** Aviso do código fixo de teste (DEV_FIXED_OTP). Só aparece quando o código fixo está ligado (nunca em produção). */
export function TestCodeNotice({ code }: { code: string | null }) {
  if (!code) return null;
  return (
    <p
      role="note"
      data-testid="codigo-de-teste"
      className="rounded-2xl border-2 border-dashed border-red/50 bg-red-50 px-4 py-3 text-lg text-red-dark"
    >
      <strong>MODO DE TESTE</strong> — use o código <strong className="tracking-widest">{code}</strong> (o
      código real também chega na caixa de testes).
    </p>
  );
}
