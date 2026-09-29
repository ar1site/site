"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACEITA_ARQUIVOS,
  AVISO_SEM_TEXTO,
  BUCKET_CONTEXTO,
  extensaoDe,
  LIMITE_CARACTERES,
  LIMITE_TITULO,
  TAMANHO_MAXIMO_BYTES,
  tamanhoEmBytes,
  tamanhoEmCaracteres,
  TIPOS_ACEITOS_LEGIVEL,
  tipoDoArquivo,
} from "@/lib/contexto/limites";
import { dataHora } from "@/lib/formato";
import { supabaseNoNavegador } from "@/lib/supabase/browser";
import type { DocContexto, DocContextoResumo, EscopoContexto } from "@/lib/tipos";

export interface ContextoDocsProps {
  escopo: EscopoContexto;
  /** Obrigatório quando escopo = "contato". */
  contactId?: string;
  titulo: string;
  descricao: string;
  /** Chamado depois de adicionar, alterar ou apagar um documento. */
  aoMudar?: () => void;
  /** Esconde o título (quando quem usa já mostra um). */
  ocultarTitulo?: boolean;
}

type EtapaEnvio = "preparando" | "enviando" | "lendo" | "pronto" | "erro";

interface Envio {
  id: string;
  nome: string;
  etapa: EtapaEnvio;
  mensagem?: string;
}

const ROTULO_ETAPA: Record<EtapaEnvio, string> = {
  preparando: "Preparando…",
  enviando: "Enviando arquivo…",
  lendo: "Lendo o texto…",
  pronto: "Pronto",
  erro: "Não foi possível enviar",
};

const LARGURA_ETAPA: Record<EtapaEnvio, string> = {
  preparando: "10%",
  enviando: "55%",
  lendo: "85%",
  pronto: "100%",
  erro: "100%",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Tente de novo.");
  }
  const json = (await resposta.json().catch(() => ({}))) as { ok?: boolean; erro?: string };
  if (!resposta.ok || json.ok === false) {
    throw new Error(json.erro || "Algo deu errado. Tente de novo.");
  }
  return json as T;
}

