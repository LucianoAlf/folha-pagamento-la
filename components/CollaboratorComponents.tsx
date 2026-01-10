import React, { useEffect, useState, useMemo } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { 
  User, Briefcase, DollarSign, Building2, CreditCard, Music, 
  X, ChevronRight, Check, Search, Trash2, Edit2, ShieldAlert,
  Mail, Phone, Calendar, MapPin, Hash, Building, RefreshCw, UserX
} from 'lucide-react';
import { Card, Badge, Modal, CustomSelect, Tooltip, DatePicker } from './UI';
import { Colaborador, CollaboratorDepartment, CollaboratorContractType, CollaboratorStatus } from '../types';
import { formatCurrency } from '../services/api';

// --- Constants & Config ---

export const DEPARTMENT_LABELS: Record<CollaboratorDepartment, string> = {
  staff_rateado: 'Staff Corporativo',
  equipe_operacional: 'Equipe Operacional',
  professores: 'Professor'
};

export const DEPARTMENT_COLORS: Record<CollaboratorDepartment, string> = {
  staff_rateado: '#8b5cf6', // Violet
  equipe_operacional: '#f59e0b', // Amber
  professores: '#10b981' // Emerald
};

export const STATUS_LABELS: Record<CollaboratorStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  on_leave: 'Afastado'
};

export const STATUS_COLORS: Record<CollaboratorStatus, 'success' | 'danger' | 'warning'> = {
  active: 'success',
  inactive: 'danger',
  on_leave: 'warning'
};

export const CONTRACT_LABELS: Record<CollaboratorContractType, string> = {
  pj: 'PJ (Pessoa Jurídica)',
  clt: 'CLT (Mensalista)',
  mei: 'MEI',
  estagiario: 'Estagiário',
  diarista: 'Diarista',
  rpa: 'RPA'
};

// --- Helpers ---

export const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

// --- Components ---

interface CollaboratorCardProps {
  collaborator: Colaborador;
  onEdit: (c: Colaborador) => void;
  onDelete: (c: Colaborador) => void;
  onToggleInactive: (c: Colaborador) => void;
}

