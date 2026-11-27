"use client";

import { Check, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BRAND_FACT_KIND_LABELS,
  BRAND_FACT_KINDS,
  BRAND_FONTS,
  SOCIAL_LABELS,
  SOCIAL_NETWORKS,
  type SocialNetwork,
} from "@tmp/core/marketing";
import { Button, Checkbox, Field, SelectField, TextAreaField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import { UploadForm } from "@/components/marketing/upload-form";
import type { BrandResult } from "@/server/marketing/brands";
import {
  addFactAction,
  approveFactAction,
  createBrandAction,
  deleteBrandAction,
  removeFactAction,
  saveBrandAction,
  setLogoAction,
} from "../actions";

export function CreateBrandForm() {
  const router = useRouter();
  const [result, onSubmit, pending] = useServerForm<BrandResult>(createBrandAction);
  useEffect(() => {
    if (result?.ok && result.id) router.push(`/admin/marketing/marca/${result.id}`);
  }, [result, router]);
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="sm:col-span-2">
        <ResultMessage result={result} />
      </div>
      <Field label="Nome da marca" name="nome" required minLength={2} maxLength={80} placeholder="Ex.: Prosed+Saúde" />
      <Button type="submit" disabled={pending} icon={<Plus className="size-4" />}>
        Criar marca
      </Button>
    </form>
  );
}

export interface BrandFormValues {
  id: string;
  name: string;
  website: string;
  about: string;
  colors: string[];
  headingFont: string;
  bodyFont: string;
  ctas: string[];
  socials: Partial<Record<SocialNetwork, string>>;
}

