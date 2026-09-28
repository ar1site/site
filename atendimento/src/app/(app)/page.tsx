import type { Metadata } from "next";
import { Fila } from "@/components/Fila";

export const metadata: Metadata = { title: "Fila" };

export default function PaginaFila() {
  return <Fila />;
}
