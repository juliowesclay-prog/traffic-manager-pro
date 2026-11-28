import {
  Brush,
  Clapperboard,
  GalleryHorizontal,
  Image,
  Library,
  MessagesSquare,
  Palette,
  Send,
  TrendingUp,
} from "lucide-react";

const ICONS = {
  Brush,
  Clapperboard,
  GalleryHorizontal,
  Image,
  Library,
  MessagesSquare,
  Palette,
  Send,
  TrendingUp,
};

export function SectionIcon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}
