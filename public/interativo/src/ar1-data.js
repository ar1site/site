export const company = {
  name: 'AR1 Films',
  email: 'contato@ar1films.com',
  phone: '(62) 98125-2338',
  whatsapp: 'https://wa.me/5562981252338',
  site: 'https://ar1films.com/',
  address: 'Goiânia - GO · Atendimento em todo o Brasil',
  haras: 'GO-010, sentido Nerópolis, saída de Goiânia - GO',
  pdf: '/interativo/portfolio/AR1-Films-Servicos-Agencias.pdf',
};

export function whatsappLink(subject = 'um projeto audiovisual') {
  return company.whatsapp + '?text=' + encodeURIComponent(`Olá, AR1! Conheci o portfólio interativo e quero conversar sobre ${subject}.`);
}

export const services = [
  {
    id: 'podcast', number: '01', name: 'Gravação de podcast', short: 'Podcast e videocast, gravados ou ao vivo.',
    image: '/interativo/media/entrevista.jpg', imageAlt: 'Gravação de entrevista em estúdio', imagePosition: '50% 43%',
    intro: 'Você chega com o tema. A AR1 organiza câmera, luz, som, direção e edição.',
    formats: ['Podcast e videocast gravados', 'Podcast ao vivo', 'Temporadas, entrevistas e programas corporativos'],
    deliveries: ['Captação de áudio e vídeo com direção', 'Sincronização, edição e tratamento de imagem', 'Episódio completo e cortes para redes', 'Postagem opcional, conforme o escopo'],
    text: 'Produção no estúdio, no Haras SOBI ou em uma locação definida para o projeto. A proposta organiza duração, episódios, versões e entregas.',
    gallery: [['/interativo/media/convidado.jpg', 'Convidado durante gravação em estúdio'], ['/interativo/media/camera.jpg', 'Câmeras durante uma gravação de podcast']],
    related: ['podcast-itinerante', 'consultoria'],
  },
  {
    id: 'transmissao', number: '02', name: 'Transmissão ao vivo', short: 'Seu evento com captação e direção em tempo real.',
    image: '/interativo/media/camera.jpg', imageAlt: 'Bastidores de captação multicâmera em estúdio', imagePosition: '50% 38%',
    intro: 'Do palco para quem acompanha de longe: uma operação planejada para o evento e seus canais.',
    formats: ['Congressos, palestras e encontros corporativos', 'Apresentações e eventos culturais', 'Entrevistas e programas ao vivo'],
    deliveries: ['Planejamento de sinal e conexão', 'Captação multicâmera e direção ao vivo', 'Integração de áudio, slides e vinhetas', 'Gravação para reaproveitamento posterior'],
    text: 'O desenho técnico considera as condições do local, os canais de transmissão, o público e a programação. Agenda e viabilidade são confirmadas pela equipe.',
    gallery: [['/interativo/media/palco.jpg', 'Apresentação em cenário externo no Haras SOBI']],
    related: ['leilao-360', 'shows-dvds'],
  },
  {
    id: 'shows-dvds', number: '03', name: 'Shows, DVDs e clipes', short: 'Registro musical e vídeos para lançamentos.',
    image: '/interativo/media/show.jpg', imageAlt: 'Show com público no Haras SOBI', imagePosition: '50% 48%',
    intro: 'A música continua depois do palco. Captação e pós-produção pensadas para o destino de cada gravação.',
    formats: ['Gravação de shows e DVDs', 'Vídeos de faixas e apresentações', 'Clipes, teasers e bastidores'],
    deliveries: ['Planejamento de captação e direção', 'Registro multicâmera', 'Edição e tratamento de imagem', 'Apresentação completa, faixas ou cortes'],
    text: 'O roteiro, as câmeras e as versões finais acompanham a identidade do artista e a estratégia de lançamento. O Haras SOBI pode integrar a proposta como locação.',
    gallery: [['/interativo/media/palco.jpg', 'Apresentação musical no Haras SOBI'], ['/interativo/media/aerea.jpg', 'Vista aérea da pista e dos espaços do Haras SOBI']],
    related: ['haras-sobi', 'pos-producao'],
  },
  {
    id: 'filmes', number: '04', name: 'Filmes e fotografia', short: 'Campanhas, institucionais e histórias de legado.',
    image: '/interativo/media/sombra.jpg', imageAlt: 'Paisagem do Haras SOBI, locação para filmagens e fotografia', imagePosition: '50% 55%',
    intro: 'Roteiro, direção, captação e edição para apresentar uma marca, registrar um momento ou preservar uma história.',
    formats: ['Filmes institucionais e campanhas', 'Entrevistas e depoimentos', 'Filmes de legado para empresas e famílias', 'Fotografia de marcas, eventos e propriedades'],
    deliveries: ['Planejamento e roteiro', 'Captação de imagem e entrevistas', 'Edição, cor e acabamento', 'Versões conforme os canais do projeto'],
    text: 'A linguagem e as entregas partem do briefing. Nas histórias de legado, pesquisa e escuta ajudam a conectar pessoas, memória, documentos e território.',
    gallery: [['/interativo/media/varanda.jpg', 'Ambiente do Haras SOBI para gravações'], ['/interativo/media/lago.jpg', 'Lago e paisagem do Haras SOBI']],
    related: ['haras-sobi', 'pos-producao'],
  },
  {
    id: 'pos-producao', number: '05', name: 'Edição e conteúdo recorrente', short: 'Do material captado às peças de publicação.',
    image: '/interativo/media/convidado.jpg', imageAlt: 'Convidado em uma gravação de podcast', imagePosition: '50% 36%',
    intro: 'Uma entrevista, uma gravação ou um evento podem gerar conteúdos para diferentes momentos e canais.',
    formats: ['Edição de episódios e entrevistas', 'Cortes, teasers e versões de vídeo', 'Conteúdo recorrente para empresas e marcas'],
    deliveries: ['Sincronização e edição', 'Tratamento de cor e finalização', 'Peças organizadas por formato e finalidade', 'Pauta, captação e calendário em projetos recorrentes'],
    text: 'Volume, periodicidade, versões e prazos são definidos na proposta. A operação pode reunir produção e pós-produção no mesmo projeto.',
    gallery: [['/interativo/media/camera.jpg', 'Captação em estúdio']],
    related: ['podcast', 'filmes'],
  },
  {
    id: 'haras-sobi', number: '06', name: 'Haras SOBI', short: 'Locação e produção em um só endereço.',
    image: '/interativo/media/aerea.jpg', imageAlt: 'Vista aérea da pista e das áreas do Haras SOBI', imagePosition: '50% 48%',
    intro: 'Pista, bosque, lago, palcos e áreas cobertas para filmagens, fotografia, shows e eventos.',
    formats: ['Shows, DVDs e clipes', 'Campanhas, filmes e fotografia', 'Podcasts em cenários especiais', 'Eventos e experiências'],
    deliveries: ['Mais de 20 cenários em uma única locação', 'Área coberta com capacidade anunciada para 4 mil pessoas', 'Locação e produção na mesma proposta, conforme o projeto', 'Avaliação de áreas, montagem e necessidades técnicas'],
    text: 'O Haras fica na GO-010, sentido Nerópolis, na saída de Goiânia. As áreas disponíveis, a capacidade de cada montagem e a agenda são confirmadas pela equipe.',
    gallery: [['/interativo/media/bosque.jpg', 'Bosque do Haras SOBI'], ['/interativo/media/lago.jpg', 'Lago do Haras SOBI'], ['/interativo/media/coberto.jpg', 'Área coberta do Haras SOBI'], ['/interativo/media/salao.jpg', 'Salão para eventos'], ['/interativo/media/lounge.jpg', 'Ambientes de convivência'], ['/interativo/media/pista_cavalo.jpg', 'Pista e identidade equestre']],
    related: ['shows-dvds', 'filmes'],
  },
  {
    id: 'consultoria', number: '07', name: 'Consultoria de estúdio', short: 'Projeto, implantação e treinamento de equipe.',
    image: '/interativo/media/estudio.jpg', imageAlt: 'Estúdio de podcast com câmeras, iluminação e áudio', imagePosition: '50% 50%',
    intro: 'Um estúdio precisa funcionar na rotina. O projeto começa pelo uso, pela equipe e pelos formatos.',
    formats: ['Estúdio do zero', 'Reorganização de estrutura existente', 'Estúdios corporativos e de conteúdo'],
    deliveries: ['Diagnóstico de objetivo, espaço e rotina', 'Projeto técnico e orientação de acústica, luz, áudio e vídeo', 'Especificação, integração e testes', 'Treinamento e organização do fluxo de produção'],
    text: 'O escopo pode incluir projeto, acompanhamento da implantação e treinamento. Equipamentos disponíveis e necessidades do time orientam as decisões.',
    gallery: [['/interativo/media/estudio.jpg', 'Estrutura de um estúdio de podcast']],
    related: ['podcast', 'pos-producao'],
  },
  {
    id: 'podcast-itinerante', number: '08', name: 'Podcast itinerante', short: 'O estúdio dentro da sua feira, empresa ou evento.',
    image: '/interativo/media/lounge.jpg', imageAlt: 'Ambiente do Haras SOBI que pode receber formatos especiais de gravação', imagePosition: '50% 43%',
    intro: 'Leve entrevistas e conversas para onde os convidados e o público já estão.',
    formats: ['Feiras e congressos', 'Encontros corporativos', 'Temporadas em locações especiais'],
    deliveries: ['Planejamento de montagem e desmontagem', 'Cenário, luz, áudio, câmeras e equipe', 'Gravação de entrevistas durante o evento', 'Edição e cortes definidos conforme o projeto'],
    text: 'A montagem considera o espaço, a identidade do evento, a programação e o fluxo de convidados. A imagem desta página mostra uma possibilidade de locação no Haras SOBI.',
    gallery: [['/interativo/media/salao.jpg', 'Salão do Haras SOBI']],
    related: ['podcast', 'haras-sobi'],
  },
  {
    id: 'leilao-360', number: '09', name: 'Leilão 360', short: 'Aquecimento, transmissão e conteúdo posterior.',
    image: '/interativo/media/pista.jpg', imageAlt: 'Pista do Haras SOBI, possibilidade de locação para eventos', imagePosition: '50% 50%',
    intro: 'O leilão começa antes do primeiro lote e continua depois do último.',
    formats: ['Leilões ao vivo', 'Eventos de haras e propriedades', 'Conteúdo de aquecimento e divulgação'],
    deliveries: ['Planejamento de agenda e conteúdos anteriores', 'Captação e transmissão dirigida', 'Melhores momentos e materiais posteriores', 'Operação dimensionada para o formato e os canais'],
    text: 'Uma proposta integra as etapas de conteúdo e transmissão. As responsabilidades, os canais, as condições do local e as entregas são definidos no briefing.',
    gallery: [['/interativo/media/aerea.jpg', 'Vista aérea do Haras SOBI']],
    related: ['transmissao', 'haras-sobi'],
  },
];

