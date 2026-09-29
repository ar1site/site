import type { Metadata } from "next";
import { Funil } from "@/components/Funil";

export const metadata: Metadata = { title: "Funil" };

export default function PaginaFunil() {
  return <Funil />;
}
