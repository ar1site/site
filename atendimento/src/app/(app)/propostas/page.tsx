import type { Metadata } from "next";
import { ListaPropostas } from "@/components/ListaPropostas";

export const metadata: Metadata = { title: "Propostas" };

export default function PaginaPropostas() {
  return <ListaPropostas />;
}
