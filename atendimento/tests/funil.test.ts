import { describe, expect, it } from "vitest";
import { diaCurto, diaParaIso, isoParaDia, normalizarDataHora } from "@/lib/funil/datas";
import {
  acaoVencida,
  diasNaEtapa,
  ETAPAS,
  fechouRecentemente,
  filtrarOportunidades,
  FILTROS_PADRAO,
  formatarReais,
  ordenarCartoes,
  probabilidadeEfetiva,
  resumoDoFunil,
  ROTULO_ETAPA,
  textoDiasNaEtapa,
  transicaoPede,
  validarTransicao,
} from "@/lib/funil/etapas";
import {
  lerProbabilidade,
  lerValor,
  telefonesParaBusca,
  validarEdicao,
  validarOportunidade,
  valorParaCampo,
  type EntradaOportunidade,
} from "@/lib/funil/formulario";
import type { EtapaFunil, Oportunidade } from "@/lib/tipos";

const AGORA = new Date("2026-09-29T15:00:00.000Z").getTime(); // 12:00 em Brasília
const DIA = 24 * 60 * 60 * 1000;

function op(parcial: Partial<Oportunidade>): Oportunidade {
  return {
    id: "o1",
    name: "Maria Souza",
    phone: "+55 (62) 99999-8888",
    company: "Souza Eventos",
    email: null,
    project_type: "Gravação de podcast",
    expected_date: null,
    message: null,
    source_path: null,
    status: "new",
    internal_notes: null,
    assigned_to: null,
    client_id: null,
    contact_id: null,
    source: "site",
    estimated_value: null,
    probability: null,
    next_action: null,
    next_action_at: null,
    lost_reason: null,
    ai_notes: null,
    stage_changed_at: "2026-09-26T15:00:00.000Z",
    closed_at: null,
    created_at: "2026-09-20T15:00:00.000Z",
    updated_at: "2026-09-26T15:00:00.000Z",
    ...parcial,
  };
}

describe("etapas do funil", () => {
  it("tem as sete etapas com os rótulos pedidos, na ordem", () => {
    expect(ETAPAS.map((e) => ROTULO_ETAPA[e])).toEqual([
      "Novo",
      "Qualificado",
      "Em contato",
      "Proposta",
      "Negociação",
      "Ganho",
      "Perdido",
    ]);
  });
});

describe("formatarReais", () => {
  it("mostra valor redondo sem centavos e quebrado com centavos", () => {
    expect(formatarReais(4800)).toBe("R$ 4.800");
    expect(formatarReais(4800.5)).toBe("R$ 4.800,50");
    expect(formatarReais(0)).toBe("R$ 0");
    expect(formatarReais(1234567.89)).toBe("R$ 1.234.567,89");
  });

  it("sem valor vira 'sem valor'", () => {
    expect(formatarReais(null)).toBe("sem valor");
    expect(formatarReais(undefined)).toBe("sem valor");
  });

  it("aceita numeric que chega como texto", () => {
    expect(formatarReais("4800.00" as unknown as number)).toBe("R$ 4.800");
  });
});

