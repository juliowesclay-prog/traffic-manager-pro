"use client";

import { ImagePlus, Plus, Save, Sparkles, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ART_FORMATS,
  ART_LIMITS,
  ART_TEMPLATES,
  CAROUSEL_FORMATS,
  CAROUSEL_LIMITS,
  LOGO_POSITIONS,
  type ArtFormat,
  type ArtSpec,
  type ArtTemplate,
  type CarouselSpec,
  type LogoPosition,
} from "@tmp/core/art";
import { BRAND_FONTS } from "@tmp/core/marketing";
import { Button, Checkbox, Field, SelectField, TextAreaField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import type { CreativeResult } from "@/server/marketing/creatives";
import { uploadMarketingFile } from "./upload-client";

export type BrandOption = {
  id: string;
  name: string;
  colors: string[];
  headingFont: string | null;
  bodyFont: string | null;
  ctas: string[];
  hasLogo: boolean;
};
export type LibraryImage = { id: string; label: string };

type SaveAction = (prev: CreativeResult | undefined, f: FormData) => Promise<CreativeResult>;
type GenImage = (
  prompt: string,
  format: string,
) => Promise<{ ok: true; id: string; demo: boolean } | { ok: false; message: string }>;

/** Prévia desenhada pelo servidor (o mesmo desenho que será salvo), atualizada ~0,6 s depois de cada mudança. */
function usePreview(body: unknown) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(body);
  const last = useRef<string | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/admin/marketing/previa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
          signal: ctl.signal,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { message?: string };
          setError(j.message ?? "Não foi possível desenhar a prévia.");
          return;
        }
        const blob = await res.blob();
        const next = URL.createObjectURL(blob);
        if (last.current) URL.revokeObjectURL(last.current);
        last.current = next;
        setUrl(next);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Não foi possível desenhar a prévia.");
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [key]);
  return { url, error, loading };
}

function Preview({ body, format, label }: { body: unknown; format: ArtFormat; label: string }) {
  const { url, error, loading } = usePreview(body);
  const f = ART_FORMATS[format];
  return (
    <div className="grid gap-2" data-testid="previa-arte">
      <div
        className="relative w-full overflow-hidden rounded-xl border border-line bg-canvas"
        style={{ aspectRatio: `${f.width} / ${f.height}`, maxHeight: "72vh" }}
      >
        {url ? (
          <img src={url} alt={label} className="size-full object-contain" />
        ) : (
          <p className="p-4 text-sm text-ink-soft">Desenhando a prévia…</p>
        )}
        {loading && url ? (
          <span className="absolute right-2 top-2 rounded-full bg-surface px-2 py-0.5 text-xs text-ink-soft">
            atualizando…
          </span>
        ) : null}
      </div>
      <p className="text-xs text-ink-soft">
        {f.label} · {f.width}×{f.height} px · PNG
      </p>
      {error ? <p className="text-sm font-semibold text-red-dark">{error}</p> : null}
    </div>
  );
}

