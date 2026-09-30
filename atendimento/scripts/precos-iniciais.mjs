// Tabela de preços inicial da AR1 Films: os mesmos itens que a migração
// 20260930110000_ar1_propostas_premium.sql insere. Esta lista é a fonte; o
// INSERT da migração sai dela:
//
//   node scripts/precos-iniciais.mjs --sql        imprime o INSERT
//   node scripts/precos-iniciais.mjs --conferir   confere se a migração tem
//                                                 exatamente esse INSERT (sai com
//                                                 código 1 se não tiver)
//
// Mudou um item aqui? Rode --sql, cole no lugar do INSERT da migração e rode
// --conferir. Depois de aplicada no banco, a tabela passa a ser da equipe (tela
// Ajustes → Tabela de preços): mudar esta lista não altera o banco.
//
// São VALORES INICIAIS SUGERIDOS para o mercado de Goiânia / Brasil central em
// 2026, todos com confirmed=false: a equipe confirma cada um na tela
// Ajustes → Tabela de preços antes de usá-los em propostas.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let n = 0;
const item = (service, name, unit, price, description, includes, extra = {}) => {
  n += 1;
  return {
    id: id(n),
    service,
    name,
    description,
    unit,
    price,
    min_qty: 1,
    includes,
    active: true,
    confirmed: false,
    sort_order: n * 10,
    ...extra,
  };
};