describe("resumoDoFunil", () => {
  const lista = [
    op({ id: "a", status: "new", estimated_value: 1000, probability: 10 }),
    op({ id: "b", status: "proposal", estimated_value: 4800, probability: 60 }),
    op({ id: "c", status: "proposal", estimated_value: null, probability: 90 }),
    op({ id: "d", status: "negotiating", estimated_value: 10000, probability: 80 }),
    op({ id: "e", status: "won", estimated_value: 7000, probability: 100 }),
    op({ id: "f", status: "lost", estimated_value: 3000, probability: 0 }),
  ];

  it("conta e soma por etapa", () => {
    const r = resumoDoFunil(lista);
    expect(r.porEtapa.new).toEqual({ quantidade: 1, soma: 1000, semValor: 0 });
    expect(r.porEtapa.proposal).toEqual({ quantidade: 2, soma: 4800, semValor: 1 });
    expect(r.porEtapa.negotiating).toEqual({ quantidade: 1, soma: 10000, semValor: 0 });
    expect(r.porEtapa.won).toEqual({ quantidade: 1, soma: 7000, semValor: 0 });
    expect(r.porEtapa.lost).toEqual({ quantidade: 1, soma: 3000, semValor: 0 });
    expect(r.porEtapa.qualified).toEqual({ quantidade: 0, soma: 0, semValor: 0 });
  });

  it("total em aberto ignora Ganho e Perdido", () => {
    const r = resumoDoFunil(lista);
    expect(r.quantidadeEmAberto).toBe(4);
    expect(r.totalEmAberto).toBe(15800);
  });

  it("previsão ponderada = soma de valor × probabilidade das etapas abertas", () => {
    // 1000×10% + 4800×60% + (sem valor) + 10000×80% = 100 + 2880 + 0 + 8000
    expect(resumoDoFunil(lista).previsaoPonderada).toBe(10980);
  });

  it("sem probabilidade preenchida usa a padrão da etapa", () => {
    const r = resumoDoFunil([
      op({ status: "proposal", estimated_value: 1000, probability: null }), // 60%
      op({ status: "new", estimated_value: 1000, probability: null }), // 10%
    ]);
    expect(r.previsaoPonderada).toBe(700);
    expect(probabilidadeEfetiva(op({ status: "negotiating", probability: null }))).toEqual({
      valor: 80,
      padrao: true,
    });
    expect(probabilidadeEfetiva(op({ status: "negotiating", probability: 35 }))).toEqual({
      valor: 35,
      padrao: false,
    });
  });

  it("probabilidade zero é respeitada (não cai na padrão)", () => {
    expect(resumoDoFunil([op({ status: "proposal", estimated_value: 1000, probability: 0 })]).previsaoPonderada).toBe(0);
  });

  it("arredonda em centavos e aceita lista vazia", () => {
    expect(resumoDoFunil([op({ status: "new", estimated_value: 0.1, probability: 33 })]).previsaoPonderada).toBe(0.03);
    const vazio = resumoDoFunil([]);
    expect(vazio.totalEmAberto).toBe(0);
    expect(vazio.previsaoPonderada).toBe(0);
    expect(vazio.quantidadeEmAberto).toBe(0);
  });
});

describe("tempo na etapa e ação vencida", () => {
  it("conta dias inteiros na etapa", () => {
    expect(diasNaEtapa(new Date(AGORA - 3 * DIA - 1000).toISOString(), AGORA)).toBe(3);
    expect(diasNaEtapa(new Date(AGORA - 1000).toISOString(), AGORA)).toBe(0);
    expect(diasNaEtapa(null, AGORA)).toBe(0);
    expect(textoDiasNaEtapa(new Date(AGORA - 3 * DIA).toISOString(), AGORA)).toBe("há 3 dias nesta etapa");
    expect(textoDiasNaEtapa(new Date(AGORA - DIA).toISOString(), AGORA)).toBe("há 1 dia nesta etapa");
    expect(textoDiasNaEtapa(new Date(AGORA).toISOString(), AGORA)).toBe("hoje nesta etapa");
  });

  it("ação vencida só em etapa aberta", () => {
    const ontem = new Date(AGORA - DIA).toISOString();
    const amanha = new Date(AGORA + DIA).toISOString();
    expect(acaoVencida(op({ status: "proposal", next_action_at: ontem }), AGORA)).toBe(true);
    expect(acaoVencida(op({ status: "proposal", next_action_at: amanha }), AGORA)).toBe(false);
    expect(acaoVencida(op({ status: "proposal", next_action_at: null }), AGORA)).toBe(false);
    expect(acaoVencida(op({ status: "won", next_action_at: ontem }), AGORA)).toBe(false);
    expect(acaoVencida(op({ status: "lost", next_action_at: ontem }), AGORA)).toBe(false);
  });

  it("Ganho e Perdido: só os dos últimos 30 dias", () => {
    expect(fechouRecentemente(op({ closed_at: new Date(AGORA - 29 * DIA).toISOString() }), AGORA)).toBe(true);
    expect(fechouRecentemente(op({ closed_at: new Date(AGORA - 31 * DIA).toISOString() }), AGORA)).toBe(false);
    // sem closed_at, vale a data em que entrou na etapa
    expect(
      fechouRecentemente(op({ closed_at: null, stage_changed_at: new Date(AGORA - 40 * DIA).toISOString() }), AGORA),
    ).toBe(false);
  });

  it("ordena: vencidas primeiro, depois a ação mais próxima", () => {
    const lista = [
      op({ id: "sem", status: "new", next_action_at: null }),
      op({ id: "futura", status: "new", next_action_at: new Date(AGORA + 2 * DIA).toISOString() }),
      op({ id: "vencida", status: "new", next_action_at: new Date(AGORA - DIA).toISOString() }),
      op({ id: "proxima", status: "new", next_action_at: new Date(AGORA + DIA).toISOString() }),
    ];
    expect(ordenarCartoes(lista, AGORA).map((o) => o.id)).toEqual(["vencida", "proxima", "futura", "sem"]);
  });
});

