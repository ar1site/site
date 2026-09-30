// A apresentação da proposta premium: a MESMA marcação serve à página pública
// (rolável em tela cheia), à prévia do editor e ao PDF (modo de impressão,
// uma lâmina A4 paisagem por seção). Sem hooks: renderiza no servidor e no
// navegador. As ações do cliente (aceitar, WhatsApp) entram por `acoes`.

import type { ReactNode } from "react";
import {
  paragrafos,
  secoesVisiveis,
  type ImagemDaProposta,
  type PropostaPremium,
  type SecaoPremium,
} from "@/lib/propostas/premium/conteudo";
import { quantidadeLegivel, reaisPremium, TEXTO_SOB_CONSULTA } from "@/lib/propostas/premium/investimento";
import { WHATSAPP_COMERCIAL_LEGIVEL } from "@/lib/propostas/premium/publico";
import { urlDaGaleria } from "@/lib/propostas/galeria";
import { diaPorExtenso } from "@/lib/propostas/proposta";
import "./apresentacao.css";

export type ModoDaApresentacao = "tela" | "previa" | "impressao";

export interface DadosDaApresentacao {
  conteudo: PropostaPremium;
  numero: string;
  /** AAAA-MM-DD */
  emitidaEm: string;
  /** AAAA-MM-DD */
  validaAte: string;
  /** Caminho no bucket -> URL assinada (imagens enviadas). */
  imagens: Record<string, string>;
  /** Prefixo absoluto para as imagens da galeria (o PDF e o Open Graph precisam de URL completa). */
  base?: string;
}

export function urlDaImagem(img: ImagemDaProposta | null, dados: Pick<DadosDaApresentacao, "imagens" | "base">): string | null {
  if (!img) return null;
  if (img.origem === "galeria") return `${dados.base ?? ""}${urlDaGaleria(img.arquivo)}`;
  return dados.imagens[img.arquivo] ?? null;
}

const CONTATOS = { whatsapp: WHATSAPP_COMERCIAL_LEGIVEL, email: "contato@ar1films.com", site: "ar1films.com" };

function Fundo({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <>
      <div className="ap-fundo" data-fundo={url} style={{ backgroundImage: `url("${url}")` }} aria-hidden />
      <div className="ap-veu" aria-hidden />
    </>
  );
}

function Rodape({ numero, indice, total }: { numero: string; indice: number; total: number }) {
  return (
    <div className="ap-rodape" aria-hidden>
      <span>AR1 Films · Proposta {numero}</span>
      <span>
        {indice + 1} / {total}
      </span>
    </div>
  );
}

