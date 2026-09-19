import type { Metadata, Viewport } from "next";
import { Archivo, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { THEME_SCRIPT } from "@/components/shell/theme-toggle";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OutBox CMS", template: "%s · OutBox CMS" },
  description: "Crie artigos uma vez e publique no blog de cada cliente.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f3f5" },
    { media: "(prefers-color-scheme: dark)", color: "#131416" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${sourceSerif.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-paper text-text">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: "var(--font-sans)",
              borderRadius: 12,
              border: "1px solid var(--color-line)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
            },
          }}
        />
      </body>
    </html>
  );
}
