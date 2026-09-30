import { describe, expect, it } from "vitest";
import { doEditor, paraEditor, totalDoEditor } from "@/lib/propostas/editor";
import { esquemaRascunhoProposta } from "@/lib/propostas/esquema";
import { primeiroNome, textoDaMensagem, textoTemLink } from "@/lib/propostas/mensagem";
import {
  diaDaProposta,
  diaPorExtenso,
  lerValidade,
  LIMITES,
  nomeDoArquivo,
  NUMERO_VALIDO,
  numeroDaProposta,
  proximoNumero,
  reaisComCentavos,
  textoDoTotal,
  totalDaProposta,
  validaAte,
  VALIDADE_PADRAO_DIAS,
  validarProposta,
} from "@/lib/propostas/proposta";
import {
  aplicarRegrasDoRascunho,
  FONTE_CONVERSA,
  FONTE_OPORTUNIDADE,
  montarPromptProposta,
  rascunhoSemIA,
  type ContatoDaProposta,
  type MensagemDaProposta,
  type OportunidadeDaProposta,
  type RascunhoBruto,
} from "@/lib/propostas/rascunho";
import { ACAO_APOS_PROPOSTA, prazoParaCobrar, sugestoesAposProposta } from "@/lib/propostas/sugestoes";
import { numerosDoTexto, valorTemBase } from "@/lib/propostas/valores";
import { PROPOSTA_EXEMPLO } from "./ajuda/proposta";

/** Horário de Brasília -> Date. brt("2026-09-30 10:00") */
function brt(texto: string): Date {
  return new Date(`${texto.replace(" ", "T")}:00-03:00`);
}

const AGORA = brt("2026-09-30 10:00");

const OPORTUNIDADE: OportunidadeDaProposta = {
  name: "Maria Souza",
  company: "Souza Eventos",
  project_type: "Podcast itinerante em evento",
  expected_date: "2026-10-24",
  message: "Quer um podcast itinerante na feira de noivas, dois dias de gravação.",
  internal_notes: null,
  status: "contacting",
  estimated_value: 4800,
  next_action: null,
  next_action_at: null,
};

const CONTATO: ContatoDaProposta = {
  phone: "5562999110001",
  wa_name: "Maria",
  display_name: null,
  company: "Souza Eventos",
  notes: null,
};

function mensagem(direcao: "in" | "out", texto: string, quando: string, extra: Partial<MensagemDaProposta> = {}): MensagemDaProposta {
  return {
    direction: direcao,
    sent_by: direcao === "in" ? "contato" : "sistema",
    kind: "text",
    body: texto,
    media_name: null,
    transcript: null,
    sent_at: brt(quando).toISOString(),
    ...extra,
  };
}

const MENSAGENS: MensagemDaProposta[] = [
  mensagem("in", "A feira vai ser nos dias 24 e 25 de outubro, no Centro de Convenções.", "2026-09-28 10:00"),
  mensagem("out", "Perfeito, Maria. Vou montar a proposta.", "2026-09-28 11:00"),
  mensagem("in", "", "2026-09-29 09:00", {
    kind: "audio",
    body: null,
    transcript: "A diretoria aprovou até seis mil e quinhentos, ou seja, R$ 6.500 no total.",
  }),
];

const TABELA = {
  titulo: "Tabela de serviços 2026",
  texto:
    "Podcast itinerante em evento: diária de R$ 2.800,00.\n" +
    "Cortes verticais: R$ 150 por corte.\n" +
    "Pagamento: 50% na aprovação e 50% na entrega. Proposta válida por 10 dias.",
};

function prompt() {
  return montarPromptProposta({
    oportunidade: OPORTUNIDADE,
    contato: CONTATO,
    mensagens: MENSAGENS,
    resumoDaConversa: "Maria pediu a proposta com dois dias de gravação.",
    instrucoes: "Tom direto e cordial. Assine como Equipe AR1 Films.",
    baseConhecimento: [TABELA],
    contextoCliente: [{ titulo: "Briefing da feira", texto: "Estande 14, pavilhão azul. Montagem às 7h." }],
    agora: AGORA,
  });
}

function contexto() {
  const p = prompt();
  return {
    oportunidade: OPORTUNIDADE,
    contato: CONTATO,
    titulosDosDocumentos: p.titulosDosDocumentos,
    textosDeBase: p.textosDeBase,
    temConversa: p.temConversa,
  };
}

