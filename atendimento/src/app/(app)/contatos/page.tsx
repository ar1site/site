import type { Metadata } from "next";
import { Contatos } from "@/components/Contatos";

export const metadata: Metadata = { title: "Contatos" };

export default function PaginaContatos() {
  return <Contatos />;
}
