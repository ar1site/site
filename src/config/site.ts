export const SITE_NAME = "AR1 Films";
export const LEGAL_NAME = "TODO_RAZAO_SOCIAL";
export const CNPJ = "30.687.924/0001-79";
export const CITY = "Goiânia - GO";
export const TAGLINE = "Produção audiovisual, locação e transmissões para projetos que não podem falhar.";
export const HARAS_ADDRESS = "Haras SOBI · GO-010, sentido Nerópolis, saída de Goiânia - GO";
export const STUDIO_ADDRESS = "TODO_ENDERECO_ESTUDIO_GOIANIA";
export const MAPS_URL = "";
export const EMAIL = "contato@ar1films.com";
export const WHATSAPP_DISPLAY = "(62) 9835-4354";
export const WHATSAPP_E164 = "556298354354";
export const WHATSAPP_BASE_MESSAGE = "Olá, AR1! Vim pelo site e quero falar sobre";

// O projeto é Vite; variáveis públicas usam o prefixo VITE_ em vez de NEXT_PUBLIC_.
export const GA4_ID = import.meta.env.VITE_GA4_ID ?? "";

export function whatsappLink(topic: string) {
  return `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(`${WHATSAPP_BASE_MESSAGE} ${topic}.`)}`;
}

export function whatsappMessageLink(message: string) {
  return `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(message)}`;
}
