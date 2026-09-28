import type { Metadata } from "next";
import { Configuracoes } from "@/components/Configuracoes";

export const metadata: Metadata = { title: "Configurações" };

export default function PaginaConfiguracoes() {
  return <Configuracoes />;
}
