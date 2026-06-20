import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FeriasColaboradorCard } from './FeriasColaboradorCard';
import type { FeriasColaboradorStatus, FeriasColaboradorFiltros } from '../../types';
import { Search, Filter, Users, Briefcase, Activity } from 'lucide-react';
import { CustomSelect } from '../UI';

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
            className="h-48 rounded-xl bg-surface-2/30 border border-base animate-pulse"
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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          />
          <input
            type="text"
            placeholder="Buscar por nome, função..."
            value={filtros.busca || ''}
            onChange={(e) => handleBuscaChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface/40 border border-base rounded-xl text-secondary text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>

        {/* Filtro de Departamento */}
        <CustomSelect
          value={filtros.departamento || 'todos'}
          onValueChange={handleDepartamentoChange}
          icon={Briefcase}
          options={[
            { value: 'todos', label: 'Todos os Departamentos' },
            { value: 'staff_rateado', label: 'Staff' },
            { value: 'equipe_operacional', label: 'Operacional' },
            { value: 'professores', label: 'Professores' },
          ]}
          className="md:w-64"
        />

        {/* Filtro de Status */}
        <CustomSelect
          value={filtros.status_ferias || 'todos'}
          onValueChange={handleStatusChange}
          icon={Activity}
          options={[
            { value: 'todos', label: 'Todos os Status' },
            { value: 'critico', label: '🔴 Crítico' },
            { value: 'alerta', label: '🟡 Alerta' },
            { value: 'atencao', label: '🔵 Atenção' },
            { value: 'ok', label: '🟢 OK' },
          ]}
          className="md:w-56"
        />
      </div>

      {/* Contador */}
      <div className="flex items-center gap-2 text-sm text-secondary">
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
          <div className="w-16 h-16 rounded-2xl bg-surface-2/50 flex items-center justify-center mb-4">
            <Users size={32} className="text-muted" />
          </div>
          <h3 className="text-lg font-bold text-secondary mb-1">
            Nenhum colaborador encontrado
          </h3>
          <p className="text-sm text-muted">
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
              <div className="flex items-center gap-2 text-secondary text-sm">
                <div className="w-4 h-4 border-2 border-surface-3 border-t-accent rounded-full animate-spin" />
                Carregando mais...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
