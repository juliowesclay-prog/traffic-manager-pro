"use client";

import { Link2, Send, Unlink } from "lucide-react";
import { useState } from "react";
import { checkAdPolicy } from "@tmp/core/marketing-ai";
import { META_AD_LIMITS, META_CTAS } from "@tmp/core/meta-publish";
import { Button, Checkbox, Field, SelectField, TextAreaField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import { linkAdAction, sendToMetaAction, unlinkAdAction } from "./actions";

type AdSet = { id: string; name: string; status: string; campaign: string };
type Page = { id: string; name: string; instagramId?: string | null; instagramName?: string | null };

export function SendForm({
  creativeId,
  defaults,
  adSets,
  pages,
  pagesError,
}: {
  creativeId: string;
  defaults: { adName: string; link: string; primaryText: string; headline: string };
  adSets: AdSet[];
  pages: Page[];
  pagesError: string | null;
}) {
  const [result, onSubmit, pending] = useServerForm(sendToMetaAction);
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [text, setText] = useState(defaults.primaryText);
  const [headline, setHeadline] = useState(defaults.headline);
  const [description, setDescription] = useState("");
  const page = pages.find((p) => p.id === pageId);
  const policy = checkAdPolicy(text, headline, description);

  return (
    <form onSubmit={onSubmit} className="grid gap-5" data-testid="form-enviar-meta">
      <ResultMessage result={result} />
      <input type="hidden" name="criativo" value={creativeId} />
      <SelectField
        label="Conjunto de anúncios (campanha — conjunto)"
        name="conjunto"
        required
        defaultValue=""
      >
        <option value="" disabled>
          Escolha…
        </option>
        {adSets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.campaign} — {s.name}
            {s.status !== "ACTIVE" ? " (pausado)" : ""}
          </option>
        ))}
      </SelectField>
      {pages.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Página do Facebook"
            name="pagina"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Instagram" name="instagram" key={pageId} defaultValue={page?.instagramId ?? ""}>
            <option value="">Usar a página do Facebook</option>
            {page?.instagramId ? (
              <option value={page.instagramId}>{page.instagramName ?? page.instagramId}</option>
            ) : null}
          </SelectField>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="ID da página do Facebook"
            name="pagina"
            required
            inputMode="numeric"
            hint={pagesError ?? "A Meta não listou páginas para esta conta."}
          />
          <Field label="ID da conta do Instagram" name="instagram" inputMode="numeric" />
        </div>
      )}
      <Field
        label="Nome do anúncio"
        name="nome"
        required
        defaultValue={defaults.adName}
        maxLength={META_AD_LIMITS.name}
      />
      <TextAreaField
        label="Texto principal"
        name="texto"
        required
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={META_AD_LIMITS.primaryText}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Título"
          name="titulo"
          required
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={META_AD_LIMITS.headline}
        />
        <Field
          label="Descrição"
          name="descricao"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={META_AD_LIMITS.description}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Link de destino"
          name="link"
          required
          type="url"
          defaultValue={defaults.link}
          placeholder="https://"
        />
        <SelectField label="Chamada para ação (botão)" name="cta" defaultValue="LEARN_MORE">
          {Object.entries(META_CTAS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
      </div>
      {policy.length ? (
        <div
          className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="alerta-politica-envio"
        >
          <p className="font-semibold">Atenção às políticas de anúncios da Meta:</p>
          <ul className="mt-1 list-disc pl-5">
            {policy.map((p) => (
              <li key={p.motivo}>{p.motivo}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Checkbox
        name="confirmo"
        label="Revisei o texto, a imagem e as políticas de anúncios da Meta. Entendo que o anúncio será criado PAUSADO."
      />
      <Button type="submit" disabled={pending} className="w-fit">
        <Send aria-hidden="true" className="size-4" />
        {pending ? "Enviando para a Meta…" : "Criar anúncio pausado na Meta"}
      </Button>
    </form>
  );
}

export function LinkAdForm({ creativeId, ads }: { creativeId: string; ads: { id: string; name: string }[] }) {
  const [result, onSubmit, pending] = useServerForm(linkAdAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-3" data-testid="vincular-anuncio">
      <ResultMessage result={result} />
      <input type="hidden" name="criativo" value={creativeId} />
      <SelectField label="Anúncio já existente na Meta" name="anuncio" defaultValue="" required>
        <option value="" disabled>
          Escolha…
        </option>
        {ads.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </SelectField>
      <Button type="submit" variant="secondary" disabled={pending || !ads.length} className="w-fit">
        <Link2 aria-hidden="true" className="size-4" />
        Vincular para medir o desempenho
      </Button>
    </form>
  );
}

export function UnlinkAdButton({ creativeId, adId }: { creativeId: string; adId: string }) {
  const [result, onSubmit, pending] = useServerForm(unlinkAdAction);
  return (
    <form onSubmit={onSubmit} className="inline">
      {result && !result.ok ? <span className="text-sm text-red-dark">{result.message} </span> : null}
      <input type="hidden" name="criativo" value={creativeId} />
      <input type="hidden" name="anuncio" value={adId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        <Unlink aria-hidden="true" className="size-4" />
        Desvincular
      </Button>
    </form>
  );
}
