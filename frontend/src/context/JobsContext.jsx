import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { consultarJobAdmin } from "../lib/api.js";
import { useAuth } from "./AuthContext.jsx";

const JobsContext = createContext(null);

// localStorage (não sessionStorage/state) de propósito: sobrevive a reload
// e a navegar pra outra tela — sem isso, um job criado em /admin/camadas
// "some" da UI assim que o usuário sai da tela ou recarrega a página, mesmo
// continuando rodando normalmente no backend (fire-and-forget). Simplificação
// aceita: a chave é por navegador, não por usuário — em uso normal (cada
// admin no próprio navegador) isso não importa.
const CHAVE_LOCALSTORAGE = "geomap_jobs_pendentes";
const MAX_RESULTADOS_RECENTES = 20;

function lerJobsSalvos() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    const jobs = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

// Provider montado uma vez em App.jsx, fora das <Routes> — ao contrário do
// polling que antes vivia dentro de AdminCamadas.jsx (morria ao trocar de
// tela), este componente nunca desmonta durante a navegação, só no logout.
export function JobsProvider({ children }) {
  const { sessao } = useAuth();
  const [jobsPendentes, setJobsPendentes] = useState(() => lerJobsSalvos());
  // Últimos jobs concluídos/com erro (não só os "processando") — permite
  // que uma tela específica (ex: AdminCamadas) reaja ao resultado de um job
  // que ELA disparou, sem duplicar o polling; o toast abaixo é o aviso
  // genérico que aparece não importa qual tela está aberta.
  const [resultadosRecentes, setResultadosRecentes] = useState([]);
  const [toasts, setToasts] = useState([]);
  const acompanhandoRef = useRef(new Set());

  const persistirJobs = useCallback((jobs) => {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(jobs));
  }, []);

  const removerJobPendente = useCallback(
    (jobId) => {
      setJobsPendentes((atual) => {
        const restante = atual.filter((j) => j.jobId !== jobId);
        persistirJobs(restante);
        return restante;
      });
    },
    [persistirJobs]
  );

  const removerToast = useCallback((id) => {
    setToasts((atual) => atual.filter((t) => t.id !== id));
  }, []);

  const adicionarToast = useCallback(
    (toast) => {
      const id = crypto.randomUUID();
      setToasts((atual) => [...atual, { id, ...toast }]);
      setTimeout(() => removerToast(id), 8000);
    },
    [removerToast]
  );

  const acompanharJob = useCallback(
    (jobId, rotulo) => {
      if (acompanhandoRef.current.has(jobId)) return;
      acompanhandoRef.current.add(jobId);

      async function consultar() {
        const token = sessao?.token;
        if (!token) {
          acompanhandoRef.current.delete(jobId);
          return;
        }
        let job;
        try {
          job = await consultarJobAdmin(token, jobId);
        } catch {
          setTimeout(consultar, 4000);
          return;
        }
        if (job.status === "processando") {
          setTimeout(consultar, 4000);
          return;
        }
        acompanhandoRef.current.delete(jobId);
        removerJobPendente(jobId);
        setResultadosRecentes((atual) =>
          [...atual, { jobId, rotulo, status: job.status, camadaId: job.camadaId, erro: job.erro, finalizadoEm: Date.now() }].slice(
            -MAX_RESULTADOS_RECENTES
          )
        );
        adicionarToast(
          job.status === "concluido"
            ? { tipo: "sucesso", mensagem: `Camada "${rotulo}" processada com sucesso.` }
            : { tipo: "erro", mensagem: `Falha ao processar "${rotulo}": ${job.erro}` }
        );
      }

      setTimeout(consultar, 2000);
    },
    [sessao, removerJobPendente, adicionarToast]
  );

  const adicionarJob = useCallback(
    (jobId, rotulo) => {
      setJobsPendentes((atual) => {
        const novo = [...atual, { jobId, rotulo }];
        persistirJobs(novo);
        return novo;
      });
      acompanharJob(jobId, rotulo);
    },
    [persistirJobs, acompanharJob]
  );

  // Retoma o polling dos jobs que já estavam pendentes antes deste mount
  // (reload de página, ou login numa aba nova) — só na primeira vez que o
  // token fica disponível, não a cada mudança de jobsPendentes (senão um
  // job recém-adicionado por adicionarJob seria "resumido" de novo aqui,
  // inofensivo pelo guard de acompanhandoRef mas redundante).
  useEffect(() => {
    if (!sessao?.token) return;
    for (const job of lerJobsSalvos()) {
      acompanharJob(job.jobId, job.rotulo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token]);

  return (
    <JobsContext.Provider value={{ jobsPendentes, resultadosRecentes, adicionarJob }}>
      {children}
      {toasts.length > 0 && (
        <div className="pilha-toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.tipo}`}>
              <span>{t.mensagem}</span>
              <button type="button" className="fechar" onClick={() => removerToast(t.id)} aria-label="Fechar aviso">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs precisa estar dentro de JobsProvider");
  return ctx;
}
