import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Ugoki — Motion, made yours.',
    template: '%s · Ugoki',
  },
  description:
    'Art-directed motion templates. Customize in seconds, export in your browser. Free, no sign-up, nothing leaves your device.',
  applicationName: 'Ugoki',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-theme="daylight">
      <body>{children}</body>
    </html>
  );
}
