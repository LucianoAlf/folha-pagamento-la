import React, { useState, useEffect } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Modal } from '../UI';
import { CategoriaDespesa } from '../../types/contasPagar';

const PRESET_ICONS = [
  '💰', '📋', '🛍️', '🎪', '🏠',
  '👤', '🚌', '🍽️', '📊', '📶',
  '⚡', '🔧', '📄', '🧹', '📢',
  '💵', '↩️', '📦', '📌', '📈',
  // Ícones que já existem nas categorias (garante que o modal sempre tenha os mesmos)
  '🏢', '🏦', '🧑‍🤝‍🧑', '💡', '💧', '💻', '🤝'
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
  const [tipoCusto, setTipoCusto] = useState<'fixo' | 'variavel'>('fixo');
  const [icone, setIcone] = useState('💰');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setNome(initialData.nome);
      setTipoCusto((initialData.tipo_custo as 'fixo' | 'variavel') || 'fixo');
      setIcone(initialData.icone);
    } else {
      setNome('');
      setTipoCusto('fixo');
      setIcone('💵');
    }
  }, [initialData, isOpen]);

  const handleSave = async () => {
    if (!nome.trim()) return;
    setIsSaving(true);
    try {
      await onConfirm({
        ...(initialData?.id ? { id: initialData.id } : {}),
        nome: nome.trim(),
        tipo_fluxo: 'despesa', // Sempre despesa
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'EDITAR CATEGORIA' : 'NOVA CATEGORIA'}
      className="max-w-md"
      position="center"
    >
      <div className="space-y-6">
        {/* Nome */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2 px-1">
            Nome da Categoria
          </label>
          <input
            autoFocus
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Mensalidades"
            className="w-full px-5 py-4 bg-bg border border-base rounded-2xl text-primary font-bold placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-danger/40 focus:border-danger/50 transition-all"
          />
        </div>

        {/* Comportamento */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2 px-1">
            Comportamento
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTipoCusto('fixo')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-black text-xs transition-all ${
                tipoCusto === 'fixo'
                  ? 'bg-danger/10 border-danger/50 text-danger'
                  : 'bg-surface/40 border-base text-muted hover:bg-surface-2'
              }`}
            >
              📌 FIXO
            </button>
            <button
              type="button"
              onClick={() => setTipoCusto('variavel')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-black text-xs transition-all ${
                tipoCusto === 'variavel'
                  ? 'bg-danger/10 border-danger/50 text-danger'
                  : 'bg-surface/40 border-base text-muted hover:bg-surface-2'
              }`}
            >
              📈 VARIÁVEL
            </button>
          </div>
        </div>

        {/* Ícones */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2 px-1">
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
                    ? 'bg-danger/20 border-danger text-danger scale-110 shadow-lg shadow-danger/20'
                    : 'bg-surface/40 border-base hover:bg-surface-2'
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
          className="flex-1 py-4 px-4 rounded-2xl border border-base text-secondary font-black text-xs hover:bg-surface-2 transition-all"
        >
          CANCELAR
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !nome.trim()}
          className="flex-[1.5] py-4 px-4 rounded-2xl bg-danger hover:bg-danger/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs shadow-lg shadow-danger/20 transition-all flex items-center justify-center gap-2"
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
            onDelete(initialData.id);
            onClose();
          }}
          className="w-full mt-4 py-3 text-[10px] font-black text-danger/60 hover:text-danger transition-colors flex items-center justify-center gap-2"
        >
          <Trash2 size={12} />
          EXCLUIR CATEGORIA
        </button>
      )}
    </Modal>
  );
};
