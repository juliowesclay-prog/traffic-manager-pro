"use client";

import { Copy, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CREATIVE_STATUS_LABELS, MEDIA_LIMITS, type CreativeStatus } from "@tmp/core/marketing";
import { Button, Checkbox, Field, SelectField, TextAreaField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import { UploadForm } from "@/components/marketing/upload-form";
import type { CreativeResult } from "@/server/marketing/creatives";
import {
  addVersionAction,
  changeStatusAction,
  createCreativeAction,
  deleteCreativeAction,
  duplicateCreativeAction,
  updateCreativeAction,
} from "../actions";

type Option = { id: string; name: string };
const ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.mov";

function LinkFields({
  brands,
  campaigns,
  brandId,
  campaignId,
}: {
  brands: Option[];
  campaigns: Option[];
  brandId?: string | null;
  campaignId?: string | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Marca" name="marca" defaultValue={brandId ?? ""}>
        <option value="">Sem marca</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Campanha relacionada" name="campanha" defaultValue={campaignId ?? ""}>
        <option value="">Nenhuma</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

const FILE_HINT = `Uma imagem, de 2 a ${MEDIA_LIMITS.carouselMax} imagens (vira carrossel, na ordem escolhida) ou um vídeo. PNG, JPG ou WEBP até 20 MB; MP4 ou MOV até 500 MB e 10 minutos. Use só material próprio ou licenciado.`;

export function ImportCreativeForm({ brands, campaigns }: { brands: Option[]; campaigns: Option[] }) {
  return (
    <UploadForm
      action={createCreativeAction}
      purpose="criativo"
      accept={ACCEPT}
      multiple
      fileLabel="Arquivos"
      fileHint={FILE_HINT}
      submitLabel="Enviar para a biblioteca"
      redirectBase="/admin/marketing/biblioteca/"
    >
      <Field label="Nome do criativo" name="nome" required minLength={2} maxLength={120} placeholder="Ex.: Cartão do Trabalhador — feed novembro" />
      <LinkFields brands={brands} campaigns={campaigns} />
    </UploadForm>
  );
}

export function NewVersionForm({ id, multiple }: { id: string; multiple: boolean }) {
  return (
    <UploadForm
      action={addVersionAction}
      purpose="criativo"
      accept={ACCEPT}
      multiple={multiple}
      fileLabel="Arquivos da nova versão"
      fileHint="Mesmo tipo do criativo. O arquivo original e as versões anteriores continuam guardados."
      submitLabel="Criar nova versão"
    >
      <input type="hidden" name="id" value={id} />
      <TextAreaField label="O que mudou" name="nota" maxLength={300} rows={2} placeholder="Ex.: chamada mais forte no título" />
    </UploadForm>
  );
}

export function DetailsForm({
  id,
  name,
  brands,
  campaigns,
  brandId,
  campaignId,
}: {
  id: string;
  name: string;
  brands: Option[];
  campaigns: Option[];
  brandId: string | null;
  campaignId: string | null;
}) {
  const [result, onSubmit, pending] = useServerForm<CreativeResult>(updateCreativeAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={id} />
      <Field label="Nome do criativo" name="nome" required minLength={2} maxLength={120} defaultValue={name} />
      <LinkFields brands={brands} campaigns={campaigns} brandId={brandId} campaignId={campaignId} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending} icon={<Save className="size-4" />}>
          Salvar dados
        </Button>
      </div>
    </form>
  );
}

export function StatusForm({ id, options }: { id: string; options: CreativeStatus[] }) {
  const [result, onSubmit, pending] = useServerForm<CreativeResult>(changeStatusAction);
  if (!options.length) return <p className="text-sm text-ink-soft">Nenhuma mudança de status disponível para o seu perfil.</p>;
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={id} />
      <SelectField label="Novo status" name="status" defaultValue={options[0]}>
        {options.map((s) => (
          <option key={s} value={s}>
            {CREATIVE_STATUS_LABELS[s]}
          </option>
        ))}
      </SelectField>
      <div>
        <Button type="submit" disabled={pending}>
          Alterar status
        </Button>
      </div>
    </form>
  );
}

export function DuplicateButton({ id }: { id: string }) {
  const router = useRouter();
  const [result, onSubmit, pending] = useServerForm<CreativeResult>(duplicateCreativeAction);
  useEffect(() => {
    if (result?.ok && result.id) router.push(`/admin/marketing/biblioteca/${result.id}`);
  }, [result, router]);
  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      {result && !result.ok ? <ResultMessage result={result} /> : null}
      <input type="hidden" name="id" value={id} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending} icon={<Copy className="size-4" />}>
          Duplicar
        </Button>
      </div>
    </form>
  );
}

export function DeleteForm({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [result, onSubmit, pending] = useServerForm<CreativeResult>(deleteCreativeAction);
  useEffect(() => {
    if (result?.ok) router.push("/admin/marketing/biblioteca");
  }, [result, router]);
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <ResultMessage result={result} />
      <input type="hidden" name="id" value={id} />
      <Checkbox
        name="confirmo"
        label={
          <>
            Confirmo que quero excluir <strong>{name}</strong>, com todas as versões e arquivos. Isso não pode ser desfeito.
          </>
        }
      />
      <div>
        <Button type="submit" variant="cta" disabled={pending} icon={<Trash2 className="size-4" />}>
          Excluir definitivamente
        </Button>
      </div>
    </form>
  );
}