function BrandFields({
  brands,
  brandId,
  onBrand,
  colors,
  setColors,
  fontsState,
  setFonts,
}: {
  brands: BrandOption[];
  brandId: string | null;
  onBrand: (b: BrandOption | null) => void;
  colors: { primary: string; accent: string };
  setColors: (c: { primary: string; accent: string }) => void;
  fontsState: { headingFont: string; bodyFont: string };
  setFonts: (f: { headingFont: string; bodyFont: string }) => void;
}) {
  return (
    <fieldset className="grid gap-4 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-ink">Marca e identidade</legend>
      <SelectField
        label="Marca"
        value={brandId ?? ""}
        onChange={(e) => onBrand(brands.find((b) => b.id === e.target.value) ?? null)}
        hint="Aplica as cores, fontes e a logomarca do kit da marca."
      >
        <option value="">Sem marca</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Cor principal (fundo)
          <input
            type="color"
            value={colors.primary}
            onChange={(e) => setColors({ ...colors, primary: e.target.value.toUpperCase() })}
            className="h-11 w-full rounded-lg border border-slate-300 bg-surface"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Cor de destaque (botão)
          <input
            type="color"
            value={colors.accent}
            onChange={(e) => setColors({ ...colors, accent: e.target.value.toUpperCase() })}
            className="h-11 w-full rounded-lg border border-slate-300 bg-surface"
          />
        </label>
        <SelectField
          label="Fonte dos títulos"
          value={fontsState.headingFont}
          onChange={(e) => setFonts({ ...fontsState, headingFont: e.target.value })}
        >
          {BRAND_FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </SelectField>
        <SelectField
          label="Fonte dos textos"
          value={fontsState.bodyFont}
          onChange={(e) => setFonts({ ...fontsState, bodyFont: e.target.value })}
        >
          {BRAND_FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </SelectField>
      </div>
    </fieldset>
  );
}

/** Foto de fundo: nenhuma, enviar do computador, escolher da biblioteca ou gerar por IA. */
function BackgroundPicker({
  value,
  onChange,
  library,
  format,
  imageAi,
  generateImage,
  label,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  library: LibraryImage[];
  format: ArtFormat;
  imageAi: boolean;
  generateImage: GenImage;
  label: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [uploaded, setUploaded] = useState<LibraryImage[]>([]);
  const options = [...uploaded, ...library];

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const r = await uploadMarketingFile(file, "criativo", () => undefined);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, message: r.message });
    setUploaded((u) => [{ id: r.id, label: `Enviada agora: ${file.name}` }, ...u]);
    onChange(r.id);
    setMsg({ ok: true, message: "Foto enviada." });
  }

  async function onGenerate() {
    setBusy(true);
    setMsg(null);
    const r = await generateImage(prompt, format);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, message: r.message });
    setUploaded((u) => [
      { id: r.id, label: `Gerada por IA${r.demo ? " (DEMO)" : ""}: ${prompt.slice(0, 40)}` },
      ...u,
    ]);
    onChange(r.id);
    setMsg({
      ok: true,
      message: r.demo ? "Imagem DEMO criada (gerador simulado)." : "Imagem criada pela IA.",
    });
  }

  return (
    <fieldset className="grid gap-4 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-ink">{label}</legend>
      <SelectField label="Foto" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Sem foto</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <label className="grid gap-2 text-sm font-semibold text-ink">
        Enviar uma foto (PNG, JPG ou WEBP, só material próprio ou licenciado)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="min-h-11 w-full rounded-lg border border-dashed border-slate-300 bg-surface p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-50 file:px-3 file:py-2 file:font-semibold file:text-accent-text"
        />
      </label>
      {imageAi ? (
        <div className="grid gap-2">
          <TextAreaField
            label="Ou gere a foto por IA"
            hint="Descreva a cena. A IA cria só a foto, sem texto; o título e a logomarca entram pela arte."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            maxLength={900}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={onGenerate}
            disabled={busy || prompt.trim().length < 5}
            className="w-fit"
          >
            <Sparkles aria-hidden="true" className="size-4" />
            {busy ? "Gerando…" : "Gerar foto"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          A geração de fotos por IA ainda não foi ligada neste ambiente.
        </p>
      )}
      {msg ? <ResultMessage result={msg} /> : null}
    </fieldset>
  );
}

