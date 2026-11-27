"use client";

import { Clapperboard, Mic, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND_FONTS } from "@tmp/core/marketing";
import {
  CAPTION_POSITIONS,
  formatCaptionLines,
  parseCaptionLines,
  VIDEO_FITS,
  VIDEO_FORMATS,
  VIDEO_LOGO_POSITIONS,
  type CaptionPosition,
  type CaptionSegment,
  type VideoFit,
  type VideoFormat,
  type VideoLogoPosition,
} from "@tmp/core/video";
import { Button, Checkbox, Field, SelectField, TextAreaField } from "@tmp/ui";
import { ResultMessage } from "@/components/forms/result-message";
import { useServerForm } from "@/components/forms/use-server-form";
import { cancelVideoJobAction, transcribeAction, videoEditAction } from "../studio-actions";

const sec = (ms: number) => (ms / 1000).toFixed(1);

export function VideoEditor({
  creativeId,
  name,
  durationMs,
  brand,
  transcript,
  transcribeOn,
}: {
  creativeId: string;
  name: string;
  durationMs: number;
  brand: { hasLogo: boolean; colors: string[]; font: string | null; cta: string | null } | null;
  transcript: CaptionSegment[] | null;
  transcribeOn: boolean;
}) {
  const [result, onSubmit, pending] = useServerForm(videoEditAction);
  const [outName, setOutName] = useState(`${name} editado`.slice(0, 110));
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState(sec(durationMs));
  const [removeSilence, setRemoveSilence] = useState(false);
  const [formats, setFormats] = useState<VideoFormat[]>(["9:16"]);
  const [fit, setFit] = useState<VideoFit>("cortar");
  const [captionsOn, setCaptionsOn] = useState(!!transcript?.length);
  const [captionText, setCaptionText] = useState(transcript ? formatCaptionLines(transcript) : "");
  const [captionPos, setCaptionPos] = useState<CaptionPosition>("baixo");
  const [captionFont, setCaptionFont] = useState(brand?.font ?? "Inter");
  const [logoOn, setLogoOn] = useState(!!brand?.hasLogo);
  const [logoPos, setLogoPos] = useState<VideoLogoPosition>("topo-direita");
  const [endOn, setEndOn] = useState(false);
  const [endTitle, setEndTitle] = useState("");
  const [endCta, setEndCta] = useState(brand?.cta ?? "");
  const [endSeconds, setEndSeconds] = useState("3");

  useEffect(() => {
    if (transcript?.length) {
      setCaptionText(formatCaptionLines(transcript));
      setCaptionsOn(true);
    }
  }, [transcript]);

  const parsed = parseCaptionLines(captionText);
  const spec = {
    name: outName,
    trim: {
      startMs: Math.round(Number(start.replace(",", ".")) * 1000) || 0,
      endMs: Math.round(Number(end.replace(",", ".")) * 1000) || null,
    },
    removeSilence,
    formats,
    fit,
    captions: {
      enabled: captionsOn,
      segments: parsed.ok ? parsed.segments : [],
      position: captionPos,
      font: captionFont,
    },
    logo: { enabled: logoOn, position: logoPos },
    endCard: {
      enabled: endOn,
      title: endTitle,
      cta: endCta,
      seconds: Number(endSeconds) || 3,
      background: brand?.colors[0] ?? "#1E3A8A",
      accent: brand?.colors[1] ?? brand?.colors[0] ?? "#F59E0B",
      font: brand?.font ?? "Inter",
    },
  };

  return (
    <div className="grid gap-6">
      <TranscribeBox creativeId={creativeId} enabled={transcribeOn} />
      <form onSubmit={onSubmit} className="grid gap-5" data-testid="editor-video">
        <ResultMessage
          result={result ?? (captionsOn && !parsed.ok ? { ok: false, message: parsed.message } : undefined)}
        />
        <input type="hidden" name="criativo" value={creativeId} />
        <input type="hidden" name="spec" value={JSON.stringify(spec)} />
        <Field
          label="Nome dos vídeos gerados"
          required
          value={outName}
          onChange={(e) => setOutName(e.target.value)}
          maxLength={110}
        />

        <fieldset className="grid gap-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Cortes</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Começa em (segundos)"
              inputMode="decimal"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <Field
              label={`Termina em (segundos, vídeo tem ${sec(durationMs)})`}
              inputMode="decimal"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <Checkbox
            label="Remover silêncios e pausas longas automaticamente"
            checked={removeSilence}
            onChange={(e) => setRemoveSilence(e.target.checked)}
          />
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Formatos (um vídeo para cada)</legend>
          {Object.entries(VIDEO_FORMATS).map(([k, v]) => (
            <Checkbox
              key={k}
              label={v.label}
              checked={formats.includes(k as VideoFormat)}
              onChange={(e) =>
                setFormats((fs) => (e.target.checked ? [...fs, k as VideoFormat] : fs.filter((x) => x !== k)))
              }
            />
          ))}
          <SelectField label="Enquadramento" value={fit} onChange={(e) => setFit(e.target.value as VideoFit)}>
            {Object.entries(VIDEO_FITS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
        </fieldset>

        <fieldset className="grid gap-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Legendas</legend>
          <Checkbox
            label="Colocar legendas no vídeo"
            checked={captionsOn}
            onChange={(e) => setCaptionsOn(e.target.checked)}
          />
          <TextAreaField
            label="Texto das legendas"
            hint='Uma por linha: "00:01.0 - 00:03.5 texto". Os tempos são do vídeo original; os cortes são aplicados sozinhos.'
            value={captionText}
            onChange={(e) => setCaptionText(e.target.value)}
            rows={6}
            className="font-mono"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Posição"
              value={captionPos}
              onChange={(e) => setCaptionPos(e.target.value as CaptionPosition)}
            >
              {Object.entries(CAPTION_POSITIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectField>
            <SelectField label="Fonte" value={captionFont} onChange={(e) => setCaptionFont(e.target.value)}>
              {BRAND_FONTS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </SelectField>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Marca</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Checkbox
              label={
                brand?.hasLogo
                  ? "Pôr a logomarca"
                  : "Pôr a logomarca (ligue o vídeo a uma marca com logomarca)"
              }
              checked={logoOn}
              disabled={!brand?.hasLogo}
              onChange={(e) => setLogoOn(e.target.checked)}
            />
            <SelectField
              label="Posição da logomarca"
              value={logoPos}
              onChange={(e) => setLogoPos(e.target.value as VideoLogoPosition)}
            >
              {Object.entries(VIDEO_LOGO_POSITIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectField>
          </div>
          <Checkbox
            label="Encerramento com chamada para ação no fim"
            checked={endOn}
            onChange={(e) => setEndOn(e.target.checked)}
          />
          {endOn ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Texto do encerramento"
                required
                value={endTitle}
                onChange={(e) => setEndTitle(e.target.value)}
                maxLength={60}
              />
              <Field
                label="Chamada (botão)"
                value={endCta}
                onChange={(e) => setEndCta(e.target.value)}
                maxLength={32}
              />
              <SelectField label="Duração" value={endSeconds} onChange={(e) => setEndSeconds(e.target.value)}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} segundos
                  </option>
                ))}
              </SelectField>
            </div>
          ) : null}
        </fieldset>

        <Button type="submit" disabled={pending || !formats.length} className="w-fit">
          <Clapperboard aria-hidden="true" className="size-4" />
          {pending ? "Enviando…" : "Gerar os vídeos"}
        </Button>
      </form>
    </div>
  );
}

function TranscribeBox({ creativeId, enabled }: { creativeId: string; enabled: boolean }) {
  const [result, onSubmit, pending] = useServerForm(transcribeAction);
  if (!enabled)
    return (
      <p className="text-sm text-ink-soft">
        A transcrição automática ainda não foi ligada: digite as legendas abaixo.
      </p>
    );
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <ResultMessage result={result} />
      <input type="hidden" name="criativo" value={creativeId} />
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        <Mic aria-hidden="true" className="size-4" />
        {pending ? "Enviando…" : "Transcrever a fala (legendas automáticas)"}
      </Button>
    </form>
  );
}

export function CancelJob({ id }: { id: string }) {
  const [result, onSubmit, pending] = useServerForm(cancelVideoJobAction);
  return (
    <form onSubmit={onSubmit} className="inline">
      {result && !result.ok ? <span className="text-sm text-red-dark">{result.message}</span> : null}
      <input type="hidden" name="tarefa" value={id} />
      <Button type="submit" variant="ghost" disabled={pending}>
        <X aria-hidden="true" className="size-4" />
        Cancelar
      </Button>
    </form>
  );
}

/** Atualiza a página a cada 5 s enquanto há vídeos na fila ou processando. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