function bruto(parcial: Partial<RascunhoBruto> = {}): RascunhoBruto {
  return {
    titulo: "Podcast itinerante na feira de noivas",
    cliente: { nome: "Maria", empresa: "Eventos Souza Ltda" },
    resumo_do_pedido: "A Souza Eventos quer um podcast itinerante nos dias 24 e 25 de outubro.",
    escopo: [{ item: "Gravação no evento", descricao: "Dois dias de gravação com três câmeras." }],
    entregas: ["Episódios editados"],
    cronograma: [{ etapa: "Gravação", prazo: "24 e 25/10/2026" }],
    investimento: [{ descricao: "Diária de gravação", valor: 2800, fonte_do_valor: "Tabela de serviços 2026" }],
    condicoes: ["Pagamento: 50% na aprovação e 50% na entrega."],
    validade_dias: 10,
    observacoes: null,
    pendencias: [],
    fontes: ["Tabela de serviços 2026"],
    ...parcial,
  };
}

// ------------------------------------------------------------------ valores

describe("números escritos num texto", () => {
  it("lê os formatos usados no Brasil", () => {
    expect(numerosDoTexto("diária de R$ 2.800,00")).toEqual([2800]);
    expect(numerosDoTexto("fica 4800 no total")).toEqual([4800]);
    expect(numerosDoTexto("R$ 4.800,50 à vista")).toEqual([4800.5]);
    expect(numerosDoTexto("uns 4,8 mil")).toEqual([4800]);
    expect(numerosDoTexto("até 5 mil")).toEqual([5000]);
    expect(numerosDoTexto("R$ 1,2 milhão")).toEqual([1200000]);
    expect(numerosDoTexto("12k por mês")).toEqual([12000]);
    expect(numerosDoTexto("4800.50")).toEqual([4800.5]);
    expect(numerosDoTexto("entre 3.200 e 3.600")).toEqual([3200, 3600]);
  });

  it("não confunde data, hora, telefone, percentual e documento com valor", () => {
    expect(numerosDoTexto("dia 24/10/2026 às 14:30")).toEqual([]);
    expect(numerosDoTexto("em 2026-10-24T18:00")).toEqual([]);
    expect(numerosDoTexto("montagem às 7h, gravação 14h30")).toEqual([]);
    expect(numerosDoTexto("me liga no (62) 98125-2338")).toEqual([]);
    expect(numerosDoTexto("WhatsApp 5562981252338")).toEqual([]);
    expect(numerosDoTexto("50% na aprovação")).toEqual([]);
    expect(numerosDoTexto("CNPJ 12.345.678/0001-90")).toEqual([]);
    expect(numerosDoTexto("sem números aqui")).toEqual([]);
  });

  it("valor só tem base quando está escrito ou é o da oportunidade", () => {
    const base = { textos: ["Diária de R$ 2.800,00", "Cliente falou em 6.500"], valorDaOportunidade: 4800 };
    expect(valorTemBase(2800, base)).toBe(true);
    expect(valorTemBase(6500, base)).toBe(true);
    expect(valorTemBase(4800, base)).toBe(true); // valor estimado da oportunidade
    expect(valorTemBase(5600, base)).toBe(false); // 2 x 2.800: conta que ninguém escreveu
    expect(valorTemBase(2799.99, base)).toBe(false);
    expect(valorTemBase(0, base)).toBe(false);
    expect(valorTemBase(-2800, base)).toBe(false);
    expect(valorTemBase(Number.NaN, base)).toBe(false);
    expect(valorTemBase(4800, { textos: [], valorDaOportunidade: null })).toBe(false);
  });
});

// ----------------------------------------------------------------- rascunho

describe("prompt do rascunho", () => {
  it("leva documentos, oportunidade, contato e conversa (com a transcrição do áudio)", () => {
    const p = prompt();
    expect(p.system).toContain("REGRA DOS VALORES");
    expect(p.system).toContain("use null");
    expect(p.system).toContain("nunca aparecem na proposta");
    expect(p.system).toContain("Tom direto e cordial");
    expect(p.user).toContain("BASE DE CONHECIMENTO DA AR1");
    expect(p.user).toContain("### Tabela de serviços 2026");
    expect(p.user).toContain("### Briefing da feira");
    expect(p.user).toContain("<oportunidade_atual>");
    expect(p.user).toContain("valor estimado: R$ 4.800");
    expect(p.user).toContain("data prevista do projeto: 24/10/2026");
    expect(p.user).toContain("CONTATO: A feira vai ser nos dias 24 e 25 de outubro");
    expect(p.user).toContain("[áudio] A diretoria aprovou até seis mil e quinhentos");
    expect(p.titulosDosDocumentos).toEqual(["Tabela de serviços 2026", "Briefing da feira"]);
    expect(p.temConversa).toBe(true);
  });

  it("o valor estimado não entra nos textos de base (ele tem regra própria)", () => {
    const p = prompt();
    expect(p.textosDeBase.join("\n")).not.toContain("valor estimado");
    expect(p.textosDeBase.join("\n")).toContain("R$ 6.500");
  });

  it("funciona sem conversa e sem documentos", () => {
    const p = montarPromptProposta({ oportunidade: OPORTUNIDADE, contato: null, mensagens: [], instrucoes: "" });
    expect(p.user).toContain("(sem conversa no WhatsApp)");
    expect(p.user).toContain("(nenhum documento)");
    expect(p.user).not.toContain("<contato>");
    expect(p.temConversa).toBe(false);
  });
});

