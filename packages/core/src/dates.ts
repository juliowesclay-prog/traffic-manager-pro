/** Data no formato AAAA-MM-DD (copiado de @prosed/core/billing, só o necessário ao Gestor de Tráfego). */
export type IsoDate = string;

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
