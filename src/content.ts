import { EMAIL, SITE_NAME, WHATSAPP_E164 } from "./config/site";

export const siteConfig = {
  brand: SITE_NAME,
  domain: "ar1films.com",
  email: EMAIL,
  whatsappNumber: WHATSAPP_E164,
  instagramUrl: "",
  youtubeUrl: "",
  linkedinUrl: "",
} as const;

export const solutionFamilies = [
  {
    number: "01",
    key: "operar",
    eyebrow: "Operar conteúdo",
    title: "Conhecimento interno transformado em presença recorrente.",
    body: "Para organizações que possuem especialistas e assuntos relevantes, mas precisam de método, cadência e produção para colocar esse conhecimento em circulação.",
    items: ["Diagnóstico editorial", "Captação recorrente", "Conteúdos derivados", "Organização de calendário e entregas"],
    status: "Operação gerenciada em ciclo de validação",
    image: "/media/camera-auction-vertical.webp",
  },
  {
    number: "02",
    key: "capacidade",
    eyebrow: "Construir capacidade",
    title: "Um estúdio que nasce para funcionar — não apenas para existir.",
    body: "Diagnóstico, projeto, ativação e suporte para empresas e instituições que desejam criar ou organizar uma estrutura própria de produção.",
    items: ["Diagnóstico de uso e viabilidade", "Projeto técnico", "Implantação e testes", "Treinamento e suporte operacional"],
    status: "Consultoria e implantação sob medida",
    image: "/media/consultoria-hero-estudio-v1.webp",
  },
  {
    number: "03",
    key: "especiais",
    eyebrow: "Projetos especiais",
    title: "Estrutura, direção e produção para momentos que não podem falhar.",
    body: "Transmissões, eventos, filmes e produções em grande escala, organizados a partir do objetivo, do público, da locação e da complexidade real.",
    items: ["Transmissões ao vivo", "Leilão 360", "Filmes de marca e legado", "Produções no Haras SOBI"],
    status: "Projetos dimensionados por escopo",
    image: "/media/event-stage.webp",
  },
] as const;

export const flagshipOffers = [
  {
    tag: "Gravação, edição e ao vivo",
    title: "Podcast",
    body: "Gravação, edição até a postagem ou transmissão ao vivo. No estúdio, no Haras ou em qualquer lugar do Brasil.",
    href: "/podcast",
    image: "/media/podcast-entrevista-v1.webp",
  },
  {
    tag: "Locação e produção",
    title: "Haras SOBI",
    body: "Mais de 20 cenários, pista de laço para shows e DVDs e espaço coberto para até 4 mil pessoas.",
    href: "/haras-sobi",
    image: "/media/haras-show-noturno-2026-v1.webp",
  },
  {
    tag: "Transmissão e conteúdo",
    title: "Leilão 360",
    body: "Aquecimento, transmissão dirigida e conteúdos posteriores organizados como uma única operação.",
    href: "/leilao-360",
    image: "/media/camera-auction.webp",
  },
  {
    tag: "Projeto, implantação e treinamento",
    title: "Consultoria de estúdio",
    body: "Do diagnóstico ao treinamento da equipe, para a estrutura própria funcionar sem depender da AR1.",
    href: "/consultoria-podcast",
    image: "/media/consultoria-hero-estudio-v1.webp",
  },
  {
    tag: "Filme e patrimônio",
    title: "Filme de Legado",
    body: "Pesquisa, roteiro e produção para histórias que precisam permanecer com valor e clareza.",
    href: "/filme-de-legado",
    image: "/media/cattle-wide.webp",
  },
] as const;