describe("regras do código sobre o rascunho da IA", () => {
  it("o esquema aceita valor nulo e recusa valor em texto", () => {
    expect(esquemaRascunhoProposta.safeParse(bruto()).success).toBe(true);
    expect(
      esquemaRascunhoProposta.safeParse(
        bruto({ investimento: [{ descricao: "Gravação", valor: null, fonte_do_valor: null }] }),
      ).success,
    ).toBe(true);
    expect(
      esquemaRascunhoProposta.safeParse({
        ...bruto(),
        investimento: [{ descricao: "Gravação", valor: "2800", fonte_do_valor: null }],
      }).success,
    ).toBe(false);
  });

  it("mantém o valor que está escrito num documento e diz de onde veio", () => {
    const r = aplicarRegrasDoRascunho(bruto(), contexto());
    expect(r.proposta.investimento).toEqual([{ descricao: "Diária de gravação", valor: 2800 }]);
    expect(r.fontesDosValores).toEqual(["Tabela de serviços 2026"]);
    expect(r.valoresSemBase).toBe(0);
    expect(r.avisos).toEqual([]);
  });

  it("valor inventado vira nulo (a definir), com aviso para quem revisa", () => {
    const r = aplicarRegrasDoRascunho(
      bruto({
        investimento: [
          { descricao: "Diária de gravação (2 dias)", valor: 5600, fonte_do_valor: "Tabela de serviços 2026" },
          { descricao: "Transmissão ao vivo", valor: 3000, fonte_do_valor: "conversa" },
          { descricao: "Cortes verticais", valor: 150, fonte_do_valor: "Tabela de serviços 2026" },
        ],
      }),
      contexto(),
    );
    expect(r.proposta.investimento).toEqual([
      { descricao: "Diária de gravação (2 dias)", valor: null },
      { descricao: "Transmissão ao vivo", valor: null },
      { descricao: "Cortes verticais", valor: 150 },
    ]);
    expect(r.fontesDosValores).toEqual([null, null, "Tabela de serviços 2026"]);
    expect(r.valoresSemBase).toBe(2);
    expect(r.avisos[0]).toContain("2 valores");
    expect(r.avisos[0]).toContain("a definir");
  });

  it("aceita o valor dito na conversa (inclusive em áudio transcrito)", () => {
    const r = aplicarRegrasDoRascunho(
      bruto({ investimento: [{ descricao: "Pacote fechado", valor: 6500, fonte_do_valor: "conversa" }] }),
      contexto(),
    );
    expect(r.proposta.investimento[0].valor).toBe(6500);
    expect(r.fontesDosValores).toEqual([FONTE_CONVERSA]);
  });

  it("aceita o valor estimado da oportunidade mesmo sem estar em texto nenhum", () => {
    const r = aplicarRegrasDoRascunho(
      bruto({ investimento: [{ descricao: "Podcast itinerante", valor: 4800, fonte_do_valor: null }] }),
      contexto(),
    );
    expect(r.proposta.investimento[0].valor).toBe(4800);
    expect(r.fontesDosValores).toEqual([FONTE_OPORTUNIDADE]);
  });

  it("sem base nenhuma, todo valor fica nulo", () => {
    const r = aplicarRegrasDoRascunho(bruto(), {
      oportunidade: { ...OPORTUNIDADE, estimated_value: null, message: null },
      contato: null,
      titulosDosDocumentos: [],
      textosDeBase: [],
      temConversa: false,
    });
    expect(r.proposta.investimento).toEqual([{ descricao: "Diária de gravação", valor: null }]);
    expect(r.valoresSemBase).toBe(1);
    expect(r.avisos[0]).toContain("1 valor");
  });

  it("valor nulo da IA continua nulo, sem aviso de valor retirado", () => {
    const r = aplicarRegrasDoRascunho(
      bruto({ investimento: [{ descricao: "Filme institucional", valor: null, fonte_do_valor: null }] }),
      contexto(),
    );
    expect(r.proposta.investimento).toEqual([{ descricao: "Filme institucional", valor: null }]);
    expect(r.valoresSemBase).toBe(0);
    expect(r.avisos.join(" ")).toContain("valor estimado de R$ 4.800");
  });

  it("sem investimento da IA, usa o serviço e o valor da oportunidade", () => {
    const r = aplicarRegrasDoRascunho(bruto({ investimento: [] }), contexto());
    expect(r.proposta.investimento).toEqual([{ descricao: "Podcast itinerante em evento", valor: 4800 }]);
    expect(r.origens.investimento).toBe("oportunidade");
    expect(r.fontesDosValores).toEqual([FONTE_OPORTUNIDADE]);
  });

  it("nome e empresa vêm do cadastro, não da IA", () => {
    const r = aplicarRegrasDoRascunho(bruto(), contexto());
    expect(r.proposta.cliente).toEqual({ nome: "Maria Souza", empresa: "Souza Eventos" });
    expect(r.origens.cliente).toBe("oportunidade");
  });

  it("empresa 'Não informada' não vai para a proposta", () => {
    const r = aplicarRegrasDoRascunho(bruto({ cliente: { nome: "Bruno", empresa: null } }), {
      ...contexto(),
      oportunidade: { ...OPORTUNIDADE, name: "Bruno Tavares", company: "Não informada" },
      contato: { ...CONTATO, company: null },
    });
    expect(r.proposta.cliente).toEqual({ nome: "Bruno Tavares", empresa: null });
  });

  it("validade: a da IA quando é válida; senão a padrão, marcada como padrão", () => {
    expect(aplicarRegrasDoRascunho(bruto({ validade_dias: 10 }), contexto()).proposta.validade_dias).toBe(10);
    expect(aplicarRegrasDoRascunho(bruto({ validade_dias: 10 }), contexto()).origens.validade_dias).toBe("ia");
    for (const invalida of [null, 0, -5, 9999, Number.NaN]) {
      const r = aplicarRegrasDoRascunho(bruto({ validade_dias: invalida }), contexto());
      expect(r.proposta.validade_dias).toBe(VALIDADE_PADRAO_DIAS);
      expect(r.origens.validade_dias).toBe("padrao");
    }
  });

  it("só valem como fonte os documentos enviados, mais a conversa e a oportunidade", () => {
    const r = aplicarRegrasDoRascunho(
      bruto({ fontes: ["tabela de serviços 2026", "Documento que não existe", "### Briefing da feira"] }),
      contexto(),
    );
    expect(r.fontes).toEqual(["Tabela de serviços 2026", "Briefing da feira", FONTE_CONVERSA, FONTE_OPORTUNIDADE]);
  });

  it("aplica os limites de tamanho e de quantidade", () => {
    const r = aplicarRegrasDoRascunho(
      bruto({
        titulo: "T".repeat(500),
        escopo: Array.from({ length: 30 }, (_, i) => ({ item: `Item ${i}`, descricao: "d".repeat(2000) })),
        entregas: Array.from({ length: 30 }, (_, i) => `Entrega ${i}`),
        cronograma: [{ etapa: "Entrega", prazo: "" }],
      }),
      contexto(),
    );
    expect(r.proposta.titulo.length).toBe(LIMITES.titulo);
    expect(r.proposta.escopo).toHaveLength(LIMITES.itensDeEscopo);
    expect(r.proposta.escopo[0].descricao.length).toBe(LIMITES.descricaoDeEscopo);
    expect(r.proposta.entregas).toHaveLength(LIMITES.entregas);
    expect(r.proposta.cronograma).toEqual([{ etapa: "Entrega", prazo: "a definir" }]);
    // O que sai das regras passa na validação do editor.
    expect(validarProposta(r.proposta).ok).toBe(true);
  });

  it("recado interno da IA fica fora da proposta (e do PDF)", () => {
    const r = aplicarRegrasDoRascunho(
      bruto({
        observacoes: "A transmissão ao vivo depende da internet do pavilhão.",
        pendencias: ["  Confirmar o horário   de montagem. ", "", ...Array.from({ length: 10 }, (_, i) => `Pendência ${i}`)],
      }),
      contexto(),
    );
    expect(r.pendencias).toHaveLength(6);
    expect(r.pendencias[0]).toBe("Confirmar o horário de montagem.");
    expect(r.proposta.observacoes).toBe("A transmissão ao vivo depende da internet do pavilhão.");
    expect(JSON.stringify(r.proposta)).not.toContain("Confirmar o horário");
    expect(Object.keys(r.proposta)).not.toContain("pendencias");
    // Resposta antiga, sem o campo: nenhuma pendência.
    const semCampo = bruto();
    delete semCampo.pendencias;
    expect(aplicarRegrasDoRascunho(semCampo, contexto()).pendencias).toEqual([]);
  });

  it("marca o que veio da IA, da oportunidade e o que ficou vazio", () => {
    const r = aplicarRegrasDoRascunho(bruto({ entregas: [], observacoes: "  " }), contexto());
    expect(r.origens).toMatchObject({
      titulo: "ia",
      resumo_do_pedido: "ia",
      escopo: "ia",
      entregas: "vazio",
      investimento: "ia",
      condicoes: "ia",
      observacoes: "vazio",
    });
  });

  it("rascunho sem IA usa só os dados da oportunidade", () => {
    const r = rascunhoSemIA(OPORTUNIDADE, CONTATO);
    expect(r.proposta.titulo).toBe("Proposta: Podcast itinerante em evento");
    expect(r.proposta.cliente).toEqual({ nome: "Maria Souza", empresa: "Souza Eventos" });
    expect(r.proposta.resumo_do_pedido).toBe(OPORTUNIDADE.message);
    expect(r.proposta.investimento).toEqual([{ descricao: "Podcast itinerante em evento", valor: 4800 }]);
    expect(r.proposta.escopo).toEqual([]);
    expect(r.origens.titulo).toBe("padrao");
    expect(r.origens.resumo_do_pedido).toBe("oportunidade");
    expect(r.fontes).toEqual([FONTE_OPORTUNIDADE]);
    expect(r.avisos).toEqual([]);
    expect(r.pendencias).toEqual([]);
  });

  it("rascunho sem IA e sem valor estimado deixa o valor a definir", () => {
    const r = rascunhoSemIA({ ...OPORTUNIDADE, estimated_value: null }, null);
    expect(r.proposta.investimento).toEqual([{ descricao: "Podcast itinerante em evento", valor: null }]);
  });
});