describe("filtrarOportunidades", () => {
  const lista = [
    op({ id: "a", name: "Maria Souza", company: "Souza Eventos", source: "site", assigned_to: "u1" }),
    op({ id: "b", name: "João Leilões", company: "Haras São José", source: "whatsapp", assigned_to: "u2" }),
    op({ id: "c", name: "Carla", company: "Não informada", source: "indicacao", assigned_to: null }),
  ];

  it("sem filtro devolve tudo", () => {
    expect(filtrarOportunidades(lista, FILTROS_PADRAO)).toHaveLength(3);
  });

  it("filtra por origem", () => {
    expect(filtrarOportunidades(lista, { ...FILTROS_PADRAO, origem: "whatsapp" }).map((o) => o.id)).toEqual(["b"]);
  });

  it("filtra por responsável e por 'sem responsável'", () => {
    expect(filtrarOportunidades(lista, { ...FILTROS_PADRAO, responsavel: "u1" }).map((o) => o.id)).toEqual(["a"]);
    expect(filtrarOportunidades(lista, { ...FILTROS_PADRAO, responsavel: "sem" }).map((o) => o.id)).toEqual(["c"]);
  });

  it("busca por nome ou empresa, sem ligar para acento ou maiúscula", () => {
    expect(filtrarOportunidades(lista, { ...FILTROS_PADRAO, busca: "joao" }).map((o) => o.id)).toEqual(["b"]);
    expect(filtrarOportunidades(lista, { ...FILTROS_PADRAO, busca: "SAO JOSE" }).map((o) => o.id)).toEqual(["b"]);
    expect(filtrarOportunidades(lista, { ...FILTROS_PADRAO, busca: "souza" }).map((o) => o.id)).toEqual(["a"]);
    expect(filtrarOportunidades(lista, { ...FILTROS_PADRAO, busca: "nada" })).toHaveLength(0);
  });

  it("combina os filtros", () => {
    expect(
      filtrarOportunidades(lista, { origem: "site", responsavel: "u2", busca: "" }),
    ).toHaveLength(0);
  });
});

describe("validarTransicao", () => {
  it("Perdido exige motivo", () => {
    expect(validarTransicao({ de: "proposal", para: "lost" })).toEqual({
      ok: false,
      erro: "Informe o motivo da perda.",
    });
    expect(validarTransicao({ de: "proposal", para: "lost", motivo: "   " }).ok).toBe(false);
    expect(validarTransicao({ de: "proposal", para: "lost", motivo: "x".repeat(501) }).ok).toBe(false);
  });

  it("Perdido com motivo grava etapa e motivo (sem espaços nas pontas)", () => {
    expect(validarTransicao({ de: "proposal", para: "lost", motivo: "  Fechou com outra produtora " })).toEqual({
      ok: true,
      campos: { status: "lost", lost_reason: "Fechou com outra produtora" },
    });
  });

  it("Ganho exige o valor final confirmado", () => {
    expect(validarTransicao({ de: "negotiating", para: "won" }).ok).toBe(false);
    expect(validarTransicao({ de: "negotiating", para: "won", valorFinal: null }).ok).toBe(false);
    expect(validarTransicao({ de: "negotiating", para: "won", valorFinal: Number.NaN }).ok).toBe(false);
    expect(validarTransicao({ de: "negotiating", para: "won", valorFinal: -1 }).ok).toBe(false);
    expect(validarTransicao({ de: "negotiating", para: "won", valorFinal: 1e12 }).ok).toBe(false);
  });

  it("Ganho grava o valor final e probabilidade 100", () => {
    expect(validarTransicao({ de: "negotiating", para: "won", valorFinal: 5200.456 })).toEqual({
      ok: true,
      campos: { status: "won", estimated_value: 5200.46, probability: 100 },
    });
  });

  it("entre etapas abertas não pede nada e só muda a etapa", () => {
    expect(validarTransicao({ de: "new", para: "qualified" })).toEqual({ ok: true, campos: { status: "qualified" } });
    expect(validarTransicao({ de: "negotiating", para: "new" })).toEqual({ ok: true, campos: { status: "new" } });
  });

  it("sair de Perdido limpa o motivo", () => {
    expect(validarTransicao({ de: "lost", para: "contacting" })).toEqual({
      ok: true,
      campos: { status: "contacting", lost_reason: null },
    });
    expect(validarTransicao({ de: "lost", para: "won", valorFinal: 100 })).toEqual({
      ok: true,
      campos: { status: "won", estimated_value: 100, probability: 100, lost_reason: null },
    });
  });

  it("recusa a mesma etapa e etapa desconhecida", () => {
    expect(validarTransicao({ de: "new", para: "new" }).ok).toBe(false);
    expect(validarTransicao({ de: "new", para: "fechado" as EtapaFunil }).ok).toBe(false);
  });

  it("diz o que cada destino pede", () => {
    expect(transicaoPede("lost")).toBe("motivo");
    expect(transicaoPede("won")).toBe("valor");
    expect(transicaoPede("proposal")).toBeNull();
  });
});

