import { Clapperboard, GalleryHorizontal, Image, Library, MessagesSquare, Palette, Send } from "lucide-react";

const ICONS = { Clapperboard, GalleryHorizontal, Image, Library, MessagesSquare, Palette, Send };

export function SectionIcon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}