// -------------------------------------------------------------------- total

describe("total da proposta", () => {
  it("soma só os itens com valor e conta os que estão a definir", () => {
    expect(totalDaProposta(PROPOSTA_EXEMPLO.investimento)).toEqual({
      total: 6850.5,
      itensComValor: 2,
      itensADefinir: 1,
      completo: false,
    });
  });

  it("não acumula erro de centavos", () => {
    const t = totalDaProposta([
      { descricao: "a", valor: 0.1 },
      { descricao: "b", valor: 0.2 },
      { descricao: "c", valor: 1999.99 },
    ]);
    expect(t.total).toBe(2000.29);
    expect(t.completo).toBe(true);
  });

  it("sem itens ou sem valores, o total é zero e incompleto", () => {
    expect(totalDaProposta([])).toEqual({ total: 0, itensComValor: 0, itensADefinir: 0, completo: false });
    expect(totalDaProposta([{ descricao: "x", valor: null }])).toMatchObject({ total: 0, itensADefinir: 1, completo: false });
  });

  it("escreve o total para a tela", () => {
    expect(reaisComCentavos(6850.5)).toBe("R$ 6.850,50");
    expect(reaisComCentavos(4800)).toBe("R$ 4.800,00");
    expect(textoDoTotal(totalDaProposta([{ descricao: "a", valor: 4800 }]))).toBe("R$ 4.800,00");
    expect(textoDoTotal(totalDaProposta(PROPOSTA_EXEMPLO.investimento))).toBe("R$ 6.850,50 + 1 item a definir");
    expect(
      textoDoTotal(
        totalDaProposta([
          { descricao: "a", valor: 100 },
          { descricao: "b", valor: null },
          { descricao: "c", valor: null },
        ]),
      ),
    ).toBe("R$ 100,00 + 2 itens a definir");
    expect(textoDoTotal(totalDaProposta([{ descricao: "a", valor: null }]))).toBe("a definir");
  });
});