export function BrandForm({ brand }: { brand: BrandFormValues }) {
  const [result, onSubmit, pending] = useServerForm<BrandResult>(saveBrandAction);
  const [colors, setColors] = useState<string[]>(brand.colors.length ? brand.colors : ["#1F4FD8"]);
  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={brand.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da empresa ou marca" name="nome" required minLength={2} maxLength={80} defaultValue={brand.name} />
        <Field label="Site" name="site" inputMode="url" defaultValue={brand.website} placeholder="https://www.suaempresa.com.br" />
      </div>
      <TextAreaField
        label="Informações institucionais"
        name="sobre"
        rows={4}
        maxLength={4000}
        defaultValue={brand.about}
        hint="Quem é a empresa, há quanto tempo atua, onde atende. Só fatos verdadeiros e verificáveis."
      />

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-ink">Cores oficiais (até 8)</legend>
        <ul className="flex flex-wrap gap-3">
          {colors.map((c, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg border border-line p-2">
              <input
                type="color"
                aria-label={`Cor ${i + 1}`}
                value={/^#[0-9a-f]{6}$/i.test(c) ? c : "#000000"}
                onChange={(e) => setColors((p) => p.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))}
                className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent"
              />
              <input
                name="cor"
                aria-label={`Código da cor ${i + 1}`}
                value={c}
                maxLength={7}
                onChange={(e) => setColors((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                className="min-h-9 w-24 rounded border border-slate-300 px-2 font-mono text-sm uppercase"
              />
              <button
                type="button"
                onClick={() => setColors((p) => p.filter((_, j) => j !== i))}
                className="min-h-9 rounded px-2 text-sm text-ink-soft hover:bg-navy-50"
                aria-label={`Remover cor ${i + 1}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        {colors.length < 8 ? (
          <div>
            <Button type="button" variant="ghost" onClick={() => setColors((p) => [...p, "#FFFFFF"])} icon={<Plus className="size-4" />}>
              Adicionar cor
            </Button>
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Fonte dos títulos" name="fonte_titulos" defaultValue={brand.headingFont}>
          <option value="">Escolher depois</option>
          {BRAND_FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </SelectField>
        <SelectField label="Fonte dos textos" name="fonte_textos" defaultValue={brand.bodyFont}>
          <option value="">Escolher depois</option>
          {BRAND_FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </SelectField>
      </div>

      <TextAreaField
        label="Chamadas para ação preferidas"
        name="ctas"
        rows={3}
        defaultValue={brand.ctas.join("\n")}
        hint="Uma por linha, até 8. Ex.: Assine agora · Fale com a gente no WhatsApp"
      />

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-ink">Redes sociais</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((n) => (
            <Field key={n} label={SOCIAL_LABELS[n]} name={`rede_${n}`} inputMode="url" defaultValue={brand.socials[n] ?? ""} />
          ))}
        </div>
      </fieldset>

      <div>
        <Button type="submit" disabled={pending} icon={<Save className="size-4" />}>
          Salvar kit da marca
        </Button>
      </div>
    </form>
  );
}

export function LogoForm({ id }: { id: string }) {
  return (
    <UploadForm
      action={setLogoAction}
      purpose="logo"
      accept="image/png,image/jpeg,image/webp"
      fileLabel="Arquivo da logomarca"
      fileHint="PNG com fundo transparente de preferência. Até 5 MB. SVG não é aceito por segurança."
      submitLabel="Enviar logomarca"
    >
      <input type="hidden" name="id" value={id} />
    </UploadForm>
  );
}

export function AddFactForm({ id }: { id: string }) {
  const [result, onSubmit, pending] = useServerForm<BrandResult>(addFactAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <SelectField label="Tipo" name="tipo" defaultValue="BENEFICIO">
          {BRAND_FACT_KINDS.map((k) => (
            <option key={k} value={k}>
              {BRAND_FACT_KIND_LABELS[k]}
            </option>
          ))}
        </SelectField>
        <Field label="Título" name="titulo" required minLength={2} maxLength={200} placeholder="Ex.: Consultas com desconto na rede credenciada" />
      </div>
      <TextAreaField label="Detalhes" name="detalhe" rows={3} maxLength={2000} hint="Condições, valores e regras exatamente como devem aparecer nos anúncios." />
      <div>
        <Button type="submit" variant="secondary" disabled={pending} icon={<Plus className="size-4" />}>
          Cadastrar informação
        </Button>
      </div>
    </form>
  );
}

export function FactButtons({ brandId, factId, canApprove, approved }: { brandId: string; factId: string; canApprove: boolean; approved: boolean }) {
  const [approveResult, onApprove, approving] = useServerForm<BrandResult>(approveFactAction);
  const [removeResult, onRemove, removing] = useServerForm<BrandResult>(removeFactAction);
  const result = approveResult ?? removeResult;
  return (
    <div className="grid gap-2">
      {result && !result.ok ? <ResultMessage result={result} /> : null}
      <div className="flex flex-wrap gap-2">
        {canApprove && !approved ? (
          <form onSubmit={onApprove}>
            <input type="hidden" name="marca" value={brandId} />
            <input type="hidden" name="fato" value={factId} />
            <Button type="submit" disabled={approving} icon={<Check className="size-4" />}>
              Aprovar
            </Button>
          </form>
        ) : null}
        <form onSubmit={onRemove}>
          <input type="hidden" name="marca" value={brandId} />
          <input type="hidden" name="fato" value={factId} />
          <Button type="submit" variant="ghost" disabled={removing} icon={<Trash2 className="size-4" />}>
            Remover
          </Button>
        </form>
      </div>
    </div>
  );
}

export function DeleteBrandForm({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [result, onSubmit, pending] = useServerForm<BrandResult>(deleteBrandAction);
  useEffect(() => {
    if (result?.ok) router.push("/admin/marketing/marca");
  }, [result, router]);
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={id} />
      <Checkbox
        name="confirmo"
        label={
          <>
            Confirmo que quero excluir a marca <strong>{name}</strong>, a logomarca e as informações oficiais. Os criativos continuam na biblioteca.
          </>
        }
      />
      <div>
        <Button type="submit" variant="cta" disabled={pending} icon={<Trash2 className="size-4" />}>
          Excluir marca
        </Button>
      </div>
    </form>
  );
}