export const intentRoutes = [
  {
    number: "01",
    prompt: "Gravar um podcast, no estúdio ou ao vivo",
    destination: "Ver Podcast",
    body: "Mais de 4 mil episódios. Você grava, a gente edita até a postagem. Ou transmite ao vivo.",
    href: "/podcast",
  },
  {
    number: "02",
    prompt: "Gravar um show, DVD, clipe ou campanha",
    destination: "Ver o Haras SOBI",
    body: "Mais de 20 cenários, pista de laço e área coberta para 4 mil pessoas em uma só locação.",
    href: "/haras-sobi",
  },
  {
    number: "03",
    prompt: "Transmitir um leilão ou evento ao vivo",
    destination: "Conhecer o Leilão 360",
    body: "Aquecimento, transmissão dirigida e melhores momentos, tudo em uma operação.",
    href: "/leilao-360",
  },
  {
    number: "04",
    prompt: "Montar ou reorganizar um estúdio de podcast",
    destination: "Ver a consultoria",
    body: "Projetamos espaço, acústica, equipamento e rotina para o estúdio funcionar depois da inauguração.",
    href: "/consultoria-podcast",
  },
  {
    number: "05",
    prompt: "Contar a história da empresa ou da família",
    destination: "Ver o Filme de Legado",
    body: "Pesquisa, entrevistas e filme para uma história que precisa durar.",
    href: "/filme-de-legado",
  },
  {
    number: "06",
    prompt: "Produzir conteúdo recorrente sem improviso",
    destination: "Ver soluções",
    body: "Transformamos o conhecimento da sua equipe em vídeos, podcasts e fotos com cadência.",
    href: "/solucoes",
  },
] as const;

export const relatedJourneys = {
  consulting: [
    { label: "01 · Serviço independente", title: "Podcast", body: "Gravação, edição até a postagem ou transmissão ao vivo.", href: "/podcast" },
    { label: "Operação recorrente", title: "Conteúdo depois da implantação", body: "Organize especialistas, pauta, captação e entregas para que o estúdio ganhe uso consistente.", href: "/solucoes#familias" },
    { label: "Formato móvel", title: "Podcast itinerante", body: "Leve entrevistas e conversas para empresas, feiras, eventos e locações especiais.", href: "/servicos/podcast-itinerante" },
    { label: "Escopo combinado", title: "Projetos integrados", body: "Coordene estúdio, conteúdo, audiovisual e transmissão dentro de uma mesma arquitetura.", href: "/servicos/projetos-integrados" },
  ],
  podcast: [
    { label: "01 · Cenário externo", title: "Haras SOBI", body: "Grave temporadas especiais em bosque, lago ou pista.", href: "/haras-sobi" },
    { label: "02 · Serviço independente", title: "Consultoria de estúdio", body: "Projeto, implantação e treinamento para quem quer estrutura própria.", href: "/consultoria-podcast" },
    { label: "03 · Ao vivo com venda", title: "Leilão 360", body: "Transmissão de leilão como operação única.", href: "/leilao-360" },
  ],
  haras: [
    { label: "Evento e transmissão", title: "Leilão 360", body: "Combine locação, aquecimento, operação ao vivo e ativos posteriores.", href: "/leilao-360" },
    { label: "Memória e patrimônio", title: "Filme de Legado", body: "Use território, história e imagem para construir uma narrativa de permanência.", href: "/filme-de-legado" },
    { label: "Produção em locação", title: "Produção externa", body: "Dimensione equipe, logística, captação e uso conforme a locação e a escala.", href: "/servicos/producao-externa" },
  ],
  method: [
    { label: "Arquitetura comercial", title: "Soluções AR1", body: "Entenda qual família de solução responde melhor ao desafio da organização.", href: "/solucoes" },
    { label: "Construir capacidade", title: "Consultoria de podcast", body: "Aplique o método ao diagnóstico, projeto, implantação e ativação de um estúdio.", href: "/consultoria-podcast" },
    { label: "Projeto de escala", title: "Haras SOBI", body: "Veja como locação e planejamento se conectam em produções de grande porte.", href: "/haras-sobi" },
  ],
  about: [
    { label: "Como a AR1 trabalha", title: "Método AR1", body: "Conheça as decisões, responsabilidades e critérios que orientam cada projeto.", href: "/metodo" },
    { label: "O que a AR1 organiza", title: "Soluções", body: "Explore operação de conteúdo, construção de capacidade e projetos especiais.", href: "/solucoes" },
    { label: "Patrimônio em narrativa", title: "Filme de Legado", body: "Veja uma oferta criada para histórias que precisam permanecer.", href: "/filme-de-legado" },
  ],
  live: [
    { label: "Locação e produção", title: "Haras SOBI", body: "Integre espaço, público, montagem e operação audiovisual em uma mesma proposta.", href: "/haras-sobi" },
    { label: "Capacidade técnica", title: "Transmissão ao vivo", body: "Conheça a frente de planejamento, captação, direção e operação de transmissão.", href: "/servicos/transmissao-ao-vivo" },
    { label: "Continuidade editorial", title: "Eventos e conteúdo", body: "Faça o evento continuar por meio de entrevistas, registros e peças posteriores.", href: "/servicos/eventos-e-conteudo" },
  ],
  legacy: [
    { label: "Território e locação", title: "Haras SOBI", body: "Encontre cenários e escala para entrevistas, patrimônio, filmes e campanhas.", href: "/haras-sobi" },
    { label: "Direção institucional", title: "Sobre a AR1", body: "Entenda a experiência e os compromissos que sustentam a atuação da marca.", href: "/sobre" },
    { label: "Captação e acervo", title: "Fotografia e vídeo", body: "Planeje roteiro, entrevistas, captação e organização de ativos complementares.", href: "/servicos/fotografia-e-video" },
  ],
} as const;