// ---------------------------------------------------------------- numeração

describe("numeração AR1-AAAAMMDD-XXXX", () => {
  it("usa o dia de Brasília, não o de UTC", () => {
    expect(diaDaProposta(brt("2026-09-30 10:00"))).toBe("20260930");
    expect(diaDaProposta(brt("2026-09-30 23:30"))).toBe("20260930"); // já é dia 1º em UTC
    expect(diaDaProposta(brt("2026-10-01 00:10"))).toBe("20261001");
  });

  it("monta o número com quatro dígitos", () => {
    expect(numeroDaProposta("20260930", 1)).toBe("AR1-20260930-0001");
    expect(numeroDaProposta("20260930", 42)).toBe("AR1-20260930-0042");
    expect(numeroDaProposta("20260930", 9999)).toBe("AR1-20260930-9999");
    expect(NUMERO_VALIDO.test(numeroDaProposta("20260930", 7))).toBe(true);
  });

  it("recusa dia ou sequência inválidos", () => {
    expect(() => numeroDaProposta("2026-09-30", 1)).toThrow();
    expect(() => numeroDaProposta("20260930", 0)).toThrow();
    expect(() => numeroDaProposta("20260930", 10000)).toThrow();
    expect(() => numeroDaProposta("20260930", 1.5)).toThrow();
  });

  it("o próximo número é a maior sequência do dia mais um", () => {
    expect(proximoNumero([], AGORA)).toBe("AR1-20260930-0001");
    expect(proximoNumero(["AR1-20260930-0001", "AR1-20260930-0003"], AGORA)).toBe("AR1-20260930-0004");
  });

  it("ignora números de outros dias e textos fora do padrão", () => {
    expect(proximoNumero(["AR1-20260929-0017", "AR1-20260930-0002", "rascunho", "AR1-20260930-12"], AGORA)).toBe(
      "AR1-20260930-0003",
    );
  });

  it("avisa quando o dia chega ao limite", () => {
    expect(() => proximoNumero(["AR1-20260930-9999"], AGORA)).toThrow(/Limite/);
  });
});

