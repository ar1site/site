import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

let cliente: SupabaseClient | null = null;

/**
 * Cliente com a chave de serviço (ignora RLS). SÓ no servidor: webhook,
 * análise da IA, envio e lista da equipe. Nunca importar em código de cliente.
 */
export function supabaseServico(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}
