import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Conversa } from "@/components/Conversa";
import { Fila } from "@/components/Fila";

export const metadata: Metadata = { title: "Conversa" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaConversa(props: PageProps<"/atendimento/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();

  return (
    <div className="flex h-dvh lg:h-dvh">
      <aside className="hidden w-[380px] shrink-0 overflow-y-auto border-r border-borda lg:block">
        <Fila compacta selecionadoId={id} />
      </aside>
      <div className="min-w-0 flex-1">
        <Conversa key={id} atendimentoId={id} />
      </div>
    </div>
  );
}