describe("datas do funil (horário de Brasília)", () => {
  it("dia -> ISO às 18 h de Brasília, e de volta", () => {
    expect(diaParaIso("2026-10-02")).toBe("2026-10-02T21:00:00.000Z");
    expect(isoParaDia("2026-10-02T21:00:00.000Z")).toBe("2026-10-02");
    // 01:00 UTC do dia 3 ainda é dia 2 em Brasília
    expect(isoParaDia("2026-10-03T01:00:00.000Z")).toBe("2026-10-02");
  });

  it("recusa data inválida", () => {
    expect(diaParaIso("2026-02-30")).toBeNull();
    expect(diaParaIso("02/10/2026")).toBeNull();
    expect(diaParaIso("")).toBeNull();
    expect(isoParaDia("lixo")).toBe("");
  });

  it("mostra o dia curto, com ano só quando não é o atual", () => {
    expect(diaCurto("2026-10-02T21:00:00.000Z", AGORA)).toBe("02/10");
    expect(diaCurto("2027-01-15T21:00:00.000Z", AGORA)).toBe("15/01/2027");
    expect(diaCurto(null, AGORA)).toBe("");
  });

  it("normaliza o que a IA manda", () => {
    expect(normalizarDataHora("2026-10-02")).toBe("2026-10-02T21:00:00.000Z");
    expect(normalizarDataHora("2026-10-02T18:00:00-03:00")).toBe("2026-10-02T21:00:00.000Z");
    expect(normalizarDataHora("2026-10-02T21:00:00Z")).toBe("2026-10-02T21:00:00.000Z");
    // sem fuso: é horário de Brasília
    expect(normalizarDataHora("2026-10-02T10:30:00")).toBe("2026-10-02T13:30:00.000Z");
    expect(normalizarDataHora("sexta-feira")).toBeNull();
    expect(normalizarDataHora("")).toBeNull();
    expect(normalizarDataHora(null)).toBeNull();
  });
});

describe("campos de formulário", () => {
  it("lê valores em reais digitados de vários jeitos", () => {
    expect(lerValor("4800")).toBe(4800);
    expect(lerValor("4.800")).toBe(4800);
    expect(lerValor("4.800,50")).toBe(4800.5);
    expect(lerValor("R$ 4.800,00")).toBe(4800);
    expect(lerValor("4800.5")).toBe(4800.5);
    expect(lerValor("1.234.567,89")).toBe(1234567.89);
    expect(lerValor("")).toBeNull();
    expect(lerValor("   ")).toBeNull();
    expect(lerValor(null)).toBeNull();
    expect(Number.isNaN(lerValor("quatro mil"))).toBe(true);
  });

  it("devolve o valor para o campo de edição", () => {
    expect(valorParaCampo(4800)).toBe("4800");
    expect(valorParaCampo(4800.5)).toBe("4800,50");
    expect(valorParaCampo(null)).toBe("");
    expect(lerValor(valorParaCampo(4800.5))).toBe(4800.5);
  });

  it("lê probabilidade de 0 a 100", () => {
    expect(lerProbabilidade("60")).toBe(60);
    expect(lerProbabilidade("60%")).toBe(60);
    expect(lerProbabilidade("0")).toBe(0);
    expect(lerProbabilidade("")).toBeNull();
    expect(Number.isNaN(lerProbabilidade("101"))).toBe(true);
    expect(Number.isNaN(lerProbabilidade("-5"))).toBe(true);
    expect(Number.isNaN(lerProbabilidade("6,5"))).toBe(true);
  });

  it("monta os telefones para achar o contato do WhatsApp", () => {
    expect(telefonesParaBusca("(62) 99999-8888")).toEqual(["62999998888", "5562999998888"]);
    expect(telefonesParaBusca("+55 (62) 99999-8888")).toEqual(["5562999998888", "62999998888"]);
    expect(telefonesParaBusca("123")).toEqual([]);
  });
});

