import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/**
 * IBM Plex Sans foi desenhada para interface técnica densa e se mantém legível
 * em corpo pequeno — que é o caso aqui, no celular, em campo. A Plex Mono
 * acompanha na mesma superfamília e carrega o que é dado: códigos de demanda,
 * prazos, valores e scores de prioridade.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fonte-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--fonte-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CN Obras — gestão operacional de infraestrutura",
  description:
    "Sistema operacional do ministério de obras da Comunidade das Nações: percebe o que precisa de atenção, aponta o próximo movimento e acompanha até o resultado.",
};

export const viewport: Viewport = {
  themeColor: "#1e2330",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