export const CollaboratorCard: React.FC<CollaboratorCardProps> = ({ collaborator, onEdit, onDelete, onToggleInactive }) => {
  const deptColor = DEPARTMENT_COLORS[collaborator.departamento];
  const statusColor = STATUS_COLORS[collaborator.status];

  return (
    <Card className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 shadow-sm hover:shadow-xl transition-all group overflow-hidden">
      <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 relative">
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg overflow-hidden"
            style={{ backgroundColor: deptColor }}
          >
            {collaborator.id === 2 || collaborator.nome?.includes('Ana Paula') ? (
              <img src="/Avatar_Ana.png" alt="Ana Paula" className="w-full h-full object-cover" />
            ) : collaborator.foto_url ? (
              <img src={collaborator.foto_url} alt={collaborator.nome} className="w-full h-full object-cover" />
            ) : (
              <User size={24} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white truncate">
              {collaborator.nome}
              {collaborator.unidade_fixa && (
                <span className="ml-1 text-slate-400 font-medium">({collaborator.unidade_fixa.toUpperCase()})</span>
              )}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span 
                className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
                style={{ backgroundColor: `${deptColor}20`, color: deptColor }}
              >
                {DEPARTMENT_LABELS[collaborator.departamento]}
              </span>
              {collaborator.funcao && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase truncate">
                  • {collaborator.funcao}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1 transition-all">
          <Tooltip content="Editar">
            <button 
              onClick={() => onEdit(collaborator)}
              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-400 hover:text-violet-500 dark:hover:text-violet-400 shadow-sm transition-all"
            >
              <Edit2 size={14} />
            </button>
          </Tooltip>

          <Tooltip content={collaborator.status === 'active' ? 'Inativar' : 'Reativar'}>
            <button
              onClick={() => onToggleInactive(collaborator)}
              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 shadow-sm transition-all"
            >
              <UserX size={14} />
            </button>
          </Tooltip>

          <Tooltip content="Excluir">
            <button 
              onClick={() => onDelete(collaborator)}
              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 shadow-sm transition-all"
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusColor}>{STATUS_LABELS[collaborator.status]}</Badge>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-700/50 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700/50">
            {CONTRACT_LABELS[collaborator.tipo]}
          </span>
        </div>

        <div className="space-y-2">
          {collaborator.telefone && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Phone size={12} className="text-slate-400 dark:text-slate-500" />
              {collaborator.telefone}
            </div>
          )}
          {collaborator.email && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
              <Mail size={12} className="text-slate-400 dark:text-slate-500" />
              {collaborator.email}
            </div>
          )}
          
          <div className="flex flex-wrap gap-1.5 mt-2">
            {collaborator.is_rateado ? (
              ['Campo Grande', 'Recreio', 'Barra'].map(u => (
                <span key={u} className="text-[9px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 px-2 py-0.5 rounded-full uppercase">
                  {u}
                </span>
              ))
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Building size={12} className="text-slate-400 dark:text-slate-500" />
                Unidade {collaborator.unidade_fixa?.toUpperCase() || 'N/A'}
              </div>
            )}
          </div>

          {collaborator.instrumentos && collaborator.instrumentos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {collaborator.instrumentos.map(instr => (
                <span key={instr} className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">
                  {instr}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-emerald-500 dark:text-emerald-500/80"><DollarSign size={14} /></span>
          <span className="text-sm font-black text-slate-700 dark:text-slate-200">
            {formatCurrency(collaborator.salario_base)}
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium"> /mês</span>
          </span>
        </div>
        {collaborator.data_admissao && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            Desde {new Date(collaborator.data_admissao).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>
    </Card>
  );
};

// --- Modal Wizard ---

type Section = 'personal' | 'employment' | 'remuneration' | 'allocation' | 'banking' | 'instruments';

const SECTIONS: { id: Section; label: string; icon: React.ElementType; condition?: (dept: CollaboratorDepartment) => boolean }[] = [
  { id: 'personal', label: 'Dados Pessoais', icon: User },
  { id: 'employment', label: 'Vínculo', icon: Briefcase },
  { id: 'remuneration', label: 'Remuneração', icon: DollarSign },
  { id: 'allocation', label: 'Alocação por Unidade', icon: Building2 },
  { id: 'banking', label: 'Dados Bancários', icon: CreditCard },
  { id: 'instruments', label: 'Instrumentos', icon: Music, condition: (dept) => dept === 'professores' }
];

interface CollaboratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Colaborador>) => Promise<void>;
  initialData?: Colaborador;
}

export const CollaboratorModal: React.FC<CollaboratorModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [activeSection, setActiveSection] = useState<Section>('personal');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [form, setForm] = useState<Partial<Colaborador>>(() => initialData ? { ...initialData } : {
    nome: '',
    departamento: 'staff_rateado',
    tipo: 'pj',
    status: 'active',
    salario_base: 0,
    ativo: true,
    is_rateado: false,
    foto_url: undefined
  });

  // IMPORTANT: keep local form state in sync when editing different collaborators.
  // useState(initialData) only runs once on mount.
  useEffect(() => {
    if (!isOpen) return;
    setActiveSection('personal');
    setSubmitError(null);
    setIsCropOpen(false);
    setCropImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setForm(initialData ? { ...initialData } : {
      nome: '',
      departamento: 'staff_rateado',
      tipo: 'pj',
      status: 'active',
      salario_base: 0,
      ativo: true,
      is_rateado: false,
      foto_url: undefined
    });
  }, [initialData, isOpen]);

  const deptColor = DEPARTMENT_COLORS[form.departamento || 'staff_rateado'];
  const visibleSections = SECTIONS.filter(s => !s.condition || s.condition(form.departamento as CollaboratorDepartment));

  const updateForm = (updates: Partial<Colaborador>) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const getCroppedDataUrl = async (imageSrc: string, cropPx: Area): Promise<string> => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cropPx.width);
    canvas.height = Math.round(cropPx.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas não suportado');

    ctx.drawImage(
      img,
      cropPx.x,
      cropPx.y,
      cropPx.width,
      cropPx.height,
      0,
      0,
      cropPx.width,
      cropPx.height
    );

    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const handleFinish = async () => {
    if (!form.nome?.trim()) {
      setActiveSection('personal');
      setSubmitError('Nome é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#0f172a] w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-3rem)] animate-in zoom-in-95">
        {/* Header */}
        <div 
          className="p-6 flex items-center justify-between shrink-0"
          style={{ backgroundColor: deptColor }}
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
              <User className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">
                {initialData ? 'Editar Colaborador' : 'Novo Colaborador'}
              </h3>
              <p className="text-white/80 text-sm font-medium">{DEPARTMENT_LABELS[form.departamento as CollaboratorDepartment]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-slate-50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 p-4 space-y-2 shrink-0 overflow-y-auto">
            {visibleSections.map((section, index) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all",
                    isActive
                      ? "bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700"
                      : "hover:bg-white/50 dark:hover:bg-slate-800/50 text-slate-500"
                  )}
                >
                  <div className={cn("p-2 rounded-lg", isActive ? "bg-blue-500 text-white" : "bg-slate-200 dark:bg-slate-800")}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Passo {index + 1}</div>
                    <div className={cn("text-xs font-bold truncate", isActive ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400")}>
                      {section.label}
                    </div>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-blue-500" />}
                </button>
              );
            })}
          </div>

          {/* Form Content */}
          <div className="flex-1 p-8 overflow-y-auto bg-white dark:bg-[#0f172a]">
            {activeSection === 'personal' && (
              <div className="max-w-2xl space-y-6">
                {submitError && (
                  <div className="px-5 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm font-bold">
                    {submitError}
                  </div>
                )}

                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                    {form.foto_url ? (
                      <img src={form.foto_url} alt="Foto do colaborador" className="w-full h-full object-cover" />
                    ) : (
                      <User className="text-slate-400" size={26} />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Foto</label>
                    <div className="flex items-center gap-3">
                      <input
                        id="collab-photo-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const result = String(reader.result || '');
                            setCropImageSrc(result);
                            setIsCropOpen(true);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('collab-photo-input')?.click()}
                        className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors flex items-center gap-2"
                      >
                        <Plus size={14} /> Selecionar Imagem
                      </button>
                      {form.foto_url && (
                        <button
                          type="button"
                          onClick={() => { setCropImageSrc(form.foto_url || null); setIsCropOpen(true); }}
                          className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 shrink-0"
                        >
                          Ajustar
                        </button>
                      )}
                      {form.foto_url && (
                        <button
                          type="button"
                          onClick={() => updateForm({ foto_url: undefined })}
                          className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 shrink-0"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Dica: a foto fica salva no cadastro (campo <span className="font-mono">foto_url</span>).
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Nome Completo *</label>
                  <input 
                    type="text" 
                    value={form.nome || ''} 
                    onChange={(e) => updateForm({ nome: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                    placeholder="Nome do colaborador"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">CPF</label>
                    <input 
                      type="text" 
                      value={form.cpf || ''} 
                      onChange={(e) => updateForm({ cpf: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold font-mono"
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">RG</label>
                    <input 
                      type="text" 
                      value={form.rg || ''} 
                      onChange={(e) => updateForm({ rg: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold font-mono"
                      placeholder="00.000.000-0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">E-mail</label>
                    <input 
                      type="email" 
                      value={form.email || ''} 
                      onChange={(e) => updateForm({ email: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Telefone</label>
                    <input 
                      type="text" 
                      value={form.telefone || ''} 
                      onChange={(e) => updateForm({ telefone: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Data de Nascimento</label>
                  <DatePicker
                    value={form.data_nascimento}
                    onChange={(v) => updateForm({ data_nascimento: v })}
                    placeholder="Selecione a data..."
                  />
                </div>
              </div>
            )}

            {activeSection === 'employment' && (
              <div className="max-w-2xl space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Departamento *</label>
                    <CustomSelect
                      value={form.departamento || ''}
                      onValueChange={(v) => updateForm({ departamento: v as any })}
                      options={Object.entries(DEPARTMENT_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Função/Cargo</label>
                    <input 
                      type="text" 
                      value={form.funcao || ''} 
                      onChange={(e) => updateForm({ funcao: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                      placeholder="Ex: Analista Financeiro"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo de Contrato</label>
                    <CustomSelect
                      value={form.tipo || ''}
                      onValueChange={(v) => updateForm({ tipo: v as any })}
                      options={Object.entries(CONTRACT_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Status</label>
                    <CustomSelect
                      value={form.status || ''}
                      onValueChange={(v) => updateForm({ status: v as any })}
                      options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Data de Admissão</label>
                  <DatePicker
                    value={form.data_admissao}
                    onChange={(v) => updateForm({ data_admissao: v })}
                    placeholder="Selecione a data..."
                  />
                </div>
              </div>
            )}

            {activeSection === 'remuneration' && (
              <div className="max-w-2xl space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Salário/Honorário Base (R$)</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                    <input 
                      type="number" 
                      value={form.salario_base || 0} 
                      onChange={(e) => updateForm({ salario_base: Number(e.target.value) })}
                      className="w-full pl-14 pr-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-3xl">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-500 text-white rounded-2xl shadow-lg shadow-blue-500/20">
                      <ShieldAlert size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider mb-1">Composições Fixas</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Este valor é a base para o cálculo da folha. Adicionais variáveis (bônus, comissão) são lançados mensalmente na aba de lançamentos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'allocation' && (
              <div className="max-w-2xl space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => updateForm({ is_rateado: false })}
                    className={cn(
                      "p-6 rounded-3xl border-2 text-left transition-all",
                      !form.is_rateado 
                        ? "border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10" 
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                    )}
                  >
                    <Building size={24} className={!form.is_rateado ? "text-blue-500" : "text-slate-400"} />
                    <h4 className="font-bold text-sm mt-4">100% Uma Unidade</h4>
                    <p className="text-[10px] text-slate-500 mt-1">Custo alocado integralmente em uma unidade fixa.</p>
                  </button>
                  <button 
                    onClick={() => updateForm({ is_rateado: true })}
                    className={cn(
                      "p-6 rounded-3xl border-2 text-left transition-all",
                      form.is_rateado 
                        ? "border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10" 
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                    )}
                  >
                    <RefreshCw size={24} className={form.is_rateado ? "text-blue-500" : "text-slate-400"} />
                    <h4 className="font-bold text-sm mt-4">Custo Rateado</h4>
                    <p className="text-[10px] text-slate-500 mt-1">Custo dividido entre múltiplas unidades (Staff Corporativo).</p>
                  </button>
                </div>
                {!form.is_rateado && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unidade Principal</label>
                    <CustomSelect
                      value={form.unidade_fixa || ''}
                      onValueChange={(v) => updateForm({ unidade_fixa: v })}
                      options={[
                        { value: 'cg', label: 'Campo Grande' },
                        { value: 'rec', label: 'Recreio' },
                        { value: 'bar', label: 'Barra' }
                      ]}
                    />
                  </div>
                )}
              </div>
            )}

            {activeSection === 'banking' && (
              <div className="max-w-2xl space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Chave PIX</label>
                  <input 
                    type="text" 
                    value={form.pix || ''} 
                    onChange={(e) => { setSubmitError(null); updateForm({ pix: e.target.value }); }}
                    className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                    placeholder="CPF, E-mail, Telefone ou Aleatória"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Banco</label>
                    <input 
                      type="text" 
                      value={form.banco || ''} 
                      onChange={(e) => updateForm({ banco: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                      placeholder="Ex: Itaú, Nubank"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Agência</label>
                    <input 
                      type="text" 
                      value={form.agencia || ''} 
                      onChange={(e) => updateForm({ agencia: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                      placeholder="0000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Número da Conta</label>
                    <input 
                      type="text" 
                      value={form.conta || ''} 
                      onChange={(e) => updateForm({ conta: e.target.value })}
                      className="w-full px-5 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                      placeholder="00000-0"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo de Conta</label>
                    <CustomSelect
                      value={form.tipo_conta || ''}
                      onValueChange={(v) => updateForm({ tipo_conta: v })}
                      options={[
                        { value: 'corrente', label: 'Conta Corrente' },
                        { value: 'poupanca', label: 'Conta Poupança' }
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'instruments' && (
              <div className="max-w-2xl space-y-6">
                <p className="text-xs text-slate-500">Selecione os instrumentos que este professor leciona.</p>
                <div className="grid grid-cols-3 gap-3">
                  {['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Teclado', 'Baixo', 'Violino'].map(instr => {
                    const isSelected = (form.instrumentos || []).includes(instr);
                    return (
                      <button
                        key={instr}
                        onClick={() => {
                          const current = form.instrumentos || [];
                          const next = isSelected 
                            ? current.filter(i => i !== instr)
                            : [...current, instr];
                          updateForm({ instrumentos: next });
                        }}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-sm font-bold",
                          isSelected 
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" 
                            : "border-slate-200 dark:border-slate-700 hover:border-emerald-500/50"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all",
                          isSelected ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                        )}>
                          {isSelected && <Check size={10} className="text-white" />}
                        </div>
                        {instr}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-4 shrink-0">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-4 rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition-all active:scale-95"
          >
            Cancelar
          </button>
          <button 
            onClick={handleFinish}
            disabled={saving}
            className="flex-[2] px-6 py-4 rounded-2xl text-white font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl"
            style={{ backgroundColor: deptColor }}
          >
            {saving ? <RefreshCw className="animate-spin" size={20} /> : <Check size={20} />}
            {initialData ? 'Salvar Alterações' : 'Criar Colaborador'}
          </button>
        </div>
      </div>

      {/* Cropper Overlay */}
      {isCropOpen && cropImageSrc && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="text-slate-900 dark:text-white font-black">Ajustar Foto</div>
              <button
                onClick={() => { setIsCropOpen(false); }}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="relative w-full h-[360px] rounded-2xl overflow-hidden bg-slate-950">
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, px) => setCroppedAreaPixels(px)}
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="text-xs font-bold text-slate-500 w-14">Zoom</div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs font-mono text-slate-500 w-14 text-right">{zoom.toFixed(2)}x</div>
              </div>
            </div>

            <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsCropOpen(false)}
                className="px-5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-black"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!cropImageSrc || !croppedAreaPixels) return;
                  try {
                    const dataUrl = await getCroppedDataUrl(cropImageSrc, croppedAreaPixels);
                    updateForm({ foto_url: dataUrl });
                    setIsCropOpen(false);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-black shadow-lg shadow-violet-600/20"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
