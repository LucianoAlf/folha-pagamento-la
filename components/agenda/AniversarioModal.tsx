import React, { useEffect, useState } from 'react';
import { Modal, DatePicker, CustomSelect, ToggleSwitch } from '../UI';
import { cn } from '../CollaboratorComponents';
import type { Aniversario, LembreteTipo } from '../../types/aniversarios';
import { LEMBRETE_TIPOS } from '../../types/aniversarios';
import { Bell } from 'lucide-react';

const lembreteOptions = (Object.entries(LEMBRETE_TIPOS) as [LembreteTipo, typeof LEMBRETE_TIPOS[LembreteTipo]][]).map(
  ([key, val]) => ({ value: key, label: `${val.icone} ${val.label} — ${val.descricao}` })
);

export const AniversarioModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    nome: string;
    data_nascimento: string;
    lembrete_tipo: LembreteTipo;
    lembrete_ativo: boolean;
    notas: string;
  }) => Promise<void>;
  initial?: Aniversario | null;
  isMobile?: boolean;
}> = ({ isOpen, onClose, onSave, initial, isMobile }) => {
  const isEdit = !!initial;

  const [nome, setNome] = useState('');
  const [dataNascimento, setDataNascimento] = useState<string | undefined>();
  const [lembreteTipo, setLembreteTipo] = useState<LembreteTipo>('anual');
  const [lembreteAtivo, setLembreteAtivo] = useState(true);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNome(initial?.nome || '');
      setDataNascimento(initial?.data_nascimento || undefined);
      setLembreteTipo(initial?.lembrete_tipo || 'anual');
      setLembreteAtivo(initial?.lembrete_ativo ?? true);
      setNotas(initial?.notas || '');
      setError(null);
      setSaving(false);
    }
  }, [isOpen, initial]);

  const handleSubmit = async () => {
    if (!nome.trim()) { setError('Nome é obrigatório.'); return; }
    if (!dataNascimento) { setError('Data de nascimento é obrigatória.'); return; }
    setError(null);
    setSaving(true);
    try {
      await onSave({ nome: nome.trim(), data_nascimento: dataNascimento, lembrete_tipo: lembreteTipo, lembrete_ativo: lembreteAtivo, notas: notas.trim() });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const isColaborador = initial?.tipo === 'colaborador';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar Aniversário' : 'Novo Aniversário'}
      subtitle={isEdit ? 'Altere os dados do aniversário' : 'Cadastre um novo aniversário para acompanhar'}
      position={isMobile ? 'bottom' : 'center'}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl text-sm font-black text-secondary hover:text-primary hover:bg-surface-2 transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !nome.trim() || !dataNascimento}
            className={cn(
              'px-6 py-2.5 rounded-2xl text-sm font-black transition-all',
              saving || !nome.trim() || !dataNascimento
                ? 'bg-surface-2 text-muted cursor-not-allowed'
                : 'bg-danger hover:bg-danger-hover text-white shadow-lg shadow-danger/20'
            )}
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-2xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger-subtle font-bold">
            {error}
          </div>
        )}

        {/* Nome */}
        <div>
          <label className="block text-xs font-black text-muted uppercase tracking-widest mb-2">Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={isColaborador}
            placeholder="Ex: João Silva"
            className={cn(
              'w-full px-4 py-3 rounded-xl bg-surface/50 border border-strong text-primary text-sm font-bold placeholder:text-muted',
              'focus:ring-2 focus:ring-danger/40 focus:border-danger/40 outline-none transition-all',
              isColaborador && 'opacity-60 cursor-not-allowed'
            )}
          />
          {isColaborador && (
            <p className="mt-1 text-[10px] text-muted font-bold">Importado do cadastro de colaboradores</p>
          )}
        </div>

        {/* Data de Nascimento */}
        <div>
          <label className="block text-xs font-black text-muted uppercase tracking-widest mb-2">Data de Nascimento</label>
          <DatePicker
            value={dataNascimento}
            onChange={(v) => setDataNascimento(v)}
            placeholder="DD/MM/AAAA"
            disabled={isColaborador}
            fromYear={1940}
            toYear={new Date().getFullYear()}
          />
        </div>

        {/* Tipo de Lembrete */}
        <div>
          <label className="block text-xs font-black text-muted uppercase tracking-widest mb-2">Tipo de Lembrete</label>
          <CustomSelect
            value={lembreteTipo}
            onValueChange={(v) => setLembreteTipo(v as LembreteTipo)}
            options={lembreteOptions}
            icon={Bell}
          />
        </div>

        {/* Lembrete Ativo */}
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-black text-primary">Lembrete ativo</div>
            <div className="text-xs text-muted font-bold mt-0.5">Receber notificações sobre este aniversário</div>
          </div>
          <ToggleSwitch
            checked={lembreteAtivo}
            onCheckedChange={setLembreteAtivo}
            variant="violet"
          />
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs font-black text-muted uppercase tracking-widest mb-2">Notas (opcional)</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ex: Gosta de chocolate, presente já comprado..."
            rows={3}
            className={cn(
              'w-full px-4 py-3 rounded-xl bg-surface/50 border border-strong text-primary text-sm font-bold placeholder:text-muted',
              'focus:ring-2 focus:ring-danger/40 focus:border-danger/40 outline-none transition-all resize-none'
            )}
          />
        </div>
      </div>
    </Modal>
  );
};