export const visualStories = [
  {
    label: "Produção em campo",
    title: "Estratégia, equipe e território na mesma operação.",
    body: "O contexto define roteiro, logística, captação e o uso posterior de cada ativo.",
    image: "/media/producao-campo-equipe.webp",
    alt: "Equipe audiovisual preparando uma gravação externa",
    href: "/metodo",
    cta: "Conhecer o método",
  },
  {
    label: "Eventos e transmissões",
    title: "O palco é apenas um momento da jornada.",
    body: "Planejamento técnico, direção e conteúdos posteriores transformam presença em continuidade.",
    image: "/media/evento-palco-camera.webp",
    alt: "Palco de evento com câmeras posicionadas para transmissão",
    href: "/leilao-360",
    cta: "Ver Leilão 360",
  },
  {
    label: "Conteúdo corporativo",
    title: "Especialistas podem se tornar uma mídia própria.",
    body: "Conhecimento interno ganha formato, cadência e qualidade para circular dentro e fora da organização.",
    image: "/media/conteudo-corporativo-palco.webp",
    alt: "Executivo apresentando conteúdo em um palco corporativo",
    href: "/solucoes",
    cta: "Explorar soluções",
  },
  {
    label: "Consultoria de podcast",
    title: "Um estúdio precisa nascer para operar.",
    body: "Diagnóstico, projeto, fluxo, implantação e treinamento vêm antes da rotina de gravação.",
    image: "/media/consultoria-estudio-sobi-v1.webp",
    alt: "Estúdio de podcast com câmeras, microfones e iluminação profissional",
    href: "/consultoria-podcast",
    cta: "Conhecer a consultoria",
  },
  {
    label: "Haras SOBI",
    title: "Uma locação capaz de mudar de escala e linguagem.",
    body: "Mais de 20 cenários, pista para shows e DVDs e espaço coberto para até 4 mil pessoas.",
    image: "/media/haras-vista-aerea-2026-v1.webp",
    alt: "Vista aérea real da pista e das áreas do Haras SOBI",
    href: "/haras-sobi",
    cta: "Explorar o Haras",
  },
  {
    label: "Filmes de legado",
    title: "Histórias organizadas para permanecer.",
    body: "Pesquisa, escuta, território e imagem reunidos em uma narrativa com valor de patrimônio.",
    image: "/media/cattle-wide.webp",
    alt: "Rebanho em uma paisagem iluminada pelo nascer do sol",
    href: "/filme-de-legado",
    cta: "Conhecer a oferta",
  },
] as const;

