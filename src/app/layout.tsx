import type { Metadata, Viewport } from 'next';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SITE_NAME,
  SITE_URL,
  shareImage,
} from '@/features/site/metadata';
import { ugokiMono, ugokiSans } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  // Share cards for pages that set none of their own: Open Graph and Twitter fill in each page's
  // title and description; the picture is the landing's card.
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    images: [shareImage('home', DEFAULT_TITLE)],
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-theme="daylight" className={`${ugokiSans.variable} ${ugokiMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