// ----------------------------------------------------------------- validade

describe("validade", () => {
  it("conta os dias a partir do dia de Brasília", () => {
    expect(validaAte(brt("2026-09-30 10:00"), 15)).toBe("2026-10-15");
    expect(validaAte(brt("2026-09-30 23:50"), 1)).toBe("2026-10-01");
    expect(validaAte(brt("2026-12-25 09:00"), 10)).toBe("2027-01-04");
    expect(diaPorExtenso("2026-10-15")).toBe("15/10/2026");
  });

  it("lê a validade com limites", () => {
    expect(lerValidade(10)).toBe(10);
    expect(lerValidade("30")).toBe(30);
    expect(lerValidade(14.6)).toBe(15);
    expect(lerValidade(0)).toBe(VALIDADE_PADRAO_DIAS);
    expect(lerValidade(181)).toBe(VALIDADE_PADRAO_DIAS);
    expect(lerValidade("abc")).toBe(VALIDADE_PADRAO_DIAS);
    expect(lerValidade(null)).toBe(VALIDADE_PADRAO_DIAS);
  });
});

// ---------------------------------------------------------------- validação

describe("validação da proposta editada", () => {
  it("aceita a proposta de exemplo", () => {
    const r = validarProposta(PROPOSTA_EXEMPLO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposta).toEqual(PROPOSTA_EXEMPLO);
  });

  it("tira linhas vazias e espaços sobrando", () => {
    const r = validarProposta({
      ...PROPOSTA_EXEMPLO,
      titulo: "  Podcast   itinerante ",
      entregas: ["  Episódios  editados ", "", "   "],
      escopo: [{ item: "", descricao: "" }, { item: " Gravação ", descricao: " Dois dias.\n\n\n\nCom três câmeras. " }],
      investimento: [{ descricao: "", valor: null }, { descricao: "Gravação", valor: 4800.004 }],
      observacoes: "   ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta.titulo).toBe("Podcast itinerante");
    expect(r.proposta.entregas).toEqual(["Episódios editados"]);
    expect(r.proposta.escopo).toEqual([{ item: "Gravação", descricao: "Dois dias.\n\nCom três câmeras." }]);
    expect(r.proposta.investimento).toEqual([{ descricao: "Gravação", valor: 4800 }]);
    expect(r.proposta.observacoes).toBeNull();
  });

  it("aponta o campo com problema", () => {
    const erro = (parcial: Record<string, unknown>) => {
      const r = validarProposta({ ...PROPOSTA_EXEMPLO, ...parcial });
      expect(r.ok).toBe(false);
      return r.ok ? null : { campo: r.campo, erro: r.erro };
    };
    expect(erro({ titulo: " " })?.campo).toBe("titulo");
    expect(erro({ cliente: { nome: "", empresa: "X" } })?.campo).toBe("cliente");
    expect(erro({ investimento: [{ descricao: "Gravação", valor: -1 }] })?.campo).toBe("investimento");
    expect(erro({ investimento: [{ descricao: "Gravação", valor: Number.NaN }] })?.campo).toBe("investimento");
    expect(erro({ investimento: [{ descricao: "Gravação", valor: "4800" }] })?.campo).toBe("investimento");
    expect(erro({ investimento: [{ descricao: "", valor: 100 }] })?.erro).toContain("sem descrição");
    expect(erro({ validade_dias: 0 })?.campo).toBe("validade_dias");
    expect(erro({ validade_dias: 7.5 })?.campo).toBe("validade_dias");
    expect(erro({ resumo_do_pedido: "x".repeat(LIMITES.resumo + 1) })?.campo).toBe("resumo_do_pedido");
    expect(erro({ entregas: Array.from({ length: LIMITES.entregas + 1 }, (_, i) => `Entrega ${i}`) })?.campo).toBe("entregas");
    expect(erro({ escopo: [{ item: "", descricao: "sem nome" }] })?.campo).toBe("escopo");
  });

  it("recusa proposta vazia e entrada que não é objeto", () => {
    expect(
      validarProposta({
        ...PROPOSTA_EXEMPLO,
        resumo_do_pedido: "",
        escopo: [],
        entregas: [],
        investimento: [],
      }).ok,
    ).toBe(false);
    expect(validarProposta(null).ok).toBe(false);
    expect(validarProposta("texto").ok).toBe(false);
    expect(validarProposta([]).ok).toBe(false);
  });

  it("nome do arquivo sem acento nem caractere estranho", () => {
    expect(nomeDoArquivo("AR1-20260930-0001", { nome: "Maria Souza", empresa: "Souza Eventos & Cia." })).toBe(
      "Proposta AR1-20260930-0001 - Souza Eventos Cia.pdf",
    );
    expect(nomeDoArquivo("AR1-20260930-0001", { nome: "João Conceição", empresa: null })).toBe(
      "Proposta AR1-20260930-0001 - Joao Conceicao.pdf",
    );
    expect(nomeDoArquivo("AR1-20260930-0001", { nome: "🎙️", empresa: null })).toBe("Proposta AR1-20260930-0001.pdf");
  });
});

// ------------------------------------------------------------------- editor

describe("editor", () => {
  it("ida e volta preservam a proposta", () => {
    const estado = paraEditor(PROPOSTA_EXEMPLO, ["Tabela de serviços 2026", "Conversa do WhatsApp", null]);
    expect(estado.investimento).toEqual([
      { descricao: "Podcast itinerante: diária de gravação (2 dias)", valor: "5600", fonte: "Tabela de serviços 2026" },
      { descricao: "Cortes verticais para redes sociais", valor: "1250,50", fonte: "Conversa do WhatsApp" },
      { descricao: "Transmissão ao vivo", valor: "", fonte: null },
    ]);
    const r = doEditor(estado);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposta).toEqual(PROPOSTA_EXEMPLO);
  });

  it("lê valores digitados em reais", () => {
    const estado = paraEditor(PROPOSTA_EXEMPLO);
    estado.investimento = [
      { descricao: "Gravação", valor: "R$ 4.800,00", fonte: null },
      { descricao: "Edição", valor: "1.200", fonte: null },
      { descricao: "Transmissão", valor: " ", fonte: null },
    ];
    expect(totalDoEditor(estado.investimento)).toMatchObject({ total: 6000, itensComValor: 2, itensADefinir: 1 });
    const r = doEditor(estado);
    expect(r.ok && r.proposta.investimento).toEqual([
      { descricao: "Gravação", valor: 4800 },
      { descricao: "Edição", valor: 1200 },
      { descricao: "Transmissão", valor: null },
    ]);
  });

  it("linha em branco não conta no total", () => {
    expect(totalDoEditor([{ descricao: "", valor: "", fonte: null }])).toMatchObject({ itensComValor: 0, itensADefinir: 0 });
  });

  it("valor que não é número é recusado com o nome do item", () => {
    const estado = paraEditor(PROPOSTA_EXEMPLO);
    estado.investimento[0].valor = "quatro mil";
    const r = doEditor(estado);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.campo).toBe("investimento");
      expect(r.erro).toContain("Podcast itinerante");
    }
  });

  it("validade precisa ser número inteiro de dias", () => {
    const estado = paraEditor(PROPOSTA_EXEMPLO);
    for (const invalida of ["", "0", "15 dias", "7,5", "999"]) {
      const r = doEditor({ ...estado, validade: invalida });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.campo).toBe("validade_dias");
    }
    expect(doEditor({ ...estado, validade: " 30 " }).ok).toBe(true);
  });
});

