import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Save, Trash2 } from 'lucide-react';
import { CategoriaDespesa } from '../../types/contasPagar';

const PRESET_ICONS = [
  '💰', '📋', '🛍️', '🎪', '🏠',
  '👤', '🚌', '🍽️', '📊', '📶',
  '⚡', '🔧', '📄', '🧹', '📢',
  '💵', '↩️', '📦', '📌', '📈'
];

interface CategoriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: Partial<CategoriaDespesa>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  initialData?: CategoriaDespesa | null;
}

export const CategoriaModal: React.FC<CategoriaModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onDelete,
  initialData
}) => {
  const [nome, setNome] = useState('');
  const [tipoFluxo, setTipoFluxo] = useState<'receita' | 'despesa'>('despesa');
  const [tipoCusto, setTipoCusto] = useState<'fixo' | 'variavel'>('fixo');
  const [icone, setIcone] = useState('💰');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setNome(initialData.nome);
      setTipoFluxo(initialData.tipo_fluxo || 'despesa');
      setTipoCusto((initialData.tipo_custo as 'fixo' | 'variavel') || 'fixo');
      setIcone(initialData.icone);
    } else {
      setNome('');
      setTipoFluxo('despesa');
      setTipoCusto('fixo');
      setIcone('💰');
    }
  }, [initialData, isOpen]);

  const handleSave = async () => {
    if (!nome.trim()) return;
    setIsSaving(true);
    try {
      await onConfirm({
        ...(initialData?.id ? { id: initialData.id } : {}),
        nome: nome.trim(),
        tipo_fluxo: tipoFluxo,
        tipo_custo: tipoCusto,
        icone,
        ativo: true,
        ordem: initialData?.ordem || 0
      });
      onClose();
    } catch (err) {
      console.error('Erro ao salvar categoria:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#12151e] border border-slate-800 rounded-3xl p-8 z-[10000] shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="flex items-center justify-between mb-8">
            <Dialog.Title className="text-xl font-black text-white uppercase tracking-wider">
              {initialData ? 'Editar Categoria' : 'Nova Categoria'}
            </Dialog.Title>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-6">
            {/* Nome */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 px-1">
                Nome da Categoria
              </label>
              <input
                autoFocus
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Mensalidades"
                className="w-full px-5 py-4 bg-[#0a0d14] border border-slate-800 rounded-2xl text-white font-bold placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
              />
            </div>

            {/* Tipo de Fluxo */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 px-1">
                Tipo de Fluxo
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipoFluxo('receita')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-black text-xs transition-all ${
                    tipoFluxo === 'receita'
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:bg-slate-800'
                  }`}
                >
                  💰 RECEITA
                </button>
                <button
                  type="button"
                  onClick={() => setTipoFluxo('despesa')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-black text-xs transition-all ${
                    tipoFluxo === 'despesa'
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:bg-slate-800'
                  }`}
                >
                  📉 DESPESA
                </button>
              </div>
            </div>

            {/* Comportamento */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 px-1">
                Comportamento
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipoCusto('fixo')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-black text-xs transition-all ${
                    tipoCusto === 'fixo'
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:bg-slate-800'
                  }`}
                >
                  📌 FIXO
                </button>
                <button
                  type="button"
                  onClick={() => setTipoCusto('variavel')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-black text-xs transition-all ${
                    tipoCusto === 'variavel'
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500 hover:bg-slate-800'
                  }`}
                >
                  📈 VARIÁVEL
                </button>
              </div>
            </div>

            {/* Ícones */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 px-1">
                Ícone
              </label>
              <div className="grid grid-cols-5 gap-2">
                {PRESET_ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIcone(i)}
                    className={`w-full aspect-square flex items-center justify-center rounded-xl text-xl transition-all border ${
                      icone === i
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 scale-110 shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/60'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-10 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-4 px-4 rounded-2xl border border-slate-800 text-slate-400 font-black text-xs hover:bg-slate-800 transition-all"
            >
              CANCELAR
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !nome.trim()}
              className="flex-[1.5] py-4 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save size={14} />
              )}
              SALVAR CATEGORIA
            </button>
          </div>

          {initialData && onDelete && (
            <button
              onClick={() => {
                if (window.confirm('Excluir esta categoria?')) {
                  onDelete(initialData.id);
                  onClose();
                }
              }}
              className="w-full mt-4 py-3 text-[10px] font-black text-rose-500/60 hover:text-rose-500 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={12} />
              EXCLUIR CATEGORIA
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