export const evidenceCases = [
  {
    status: "Capacidade informada",
    label: "Haras SOBI",
    title: "Escala física para projetos que não cabem em um estúdio convencional.",
    body: "Uma plataforma de locação e produção com mais de 20 cenários, pista de laço para shows e gravações de DVD e área coberta para até 4 mil pessoas.",
    proof: "+20 cenários · pista de laço · até 4 mil pessoas",
    image: "/media/haras-espaco-coberto-2026-v1.webp",
    alt: "Área coberta real do Haras SOBI preparada para projetos de grande escala",
    href: "/haras-sobi",
    cta: "Ver estrutura",
  },
  {
    status: "Capacidade integrada",
    label: "Eventos e transmissão",
    title: "Uma operação pensada antes, durante e depois do evento.",
    body: "A AR1 combina desenho técnico, direção, captação e organização de ativos posteriores conforme o objetivo e o escopo aprovado.",
    proof: "Planejamento · operação · conteúdos derivados",
    image: "/media/evento-palco-camera.webp",
    alt: "Câmeras posicionadas em um evento de grande porte",
    href: "/servicos/transmissao-ao-vivo",
    cta: "Conhecer a capacidade",
  },
  {
    status: "Método consultivo",
    label: "Consultoria de estúdio",
    title: "Estrutura, fluxo e equipe desenhados como uma única operação.",
    body: "A consultoria parte do uso e da viabilidade para orientar espaço, acústica, cenografia, áudio, vídeo, iluminação, equipamentos, implantação e treinamento.",
    proof: "Diagnóstico · projeto · implantação · ativação",
    image: "/media/consultoria-bastidores-estudio-v1.webp",
    alt: "Bastidores de um estúdio de videocast em operação",
    href: "/consultoria-podcast",
    cta: "Ver jornada consultiva",
  },
] as const;

export const podcastConsulting = {
  fits: [
    ["Estúdio do zero", "Para organizações que precisam transformar um espaço disponível em uma estrutura coerente com objetivos, público e rotina."],
    ["Estrutura existente", "Para quem já comprou equipamentos, mas ainda enfrenta gargalos de qualidade, integração, fluxo ou uso."],
    ["Operação corporativa", "Para empresas e instituições que desejam ativar especialistas, entrevistas, aulas, treinamentos e conteúdo recorrente."],
    ["Formato itinerante", "Para feiras, eventos e encontros que precisam levar a estrutura de conversa até onde o público e os convidados estão."],
  ],
  steps: [
    ["01", "Diagnosticar", "Objetivo, público, formatos, frequência, equipe, espaço, infraestrutura disponível e limites do projeto."],
    ["02", "Desenhar", "Arquitetura técnica, fluxo de gravação, cenografia, acústica, iluminação, áudio, vídeo e operação."],
    ["03", "Especificar", "Equipamentos, softwares, conexões e prioridades organizados para comparação e decisão de compra."],
    ["04", "Implantar e testar", "Acompanhamento da montagem, integração, configuração, testes de uso e correções antes da ativação."],
    ["05", "Treinar e evoluir", "Orientação da equipe, documentação do fluxo e próximos ajustes conforme a operação ganha recorrência."],
  ],
  deliverables: [
    "Diagnóstico de objetivo, público e formatos",
    "Projeto técnico e orientação de acústica",
    "Direção de cenografia, áudio, vídeo e iluminação",
    "Lista técnica e critérios para decisão de compra",
    "Fluxo de gravação, software e organização de arquivos",
    "Implantação, testes, treinamento e orientação editorial",
  ],
  decisions: [
    ["Comprar ou reorganizar?", "A consultoria identifica o que já pode ser aproveitado antes de recomendar novos investimentos."],
    ["Equipe própria ou apoio externo?", "O desenho considera quem realmente vai operar, manter e publicar com consistência."],
    ["Estúdio fixo ou itinerante?", "Uso, frequência, espaço e público determinam o modelo — não a tendência do momento."],
  ],
  faq: [
    ["A AR1 vende equipamentos?", "A consultoria pode orientar especificações e critérios de compra. A proposta define separadamente responsabilidades, fornecedores e aquisições."],
    ["É possível aproveitar equipamentos que já temos?", "Sim. O diagnóstico avalia compatibilidade, estado, limitações e aderência ao uso pretendido antes de recomendar substituições."],
    ["A consultoria inclui treinamento?", "O escopo pode incluir testes, treinamento da equipe e documentação do fluxo operacional. A extensão é definida conforme a complexidade do projeto."],
    ["Vocês também podem operar o estúdio?", "A operação recorrente pode ser avaliada como uma frente separada. Primeiro são definidos frequência, responsabilidades, equipe, entregas e nível de suporte."],
  ],
} as const;

