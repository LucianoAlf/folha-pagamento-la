import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FeriasColaboradorCard } from './FeriasColaboradorCard';
import type { FeriasColaboradorStatus, FeriasColaboradorFiltros } from '../../types';
import { Search, Filter, Users } from 'lucide-react';

const PAGE_SIZE = 20;

interface FeriasColaboradorListProps {
  colaboradores: FeriasColaboradorStatus[];
  filtros?: FeriasColaboradorFiltros;
  onFiltrosChange?: (filtros: FeriasColaboradorFiltros) => void;
  onProgramarFerias: (colaborador: FeriasColaboradorStatus) => void;
  onVerHistorico: (colaborador: FeriasColaboradorStatus) => void;
  isLoading?: boolean;
  isMobile?: boolean;
}

export const FeriasColaboradorList: React.FC<FeriasColaboradorListProps> = ({
  colaboradores,
  filtros = {},
  onFiltrosChange,
  onProgramarFerias,
  onVerHistorico,
  isLoading = false,
  isMobile = false,
}) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Reset visible count quando colaboradores mudam
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [colaboradores]);

  // Intersection Observer para lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < colaboradores.length) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, colaboradores.length));
        }
      },
      { threshold: 0.1, rootMargin: '240px' }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [visibleCount, colaboradores.length]);

  // Colaboradores visíveis (com paginação)
  const colaboradoresVisiveis = useMemo(
    () => colaboradores.slice(0, visibleCount),
    [colaboradores, visibleCount]
  );

  // Filtros rápidos
  const handleBuscaChange = (busca: string) => {
    if (onFiltrosChange) {
      onFiltrosChange({ ...filtros, busca });
    }
  };

  const handleDepartamentoChange = (departamento: string) => {
    if (onFiltrosChange) {
      onFiltrosChange({
        ...filtros,
        departamento: departamento === 'todos' ? undefined : departamento,
      });
    }
  };

  const handleStatusChange = (status: string) => {
    if (onFiltrosChange) {
      onFiltrosChange({
        ...filtros,
        status_ferias: status === 'todos' ? undefined : (status as any),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-48 rounded-xl bg-slate-800/30 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Busca */}
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Buscar por nome, função..."
            value={filtros.busca || ''}
            onChange={(e) => handleBuscaChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 text-sm placeholder:text-slate-500 focus:outline-none focus:border-violet-500/50 transition-colors"
          />
        </div>

        {/* Filtro de Departamento */}
        <select
          value={filtros.departamento || 'todos'}
          onChange={(e) => handleDepartamentoChange(e.target.value)}
          className="px-4 py-2.5 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
        >
          <option value="todos">Todos os Departamentos</option>
          <option value="staff_rateado">Staff</option>
          <option value="equipe_operacional">Operacional</option>
          <option value="professores">Professores</option>
        </select>

        {/* Filtro de Status */}
        <select
          value={filtros.status_ferias || 'todos'}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="px-4 py-2.5 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
        >
          <option value="todos">Todos os Status</option>
          <option value="critico">🔴 Crítico</option>
          <option value="alerta">🟡 Alerta</option>
          <option value="atencao">🔵 Atenção</option>
          <option value="ok">🟢 OK</option>
        </select>
      </div>

      {/* Contador */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Users size={16} />
        <span>
          {colaboradores.length === 0
            ? 'Nenhum colaborador encontrado'
            : `${colaboradoresVisiveis.length} de ${colaboradores.length} colaborador${
                colaboradores.length !== 1 ? 'es' : ''
              }`}
        </span>
      </div>

      {/* Lista de Colaboradores */}
      {colaboradores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mb-4">
            <Users size={32} className="text-slate-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-300 mb-1">
            Nenhum colaborador encontrado
          </h3>
          <p className="text-sm text-slate-500">
            Ajuste os filtros ou adicione colaboradores CLT
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {colaboradoresVisiveis.map((colaborador) => (
            <FeriasColaboradorCard
              key={colaborador.colaborador_id}
              colaborador={colaborador}
              onProgramarFerias={onProgramarFerias}
              onVerHistorico={onVerHistorico}
              isMobile={isMobile}
            />
          ))}

          {/* Loader para próxima página */}
          {visibleCount < colaboradores.length && (
            <div
              ref={observerTarget}
              className="h-20 flex items-center justify-center"
            >
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-slate-600 border-t-violet-500 rounded-full animate-spin" />
                Carregando mais...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