// ------------------------------------------------ sugestões depois de gerar

describe("sugestões depois de gerar a proposta", () => {
  const geradaEm = brt("2026-09-30 10:00").toISOString();
  const agora = brt("2026-09-30 10:05").getTime();
  const base = { status: "contacting" as const, next_action: null, next_action_at: null };

  it("sugere mover para Proposta e cobrar o retorno em 3 dias", () => {
    const s = sugestoesAposProposta(base, geradaEm, agora);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ campo: "etapa", etapa: "proposal", texto: "Proposta gerada: mover para Proposta" });
    expect(s[1].campo).toBe("proxima_acao");
    expect(s[1].campos).toEqual({
      next_action: ACAO_APOS_PROPOSTA,
      // 03/10/2026 às 18 h de Brasília
      next_action_at: "2026-10-03T21:00:00.000Z",
    });
    expect(s[1].texto).toBe('Proposta gerada: próxima ação "Cobrar retorno da proposta" até 03/10');
  });

  it("o prazo conta do dia de Brasília em que a proposta foi gerada", () => {
    expect(prazoParaCobrar(brt("2026-09-30 23:40"))).toBe("2026-10-03T21:00:00.000Z");
  });

  it("não sugere a etapa para quem já está em Proposta ou adiante", () => {
    for (const status of ["proposal", "negotiating"] as const) {
      const s = sugestoesAposProposta({ ...base, status }, geradaEm, agora);
      expect(s.map((x) => x.campo)).toEqual(["proxima_acao"]);
    }
  });

  it("não sugere nada para oportunidade fechada, sem proposta ou com proposta antiga", () => {
    expect(sugestoesAposProposta({ ...base, status: "won" }, geradaEm, agora)).toEqual([]);
    expect(sugestoesAposProposta({ ...base, status: "lost" }, geradaEm, agora)).toEqual([]);
    expect(sugestoesAposProposta(base, null, agora)).toEqual([]);
    expect(sugestoesAposProposta(base, "data inválida", agora)).toEqual([]);
    expect(sugestoesAposProposta(base, geradaEm, brt("2026-10-08 10:00").getTime())).toEqual([]);
  });

  it("depois de aceitas, as sugestões somem", () => {
    const aceita = {
      status: "proposal" as const,
      next_action: "cobrar retorno da proposta ",
      next_action_at: "2026-10-03T21:00:00.000Z",
    };
    expect(sugestoesAposProposta(aceita, geradaEm, agora)).toEqual([]);
  });

  it("cobrança antiga (de outra proposta) não conta como já marcada", () => {
    const antiga = { status: "proposal" as const, next_action: ACAO_APOS_PROPOSTA, next_action_at: "2026-09-20T21:00:00.000Z" };
    expect(sugestoesAposProposta(antiga, geradaEm, agora).map((x) => x.campo)).toEqual(["proxima_acao"]);
  });

  it("prazo que já passou não é sugerido", () => {
    const s = sugestoesAposProposta(base, geradaEm, brt("2026-10-04 09:00").getTime());
    expect(s.map((x) => x.campo)).toEqual(["etapa"]);
  });
});

