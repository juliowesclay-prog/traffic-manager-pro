"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "Igual ao sistema", light: "Claro", dark: "Escuro" };
const ICON = { system: Monitor, light: Sun, dark: Moon };

/**
 * Troca o tema (sistema → claro → escuro). Grava num cookie (lido no servidor, sem "piscar" ao
 * abrir a página) e aplica na hora pelo atributo data-theme do <html>.
 */
export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const Icon = ICON[choice];
  function cycle() {
    const next = NEXT[choice];
    setChoice(next);
    const root = document.documentElement;
    if (next === "system") {
      delete root.dataset.theme;
      document.cookie = "tema=; Path=/; Max-Age=0; SameSite=Lax";
    } else {
      root.dataset.theme = next;
      document.cookie = `tema=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
  }
  return (
    <button
      type="button"
      onClick={cycle}
      data-testid="tema"
      className="flex min-h-10 w-full items-center gap-3 rounded-[9px] px-3 text-sm font-medium text-side-ink hover:bg-side-2 hover:text-white"
    >
      <Icon aria-hidden="true" className="size-[18px] opacity-75" />
      <span>
        Tema: <span className="text-white">{LABEL[choice]}</span>
      </span>
    </button>
  );
}
