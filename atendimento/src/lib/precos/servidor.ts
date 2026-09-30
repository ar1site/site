import "server-only";

// Leitura da tabela de preços no servidor (chave de serviço), para a IA e o recálculo.

import { ErroProposta, tabelaAusente } from "../propostas/registro";
import { supabaseServico } from "../supabase/service";
import { AVISO_FALTA_MIGRACAO_PRECOS, TABELA_PRECOS } from "./limites";
import { normalizarItem, type ItemDePreco } from "./precos";

/** Todos os itens (ativos e inativos), para o recálculo respeitar o que a proposta já usa. */
export async function lerTabelaDePrecos(): Promise<ItemDePreco[]> {
  const { data, error } = await supabaseServico().from(TABELA_PRECOS).select("*").order("service").order("sort_order").limit(500);
  if (error) {
    if (tabelaAusente(error)) throw new ErroProposta(AVISO_FALTA_MIGRACAO_PRECOS, 503, true);
    throw new ErroProposta(`Erro ao ler a tabela de preços: ${error.message}`, 500);
  }
  return (data ?? []).map((l) => normalizarItem(l as Record<string, unknown>));
}
