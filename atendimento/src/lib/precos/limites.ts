// Nomes e avisos da tabela de preços (sem dependências).

export const TABELA_PRECOS = "ar1_price_items";
export const MIGRACAO_PRECOS = "20260930110000_ar1_propostas_premium.sql";
export const AVISO_FALTA_MIGRACAO_PRECOS =
  `A tabela de preços ainda não existe no banco de dados (falta aplicar a migração ${MIGRACAO_PRECOS}).`;
