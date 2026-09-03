import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="pt-BR">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
