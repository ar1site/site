// Erros das propostas que as rotas traduzem em resposta. Sem dependências,
// para as rotas leves não carregarem o gerador de PDF.

/** O PDF não pôde ser gerado (por exemplo, passou de 3 páginas). */
export class ErroPdf extends Error {
  constructor(
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "ErroPdf";
  }
}
