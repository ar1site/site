import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FunilComDetalhe } from "@/components/FunilComDetalhe";

export const metadata: Metadata = { title: "Oportunidade" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaOportunidade(props: PageProps<"/funil/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  return <FunilComDetalhe id={id} />;
}