export function ApresentacaoPremium({
  dados,
  modo = "tela",
  acoes,
}: {
  dados: DadosDaApresentacao;
  modo?: ModoDaApresentacao;
  /** Botões da página pública (Aceitar proposta, Falar no WhatsApp). */
  acoes?: ReactNode;
}) {
  const p = dados.conteudo;
  const secoes = secoesVisiveis(p);
  const total = secoes.length;
  /** Lâminas contando o fecho. */
  const paginas = total + 1;
  const inv = p.investimento;
  const comValor = inv.itens.length - inv.sob_consulta;
  const logoCliente = p.logo_cliente ? (dados.imagens[p.logo_cliente] ?? null) : null;
  const classe = `ap${modo === "tela" ? " ap-rolagem" : ""}${modo === "previa" ? " ap--previa" : ""}${modo === "impressao" ? " ap--impressao" : ""}`;

  const lamina = (secao: SecaoPremium, indice: number): ReactNode => {
    switch (secao) {
      case "capa":
        return (
          <section key={secao} className="ap-lamina ap-lamina--capa" data-secao={secao}>
            <Fundo url={urlDaImagem(p.capa.imagem, dados)} />
            <div className="ap-capa-topo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${dados.base ?? ""}/marca/ar1-films-logo.png`} alt="AR1 Films" className="ap-logo" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logoCliente && <img src={logoCliente} alt={p.cliente.empresa ?? p.cliente.nome} className="ap-logo-cliente" />}
            </div>
            <div className="ap-capa-corpo">
              <p className="ap-olho">Proposta comercial</p>
              <h1 className="ap-h1">{p.titulo}</h1>
              <span className="ap-marca" />
              {p.subtitulo && <p className="ap-texto ap-apoio">{p.subtitulo}</p>}
              {p.capa.frase && <p className="ap-frase">{p.capa.frase}</p>}
              <div className="ap-capa-rodape">
                <span>
                  Para <strong>{p.cliente.empresa || p.cliente.nome}</strong>
                  {p.cliente.empresa && p.cliente.nome ? ` · ${p.cliente.nome}` : ""}
                </span>
                <span>
                  Nº <strong>{dados.numero}</strong>
                </span>
                <span>
                  Emitida em <strong>{diaPorExtenso(dados.emitidaEm)}</strong>
                </span>
                <span>
                  Válida até <strong>{diaPorExtenso(dados.validaAte)}</strong>
                </span>
              </div>
            </div>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "entendimento":
        return (
          <section key={secao} className="ap-lamina ap-lamina--escura" data-secao={secao}>
            <div className="ap-duas">
              <div>
                <p className="ap-olho">Entendimento</p>
                <h2 className="ap-h2">O que você precisa</h2>
                <span className="ap-marca" />
              </div>
              <div className="ap-texto">
                {paragrafos(p.entendimento).map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
              </div>
            </div>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "por_que_ar1":
        return (
          <section key={secao} className="ap-lamina" data-secao={secao}>
            <Fundo url={`${dados.base ?? ""}${urlDaGaleria("glow-horizontal.webp")}`} />
            <p className="ap-olho">Por que a AR1</p>
            <h2 className="ap-h2">Sinal. Presença. Conteúdo que permanece.</h2>
            <span className="ap-marca" />
            <div className="ap-grade ap-grade--3">
              {p.por_que_ar1.map((t, i) => (
                <div key={i} className="ap-cartao">
                  <div className="ap-numero">{String(i + 1).padStart(2, "0")}</div>
                  <p style={{ color: "var(--ap-osso)", fontSize: "1.05rem" }}>{t}</p>
                </div>
              ))}
            </div>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "solucao":
        return (
          <section key={secao} className="ap-lamina ap-lamina--grafite" data-secao={secao}>
            <p className="ap-olho">A solução</p>
            <h2 className="ap-h2">Como a AR1 resolve</h2>
            <span className="ap-marca" />
            <div className="ap-grade ap-grade--3">
              {p.solucao.map((s, i) => {
                const url = urlDaImagem(s.imagem, dados);
                return (
                  <div key={i} className="ap-cartao ap-cartao--foto">
                    <div
                      className={`ap-cartao-foto${url ? "" : " ap-cartao-foto--vazia"}`}
                      data-fundo={url ?? undefined}
                      style={url ? { backgroundImage: `url("${url}")` } : undefined}
                      aria-hidden
                    />
                    <div className="ap-cartao-corpo">
                      <h3 className="ap-h3">{s.titulo}</h3>
                      <p>{s.descricao}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "escopo":
        return (
          <section key={secao} className="ap-lamina ap-lamina--escura" data-secao={secao}>
            <p className="ap-olho">Escopo detalhado</p>
            <h2 className="ap-h2">O que está incluído</h2>
            <span className="ap-marca" />
            <ol className="ap-lista ap-lista--2">
              {p.escopo_detalhado.map((e, i) => (
                <li key={i}>
                  <span className="ap-n">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <strong>{e.item}</strong>
                    {e.quantidade ? <span className="ap-qtd">{quantidadeLegivel(e.quantidade, e.unidade ?? "")}</span> : null}
                    {e.descricao && <small>{e.descricao}</small>}
                  </span>
                </li>
              ))}
            </ol>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "entregas":
        return (
          <section key={secao} className="ap-lamina" data-secao={secao}>
            <Fundo url={`${dados.base ?? ""}${urlDaGaleria("edit-suite.webp")}`} />
            <p className="ap-olho">Entregas</p>
            <h2 className="ap-h2">O que você recebe</h2>
            <span className="ap-marca" />
            <ul className="ap-lista ap-lista--2">
              {p.entregas.map((e, i) => (
                <li key={i}>
                  <span className="ap-check" aria-hidden />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "cronograma":
        return (
          <section key={secao} className="ap-lamina ap-lamina--grafite" data-secao={secao}>
            <p className="ap-olho">Cronograma</p>
            <h2 className="ap-h2">Passo a passo</h2>
            <span className="ap-marca" />
            <ol className="ap-linha-do-tempo">
              {p.cronograma.map((c, i) => (
                <li key={i}>
                  <div className="ap-prazo">{c.prazo}</div>
                  <div className="ap-etapa">{c.etapa}</div>
                </li>
              ))}
            </ol>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "investimento":
        return (
          <section key={secao} className="ap-lamina ap-lamina--escura" data-secao={secao}>
            <p className="ap-olho">Investimento</p>
            <h2 className="ap-h2">Valores</h2>
            <span className="ap-marca" />
            <table className="ap-tabela">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="ap-dir">Quantidade</th>
                  <th className="ap-dir">Unitário</th>
                  <th className="ap-dir">Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.itens.map((i, k) => (
                  <tr key={k}>
                    <td>{i.descricao}</td>
                    <td className="ap-dir">
                      {quantidadeLegivel(i.quantidade, i.unidade)}
                    </td>
                    <td className="ap-dir">
                      {i.valor_unitario === null ? (
                        <span className="ap-consulta">{TEXTO_SOB_CONSULTA}</span>
                      ) : (
                        <>
                          {reaisPremium(i.valor_unitario)} <span className="ap-un">{i.unidade}</span>
                        </>
                      )}
                    </td>
                    <td className="ap-dir">
                      {i.valor_total === null ? <span className="ap-consulta">{TEXTO_SOB_CONSULTA}</span> : reaisPremium(i.valor_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ap-total">
              {inv.desconto ? (
                <>
                  <div className="ap-total-linha">
                    <span>Subtotal</span>
                    <span>{reaisPremium(inv.subtotal)}</span>
                  </div>
                  <div className="ap-total-linha">
                    <span>Desconto</span>
                    <span>− {reaisPremium(inv.desconto)}</span>
                  </div>
                </>
              ) : null}
              <div className="ap-total-final">
                <span className="ap-h3">{inv.sob_consulta > 0 && comValor > 0 ? "Total parcial" : "Total"}</span>
                <span className="ap-valor">{comValor > 0 ? reaisPremium(inv.total) : TEXTO_SOB_CONSULTA}</span>
              </div>
              {inv.sob_consulta > 0 && comValor > 0 && (
                <div className="ap-total-linha">
                  <span>
                    {inv.sob_consulta === 1 ? "1 item sob consulta não entra no total." : `${inv.sob_consulta} itens sob consulta não entram no total.`}
                  </span>
                </div>
              )}
            </div>
            {inv.condicoes_pagamento && (
              <p className="ap-condicoes">
                <strong style={{ color: "var(--ap-osso)" }}>Condições de pagamento.</strong> {inv.condicoes_pagamento}
              </p>
            )}
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "proximos_passos":
        return (
          <section key={secao} className="ap-lamina" data-secao={secao}>
            <Fundo url={`${dados.base ?? ""}${urlDaGaleria("producao-campo-equipe.webp")}`} />
            <p className="ap-olho">Próximos passos</p>
            <h2 className="ap-h2">Para começar</h2>
            <span className="ap-marca" />
            <ol className="ap-lista">
              {p.proximos_passos.map((s, i) => (
                <li key={i}>
                  <span className="ap-n">{String(i + 1).padStart(2, "0")}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );

      case "observacoes":
        return (
          <section key={secao} className="ap-lamina ap-lamina--grafite" data-secao={secao}>
            <p className="ap-olho">Observações</p>
            <h2 className="ap-h2">Bom saber</h2>
            <span className="ap-marca" />
            <div className="ap-texto">
              {paragrafos(p.observacoes ?? "").map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </div>
            <Rodape numero={dados.numero} indice={indice} total={paginas} />
          </section>
        );
    }
  };

  return (
    <div className={classe} lang="pt-BR">
      {secoes.map((s, i) => lamina(s, i))}
      <section className="ap-lamina ap-lamina--escura" data-secao="fecho">
        <Fundo url={`${dados.base ?? ""}${urlDaGaleria("hero-fields.webp")}`} />
        <p className="ap-olho">AR1 Films</p>
        <h2 className="ap-h2">Vamos fazer acontecer?</h2>
        <span className="ap-marca" />
        <p className="ap-texto">
          {modo === "impressao"
            ? `Esta proposta vale até ${diaPorExtenso(dados.validaAte)}. Para aceitar, fale com a gente pelo WhatsApp ou pelo link da proposta: a equipe alinha datas, detalhes e o contrato.`
            : `Esta proposta vale até ${diaPorExtenso(dados.validaAte)}. Aceite por aqui ou fale com a gente: a equipe alinha datas, detalhes e o contrato.`}
        </p>
        {acoes}
        <div className="ap-contatos">
          <span>WhatsApp {CONTATOS.whatsapp}</span>
          <span>{CONTATOS.email}</span>
          <span>{CONTATOS.site}</span>
          <span>Goiânia · GO · atendimento em todo o Brasil</span>
        </div>
        <Rodape numero={dados.numero} indice={total} total={paginas} />
      </section>
    </div>
  );
}