export const PRECOS_INICIAIS = [
  // Podcast gravado ---------------------------------------------------------
  item("Podcast gravado", "Episódio gravado e editado no estúdio", "por episódio", 1200,
    "Gravação no estúdio da AR1 com até 4 pessoas na bancada, edição completa e entrega pronta para publicar.",
    ["Estúdio com cenário, luz e áudio tratado", "3 câmeras com operação", "Sincronização de áudio e correção de cor", "Edição do episódio completo", "Entrega em 4K e versão para YouTube"]),
  item("Podcast gravado", "Pacote mensal: 4 episódios gravados e editados", "por mês", 4000,
    "Quatro episódios por mês com data fixa no estúdio, para quem quer cadência.",
    ["4 gravações no estúdio", "Edição completa de cada episódio", "Agenda fixa mensal", "Postagem opcional, combinada à parte"]),
  item("Podcast gravado", "Pacote de 5 cortes verticais por episódio", "por episódio", 350,
    "Cortes curtos (Reels, Shorts, TikTok) com legenda e identidade do programa.",
    ["5 cortes de até 90 segundos", "Legendas dinâmicas", "Capa e título de cada corte"]),
  // Podcast ao vivo ---------------------------------------------------------
  item("Podcast ao vivo", "Episódio ao vivo dirigido", "por episódio", 1900,
    "Transmissão ao vivo dirigida em tempo real, com gravação simultânea para reaproveitar.",
    ["Direção de corte ao vivo", "Troca de câmeras, telas e vinhetas", "Transmissão para YouTube, Instagram ou plataforma do cliente", "Gravação completa em alta qualidade"]),
  item("Podcast ao vivo", "Pacote mensal: 4 episódios ao vivo", "por mês", 6800,
    "Quatro programas ao vivo por mês, com a mesma equipe e o mesmo cenário.",
    ["4 transmissões dirigidas", "Gravação de todas as edições", "Agenda fixa mensal"]),
  // Podcast itinerante ------------------------------------------------------
  item("Podcast itinerante", "Diária do estúdio itinerante em evento", "por dia", 4500,
    "Estúdio montado dentro da feira, congresso ou evento: cenário, luz, áudio, câmeras e equipe para gravar em série.",
    ["Cenário com a identidade do evento ou patrocinador", "3 câmeras, iluminação e áudio profissional", "Equipe de direção e operação no local", "Fila de convidados organizada com a produção"]),
  item("Podcast itinerante", "Montagem e desmontagem do estúdio no local", "por evento", 2500,
    "Transporte, montagem antes do evento e desmontagem ao final.",
    ["Transporte em Goiânia e região", "Montagem no dia anterior", "Desmontagem ao final do evento"]),
  item("Podcast itinerante", "Edição de episódio gravado no evento", "por episódio", 600,
    "Edição de cada conversa gravada no evento, com abertura e identidade.",
    ["Edição completa", "Correção de cor e tratamento de áudio", "Entrega para as redes do evento"]),
  // Transmissão ao vivo -----------------------------------------------------
  item("Transmissão ao vivo", "Transmissão ao vivo com 2 câmeras", "por dia", 4800,
    "Para palestras, cultos, aulas e eventos de médio porte.",
    ["2 câmeras com operação", "Mesa de corte e inserção de slides", "Áudio integrado à mesa do evento", "Gravação completa"]),
  item("Transmissão ao vivo", "Transmissão ao vivo com 4 câmeras e direção", "por dia", 8500,
    "Congressos, shows e eventos corporativos com direção de corte ao vivo.",
    ["4 câmeras com operação", "Direção de corte ao vivo", "Inserção de slides, telões e vinhetas", "Planejamento técnico de sinal e conexão", "Gravação completa"]),
  item("Transmissão ao vivo", "Câmera adicional com operador", "por dia", 1200,
    "Mais um ponto de vista na transmissão ou na gravação.",
    ["Câmera e operador por dia"]),
  // Leilão 360 --------------------------------------------------------------
  item("Leilão 360", "Leilão 360: pacote base", "por evento", 18000,
    "O leilão começa antes do primeiro lote e continua depois do último: aquecimento, transmissão e melhores momentos.",
    ["Antes: agenda de conteúdo e aquecimento dos lotes", "Durante: transmissão multicâmera com direção de corte (1 dia)", "Depois: melhores momentos e conteúdos para o próximo ano", "Equipe completa no local"]),
  item("Leilão 360", "Conteúdo dos lotes antes do leilão (diária de captação)", "por dia", 3500,
    "Diária na fazenda para gravar os lotes e os bastidores usados no aquecimento.",
    ["Captação em campo com 2 câmeras e drone", "Edição dos vídeos dos lotes"]),
  item("Leilão 360", "Dia extra de transmissão do leilão", "por dia", 6500,
    "Para leilões com mais de um dia de pista.",
    ["Transmissão multicâmera com direção", "Gravação completa"]),
  // Filme de Legado ---------------------------------------------------------
  item("Filme de Legado", "Filme de Legado: pesquisa, escuta e roteiro", "por projeto", 9000,
    "Levantamento da história, entrevistas preliminares e roteiro do documentário.",
    ["Pesquisa e escuta com a família ou a empresa", "Organização do acervo existente", "Roteiro e plano de gravação"]),
  item("Filme de Legado", "Filme de Legado: diária de captação e entrevistas", "por dia", 4200,
    "Gravação dirigida das entrevistas e das imagens do filme.",
    ["Equipe de direção, câmera e áudio", "Iluminação de entrevista", "Drone quando o local permitir"]),
  item("Filme de Legado", "Filme de Legado: edição, cor e finalização", "por projeto", 14000,
    "Montagem do filme final para acervo, eventos e relacionamento.",
    ["Montagem e narrativa", "Correção de cor e mixagem", "Trilha licenciada", "Versão completa e versão curta"]),
  // Filme de marca ----------------------------------------------------------
  item("Filme de marca", "Filme institucional de marca", "por projeto", 16000,
    "Filme de até 3 minutos com roteiro, captação em 2 diárias e finalização.",
    ["Planejamento e roteiro", "2 diárias de captação", "Entrevistas e depoimentos", "Edição, cor e mixagem", "Versões para site e redes"]),
  item("Filme de marca", "Diária de captação adicional", "por dia", 3800,
    "Mais um dia de gravação com a equipe completa.",
    ["Equipe de câmera, áudio e direção", "Iluminação"]),
  // Fotografia --------------------------------------------------------------
  item("Fotografia", "Diária de fotografia", "por dia", 2400,
    "Fotografia de produto, equipe, evento ou propriedade, com tratamento.",
    ["Fotógrafo com equipamento profissional", "Até 80 fotos tratadas", "Entrega em alta e para redes"]),
  // Shows/DVDs/clipes -------------------------------------------------------
  item("Shows/DVDs/clipes", "Gravação de show ou DVD multicâmera", "por evento", 22000,
    "Captação multicâmera do show, bastidores e edição do produto final.",
    ["Até 6 câmeras com operação", "Captação de áudio multipista", "Bastidores e entrevistas", "Edição e finalização do DVD ou especial"]),
  item("Shows/DVDs/clipes", "Clipe musical", "por projeto", 12000,
    "Clipe com roteiro, 1 diária de captação e finalização.",
    ["Roteiro e direção", "1 diária de captação", "Edição, cor e efeitos", "Versões horizontal e vertical"]),
  // Conteúdo recorrente -----------------------------------------------------
  item("Conteúdo recorrente", "Plano mensal de conteúdo: 4 vídeos e cortes", "por mês", 5500,
    "Método e cadência para organizações que têm conhecimento relevante para compartilhar.",
    ["Diagnóstico editorial e calendário", "1 diária de captação por mês", "4 vídeos editados", "8 cortes verticais", "Fotos de apoio"]),
  // Consultoria de estúdio --------------------------------------------------
  item("Consultoria de estúdio", "Consultoria: diagnóstico", "por projeto", 3500,
    "Objetivo, público, formatos, equipe e espaço: o que o estúdio precisa ser.",
    ["Reunião de diagnóstico", "Visita ao espaço", "Relatório com recomendações"]),
  item("Consultoria de estúdio", "Consultoria: projeto técnico e especificação", "por projeto", 7500,
    "Arquitetura técnica, acústica, luz, áudio e vídeo, com a lista de equipamentos para decisão de compra.",
    ["Projeto técnico do estúdio", "Especificação de equipamentos e softwares", "Aproveitamento do que o cliente já tem"]),
  item("Consultoria de estúdio", "Consultoria: implantação, testes e treinamento", "por projeto", 9000,
    "Acompanhamento da montagem, testes e treinamento da equipe do cliente.",
    ["Acompanhamento da implantação", "Testes de gravação e transmissão", "Treinamento da equipe", "Suporte no primeiro mês"]),
  // Locação do Haras SOBI ---------------------------------------------------
  item("Locação do Haras SOBI", "Diária: cenários externos (bosque, lago e pista)", "por dia", 6000,
    "Locação dos cenários externos para gravações e ensaios.",
    ["Acesso aos cenários externos", "Apoio da equipe do Haras", "Estacionamento e apoio elétrico"]),
  item("Locação do Haras SOBI", "Diária: área coberta e salão de eventos", "por dia", 12000,
    "Área coberta e salão para eventos, gravações e transmissões.",
    ["Área coberta e salão", "Lounge coberto com cenografia", "Apoio da equipe do Haras"]),
  item("Locação do Haras SOBI", "Diária: locação completa do Haras", "por dia", 20000,
    "Todos os cenários, a área coberta para até 4 mil pessoas e a pista de laço.",
    ["Mais de 20 cenários em uma única locação", "Área coberta e pista de laço", "Apoio da equipe do Haras"]),
  // Teleprompter ------------------------------------------------------------
  item("Teleprompter", "Teleprompter: diária avulsa", "por dia", 450,
    "Equipamento profissional com tela de alto brilho e software intuitivo.",
    ["Teleprompter e suporte", "Software e tablet", "Entrega e retirada em Goiânia"]),
  item("Teleprompter", "Teleprompter: diária com operador", "por dia", 900,
    "O equipamento com um operador da AR1 durante toda a gravação ou transmissão.",
    ["Teleprompter e suporte", "Operador durante o uso", "Preparação do texto"]),
];

