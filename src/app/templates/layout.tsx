import { Gallery } from '@/features/gallery/gallery';
import './morph.css';

/**
 * The gallery around `/templates` and its category pages (docs/02-experience.md §5): one client
 * shell that stays mounted between them (the render worker, the tiles, the personalization);
 * each page adds its heading and intro, server-rendered.
 */
export default function TemplatesLayout({ children }: LayoutProps<'/templates'>) {
  return <Gallery>{children}</Gallery>;
}
