import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, Save } from 'lucide-react';
import { Modal, Badge } from '../UI';
import { ContaCredencial } from '../../types/contasPagar';
import { fetchCredenciais, setCredencialSenha, upsertCredencial } from '../../services/contasPagarService';
import { cn } from '../CollaboratorComponents';

export const CredenciaisModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
}> = ({ isOpen, onClose, onChanged }) => {
  const [items, setItems] = useState<ContaCredencial[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [senhaTarget, setSenhaTarget] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [senhaSaving, setSenhaSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [portal, setPortal] = useState('');
  const [loginHint, setLoginHint] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      setItems(await fetchCredenciais());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    reload();
    setFormOpen(false);
    setSenhaTarget(null);
    setSenha('');
  }, [isOpen]);

  const handleCreate = async () => {
    if (!nome.trim() || !portal.trim()) return;
    setSaving(true);
    try {
      await upsertCredencial({
        nome: nome.trim(),
        portal: portal.trim().toLowerCase(),
        login_hint: loginHint.trim() || null,
        ativo: true,
      });
      setNome('');
      setPortal('');
      setLoginHint('');
      setFormOpen(false);
      await reload();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const handleSetSenha = async () => {
    if (!senhaTarget || !senha) return;
    setSenhaSaving(true);
    try {
      await setCredencialSenha(senhaTarget, senha);
      setSenha('');
      setSenhaTarget(null);
    } finally {
      setSenhaSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CREDENCIAIS DE PORTAIS"
      className="max-w-2xl"
    >
      <div className="space-y-6">
        <p className="text-xs text-secondary font-bold leading-relaxed">
          Cadastre aqui os logins dos portais (Light, CEDAE, banco…). A senha fica guardada com segurança — depois de salvar, não aparece de novo na tela.
        </p>

        {loading ? (
          <div className="py-8 text-center text-muted text-sm font-bold">Carregando...</div>
        ) : (
          <div className="space-y-3">
            {items.map((c) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-line bg-surface/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-primary">{c.nome}</span>
                    <Badge variant={c.ativo ? 'success' : 'default'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </div>
                  <div className="text-xs text-muted font-bold mt-1">
                    Portal: {c.portal}
                    {c.login_hint ? ` · Login: ${c.login_hint}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSenhaTarget(c.id);
                    setSenha('');
                  }}
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/80 text-on-accent text-xs font-black transition-all"
                >
                  <KeyRound size={14} />
                  Definir senha
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <div className="py-6 text-center text-muted text-sm font-bold">Nenhuma credencial cadastrada.</div>
            )}
          </div>
        )}

        {senhaTarget && (
          <div className="p-4 rounded-2xl border border-accent/30 bg-accent/5 space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-accent">Nova senha</div>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Digite a senha do portal"
              className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSenhaTarget(null)}
                className="px-4 py-2 rounded-xl border border-line text-secondary text-xs font-black"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!senha || senhaSaving}
                onClick={handleSetSenha}
                className="px-4 py-2 rounded-xl bg-accent text-on-accent text-xs font-black disabled:opacity-50"
              >
                {senhaSaving ? 'Salvando...' : 'Salvar senha'}
              </button>
            </div>
          </div>
        )}

        {formOpen ? (
          <div className="p-4 rounded-2xl border border-line bg-surface/20 space-y-3">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome (ex.: Light CG)"
              className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm font-bold text-primary"
            />
            <input
              value={portal}
              onChange={(e) => setPortal(e.target.value)}
              placeholder="Portal (light, cedae, itau...)"
              className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm font-bold text-primary"
            />
            <input
              value={loginHint}
              onChange={(e) => setLoginHint(e.target.value)}
              placeholder="Login ou e-mail usado no portal (não digite a senha aqui)"
              className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm font-bold text-primary"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-xl border border-line text-secondary text-xs font-black">
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || !nome.trim() || !portal.trim()}
                onClick={handleCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-on-accent text-xs font-black disabled:opacity-50"
              >
                <Save size={14} />
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={cn(
              'w-full py-3 rounded-2xl border border-dashed border-line text-secondary hover:text-primary hover:border-accent/40',
              'text-xs font-black uppercase tracking-widest inline-flex items-center justify-center gap-2 transition-colors'
            )}
          >
            <Plus size={14} />
            Nova credencial
          </button>
        )}
      </div>
    </Modal>
  );
};