// ------------------------------------------------------------- INSERT da migração

export const MIGRACAO_PRECOS = new URL("../../supabase/migrations/20260930110000_ar1_propostas_premium.sql", import.meta.url);

const texto = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** O INSERT da tabela inicial, exatamente como aparece na migração (uma linha por item). */
export function sqlDosPrecosIniciais(itens = PRECOS_INICIAIS) {
  const linhas = itens.map(
    (i) =>
      `  (${texto(i.id)}, ${texto(i.service)}, ${texto(i.name)}, ${i.description === null ? "NULL" : texto(i.description)}, ` +
      `${texto(i.unit)}, ${Number(i.price).toFixed(2)}, ${i.min_qty}, ${texto(JSON.stringify(i.includes))}::jsonb, ` +
      `${i.confirmed ? "true" : "false"}, ${i.sort_order})`,
  );
  return (
    "INSERT INTO public.ar1_price_items (id, service, name, description, unit, price, min_qty, includes, confirmed, sort_order) VALUES\n" +
    `${linhas.join(",\n")}\n` +
    "ON CONFLICT (id) DO NOTHING;"
  );
}

/** A migração tem exatamente o INSERT gerado desta lista? */
export function conferirMigracao(sql = readFileSync(MIGRACAO_PRECOS, "utf8")) {
  const esperado = sqlDosPrecosIniciais();
  return { ok: sql.replace(/\r\n/g, "\n").includes(esperado), esperado };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const modo = process.argv[2];
  if (modo === "--sql") {
    process.stdout.write(`${sqlDosPrecosIniciais()}\n`);
  } else if (modo === "--conferir") {
    const { ok } = conferirMigracao();
    const servicos = new Set(PRECOS_INICIAIS.map((i) => i.service));
    const naoConfirmados = PRECOS_INICIAIS.filter((i) => !i.confirmed).length;
    console.log(`${PRECOS_INICIAIS.length} itens, ${servicos.size} serviços, ${naoConfirmados} com confirmed=false.`);
    if (ok) {
      console.log(`OK: ${fileURLToPath(MIGRACAO_PRECOS)} tem o mesmo INSERT desta lista.`);
    } else {
      console.error("DIFERENTE: o INSERT da migração não bate com esta lista. Rode --sql e cole o resultado na migração.");
      process.exitCode = 1;
    }
  } else {
    console.log("Uso: node scripts/precos-iniciais.mjs --sql | --conferir");
  }
}
