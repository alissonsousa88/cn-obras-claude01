"use client";

import { acaoEntrar } from "@/server/acoes";
import { BotaoEnviar, Formulario } from "@/componentes/Formulario";
import { Campo, classeInput } from "@/componentes/primitivos";

export function FormularioLogin() {
  return (
    <Formulario acao={acaoEntrar} className="space-y-4">
      <Campo rotulo="E-mail">
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue="joao@cnobras.app"
          className={classeInput}
        />
      </Campo>
      <Campo rotulo="Senha">
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          defaultValue="cnobras2026"
          className={classeInput}
        />
      </Campo>
      <BotaoEnviar className="w-full">Entrar</BotaoEnviar>
    </Formulario>
  );
}
