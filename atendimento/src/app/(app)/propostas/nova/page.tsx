import type { Metadata } from "next";
import { NovaProposta } from "@/components/NovaProposta";

export const metadata: Metadata = { title: "Nova proposta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ?oportunidade=<id> (botão "Montar proposta" do funil) ou ?contato=<id> (conversa sem oportunidade). */
function idDaConsulta(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v && UUID.test(v) ? v : null;
}

export default async function PaginaNovaProposta(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const consulta = await props.searchParams;
  const oportunidadeId = idDaConsulta(consulta.oportunidade);
  const contatoId = oportunidadeId ? null : idDaConsulta(consulta.contato);
  return <NovaProposta key={`${oportunidadeId ?? ""}-${contatoId ?? ""}`} oportunidadeId={oportunidadeId} contatoId={contatoId} />;
}
