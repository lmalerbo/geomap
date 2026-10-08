import { useState } from "react";
import { Link } from "react-router-dom";
import { useResumoAdmin } from "../components/LayoutAdmin.jsx";

// Visão geral do admin (redesenho, fase 5): o que precisa de atenção
// primeiro. A saúde da automação diária é deduzida no backend
// (lib/saudeAutomacao.js) — antes a automação ficou 3 dias parada
// (27–30/09) sem nenhum aviso no app.

const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const FMT_HOJE = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });

function diaCurto(iso) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function quando(data) {
  if (!data) return "—";
  const d = new Date(data);
  const hoje = FMT_DIA.format(new Date());
  const ontem = FMT_DIA.format(new Date(Date.now() - 86400000));
  const dia = FMT_DIA.format(d);
  const rotulo = dia === hoje ? "Hoje" : dia === ontem ? "Ontem" : dia;
  return `${rotulo} · ${FMT_HORA.format(d)}`;
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

const SITUACAO_CAMADA = {
  erro: { rotulo: "Falhou na conversão", classe: "erro", ordem: 0 },
  atualizando: { rotulo: "Atualizando…", classe: "andamento", ordem: 1 },
  atrasada: { rotulo: "Atrasada", classe: "alerta", ordem: 2 },
  em_dia: { rotulo: "Em dia", classe: "ok", ordem: 3 },
  manual: { rotulo: "Envio manual", classe: "neutro", ordem: 4 },
};

const SITUACAO_DIA = {
  ok: { simbolo: "✓", classe: "ok", texto: "atualização concluída" },
  erro: { simbolo: "✕", classe: "erro", texto: "alguma camada falhou" },
  andamento: { simbolo: "•", classe: "andamento", texto: "em andamento" },
  aguardando: { simbolo: "…", classe: "neutro", texto: "ainda não chegou a hora (08:05)" },
  sem_envio: { simbolo: "–", classe: "alerta", texto: "nada enviado (sem internet no servidor geo ou sem export novo)" },
};

const ACOES = {
  criar_usuario: "criou um usuário",
  editar_usuario: "mudou o papel ou o status de um usuário",
  excluir_usuario: "removeu um usuário",
  redefinir_senha: "redefiniu a senha de um usuário",
  criar_grupo: "criou um grupo",
  renomear_grupo: "renomeou um grupo",
  remover_grupo: "removeu um grupo",
  remover_mapa: "removeu um mapa",
  restaurar_versao: "restaurou uma versão anterior de camada",
  piloto_dronemgmt: "mudou o vínculo de piloto de um usuário",
};

function frasesAtividade(a) {
  const [acao, ...resto] = String(a.detalhe || "").split(": ");
  return {
    texto: `${a.usuarioNome || "Alguém"} ${ACOES[acao] || acao.replace(/_/g, " ")}`,
    detalhe: resto.join(": "),
  };
}

// Agrupa camadas com o mesmo nome e situação (ex.: Talhões atrasada nos 4
// mapas vira 1 linha "Geral, Temático, ICOL, Irrigação").
function agruparCamadas(camadas) {
  const grupos = new Map();
  for (const c of camadas) {
    const chave = `${c.nome}|${c.situacao}|${c.diasAtraso}`;
    if (!grupos.has(chave)) grupos.set(chave, { ...c, mapas: [] });
    grupos.get(chave).mapas.push(c.mapaNome);
  }
  return [...grupos.values()].sort(
    (a, b) => SITUACAO_CAMADA[a.situacao].ordem - SITUACAO_CAMADA[b.situacao].ordem || a.nome.localeCompare(b.nome)
  );
}

function proximaExecucao() {
  const agora = new Date();
  const horaLocal = Number(FMT_HORA.format(agora).replace(":", ""));
  return horaLocal < 805 ? "Hoje · 08:05" : "Amanhã · 08:05";
}

export default function AdminVisaoGeral() {
  const { resumo, erroResumo } = useResumoAdmin();
  const [passosAbertos, setPassosAbertos] = useState(false);

  if (erroResumo && !resumo) return <p className="erro adm-pagina">{erroResumo}</p>;
  if (!resumo) {
    return (
      <p className="status-carregando-admin adm-pagina">
        <span className="spinner" aria-hidden="true" /> Carregando…
      </p>
    );
  }

  const auto = resumo.automacao;
  const linhas = agruparCamadas(auto.camadas);
  const paradas = linhas.filter((l) => l.situacao === "atrasada" || l.situacao === "erro");
  const comErro = paradas.filter((l) => l.situacao === "erro");
  const mapasParados = [...new Set(paradas.flatMap((l) => l.mapas))];
  const nomesParados = [...new Set(paradas.map((l) => l.nome))];
  const ultimaOk = auto.camadas
    .filter((c) => c.automacao && c.ultimaAtualizacao)
    .map((c) => new Date(c.ultimaAtualizacao))
    .sort((a, b) => b - a)[0];
  const tentativas = auto.dias.filter((d) => d.enviados > 0);
  const ultimaTentativa = tentativas.at(-1);

  let titulo;
  if (comErro.length > 0) titulo = "Uma atualização automática falhou na conversão";
  else if (auto.maiorAtraso >= 2) titulo = `A atualização automática não chega há ${auto.maiorAtraso} dias`;
  else titulo = "A atualização automática de hoje ainda não chegou";

  return (
    <div className="adm-pagina adm-visao">
      <header className="adm-cabecalho">
        <div>
          <h1>Visão geral</h1>
          <p>
            <span className="adm-capitaliza">{FMT_HOJE.format(new Date())}</span> · o que precisa da sua atenção aparece
            primeiro
          </p>
        </div>
      </header>

      {!auto.configurada ? (
        <section className="adm-faixa adm-faixa--neutra">
          <strong>Automação diária não encontrada</strong>
          <span>
            Nenhum usuário com o e-mail {auto.email} — a saúde da atualização automática aparece aqui quando essa conta de
            serviço existir.
          </span>
        </section>
      ) : paradas.length > 0 ? (
        <section className="adm-faixa adm-faixa--alerta" aria-label="Alerta da automação">
          <div className="adm-faixa-linha">
            <span className="adm-faixa-icone" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 2.5 19.5h19L12 3Z" />
                <path d="M12 10v4M12 17.2v.3" />
              </svg>
            </span>
            <div className="adm-faixa-texto">
              <strong>{titulo}</strong>
              <span>
                {nomesParados.join(" e ")} {nomesParados.length === 1 ? "está parada" : "estão paradas"}
                {ultimaOk ? ` desde ${FMT_DIA.format(ultimaOk)}` : ""} nos mapas {mapasParados.join(", ")}.
                {comErro.length > 0
                  ? ` Erro: ${comErro[0].ultimoErro}`
                  : " Quase sempre é o portal da rede do servidor geo que expirou (o servidor fica sem internet)."}
              </span>
            </div>
            <button type="button" className="botao-acao-secundario" onClick={() => setPassosAbertos((v) => !v)} aria-expanded={passosAbertos}>
              {passosAbertos ? "Esconder passos" : "Como resolver"}
            </button>
          </div>
          {passosAbertos && (
            <ol className="adm-passos">
              {comErro.length > 0 ? (
                <>
                  <li>Abra Camadas, escolha a camada que falhou e envie o arquivo de novo em “Enviar nova versão”.</li>
                  <li>Se falhar outra vez, a mensagem de erro acima diz o que o shapefile tem de errado — corrija no ArcGIS e exporte de novo.</li>
                </>
              ) : (
                <>
                  <li>No servidor geo, abra o navegador e acesse o link de encerrar conexões da rede. Aguarde uns 10 segundos.</li>
                  <li>Entre de novo com o usuário da empresa.</li>
                  <li>
                    Rode a tarefa “GeoMap - Sincronizar Talhoes Limites” pelo Agendador de Tarefas (ou espere a próxima, às 08:05).
                  </li>
                </>
              )}
              <li>Volte aqui: este aviso some sozinho quando as camadas atualizarem.</li>
            </ol>
          )}
          {auto.processandoAgora.length > 0 && (
            <p className="adm-faixa-andamento">
              <span className="adm-pulso" aria-hidden="true" />
              Atualização em andamento agora: {auto.processandoAgora.map((p) => `${p.nome} (${p.mapaNome})`).join(", ")}
            </p>
          )}
        </section>
      ) : (
        <section className="adm-faixa adm-faixa--ok">
          <strong>Automação em dia</strong>
          <span>
            {auto.processandoAgora.length > 0
              ? `Atualizando agora: ${auto.processandoAgora.map((p) => `${p.nome} (${p.mapaNome})`).join(", ")}`
              : ultimaOk
                ? `Última atualização: ${quando(ultimaOk)}`
                : "Nenhuma atualização registrada nos últimos 30 dias."}
          </span>
        </section>
      )}

      {resumo.ponteDm?.emUso &&
        (resumo.ponteDm.conectada ? (
          <p className="adm-ponte adm-ponte--ok">
            <span className="adm-pulso" aria-hidden="true" /> Ponte do DroneManagement (servidor geo) conectada
          </p>
        ) : (
          <section className="adm-faixa adm-faixa--alerta" aria-label="Ponte do DroneManagement desligada">
            <strong>A ponte do DroneManagement está desligada</strong>
            <span>
              Sem ela ninguém consegue ver pendências novas nem apontar voo
              {resumo.ponteDm.ultimaConsulta ? ` (última conexão: ${quando(resumo.ponteDm.ultimaConsulta)})` : ""}. No servidor
              geo: confira se a janela “GeoMap - Ponte DroneManagement” está aberta e se o portal da rede não expirou (o
              mesmo passo a passo da automação diária).
            </span>
          </section>
        ))}

      <div className="adm-numeros">
        <div className="adm-numero">
          <span>Mapas</span>
          <strong>{resumo.totais.mapas}</strong>
          <small>{plural(resumo.totais.camadas, "camada", "camadas")} no total</small>
        </div>
        <div className="adm-numero">
          <span>Camadas atrasadas</span>
          <strong className={auto.atrasadas > 0 ? "adm-numero--alerta" : ""}>{auto.atrasadas}</strong>
          <small>de {plural(auto.qtdCamadasAutomacao, "camada atualizada", "camadas atualizadas")} pela automação</small>
        </div>
        <div className="adm-numero">
          <span>Processando agora</span>
          <strong>{auto.processandoAgora.length}</strong>
          <small>{auto.processandoAgora[0] ? `${auto.processandoAgora[0].nome} · ${auto.processandoAgora[0].mapaNome}` : "nenhuma conversão"}</small>
        </div>
        <div className="adm-numero">
          <span>Última atualização completa</span>
          <strong>{auto.ultimoDiaCompleto ? diaCurto(auto.ultimoDiaCompleto) : "—"}</strong>
          <small>{plural(resumo.totais.usuarios, "usuário ativo", "usuários ativos")}</small>
        </div>
      </div>

      <div className="adm-duas-colunas">
        <section className="adm-cartao adm-tabela-camadas" aria-label="Atualização das camadas">
          <div className="adm-cartao-titulo">
            <h2>Atualização das camadas</h2>
            <Link to="/admin/camadas">Abrir Camadas →</Link>
          </div>
          <div className="adm-tabela" role="table">
            <div className="adm-tabela-cabecalho" role="row">
              <span role="columnheader">Camada</span>
              <span role="columnheader">Mapas</span>
              <span role="columnheader">Atualizada</span>
              <span role="columnheader">Situação</span>
            </div>
            {linhas.map((l) => {
              const sit = SITUACAO_CAMADA[l.situacao];
              const rotulo = l.situacao === "atrasada" ? `${sit.rotulo} · ${plural(l.diasAtraso, "dia", "dias")}` : sit.rotulo;
              return (
                <div key={`${l.nome}|${l.situacao}|${l.diasAtraso}`} className="adm-tabela-linha" role="row">
                  <span role="cell" className="adm-forte">{l.nome}</span>
                  <span role="cell" className="adm-suave">{l.mapas.join(", ")}</span>
                  <span role="cell" className="adm-suave adm-numerico">
                    {l.ultimaAtualizacao ? FMT_DIA.format(new Date(l.ultimaAtualizacao)) : "—"}
                  </span>
                  <span role="cell">
                    <span className={`adm-chip adm-chip--${sit.classe}`} title={l.ultimoErro || undefined}>
                      {rotulo}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="adm-coluna-lateral">
          <section className="adm-cartao" aria-label="Automação diária">
            <div className="adm-cartao-titulo">
              <h2>Automação diária</h2>
              <small>servidor geo · 08:05</small>
            </div>
            <div className="adm-dias">
              {auto.dias.map((d) => {
                const s = SITUACAO_DIA[d.situacao];
                return (
                  <div key={d.dia} className="adm-dia">
                    <span className={`adm-dia-bloco adm-dia-bloco--${s.classe}`} title={`${diaCurto(d.dia)}: ${s.texto}`} aria-label={`${diaCurto(d.dia)}: ${s.texto}`}>
                      {s.simbolo}
                    </span>
                    <small>{diaCurto(d.dia)}</small>
                  </div>
                );
              })}
            </div>
            <dl className="adm-lista-dados">
              <dt>Último envio</dt>
              <dd>{ultimaTentativa ? `${diaCurto(ultimaTentativa.dia)} · ${plural(ultimaTentativa.enviados, "camada", "camadas")}` : "nenhum nos últimos 7 dias"}</dd>
              <dt>Última com sucesso</dt>
              <dd>{ultimaOk ? quando(ultimaOk) : "—"}</dd>
              <dt>Próxima</dt>
              <dd>{proximaExecucao()}</dd>
            </dl>
          </section>

          <section className="adm-cartao adm-atividade" aria-label="Atividade recente">
            <h2>Atividade recente</h2>
            {resumo.atividade.length === 0 ? (
              <p className="adm-suave">Nenhuma ação administrativa registrada ainda.</p>
            ) : (
              <ul>
                {resumo.atividade.map((a, i) => {
                  const f = frasesAtividade(a);
                  return (
                    <li key={i}>
                      <span className="adm-forte-leve">{f.texto}</span>
                      {f.detalhe && <small className="adm-suave">{f.detalhe}</small>}
                      <small className="adm-suave">{quando(a.quando)}</small>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