export const initialPrompts = ['Quero gravar um podcast', 'Preciso transmitir ao vivo', 'Vamos gravar um DVD'];
export const followupPrompts = ['Ver todos os serviços', 'Conhecer o Haras SOBI', 'Como solicitar orçamento?'];
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function getAnswer(message) {
  const q = normalize(message);
  const base = {title:'Serviços AR1 Films', paragraphs:[], ids:[], contact:false};
  const choices = [
    [/itinerante|feira|congresso.*podcast|podcast.*evento/, 'podcast-itinerante'],
    [/leilao|leiloes|lote/, 'leilao-360'],
    [/consultoria|implantar|implantacao|montar.*estudio|equipamento.*estudio|projetar.*estudio/, 'consultoria'],
    [/haras|sobi|locacao|cenario|bosque|lago|pista/, 'haras-sobi'],
    [/dvd|show|shows|clipe|musica/, 'shows-dvds'],
    [/transmi|live|ao vivo/, 'transmissao'],
    [/podcast|videocast|episodio/, 'podcast'],
    [/legado|filme|campanha|foto|institucional|depoimento/, 'filmes'],
    [/edicao|editar|corte|redes|recorrente|conteudo/, 'pos-producao'],
  ];
  const found = choices.filter(([pattern])=>pattern.test(q)).map(([,id])=>id);
  if (found.length) {
    const ids = [...new Set(found)].slice(0,3);
    // Uma transmissão de podcast é explicada a partir do próprio formato.
    if (ids.includes('podcast') && ids.includes('transmissao')) ids.splice(ids.indexOf('transmissao'),1);
    const selected = services.filter(s=>ids.includes(s.id));
    return {...base,title:selected.length===1?selected[0].name:'Soluções para o seu projeto',ids,
      paragraphs:[...selected.map(s=>s.intro),'Abra uma solução para ver formatos, entregas e imagens. Escopo, agenda e investimento são confirmados pela equipe.']};
  }
  if (/orcamento|preco|valor|custa|contato|whats|email|agenda|disponib|contratar|briefing|agencia/.test(q)) {
    return {...base,title:'Vamos conversar sobre o projeto?',contact:true,
      paragraphs:['Envie o serviço desejado, o objetivo, a data, o local, os formatos e o prazo de entrega. Se houver, inclua referências e a verba prevista.',
      'A equipe dimensiona a operação e apresenta escopo, cronograma, responsabilidades e investimento. A agenda é confirmada no atendimento.']};
  }
  if (/servico|soluc|portfolio|trabalho|projeto|produz|fazem|faz|capacidade/.test(q)) {
    return {...base,title:'O que a AR1 pode produzir com você',ids:services.map(s=>s.id),
      paragraphs:['Podcast, transmissões ao vivo, shows e DVDs são nossas frentes em destaque. Conheça também filmes, fotografia, edição, locação e consultoria de estúdios.']};
  }
  if (/quem|sobre|historia|experiencia|equipe|onde|localiza/.test(q)) {
    return {...base,title:'AR1 Films · Goiânia e todo o Brasil',contact:true,
      paragraphs:['A AR1 reúne produção audiovisual, transmissão, estúdio e locação. Nossa origem está em Goiás, nas operações ao vivo e no agronegócio. Hoje atendemos empresas, artistas, marcas, instituições e criadores.',
      'O Haras SOBI fica na GO-010, sentido Nerópolis, na saída de Goiânia. A equipe também atende produções em outras cidades, conforme a proposta.']};
  }
  return {...base,title:'Vamos encontrar o formato do seu projeto',ids:['podcast','transmissao','shows-dvds'],
    paragraphs:['Sou o guia de serviços da AR1 Films. Posso apresentar as soluções, mostrar os espaços do Haras SOBI e ajudar você a preparar o briefing.',
    'Escolha uma opção abaixo ou conte qual serviço procura. Para disponibilidade, proposta ou uma necessidade específica, fale com a equipe pelo WhatsApp.']};
}