export const methodSteps = [
  { number: "01", title: "Avaliar aderência", body: "Entendemos o problema, o público, a estrutura disponível e a decisão que o projeto precisa apoiar." },
  { number: "02", title: "Desenhar a operação", body: "Definimos escopo, responsabilidades, cronograma, canais, locação e recursos necessários." },
  { number: "03", title: "Produzir e ativar", body: "A equipe executa, dirige e organiza as entregas de acordo com o uso previsto desde o início." },
  { number: "04", title: "Aprender e evoluir", body: "Projetos recorrentes geram aprendizado para melhorar cadência, formatos, operação e resultado." },
] as const;

export const principles = [
  ["Problema antes do equipamento", "A estrutura é dimensionada pelo uso. Comprar tecnologia sem operação definida não resolve a demanda."],
  ["Uma fonte, vários ativos", "Uma boa sessão pode alimentar diferentes momentos da jornada comercial e institucional."],
  ["Verdade antes da vitrine", "Capacidades, números e resultados só entram na comunicação quando podem ser sustentados."],
  ["Continuidade antes do volume", "A operação deve caber na equipe, no orçamento e na rotina de quem precisa mantê-la."],
] as const;

export const harasFacts = [
  { value: "+20", label: "cenários diferentes em uma única locação" },
  { value: "4 mil", label: "pessoas em espaço coberto" },
  { value: "1 pista", label: "de laço para shows e gravações de DVD" },
] as const;

export const harasApplications = [
  ["Shows e DVDs", "Palco, pista, público e produção audiovisual organizados para projetos de grande escala."],
  ["Clipes e campanhas", "Variação de paisagens, arquitetura e atmosfera sem depender de muitas locações."],
  ["Filmes e conteúdo de marca", "Ambientes para entrevistas, narrativas, demonstrações, lançamentos e séries."],
  ["Eventos e experiências", "Área coberta, espaços externos e estrutura adaptável ao desenho de cada encontro."],
  ["Podcasts e conversas", "Cenários naturais e construídos para formatos especiais, temporadas e ativações."],
  ["Transmissões", "Integração entre locação, captação, direção e operação ao vivo sob planejamento técnico."],
] as const;

export const faq = [
  ["A AR1 é uma produtora ou uma consultoria?", "As duas capacidades se encontram no mesmo modelo. A AR1 pode diagnosticar, desenhar e implantar uma operação, além de produzir conteúdo, transmissões e projetos especiais."],
  ["Vocês atendem somente o agronegócio?", "Não. O agro é uma frente importante de experiência, relacionamento e produção, mas a AR1 atende organizações B2B, instituições, marcas, eventos e projetos culturais de diferentes setores."],
  ["O Haras SOBI pode receber que tipo de produção?", "Shows, DVDs, clipes, campanhas, filmes, podcasts, entrevistas, transmissões, lançamentos e eventos. A viabilidade de cada área depende de agenda, briefing e avaliação técnica."],
  ["É possível contratar apenas a locação do Haras?", "O formato é definido conforme o projeto. A proposta pode considerar locação, apoio de produção e operação audiovisual, respeitando as necessidades e responsabilidades de cada entrega."],
  ["A AR1 implanta estúdios próprios?", "Sim. O trabalho pode incluir diagnóstico, projeto técnico, orientação de ambiente, equipamentos, implantação, testes, treinamento e suporte."],
  ["Como funciona o orçamento?", "Primeiro avaliamos aderência, objetivo, local, prazo e complexidade. Depois apresentamos um escopo claro com responsabilidades, entregas e investimento."],
] as const;

