import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Plus, Cake, Trash2, CheckSquare, X } from 'lucide-react';
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

  const selectAll = () => {
    setSelectedIds(new Set(aniversarios.map((a) => a.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const allSelected = aniversarios.length > 0 && selectedIds.size === aniversarios.length;

  // Agrupa por proximidade
  const groups = useMemo(() => {
    const hoje: Aniversario[] = [];
    const estaSemana: Aniversario[] = [];
    const esteMes: Aniversario[] = [];
    const proximos: Aniversario[] = [];

    const mesAtual = new Date().getMonth();

    for (const a of aniversarios) {
      const dias = a._diasAteProximo ?? 999;
      if (dias === 0) hoje.push(a);
      else if (dias <= 7) estaSemana.push(a);
      else if (new Date(a._proximoAniversario || '').getMonth() === mesAtual) esteMes.push(a);
      else proximos.push(a);
    }

    return [
      { key: 'hoje', label: 'Hoje', items: hoje, variant: 'danger' as const, accent: 'text-pink-400' },
      { key: 'semana', label: 'Esta Semana', items: estaSemana, variant: 'warning' as const, accent: 'text-amber-400' },
      { key: 'mes', label: 'Este Mês', items: esteMes, variant: 'info' as const, accent: 'text-cyan-400' },
      { key: 'proximos', label: 'Próximos', items: proximos, variant: 'default' as const, accent: 'text-slate-400' },
    ].filter((g) => g.items.length > 0);
  }, [aniversarios]);

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
            <Cake className="w-5 h-5 text-pink-400" />
            <h2 className="text-lg font-black text-white uppercase tracking-wider">Aniversários</h2>
          </div>
          <p className="text-xs text-slate-500 font-bold mt-1 capitalize">
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
                  ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                  : 'bg-slate-900/60 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800 hover:border-slate-600'
              )}
            >
              <Download className={cn('w-4 h-4', (syncing || loadingPreview) && 'animate-pulse')} />
              {loadingPreview ? 'Verificando…' : syncing ? 'Importando…' : 'Importar do Cadastro'}
            </button>
            <button
              type="button"
              onClick={() => { setEditando(null); setModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black bg-pink-600 hover:bg-pink-500 text-white transition-all shadow-lg shadow-pink-600/20"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
            {aniversarios.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
              >
                <CheckSquare className="w-4 h-4" />
                Selecionar
              </button>
            )}
          </div>
        ) : (
          /* Barra de seleção */
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-400">
              {selectedIds.size} de {aniversarios.length} selecionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={allSelected ? deselectAll : selectAll}
              className="px-4 py-2.5 rounded-2xl text-xs font-black border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
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
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20'
              )}
            >
              <Trash2 className="w-4 h-4" />
              Excluir ({selectedIds.size})
            </button>
            <button
              type="button"
              onClick={exitSelectMode}
              className="flex items-center justify-center w-10 h-10 rounded-2xl border border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              aria-label="Cancelar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className="mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-emerald-200 font-bold">
            {syncResult.created === 0 && syncResult.updated === 0
              ? 'Todos os colaboradores já estão importados.'
              : `Importação concluída: ${syncResult.created} criado${syncResult.created !== 1 ? 's' : ''}, ${syncResult.updated} atualizado${syncResult.updated !== 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            onClick={() => setSyncResult(null)}
            className="px-3 py-1.5 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-200 text-xs font-black"
          >
            OK
          </button>
        </div>
      )}

      {/* Error */}
      {actionError && (
        <div className="mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-rose-200 font-bold">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="px-3 py-1.5 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-200 text-xs font-black"
          >
            OK
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-slate-400 font-bold py-8">Carregando…</div>
      ) : aniversarios.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/95 p-8 text-center">
          <div className="text-4xl mb-3">🎂</div>
          <div className="text-white font-black text-lg">Nenhum aniversário cadastrado</div>
          <p className="text-sm text-slate-500 font-bold mt-2">
            Clique em "Importar do Cadastro" para puxar dos colaboradores ou adicione manualmente.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="rounded-2xl border border-slate-800/60 bg-slate-950/95 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className="w-full flex items-center justify-between px-4 md:px-5 py-3 md:py-4 hover:bg-slate-900/30 transition-colors"
              >
                <div className="flex items-center gap-2 md:gap-3">
                  {collapsed[g.key] ? (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
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
