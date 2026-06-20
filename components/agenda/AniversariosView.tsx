import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Plus, Cake, Trash2, CheckSquare, X, Loader2, Search, Bell, BellOff } from 'lucide-react';
import { Badge, ConfirmDialog } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { Aniversario } from '../../types/aniversarios';
import type { LembreteTipo } from '../../types/aniversarios';
import { AniversarioCard } from './AniversarioCard';
import { AniversarioModal } from './AniversarioModal';
import {
  createAniversario,
  updateAniversario,
  deleteAniversario,
  deleteAniversariosBulk,
  syncFromColaboradores,
  previewSyncFromColaboradores,
} from '../../services/aniversariosService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// =============================================
// COMPONENTE PRINCIPAL
// =============================================

export const AniversariosView: React.FC<{
  aniversarios: Aniversario[];
  loading: boolean;
  onRefresh: () => void;
  isMobile?: boolean;
}> = ({ aniversarios, loading, onRefresh, isMobile }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Aniversario | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Aniversario | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncPreview, setSyncPreview] = useState<{ toCreate: number; toUpdate: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Modo de seleção
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroLembrete, setFiltroLembrete] = useState<'todos' | 'ativo' | 'inativo'>('todos');

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Lista filtrada
  const filtrados = useMemo(() => {
    let lista = aniversarios;
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      lista = lista.filter((a) => a.nome.toLowerCase().includes(q));
    }
    if (filtroLembrete === 'ativo') lista = lista.filter((a) => a.lembrete_ativo);
    else if (filtroLembrete === 'inativo') lista = lista.filter((a) => !a.lembrete_ativo);
    return lista;
  }, [aniversarios, busca, filtroLembrete]);

  const selectAll = () => {
    setSelectedIds(new Set(filtrados.map((a) => a.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const allSelected = filtrados.length > 0 && selectedIds.size === filtrados.length;

  // Agrupa por proximidade
  const groups = useMemo(() => {
    const hoje: Aniversario[] = [];
    const estaSemana: Aniversario[] = [];
    const esteMes: Aniversario[] = [];
    const proximos: Aniversario[] = [];

    const mesAtual = new Date().getMonth();

    for (const a of filtrados) {
      const dias = a._diasAteProximo ?? 999;
      if (dias === 0) hoje.push(a);
      else if (dias <= 7) estaSemana.push(a);
      else if (new Date(a._proximoAniversario || '').getMonth() === mesAtual) esteMes.push(a);
      else proximos.push(a);
    }

    return [
      { key: 'hoje', label: 'Hoje', items: hoje, variant: 'danger' as const, accent: 'text-danger' },
      { key: 'semana', label: 'Esta Semana', items: estaSemana, variant: 'warning' as const, accent: 'text-warning' },
      { key: 'mes', label: 'Este Mês', items: esteMes, variant: 'info' as const, accent: 'text-info' },
      { key: 'proximos', label: 'Próximos', items: proximos, variant: 'default' as const, accent: 'text-muted' },
    ].filter((g) => g.items.length > 0);
  }, [filtrados]);

  const mesLabel = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });
  const totalMes = useMemo(() => {
    const m = new Date().getMonth();
    return aniversarios.filter((a) => new Date(a._proximoAniversario || '').getMonth() === m).length;
  }, [aniversarios]);

  const handleSyncPreview = async () => {
    setLoadingPreview(true);
    setSyncResult(null);
    setActionError(null);
    try {
      const preview = await previewSyncFromColaboradores();
      if (preview.toCreate === 0 && preview.toUpdate === 0) {
        setSyncResult({ created: 0, updated: 0 });
      } else {
        setSyncPreview(preview);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao verificar colaboradores.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSyncConfirm = async () => {
    setSyncPreview(null);
    setSyncing(true);
    try {
      const result = await syncFromColaboradores();
      setSyncResult(result);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao importar colaboradores.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async (data: {
    nome: string;
    data_nascimento: string;
    lembrete_tipo: LembreteTipo;
    lembrete_ativo: boolean;
    notas: string;
  }) => {
    if (editando) {
      await updateAniversario(editando.id, data);
    } else {
      await createAniversario({ ...data, tipo: 'manual' });
    }
    onRefresh();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteAniversario(confirmDelete.id);
      setConfirmDelete(null);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao excluir.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      // Se todos estão selecionados, usa bulk delete otimizado
      if (selectedIds.size === aniversarios.length) {
        await deleteAniversariosBulk('todos');
      } else {
        // Delete individual para cada selecionado
        const promises = Array.from(selectedIds).map((id: string) => deleteAniversario(id));
        await Promise.all(promises);
      }
      exitSelectMode();
      setConfirmBulkDelete(false);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao excluir selecionados.');
    }
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Cake className="w-5 h-5 text-danger" />
            <h2 className="text-lg font-black text-primary uppercase tracking-wider">Aniversários</h2>
          </div>
          <p className="text-xs text-muted font-bold mt-1 capitalize">
            {mesLabel} — {totalMes} aniversário{totalMes !== 1 ? 's' : ''} este mês
          </p>
        </div>
        {!selectMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncPreview}
              disabled={syncing || loadingPreview}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all border',
                syncing || loadingPreview
                  ? 'bg-surface-2 text-muted border-base cursor-not-allowed'
                  : 'bg-surface/60 text-secondary border-base hover:text-primary hover:bg-surface-2 hover:border-strong'
              )}
            >
              <Download className={cn('w-4 h-4', (syncing || loadingPreview) && 'animate-pulse')} />
              {loadingPreview ? 'Verificando…' : syncing ? 'Importando…' : 'Importar do Cadastro'}
            </button>
            <button
              type="button"
              onClick={() => { setEditando(null); setModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black bg-danger hover:bg-danger-hover text-white transition-all shadow-lg shadow-danger/20"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
            {aniversarios.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black border border-base bg-surface/60 text-secondary hover:text-primary hover:bg-surface-2 transition-all"
              >
                <CheckSquare className="w-4 h-4" />
                Selecionar
              </button>
            )}
          </div>
        ) : (
          /* Barra de seleção */
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-muted">
              {selectedIds.size} de {filtrados.length} selecionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={allSelected ? deselectAll : selectAll}
              className="px-4 py-2.5 rounded-2xl text-xs font-black border border-base bg-surface/60 text-secondary hover:text-primary hover:bg-surface-2 transition-all"
            >
              {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={selectedIds.size === 0}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all',
                selectedIds.size === 0
                  ? 'bg-surface-2 text-muted cursor-not-allowed'
                  : 'bg-danger hover:bg-danger-hover text-white shadow-lg shadow-danger/20'
              )}
            >
              <Trash2 className="w-4 h-4" />
              Excluir ({selectedIds.size})
            </button>
            <button
              type="button"
              onClick={exitSelectMode}
              className="flex items-center justify-center w-10 h-10 rounded-2xl border border-base bg-surface/60 text-muted hover:text-primary hover:bg-surface-2 transition-all"
              aria-label="Cancelar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className="mb-4 rounded-2xl bg-success/10 border border-success/20 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-success-subtle font-bold">
            {syncResult.created === 0 && syncResult.updated === 0
              ? 'Todos os colaboradores já estão importados.'
              : `Importação concluída: ${syncResult.created} criado${syncResult.created !== 1 ? 's' : ''}, ${syncResult.updated} atualizado${syncResult.updated !== 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            onClick={() => setSyncResult(null)}
            className="px-3 py-1.5 rounded-xl bg-surface/40 border border-base text-secondary text-xs font-black"
          >
            OK
          </button>
        </div>
      )}

      {/* Error */}
      {actionError && (
        <div className="mb-4 rounded-2xl bg-danger/10 border border-danger/20 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-danger-subtle font-bold">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="px-3 py-1.5 rounded-xl bg-surface/40 border border-base text-secondary text-xs font-black"
          >
            OK
          </button>
        </div>
      )}

      {/* Filtros */}
      {aniversarios.length > 0 && !selectMode && (
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome…"
              className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-surface/60 border border-strong text-sm text-primary font-bold placeholder:text-muted focus:outline-none focus:border-danger/50 transition-colors"
            />
          </div>
          <div className="flex gap-1">
            {([
              { key: 'todos', label: 'Todos', icon: null },
              { key: 'ativo', label: 'Ativo', icon: Bell },
              { key: 'inativo', label: 'Inativo', icon: BellOff },
            ] as const).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltroLembrete(f.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-black border transition-all',
                  filtroLembrete === f.key
                    ? 'bg-danger/15 border-danger/30 text-danger-subtle'
                    : 'bg-surface/60 border-base text-muted hover:text-primary hover:bg-surface-2'
                )}
              >
                {f.icon && <f.icon className="w-3.5 h-3.5" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Syncing overlay */}
      {syncing && (
        <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-danger animate-spin" />
          <div className="text-primary font-black text-sm">Importando aniversários do cadastro…</div>
          <p className="text-xs text-muted font-bold">Isso pode levar alguns segundos</p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-muted font-bold py-8">Carregando…</div>
      ) : aniversarios.length === 0 ? (
        <div className="rounded-2xl border border-base/60 bg-bg/95 p-8 text-center">
          <div className="text-4xl mb-3">🎂</div>
          <div className="text-primary font-black text-lg">Nenhum aniversário cadastrado</div>
          <p className="text-sm text-muted font-bold mt-2">
            Clique em "Importar do Cadastro" para puxar dos colaboradores ou adicione manualmente.
          </p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-base/60 bg-bg/95 p-8 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-primary font-black text-lg">Nenhum resultado</div>
          <p className="text-sm text-muted font-bold mt-2">
            Nenhum aniversário encontrado com os filtros atuais.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="rounded-2xl border border-base/60 bg-bg/95 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className="w-full flex items-center justify-between px-4 md:px-5 py-3 md:py-4 hover:bg-surface/30 transition-colors"
              >
                <div className="flex items-center gap-2 md:gap-3">
                  {collapsed[g.key] ? (
                    <ChevronRight className="w-4 h-4 text-muted" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted" />
                  )}
                  <div className={cn('text-sm font-black uppercase tracking-tight md:normal-case', g.accent)}>
                    {g.label}
                  </div>
                  <Badge variant={g.variant}>{g.items.length}</Badge>
                </div>
              </button>
              {!collapsed[g.key] && (
                <div className="p-1 md:p-2">
                  {g.items
                    .sort((a, b) => (a._diasAteProximo ?? 999) - (b._diasAteProximo ?? 999))
                    .map((a) => (
                      <AniversarioCard
                        key={a.id}
                        aniversario={a}
                        onEdit={() => { setEditando(a); setModalOpen(true); }}
                        onDelete={() => setConfirmDelete(a)}
                        selectable={selectMode}
                        selected={selectedIds.has(a.id)}
                        onToggleSelect={() => toggleSelect(a.id)}
                      />
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      <AniversarioModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(null); }}
        onSave={handleSave}
        initial={editando}
        isMobile={isMobile}
      />

      {/* Confirmar exclusão individual */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Excluir aniversário"
        message={`Tem certeza que deseja excluir o aniversário de "${confirmDelete?.nome}"?`}
        confirmLabel="Excluir"
      />

      {/* Confirmar exclusão dos selecionados */}
      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={handleBulkDelete}
        title="Excluir selecionados"
        message={`Tem certeza que deseja excluir ${selectedIds.size} aniversário${selectedIds.size !== 1 ? 's' : ''} selecionado${selectedIds.size !== 1 ? 's' : ''}?`}
        confirmLabel="Excluir"
        variant="danger"
      />

      {/* Confirmar importação */}
      <ConfirmDialog
        isOpen={!!syncPreview}
        onClose={() => setSyncPreview(null)}
        onConfirm={handleSyncConfirm}
        title="Importar do Cadastro"
        message={
          syncPreview
            ? [
                syncPreview.toCreate > 0 && `${syncPreview.toCreate} aniversário${syncPreview.toCreate !== 1 ? 's' : ''} ${syncPreview.toCreate !== 1 ? 'serão criados' : 'será criado'}`,
                syncPreview.toUpdate > 0 && `${syncPreview.toUpdate} nome${syncPreview.toUpdate !== 1 ? 's' : ''} ${syncPreview.toUpdate !== 1 ? 'serão atualizados' : 'será atualizado'}`,
              ].filter(Boolean).join(' e ') + '. Deseja continuar?'
            : ''
        }
        confirmLabel="Importar"
      />
    </div>
  );
};
