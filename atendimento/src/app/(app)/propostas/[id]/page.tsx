import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorPropostaPremium } from "@/components/EditorPropostaPremium";

export const metadata: Metadata = { title: "Proposta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaProposta(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, consulta] = await Promise.all([props.params, props.searchParams]);
  if (!UUID.test(id)) notFound();
  // ?nova=1: acabou de ser gerada (o editor mostra os recados da IA).
  return <EditorPropostaPremium key={id} id={id} nova={consulta.nova === "1"} />;
}