describe("validarOportunidade (nova oportunidade)", () => {
  const base: EntradaOportunidade = {
    nome: " Maria Souza ",
    telefone: "(62) 99999-8888",
    empresa: "",
    servico: "",
    origem: "indicacao",
    valor: "4.800",
    probabilidade: "60",
    proximaAcao: "Enviar proposta",
    proximaAcaoDia: "2026-10-02",
    responsavel: "u1",
  };

  it("aceita o formulário curto e preenche os padrões", () => {
    const r = validarOportunidade(base);
    expect(r).toEqual({
      ok: true,
      campos: {
        name: "Maria Souza",
        phone: "(62) 99999-8888",
        company: "Não informada",
        email: null,
        project_type: "A definir",
        expected_date: null,
        message: null,
        status: "new",
        source: "indicacao",
        estimated_value: 4800,
        probability: 60,
        next_action: "Enviar proposta",
        next_action_at: "2026-10-02T21:00:00.000Z",
        assigned_to: "u1",
      },
    });
  });

  it("exige nome e telefone", () => {
    const r = validarOportunidade({ ...base, nome: " ", telefone: "123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["nome", "telefone"]);
  });

  it("recusa valor, probabilidade e data inválidos", () => {
    const r = validarOportunidade({ ...base, valor: "abc", probabilidade: "150", proximaAcaoDia: "2026-13-40" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["probabilidade", "proximaAcaoDia", "valor"]);
  });

  it("data sem ação pede a ação", () => {
    const r = validarOportunidade({ ...base, proximaAcao: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.proximaAcao).toBeTruthy();
  });

  it("não deixa criar direto em Ganho ou Perdido", () => {
    expect(validarOportunidade({ ...base, etapa: "won" }).ok).toBe(false);
    expect(validarOportunidade({ ...base, etapa: "lost" }).ok).toBe(false);
    const r = validarOportunidade({ ...base, etapa: "qualified" });
    expect(r.ok && r.campos.status).toBe("qualified");
  });

  it("sem valor nem probabilidade fica nulo", () => {
    const r = validarOportunidade({ ...base, valor: "", probabilidade: "", proximaAcao: "", proximaAcaoDia: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.campos.estimated_value).toBeNull();
      expect(r.campos.probability).toBeNull();
      expect(r.campos.next_action).toBeNull();
      expect(r.campos.next_action_at).toBeNull();
    }
  });
});

describe("validarEdicao (detalhe)", () => {
  const atual = { status: "proposal" as EtapaFunil, next_action: "Enviar proposta", next_action_at: "2026-10-02T21:00:00.000Z" };

  it("grava só o que foi mexido", () => {
    expect(validarEdicao({ estimated_value: "5.000" }, atual)).toEqual({
      ok: true,
      campos: { estimated_value: 5000 },
    });
    expect(validarEdicao({}, atual)).toEqual({ ok: true, campos: {} });
  });

  it("apagar a próxima ação apaga a data junto", () => {
    expect(validarEdicao({ next_action: "" }, atual)).toEqual({
      ok: true,
      campos: { next_action: null, next_action_at: null },
    });
  });

  it("mudar só a data mantém a ação", () => {
    expect(validarEdicao({ next_action_dia: "2026-10-05" }, atual)).toEqual({
      ok: true,
      campos: { next_action: "Enviar proposta", next_action_at: "2026-10-05T21:00:00.000Z" },
    });
  });

  it("data sem ação é erro", () => {
    const r = validarEdicao({ next_action_dia: "2026-10-05" }, { ...atual, next_action: null, next_action_at: null });
    expect(r.ok).toBe(false);
  });

  it("oportunidade perdida não pode ficar sem motivo", () => {
    expect(validarEdicao({ lost_reason: " " }, { ...atual, status: "lost" }).ok).toBe(false);
    expect(validarEdicao({ lost_reason: "Sem verba" }, { ...atual, status: "lost" })).toEqual({
      ok: true,
      campos: { lost_reason: "Sem verba" },
    });
  });

  it("valida nome, telefone, e-mail e notas", () => {
    const r = validarEdicao({ name: "", phone: "12", email: "sem-arroba", internal_notes: "x".repeat(10001) }, atual);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["email", "internal_notes", "name", "phone"]);
  });

  it("campo vazio vira nulo (ou o padrão, quando o banco exige texto)", () => {
    expect(validarEdicao({ email: "", company: "", project_type: "", assigned_to: "", estimated_value: "" }, atual)).toEqual({
      ok: true,
      campos: {
        email: null,
        company: "Não informada",
        project_type: "A definir",
        assigned_to: null,
        estimated_value: null,
      },
    });
  });
});
