/**
 * Shim de `next/link` para a versão navegável.
 *
 * Permite reaproveitar os componentes reais da aplicação (primitivos,
 * CartaoAtencao, CartaoDemanda) sem tocá-los: aqui a navegação é por hash,
 * já que a página roda inteira no navegador.
 */
import type { ReactNode } from "react";

export default function Link({
  href,
  children,
  className,
  title,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <a href={`#${href}`} className={className} title={title}>
      {children}
    </a>
  );
}