// ----------------------------------------------------------------- mensagem

describe("mensagem com o link da proposta", () => {
  const link = "https://exemplo.supabase.co/storage/v1/object/sign/ar1-context/propostas/x/AR1-20260930-0001.pdf?token=abc";

  it("monta o texto com nome, número, link e validade", () => {
    const texto = textoDaMensagem({
      nomeDoCliente: "maria souza",
      titulo: "Podcast itinerante na feira de noivas",
      numero: "AR1-20260930-0001",
      validaAte: "2026-10-15",
      link,
    });
    expect(texto).toContain("Oi, Maria! Segue a proposta da AR1 Films: Podcast itinerante na feira de noivas (AR1-20260930-0001).");
    expect(texto).toContain(`\n${link}\n`);
    expect(texto).toContain("fica disponível por 7 dias");
    expect(texto).toContain("vale até 15/10/2026");
    expect(texto.endsWith("Equipe AR1 Films")).toBe(true);
    expect(textoTemLink(texto, link)).toBe(true);
  });

  it("sem nome utilizável, cumprimenta sem nome", () => {
    expect(primeiroNome("+55 (62) 99911-0001")).toBe("");
    expect(primeiroNome("  ")).toBe("");
    expect(primeiroNome(null)).toBe("");
    const texto = textoDaMensagem({ nomeDoCliente: null, titulo: "Filme", numero: "AR1-20260930-0002", validaAte: "2026-10-15", link });
    expect(texto.startsWith("Olá! Segue a proposta")).toBe(true);
  });

  it("percebe quando o texto editado ficou sem o link", () => {
    expect(textoTemLink("Oi, Maria! Segue a proposta.", link)).toBe(false);
    expect(textoTemLink(`Proposta: ${link}`, link)).toBe(true);
    expect(textoTemLink("qualquer coisa", "")).toBe(false);
  });
});