function mensagemDe(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

function rotuloTipo(doc: DocContextoResumo): string {
  if (doc.kind === "text") return "Texto";
  const ext = extensaoDe(doc.file_name ?? "");
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "Word";
  return ext ? `.${ext}` : "Arquivo";
}

export function ContextoDocs({
  escopo,
  contactId,
  titulo,
  descricao,
  aoMudar,
  ocultarTitulo = false,
}: ContextoDocsProps) {
  const [docs, setDocs] = useState<DocContextoResumo[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [adicionandoTexto, setAdicionandoTexto] = useState(false);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [enviando, setEnviando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);

  const alvo = escopo === "global" ? { escopo } : { escopo, contact_id: contactId };
  const urlLista =
    escopo === "global"
      ? "/api/contexto?escopo=global"
      : `/api/contexto?escopo=contato&contact_id=${encodeURIComponent(contactId ?? "")}`;

  const buscar = useCallback(async () => {
    try {
      const r = await api<{ documentos: DocContextoResumo[] }>(urlLista);
      setDocs(r.documentos);
      setErroLista(null);
    } catch (e) {
      setErroLista(mensagemDe(e, "Não foi possível carregar os documentos."));
    }
  }, [urlLista]);

  useEffect(() => {
    let ativo = true;
    api<{ documentos: DocContextoResumo[] }>(urlLista)
      .then((r) => {
        if (ativo) setDocs(r.documentos);
      })
      .catch((e: unknown) => {
        if (ativo) setErroLista(mensagemDe(e, "Não foi possível carregar os documentos."));
      });
    return () => {
      ativo = false;
    };
  }, [urlLista]);

  const mudou = useCallback(async () => {
    await buscar();
    aoMudar?.();
  }, [buscar, aoMudar]);

  // ------------------------------------------------------------- arquivos

  function atualizarEnvio(id: string, campos: Partial<Envio>) {
    setEnvios((lista) => lista.map((e) => (e.id === id ? { ...e, ...campos } : e)));
  }

  async function enviarArquivo(arquivo: File, id: string): Promise<boolean> {
    const tipo = tipoDoArquivo(arquivo.name, arquivo.type);
    if (!tipo) {
      atualizarEnvio(id, { etapa: "erro", mensagem: `Tipo não aceito. Envie ${TIPOS_ACEITOS_LEGIVEL}.` });
      return false;
    }
    if (arquivo.size === 0) {
      atualizarEnvio(id, { etapa: "erro", mensagem: "O arquivo está vazio." });
      return false;
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      atualizarEnvio(id, {
        etapa: "erro",
        mensagem: `O arquivo tem ${tamanhoEmBytes(arquivo.size)}. O limite é 25 MB.`,
      });
      return false;
    }

    try {
      const dados = { ...alvo, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size };
      const preparo = await api<{ path: string; token: string; mime: string }>(
        "/api/contexto/upload-url",
        { method: "POST", body: JSON.stringify(dados) },
      );

      atualizarEnvio(id, { etapa: "enviando" });
      const { error } = await supabaseNoNavegador()
        .storage.from(BUCKET_CONTEXTO)
        .uploadToSignedUrl(preparo.path, preparo.token, arquivo, { contentType: preparo.mime });
      if (error) throw new Error(`O envio falhou: ${error.message}`);

      atualizarEnvio(id, { etapa: "lendo" });
      const r = await api<{ sem_texto: boolean; truncado: boolean }>("/api/contexto", {
        method: "POST",
        body: JSON.stringify({ ...dados, mime: preparo.mime, path: preparo.path }),
      });
      atualizarEnvio(id, {
        etapa: "pronto",
        mensagem: r.sem_texto
          ? AVISO_SEM_TEXTO
          : r.truncado
            ? "O texto era grande demais e foi cortado."
            : undefined,
      });
      return true;
    } catch (e) {
      atualizarEnvio(id, { etapa: "erro", mensagem: mensagemDe(e, "Tente de novo.") });
      return false;
    }
  }

  async function aoEscolherArquivos(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (seletor.current) seletor.current.value = "";
    if (arquivos.length === 0) return;

    setErro(null);
    const novos = arquivos.map((a, i) => ({
      arquivo: a,
      envio: { id: `${Date.now()}-${i}`, nome: a.name, etapa: "preparando" as const },
    }));
    // Mantém na tela só os envios com aviso; os concluídos sem aviso saem.
    setEnvios((antes) => [
      ...antes.filter((e) => e.etapa === "erro" || (e.etapa === "pronto" && e.mensagem)),
      ...novos.map((n) => n.envio),
    ]);

    setEnviando(true);
    let algumDeuCerto = false;
    for (const { arquivo, envio } of novos) {
      // Um de cada vez: a leitura do texto acontece no servidor.
      if (await enviarArquivo(arquivo, envio.id)) algumDeuCerto = true;
    }
    setEnviando(false);
    if (algumDeuCerto) await mudou();
  }

  // ----------------------------------------------------------------- render

  return (
    <div className="space-y-3 text-sm">
      <div>
        {!ocultarTitulo && <h2 className="mb-1 text-sm">{titulo}</h2>}
        <p className="text-xs leading-snug text-apoio">{descricao}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="botao botao-secundario py-1.5 text-xs"
          onClick={() => {
            setErro(null);
            setAdicionandoTexto((v) => !v);
          }}
          aria-expanded={adicionandoTexto}
        >
          Adicionar texto
        </button>
        <button
          type="button"
          className="botao botao-secundario py-1.5 text-xs"
          onClick={() => seletor.current?.click()}
          disabled={enviando}
        >
          {enviando ? "Enviando…" : "Enviar documento"}
        </button>
        <input
          ref={seletor}
          type="file"
          className="hidden"
          multiple
          accept={ACEITA_ARQUIVOS}
          onChange={(e) => aoEscolherArquivos(e.target.files)}
          aria-label="Escolher documentos"
        />
      </div>
      <p className="text-[11px] text-apoio">
        Aceita {TIPOS_ACEITOS_LEGIVEL}, até 25 MB cada. Pode escolher vários de uma vez.
      </p>

      {adicionandoTexto && (
        <FormularioTexto
          aoCancelar={() => setAdicionandoTexto(false)}
          aoSalvar={async (tituloNovo, texto) => {
            await api("/api/contexto", {
              method: "POST",
              body: JSON.stringify({ ...alvo, titulo: tituloNovo, texto }),
            });
            setAdicionandoTexto(false);
            await mudou();
          }}
        />
      )}

      {envios.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {envios.map((e) => (
            <li key={e.id} className="rounded-lg border border-borda bg-superficie-2 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs">{e.nome}</span>
                <span
                  className={`shrink-0 text-[11px] ${
                    e.etapa === "erro" ? "text-erro" : e.etapa === "pronto" ? "text-ok" : "text-apoio"
                  }`}
                >
                  {ROTULO_ETAPA[e.etapa]}
                </span>
              </div>
              <div
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-borda"
                role="progressbar"
                aria-label={`Envio de ${e.nome}`}
                aria-valuetext={ROTULO_ETAPA[e.etapa]}
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    e.etapa === "erro" ? "bg-erro" : e.etapa === "pronto" ? "bg-ok" : "animate-pulse bg-cobre"
                  }`}
                  style={{ width: LARGURA_ETAPA[e.etapa] }}
                />
              </div>
              {e.mensagem && (
                <p className={`mt-1.5 text-xs ${e.etapa === "erro" ? "text-erro" : "text-alerta"}`}>
                  {e.mensagem}
                </p>
              )}
            </li>
          ))}
          {!enviando && (
            <li>
              <button type="button" className="text-[11px] text-apoio underline" onClick={() => setEnvios([])}>
                limpar avisos de envio
              </button>
            </li>
          )}
        </ul>
      )}

      {erro && (
        <p role="alert" className="rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-xs text-erro">
          {erro}
        </p>
      )}

      {erroLista ? (
        <div className="rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-xs text-erro">
          <p>{erroLista}</p>
          <button type="button" className="mt-1 underline" onClick={buscar}>
            tentar de novo
          </button>
        </div>
      ) : docs === null ? (
        <p className="text-xs text-apoio">Carregando…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-apoio">Nenhum documento ainda.</p>
      ) : (
        <ul className="divide-y divide-borda border-t border-borda">
          {docs.map((d) => (
            <ItemDocumento key={d.id} doc={d} aoMudar={mudou} aoErro={setErro} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ novo texto

function FormularioTexto({
  aoSalvar,
  aoCancelar,
  inicial,
  somenteTitulo = false,
}: {
  aoSalvar: (titulo: string, texto: string) => Promise<void>;
  aoCancelar: () => void;
  inicial?: { titulo: string; texto: string };
  /** Arquivo: só o título pode mudar. */
  somenteTitulo?: boolean;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const passou = texto.length > LIMITE_CARACTERES;
  const pronto = Boolean(titulo.trim()) && (somenteTitulo || (Boolean(texto.trim()) && !passou));

  return (
    <form
      className="space-y-2 rounded-lg border border-borda bg-superficie-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pronto) return;
        setSalvando(true);
        setErro(null);
        try {
          await aoSalvar(titulo.trim(), texto);
        } catch (err) {
          setErro(mensagemDe(err, "Não foi possível salvar."));
          setSalvando(false);
        }
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-apoio">Título</span>
        <input
          className="campo py-1.5 text-sm"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={LIMITE_TITULO}
          placeholder="Ex.: Tabela de preços 2026"
          autoFocus
        />
      </label>
      {!somenteTitulo && (
        <label className="block">
          <span className="mb-1 block text-xs text-apoio">Texto</span>
          <textarea
            className="campo min-h-48 text-sm"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva ou cole aqui o que a IA precisa saber."
          />
          <span className={`mt-1 block text-[11px] ${passou ? "text-erro" : "text-apoio"}`}>
            {texto.length > 0 ? tamanhoEmCaracteres(texto.length) : "Até 300 mil caracteres."}
            {passou ? " · passou do limite de 300 mil caracteres" : ""}
          </span>
        </label>
      )}
      {erro && (
        <p role="alert" className="text-xs text-erro">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="botao botao-primario py-1.5 text-xs" disabled={salvando || !pronto}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="botao botao-secundario py-1.5 text-xs" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------- item

function ItemDocumento({
  doc,
  aoMudar,
  aoErro,
}: {
  doc: DocContextoResumo;
  aoMudar: () => Promise<void>;
  aoErro: (mensagem: string | null) => void;
}) {
  const [ocupado, setOcupado] = useState<"ativo" | "abrir" | "apagar" | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [edicao, setEdicao] = useState<{ titulo: string; texto: string } | null>(null);
  const semTexto = doc.chars === 0;

  async function executar(acao: "ativo" | "apagar", pedido: () => Promise<unknown>, falha: string) {
    setOcupado(acao);
    aoErro(null);
    try {
      await pedido();
      await aoMudar();
    } catch (e) {
      aoErro(mensagemDe(e, falha));
    } finally {
      setOcupado(null);
    }
  }

  async function abrirEdicao() {
    aoErro(null);
    if (doc.kind === "file") {
      setEdicao({ titulo: doc.title, texto: "" });
      return;
    }
    setOcupado("abrir");
    try {
      const r = await api<{ documento: DocContexto }>(`/api/contexto/${doc.id}`);
      setEdicao({ titulo: r.documento.title, texto: r.documento.content });
    } catch (e) {
      aoErro(mensagemDe(e, "Não foi possível abrir o documento."));
    } finally {
      setOcupado(null);
    }
  }

  if (edicao) {
    return (
      <li className="py-3">
        <FormularioTexto
          inicial={edicao}
          somenteTitulo={doc.kind === "file"}
          aoCancelar={() => setEdicao(null)}
          aoSalvar={async (titulo, texto) => {
            await api(`/api/contexto/${doc.id}`, {
              method: "PATCH",
              body: JSON.stringify(doc.kind === "file" ? { title: titulo } : { title: titulo, content: texto }),
            });
            setEdicao(null);
            await aoMudar();
          }}
        />
      </li>
    );
  }

  return (
    <li className={`space-y-1.5 py-3 ${doc.active ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words font-semibold leading-snug">{doc.title}</p>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-apoio">
          <input
            type="checkbox"
            className="h-4 w-4 accent-cobre"
            checked={doc.active}
            disabled={ocupado !== null}
            onChange={(e) =>
              executar(
                "ativo",
                () =>
                  api(`/api/contexto/${doc.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ active: e.target.checked }),
                  }),
                "Não foi possível alterar.",
              )
            }
          />
          Usar na IA
        </label>
      </div>

      <p className="text-[11px] text-apoio">
        {[rotuloTipo(doc), tamanhoEmCaracteres(doc.chars), tamanhoEmBytes(doc.file_size), dataHora(doc.created_at)]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {semTexto && <p className="text-xs text-alerta">{AVISO_SEM_TEXTO} A IA não vai usar este documento.</p>}
      {doc.content_truncated && (
        <p className="text-xs text-alerta">
          O arquivo era maior que o limite: só os primeiros 300 mil caracteres foram guardados.
        </p>
      )}
      {doc.previa && <p className="line-clamp-2 break-words text-xs text-apoio">{doc.previa}</p>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
        <button type="button" className="text-cobre-claro underline" onClick={abrirEdicao} disabled={ocupado !== null}>
          {ocupado === "abrir" ? "Abrindo…" : doc.kind === "file" ? "Editar título" : "Editar"}
        </button>
        {doc.kind === "file" && (
          <a
            className="text-cobre-claro underline"
            href={`/api/contexto/${doc.id}/arquivo`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir arquivo original
          </a>
        )}
        {confirmando ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-erro">Apagar de vez?</span>
            <button
              type="button"
              className="botao botao-perigo px-2 py-0.5 text-xs"
              disabled={ocupado !== null}
              onClick={() =>
                executar(
                  "apagar",
                  () => api(`/api/contexto/${doc.id}`, { method: "DELETE" }),
                  "Não foi possível apagar.",
                ).then(() => setConfirmando(false))
              }
            >
              {ocupado === "apagar" ? "Apagando…" : "Sim, apagar"}
            </button>
            <button type="button" className="text-apoio underline" onClick={() => setConfirmando(false)}>
              cancelar
            </button>
          </span>
        ) : (
          <button type="button" className="text-erro underline" onClick={() => setConfirmando(true)} disabled={ocupado !== null}>
            Apagar
          </button>
        )}
      </div>
    </li>
  );
}