function SaveBox({
  action,
  spec,
  creativeId,
  defaultName,
  label,
}: {
  action: SaveAction;
  spec: unknown;
  creativeId: string | null;
  defaultName: string;
  label: string;
}) {
  const router = useRouter();
  const [result, onSubmit, pending] = useServerForm(action);
  useEffect(() => {
    if (result?.ok && result.id) router.push(`/admin/marketing/biblioteca/${result.id}`);
  }, [result, router]);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <ResultMessage result={result} />
      <input type="hidden" name="spec" value={JSON.stringify(spec)} />
      {creativeId ? (
        <>
          <input type="hidden" name="criativo" value={creativeId} />
          <Field
            label="O que mudou nesta versão"
            name="nota"
            maxLength={300}
            placeholder="Ex.: título mais curto"
          />
        </>
      ) : (
        <Field
          label="Nome do criativo"
          name="nome"
          required
          minLength={2}
          maxLength={ART_LIMITS.name}
          defaultValue={defaultName}
        />
      )}
      <Button type="submit" disabled={pending} className="w-fit">
        <Save aria-hidden="true" className="size-4" />
        {pending ? "Gerando…" : creativeId ? "Salvar como nova versão" : label}
      </Button>
    </form>
  );
}

const initialColors = (b: BrandOption | null) => ({
  primary: b?.colors[0] ?? "#1E3A8A",
  accent: b?.colors[1] ?? b?.colors[0] ?? "#F59E0B",
});

// ─── Arte ─────────────────

