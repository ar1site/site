"use client";

import { useMedia } from "@/lib/tela";
import { Funil } from "./Funil";
import { OportunidadeDetalhe } from "./OportunidadeDetalhe";

/** Mesmo ponto de quebra do `xl` do Tailwind: acima dele cabem o quadro e o painel. */
const CONSULTA_TELA_LARGA = "(min-width: 80rem)";

/**
 * Detalhe da oportunidade. Em tela larga abre como painel ao lado do quadro;
 * nas demais (celular, tablet) é a página inteira.
 */
export function FunilComDetalhe({ id }: { id: string }) {
  const telaLarga = useMedia(CONSULTA_TELA_LARGA);

  if (!telaLarga) return <OportunidadeDetalhe key={id} id={id} />;

  return (
    <div className="flex h-dvh">
      <div className="min-w-0 flex-1">
        <Funil selecionadoId={id} />
      </div>
      <aside className="w-[440px] shrink-0 overflow-y-auto border-l border-borda bg-superficie-2">
        <OportunidadeDetalhe key={id} id={id} emPainel />
      </aside>
    </div>
  );
}