export const legacyServiceDetails = [
  { slug: "transmissao-ao-vivo", eyebrow: "Projetos especiais", title: "Transmissões ao vivo com planejamento e direção.", summary: "Uma operação dimensionada para conectar evento, público e conteúdos posteriores com clareza técnica.", image: "/media/camera-auction.webp", project: "Transmissão ao vivo", items: ["Planejamento técnico", "Captação e direção de corte", "Operação de transmissão", "Conteúdos derivados quando previstos"] },
  { slug: "fotografia-e-video", eyebrow: "Projetos especiais", title: "Fotografia e vídeo para explicar, registrar e permanecer.", summary: "Produções para empresas, eventos, propriedades, marcas e histórias que pedem direção própria.", image: "/media/haras-pista-e-cavalo-2026-v1.webp", project: "Filme de marca ou legado", items: ["Planejamento e roteiro", "Fotografia e captação", "Entrevistas e depoimentos", "Edição e organização dos ativos"] },
  { slug: "podcast-itinerante", eyebrow: "Operar conteúdo", title: "Conteúdo onde as conversas realmente acontecem.", summary: "Estrutura móvel para entrevistas, podcasts e agendas editoriais em empresas, feiras, eventos e locações especiais.", image: "/media/edit-suite.webp", project: "Operação de conteúdo", items: ["Desenho editorial", "Captação de áudio e vídeo", "Operação no local", "Cortes e entregas conforme escopo"] },
  { slug: "eventos-e-conteudo", eyebrow: "Projetos especiais", title: "Conteúdo que faz o evento continuar depois do palco.", summary: "Planejamento e produção para registrar, ativar e prolongar a presença de eventos e marcas.", image: "/media/event-stage.webp", project: "Evento ou projeto especial", items: ["Plano de conteúdo", "Captação de momentos e entrevistas", "Peças de circulação", "Entrega organizada por finalidade"] },
  { slug: "producao-externa", eyebrow: "Haras SOBI e locações", title: "A locação certa também faz parte da narrativa.", summary: "Produções no Haras SOBI e em outras locações avaliadas de acordo com a história, a logística e a escala do projeto.", image: "/media/haras-bosque-2026-v1.webp", project: "Haras SOBI", items: ["Planejamento de locação", "Equipe e logística", "Captação de imagem e som", "Produção dimensionada ao uso"] },
  { slug: "projetos-integrados", eyebrow: "AR1 Films", title: "Quando o projeto precisa de mais de uma frente.", summary: "Estratégia, estrutura, audiovisual, transmissão e conteúdo coordenados em uma operação sob medida.", image: "/media/cattle-wide.webp", project: "Ainda preciso entender a melhor solução", items: ["Arquitetura de escopo", "Integração entre frentes", "Cronograma e coordenação", "Entregas por etapa"] },
  { slug: "consultoria-implantacao-estudios-podcast", eyebrow: "Construir capacidade", title: "Implantar um estúdio é construir uma operação.", summary: "Diagnóstico, projeto, ativação e suporte para transformar espaço e equipamentos em uma rotina funcional.", image: "/media/edit-suite.webp", project: "Projeto e ativação de estúdio", items: ["Diagnóstico de uso", "Projeto técnico", "Implantação e testes", "Treinamento e suporte"] },
] as const;

export const projectOptions = [
  "Gravação de podcast (gravado ou ao vivo)",
  "Podcast itinerante em feira, congresso ou evento",
  "Transmissão ao vivo",
  "Operação de conteúdo",
  "Diagnóstico de capacidade",
  "Projeto e ativação de estúdio",
  "Consultoria e implantação de estúdio de podcast",
  "Haras SOBI",
  "Leilão 360",
  "Filme de marca ou legado",
  "Evento ou projeto especial",
  "Ainda preciso entender a melhor solução",
] as const;