export function ArtEditor({
  brands,
  library,
  initial,
  creativeId,
  imageAi,
  saveAction,
  generateImage,
}: {
  brands: BrandOption[];
  library: LibraryImage[];
  initial: Partial<ArtSpec> & { name?: string };
  creativeId: string | null;
  imageAi: boolean;
  saveAction: SaveAction;
  generateImage: GenImage;
}) {
  const startBrand =
    brands.find((b) => b.id === initial.brandId) ?? (brands.length === 1 ? brands[0]! : null);
  const [brandId, setBrandId] = useState<string | null>(startBrand?.id ?? null);
  const [format, setFormat] = useState<ArtFormat>(initial.format ?? "quadrado");
  const [template, setTemplate] = useState<ArtTemplate>(initial.template ?? "destaque");
  const [title, setTitle] = useState(initial.title ?? "");
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? "");
  const [cta, setCta] = useState(initial.cta ?? startBrand?.ctas[0] ?? "");
  const [highlight, setHighlight] = useState(initial.highlight ?? "");
  const [background, setBackground] = useState<string | null>(initial.backgroundAssetId ?? null);
  const [showLogo, setShowLogo] = useState(initial.showLogo ?? !!startBrand?.hasLogo);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>(initial.logoPosition ?? "topo-esquerda");
  const [colors, setColors] = useState(initial.colors ?? initialColors(startBrand));
  const [fontState, setFonts] = useState({
    headingFont: initial.headingFont ?? startBrand?.headingFont ?? "Sora",
    bodyFont: initial.bodyFont ?? startBrand?.bodyFont ?? "Inter",
  });
  const brand = brands.find((b) => b.id === brandId) ?? null;
  const spec = {
    format,
    template,
    title: title || "Seu título aqui",
    subtitle,
    cta,
    highlight,
    brandId,
    backgroundAssetId: background,
    showLogo,
    logoPosition,
    colors,
    ...fontState,
  };
  const saveSpec = { ...spec, title };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Formato"
            value={format}
            onChange={(e) => setFormat(e.target.value as ArtFormat)}
          >
            {Object.entries(ART_FORMATS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Modelo"
            value={template}
            onChange={(e) => setTemplate(e.target.value as ArtTemplate)}
          >
            {Object.entries(ART_TEMPLATES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
        </div>
        <Field
          label="Título"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={ART_LIMITS.title}
        />
        <TextAreaField
          label="Texto de apoio"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          maxLength={ART_LIMITS.subtitle}
          rows={2}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Chamada para ação (botão)"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            maxLength={ART_LIMITS.cta}
            list="ctas-marca"
          />
          {template === "oferta" ? (
            <Field
              label="Destaque"
              hint="Use só condição aprovada no kit da marca."
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              maxLength={ART_LIMITS.highlight}
            />
          ) : null}
        </div>
        <datalist id="ctas-marca">
          {(brand?.ctas ?? []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <BrandFields
          brands={brands}
          brandId={brandId}
          onBrand={(b) => {
            setBrandId(b?.id ?? null);
            setColors(initialColors(b));
            setFonts({ headingFont: b?.headingFont ?? "Sora", bodyFont: b?.bodyFont ?? "Inter" });
            setShowLogo(!!b?.hasLogo);
            if (!cta && b?.ctas[0]) setCta(b.ctas[0]);
          }}
          colors={colors}
          setColors={setColors}
          fontsState={fontState}
          setFonts={setFonts}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Checkbox
            label={brand?.hasLogo ? "Mostrar a logomarca" : "Mostrar a logomarca (cadastre no kit da marca)"}
            checked={showLogo}
            disabled={!brand?.hasLogo}
            onChange={(e) => setShowLogo(e.target.checked)}
          />
          <SelectField
            label="Posição da logomarca"
            value={logoPosition}
            onChange={(e) => setLogoPosition(e.target.value as LogoPosition)}
          >
            {Object.entries(LOGO_POSITIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
        </div>
        {template !== "texto" ? (
          <BackgroundPicker
            value={background}
            onChange={setBackground}
            library={library}
            format={format}
            imageAi={imageAi}
            generateImage={generateImage}
            label="Foto de fundo"
          />
        ) : null}
      </div>
      <div className="grid content-start gap-5 xl:sticky xl:top-4">
        <Preview body={{ tipo: "arte", spec }} format={format} label="Prévia da arte" />
        <SaveBox
          action={saveAction}
          spec={saveSpec}
          creativeId={creativeId}
          defaultName={initial.name ?? ""}
          label="Salvar na biblioteca"
        />
      </div>
    </div>
  );
}

// ─── Carrossel ─────────────────

export function CarouselEditor({
  brands,
  library,
  initial,
  creativeId,
  imageAi,
  saveAction,
  generateImage,
}: {
  brands: BrandOption[];
  library: LibraryImage[];
  initial: Partial<CarouselSpec> & { name?: string };
  creativeId: string | null;
  imageAi: boolean;
  saveAction: SaveAction;
  generateImage: GenImage;
}) {
  const startBrand =
    brands.find((b) => b.id === initial.brandId) ?? (brands.length === 1 ? brands[0]! : null);
  const [brandId, setBrandId] = useState<string | null>(startBrand?.id ?? null);
  const [format, setFormat] = useState<(typeof CAROUSEL_FORMATS)[number]>(initial.format ?? "quadrado");
  const [pages, setPages] = useState(
    initial.pages?.length
      ? initial.pages
      : [
          { title: "", text: "" },
          { title: "", text: "" },
          { title: "", text: "" },
        ],
  );
  const [cta, setCta] = useState(initial.cta ?? startBrand?.ctas[0] ?? "");
  const [cover, setCover] = useState<string | null>(initial.coverAssetId ?? null);
  const [showLogo, setShowLogo] = useState(initial.showLogo ?? !!startBrand?.hasLogo);
  const [colors, setColors] = useState(initial.colors ?? initialColors(startBrand));
  const [fontState, setFonts] = useState({
    headingFont: initial.headingFont ?? startBrand?.headingFont ?? "Sora",
    bodyFont: initial.bodyFont ?? startBrand?.bodyFont ?? "Inter",
  });
  const [current, setCurrent] = useState(0);
  const [, startTransition] = useTransition();
  const brand = brands.find((b) => b.id === brandId) ?? null;

  const filled = pages.map((p, i) => ({
    title: p.title || (i === 0 ? "Título da capa" : ""),
    text: p.text || (p.title ? "" : "…"),
  }));
  const spec = { format, pages: filled, cta, brandId, coverAssetId: cover, showLogo, colors, ...fontState };
  const saveSpec = { ...spec, pages };
  const page = Math.min(current, pages.length - 1);
  const setPage = (i: number, patch: Partial<{ title: string; text: string }>) =>
    setPages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, d: -1 | 1) =>
    setPages((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const next = [...ps];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-5">
        <SelectField
          label="Formato"
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
        >
          {CAROUSEL_FORMATS.map((k) => (
            <option key={k} value={k}>
              {ART_FORMATS[k].label}
            </option>
          ))}
        </SelectField>
        <ol className="grid gap-4" data-testid="paginas">
          {pages.map((p, i) => (
            <li
              key={i}
              className="grid gap-3 rounded-xl border border-line p-4"
              onFocus={() => startTransition(() => setCurrent(i))}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Página {i + 1}
                  {i === 0 ? " · capa" : i === pages.length - 1 ? " · fechamento" : ""}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Subir página ${i + 1}`}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === pages.length - 1}
                    aria-label={`Descer página ${i + 1}`}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))}
                    disabled={pages.length <= CAROUSEL_LIMITS.minPages}
                    aria-label={`Remover página ${i + 1}`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>
              <Field
                label={`Título da página ${i + 1}`}
                required={i === 0}
                value={p.title}
                onChange={(e) => setPage(i, { title: e.target.value })}
                maxLength={CAROUSEL_LIMITS.title}
              />
              <TextAreaField
                label={`Texto da página ${i + 1}`}
                value={p.text}
                onChange={(e) => setPage(i, { text: e.target.value })}
                maxLength={CAROUSEL_LIMITS.text}
                rows={2}
              />
              <Button type="button" variant="secondary" onClick={() => setCurrent(i)} className="w-fit">
                Ver esta página na prévia
              </Button>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPages((ps) => [...ps, { title: "", text: "" }])}
          disabled={pages.length >= CAROUSEL_LIMITS.maxPages}
          className="w-fit"
        >
          <Plus aria-hidden="true" className="size-4" />
          Adicionar página
        </Button>
        <Field
          label="Chamada final (botão da última página)"
          value={cta}
          onChange={(e) => setCta(e.target.value)}
          maxLength={ART_LIMITS.cta}
        />
        <BrandFields
          brands={brands}
          brandId={brandId}
          onBrand={(b) => {
            setBrandId(b?.id ?? null);
            setColors(initialColors(b));
            setFonts({ headingFont: b?.headingFont ?? "Sora", bodyFont: b?.bodyFont ?? "Inter" });
            setShowLogo(!!b?.hasLogo);
          }}
          colors={colors}
          setColors={setColors}
          fontsState={fontState}
          setFonts={setFonts}
        />
        <Checkbox
          label={
            brand?.hasLogo
              ? "Mostrar a logomarca em todas as páginas"
              : "Mostrar a logomarca (cadastre no kit da marca)"
          }
          checked={showLogo}
          disabled={!brand?.hasLogo}
          onChange={(e) => setShowLogo(e.target.checked)}
        />
        <BackgroundPicker
          value={cover}
          onChange={setCover}
          library={library}
          format={format}
          imageAi={imageAi}
          generateImage={generateImage}
          label="Foto da capa"
        />
      </div>
      <div className="grid content-start gap-5 xl:sticky xl:top-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Página na prévia">
          {pages.map((_, i) => (
            <Button
              key={i}
              type="button"
              variant={i === page ? "primary" : "secondary"}
              onClick={() => setCurrent(i)}
              aria-pressed={i === page}
            >
              {i + 1}
            </Button>
          ))}
        </div>
        <Preview
          body={{ tipo: "carrossel", spec, pagina: page }}
          format={format}
          label={`Prévia da página ${page + 1}`}
        />
        <SaveBox
          action={saveAction}
          spec={saveSpec}
          creativeId={creativeId}
          defaultName={initial.name ?? ""}
          label="Gerar e salvar o carrossel"
        />
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <ImagePlus aria-hidden="true" className="size-4" />
          Ao salvar, todas as páginas viram PNG e entram na biblioteca; dá para baixar tudo em ZIP.
        </p>
      </div>
    </div>
  );
}
