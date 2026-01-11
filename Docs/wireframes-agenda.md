🎨 Wireframes Completos - Módulo Agenda
Vou criar os wireframes detalhados para você enviar ao Cursor:

📋 PROMPT COMPLETO COM WIREFRAMES PARA CURSOR
## ETAPA 3: UI/UX Premium - Módulo Agenda (Layout ToDo)

### CONTEXTO
- Layout estilo Microsoft ToDo (sidebar de listas + painel principal)
- Design system existente: tema escuro, cores do sistema
- Ana é a única usuária - foco em produtividade
- Reutilizar componentes existentes (Modal, Button, Input, etc.)

### ARQUIVOS A CRIAR:
src/components/agenda/
├── AgendaPage.tsx              # Página principal
├── AgendaSidebarListas.tsx     # Sidebar com listas
├── AgendaContent.tsx           # Painel de conteúdo principal
├── AgendaHeader.tsx            # Header com título e ações
├── TarefaCard.tsx              # Card de tarefa individual
├── TarefaQuickAdd.tsx          # Input rápido para adicionar
├── TarefaModal.tsx             # Modal criar/editar tarefa
├── TarefaDetailPanel.tsx       # Painel lateral de detalhes
├── SubtarefaItem.tsx           # Item de checklist
├── CalendarioView.tsx          # Visualização calendário
├── NotasRapidas.tsx            # Widget de notas
├── TemplatesModal.tsx          # Modal de templates
└── ConfiguracoesTab.tsx        # Configurações de notificação

---

## WIREFRAME 1: Layout Principal (AgendaPage.tsx)
┌──────────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR      │                         AGENDA                                    │
│ SISTEMA      │                                                                   │
├──────────────┼───────────────────────────────────────────────────────────────────┤
│              │  ┌─────────────────┬───────────────────────────────────────────┐  │
│ 🏠 Dashboard │  │                 │                                           │  │
│              │  │  SIDEBAR        │           CONTENT AREA                    │  │
│ 📊 Folha     │  │  LISTAS         │                                           │  │
│              │  │  (240px)        │           (flex-1)                        │  │
│ 💰 Contas    │  │                 │                                           │  │
│              │  │                 │                                           │  │
│ 📅 Agenda ●  │  │                 │                                           │  │
│              │  │                 │                                           │  │
│              │  │                 │                                           │  │
│              │  │                 │                                           │  │
│              │  │                 │                                           │  │
│              │  └─────────────────┴───────────────────────────────────────────┘  │
└──────────────┴───────────────────────────────────────────────────────────────────┘

### Estrutura JSX:
```tsx
<div className="flex h-full">
  {/* Sidebar de Listas - 240px fixo */}
  <AgendaSidebarListas 
    listas={listas}
    listaAtiva={listaAtiva}
    onSelectLista={setListaAtiva}
  />
  
  {/* Conteúdo Principal - flex-1 */}
  <AgendaContent 
    lista={listaAtiva}
    tarefas={tarefasFiltradas}
  />
  
  {/* Painel de Detalhes - 400px, condicional */}
  {tarefaSelecionada && (
    <TarefaDetailPanel 
      tarefa={tarefaSelecionada}
      onClose={() => setTarefaSelecionada(null)}
    />
  )}
</div>
```

---

## WIREFRAME 2: Sidebar de Listas (AgendaSidebarListas.tsx)
┌─────────────────────┐
│  📅 AGENDA          │  ← Header com título
├─────────────────────┤
│                     │
│  LISTAS INTELIGENTES│  ← Seção label (text-xs, text-gray-500)
│                     │
│  ┌─────────────────┐│
│  │ ☀️ Meu Dia    5 ││  ← Item ativo (bg-purple-500/20, border-l-2 purple)
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │ ⭐ Importante  3 ││  ← Item hover (bg-gray-800/50)
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │ 📅 Planejado  12││
│  └─────────────────┘│
│                     │
│  ──────────────────  │  ← Separador (border-gray-800)
│                     │
│  MINHAS LISTAS      │
│                     │
│  ┌─────────────────┐│
│  │ 💰 Financeiro 28││  ← Cor da lista na borda esquerda
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │ 👥 RH         15││
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │ 📋 Admin       8││
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │ 🏠 Pessoal     4││
│  └─────────────────┘│
│                     │
│  ──────────────────  │
│                     │
│  ┌─────────────────┐│
│  │ + Nova Lista    ││  ← Botão criar lista (text-gray-400 hover:text-white)
│  └─────────────────┘│
│                     │
├─────────────────────┤
│  ⚙️ Configurações   │  ← Footer - link para config
└─────────────────────┘

### Estrutura do Item de Lista:
```tsx
<button 
  className={cn(
    "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
    "hover:bg-gray-800/50",
    isActive && "bg-purple-500/20 border-l-2 border-purple-500"
  )}
>
  <span className="text-lg">{lista.icone}</span>
  <span className="flex-1 text-left text-sm">{lista.nome}</span>
  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
    {lista._count || 0}
  </span>
</button>
```

---

## WIREFRAME 3: Área de Conteúdo - Meu Dia (AgendaContent.tsx)
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ☀️ Meu Dia                              Dom, 12 de Janeiro │   │  ← Header
│  │  5 tarefas para hoje                      [📋] [📅] [⚙️]    │   │  ← Subtítulo + ações
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ○  Adicionar uma tarefa...                            [+]  │   │  ← Quick Add
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  🔴 ATRASADAS (2)                                            │   │  ← Seção colapsável
│  │  ─────────────────────────────────────────────────────────   │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ ○ Conciliação Cartões Barra                          │   │   │
│  │  │   🔴 Urgente · 💰 Financeiro · Ontem, 10:00          │   │   │
│  │  │   ▸ 2/4 subtarefas                                   │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ ○ Verificar impostos água                            │   │   │
│  │  │   🟡 Alta · 💰 Financeiro · Ontem, 16:00             │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  📋 HOJE (3)                                                 │   │
│  │  ─────────────────────────────────────────────────────────   │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ ○ Enviar folha para conferência                      │   │   │
│  │  │   🟡 Alta · 👥 RH · Hoje, 14:00                       │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ ○ Reunião ADMs semanal                               │   │   │
│  │  │   ➡️ Média · 📋 Admin · Hoje, 17:00                   │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ ◉ Cobrar Lalitas comissões        ✓ Concluída        │   │   │  ← Tarefa concluída (opacity-50, line-through)
│  │  │   ➡️ Média · 💰 Financeiro · Hoje, 09:00              │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

---

## WIREFRAME 4: Card de Tarefa (TarefaCard.tsx)

### Estado Normal:
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ○  Conciliação Cartões Barra                              [⋮]  │  ← Checkbox + Título + Menu
│                                                                  │
│  🔴 Urgente  ·  💰 Financeiro  ·  🏢 Barra  ·  📅 Hoje, 10:00   │  ← Badges
│                                                                  │
│  ▸ 2/4 subtarefas                                               │  ← Progress subtarefas (se houver)
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

### Estado Hover:
┌──────────────────────────────────────────────────────────────────┐
│ ████████████████████████████████████████████████████████████████ │  ← bg-gray-800/50
│  ○  Conciliação Cartões Barra                              [⋮]  │
│                                                                  │
│  🔴 Urgente  ·  💰 Financeiro  ·  🏢 Barra  ·  📅 Hoje, 10:00   │
│                                                                  │
│  ▸ 2/4 subtarefas                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

### Estado Selecionado (com painel aberto):
┌──────────────────────────────────────────────────────────────────┐
│ ▌███████████████████████████████████████████████████████████████ │  ← border-l-2 border-purple-500 + bg
│  ○  Conciliação Cartões Barra                              [⋮]  │
│                                                                  │
│  🔴 Urgente  ·  💰 Financeiro  ·  🏢 Barra  ·  📅 Hoje, 10:00   │
│                                                                  │
│  ▸ 2/4 subtarefas                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

### Estado Concluída:
┌──────────────────────────────────────────────────────────────────┐
│                                                         opacity-60│
│  ◉  ̶C̶o̶n̶c̶i̶l̶i̶a̶ç̶ã̶o̶ ̶C̶a̶r̶t̶õ̶e̶s̶ ̶B̶a̶r̶r̶a̶                    ✓ Concluída  │  ← line-through + badge verde
│                                                                  │
│  🔴 Urgente  ·  💰 Financeiro  ·  Concluída há 2h               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

### Estrutura do Card:
```tsx
<div 
  onClick={() => onSelect(tarefa)}
  className={cn(
    "group p-4 rounded-lg border border-transparent transition-all cursor-pointer",
    "hover:bg-gray-800/50 hover:border-gray-700",
    isSelected && "bg-purple-500/10 border-l-2 border-purple-500",
    tarefa.status === 'concluida' && "opacity-60"
  )}
>
  <div className="flex items-start gap-3">
    {/* Checkbox */}
    <button 
      onClick={(e) => { e.stopPropagation(); onToggle(tarefa); }}
      className={cn(
        "w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5",
        tarefa.status === 'concluida' 
          ? "bg-emerald-500 border-emerald-500" 
          : "border-gray-500 hover:border-purple-500"
      )}
    >
      {tarefa.status === 'concluida' && <Check className="w-3 h-3 text-white" />}
    </button>
    
    {/* Conteúdo */}
    <div className="flex-1 min-w-0">
      <h3 className={cn(
        "font-medium text-white",
        tarefa.status === 'concluida' && "line-through text-gray-400"
      )}>
        {tarefa.titulo}
      </h3>
      
      {/* Badges */}
      <div className="flex items-center gap-2 mt-1 text-xs">
        <PrioridadeBadge prioridade={tarefa.prioridade} />
        <CategoriaBadge categoria={tarefa.categoria} />
        {tarefa.unidade && <UnidadeBadge unidade={tarefa.unidade} />}
        {tarefa.vencimento_em && <DataBadge data={tarefa.vencimento_em} />}
      </div>
      
      {/* Subtarefas progress */}
      {tarefa.subtarefas?.length > 0 && (
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
          <ChevronRight className="w-3 h-3" />
          <span>{concluidas}/{total} subtarefas</span>
        </div>
      )}
    </div>
    
    {/* Menu */}
    <DropdownMenu>...</DropdownMenu>
  </div>
</div>
```

---

## WIREFRAME 5: Quick Add (TarefaQuickAdd.tsx)

### Estado Normal:
┌─────────────────────────────────────────────────────────────────┐
│  ○  Adicionar uma tarefa...                                [+]  │
└─────────────────────────────────────────────────────────────────┘

### Estado Expandido (ao clicar):
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Título da tarefa...                                       │  │  ← Input autofocus
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │ [📅 Data] [🚨 Prioridade ▾] [📁 Categoria ▾] [📋 Template] ││  ← Ações rápidas
│  │                                                              ││
│  │                                        [Cancelar] [Salvar]  ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

---

## WIREFRAME 6: Painel de Detalhes (TarefaDetailPanel.tsx)
┌───────────────────────────────────────┐
│                                    [✕]│  ← Botão fechar
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ○ Conciliação Cartões Barra     │  │  ← Checkbox + Título editável
│  └─────────────────────────────────┘  │
│                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│  📅 VENCIMENTO                        │
│  ┌─────────────────────────────────┐  │
│  │ Hoje, 12 Jan · 10:00            │  │  ← DateTimePicker
│  └─────────────────────────────────┘  │
│                                       │
│  🚨 PRIORIDADE                        │
│  ┌───────┬───────┬───────┬────────┐  │
│  │ Baixa │ Média │ Alta  │Urgente │  │  ← Toggle buttons
│  └───────┴───────┴───────┴────────┘  │
│                      ▲ selecionado    │
│                                       │
│  📁 CATEGORIA                         │
│  ┌─────────────────────────────────┐  │
│  │ 💰 Financeiro                 ▾ │  │  ← Select
│  └─────────────────────────────────┘  │
│                                       │
│  🏢 UNIDADE                           │
│  ┌─────────────────────────────────┐  │
│  │ Barra                         ▾ │  │  ← Select
│  └─────────────────────────────────┘  │
│                                       │
│  📋 LISTA                             │
│  ┌─────────────────────────────────┐  │
│  │ 💰 Financeiro                 ▾ │  │  ← Select
│  └─────────────────────────────────┘  │
│                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│  ✓ SUBTAREFAS                    [+]  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ◉ Baixar extrato da maquininha │  │  ← Subtarefa concluída
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ ◉ Conferir valores recebidos   │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ ○ Identificar divergências     │  │  ← Subtarefa pendente
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ ○ Registrar no sistema         │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│  📝 DESCRIÇÃO                         │
│  ┌─────────────────────────────────┐  │
│  │ Conciliação mensal dos cartões │  │  ← Textarea
│  │ de crédito da unidade Barra.   │  │
│  │ Verificar todas as vendas...   │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│  🔔 LEMBRETE                          │
│  ┌─────────────────────────────────┐  │
│  │ 30 minutos antes             ▾ │  │  ← Select
│  └─────────────────────────────────┘  │
│                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ 🗑️ Excluir tarefa                │  │  ← Botão danger
│  └─────────────────────────────────┘  │
│                                       │
│  Criada em 10/01/2026 às 14:32       │  ← Metadata
│                                       │
└───────────────────────────────────────┘

---

## WIREFRAME 7: Modal de Nova Tarefa (TarefaModal.tsx)
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                     Nova Tarefa                        [✕]│   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ Título *                                                  │   │
│  │ ┌───────────────────────────────────────────────────────┐ │   │
│  │ │ Ex: Conciliação cartões Barra                         │ │   │
│  │ └───────────────────────────────────────────────────────┘ │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ Descrição                                                 │   │
│  │ ┌───────────────────────────────────────────────────────┐ │   │
│  │ │                                                       │ │   │
│  │ │                                                       │ │   │
│  │ └───────────────────────────────────────────────────────┘ │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────┬─────────────────────────────────┐   │
│  │ Vencimento              │ Hora                            │   │
│  │ ┌─────────────────────┐ │ ┌─────────────────────────────┐ │   │
│  │ │ 📅 12/01/2026       │ │ │ 🕐 10:00                    │ │   │
│  │ └─────────────────────┘ │ └─────────────────────────────┘ │   │
│  │ ☐ Dia inteiro           │                                 │   │
│  └─────────────────────────┴─────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────┬─────────────────────────────────┐   │
│  │ Prioridade              │ Categoria                       │   │
│  │ ┌─────────────────────┐ │ ┌─────────────────────────────┐ │   │
│  │ │ 🟡 Alta           ▾ │ │ │ 💰 Financeiro             ▾ │ │   │
│  │ └─────────────────────┘ │ └─────────────────────────────┘ │   │
│  └─────────────────────────┴─────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────┬─────────────────────────────────┐   │
│  │ Lista                   │ Unidade                         │   │
│  │ ┌─────────────────────┐ │ ┌─────────────────────────────┐ │   │
│  │ │ 💰 Financeiro     ▾ │ │ │ Barra                     ▾ │ │   │
│  │ └─────────────────────┘ │ └─────────────────────────────┘ │   │
│  └─────────────────────────┴─────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ Lembrete                                                  │   │
│  │ ┌───────────────────────────────────────────────────────┐ │   │
│  │ │ 🔔 30 minutos antes                                 ▾ │ │   │
│  │ └───────────────────────────────────────────────────────┘ │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ 📋 Usar template                                       [▾]│   │  ← Dropdown templates
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                                                           │   │
│  │                          [Cancelar]  [Criar Tarefa]       │   │
│  │                                                           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

---

## WIREFRAME 8: Visualização Calendário (CalendarioView.tsx)
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ◀  Janeiro 2026  ▶                              [Hoje]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐                       │
│  │ Dom │ Seg │ Ter │ Qua │ Qui │ Sex │ Sáb │                       │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                       │
│  │     │     │     │  1  │  2  │  3  │  4  │                       │
│  │     │     │     │     │     │     │     │                       │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                       │
│  │  5  │  6  │  7  │  8  │  9  │ 10  │ 11  │                       │
│  │     │ 2🔴 │     │     │     │ 1🟡 │     │                       │  ← Indicadores de tarefas
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                       │
│  │ 12● │ 13  │ 14  │ 15  │ 16  │ 17  │ 18  │                       │  ← 12 = hoje (highlight)
│  │ 3🔴 │     │     │ 2🟡 │     │     │     │                       │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                       │
│  │ 19  │ 20  │ 21  │ 22  │ 23  │ 24  │ 25  │                       │
│  │     │     │     │     │ 1➡️ │     │ 4🔴 │                       │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                       │
│  │ 26  │ 27  │ 28  │ 29  │ 30  │ 31  │     │                       │
│  │     │     │     │     │     │     │     │                       │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘                       │
│                                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                     │
│  📅 12 de Janeiro (Hoje)                                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 10:00  ○ Conciliação Cartões Barra          🔴 Urgente      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 14:00  ○ Enviar folha para conferência      🟡 Alta         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 17:00  ○ Reunião ADMs semanal               ➡️ Média        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

---

## WIREFRAME 9: Configurações (ConfiguracoesTab.tsx)
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⚙️ Configurações de Notificação                                    │
│                                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                     │
│  📱 WHATSAPP                                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  Ativar notificações WhatsApp                         [ON]  │   │  ← Toggle
│  │                                                              │   │
│  │  Número do WhatsApp                                         │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │ +55 21 99999-9999                                     │  │   │
│  │  └───────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  │  [Enviar teste]                                             │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                     │
│  📅 GOOGLE CALENDAR                                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  Status: ✅ Conectado                                       │   │
│  │  Calendário: ana.mendonca@lamusic.com                       │   │
│  │                                                              │   │
│  │  [Reconectar]  [Desconectar]                                │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                     │
│  🔔 RESUMOS AUTOMÁTICOS                                             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  Resumo diário                                        [ON]  │   │
│  │  Horário: [08:00 ▾]                                         │   │
│  │                                                              │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │                                                              │   │
│  │  Resumo semanal                                       [ON]  │   │
│  │  Dia: [Domingo ▾]  Horário: [20:00 ▾]                       │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                     │
│  ⏰ PADRÕES                                                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  Lembrete padrão para novas tarefas                         │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │ 30 minutos antes                                    ▾ │  │   │
│  │  └───────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                                    [Salvar]         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

---

## ESPECIFICAÇÕES DE DESIGN

### Cores do Sistema (reutilizar):
```typescript
const colors = {
  background: {
    primary: '#0f1219',    // bg principal
    secondary: '#1a1f2e',  // cards
    tertiary: '#252b3b',   // hover
  },
  border: '#374151',       // gray-700
  accent: '#8b5cf6',       // purple-500
  
  prioridades: {
    baixa: '#6b7280',      // gray-500
    media: '#3b82f6',      // blue-500
    alta: '#f59e0b',       // amber-500
    urgente: '#ef4444',    // red-500
  },
  
  categorias: {
    financeiro: '#10b981', // emerald-500
    rh: '#8b5cf6',         // purple-500
    administrativo: '#6366f1', // indigo-500
    pessoal: '#ec4899',    // pink-500
    geral: '#6b7280',      // gray-500
  }
};
```

### Dimensões:
```typescript
const dimensions = {
  sidebarListas: '240px',
  detailPanel: '400px',
  cardPadding: '16px',
  borderRadius: '8px',
};
```

### Animações:
```typescript
const animations = {
  transition: 'all 200ms ease-out',
  slideIn: 'slideInRight 200ms ease-out',
  fadeIn: 'fadeIn 150ms ease-out',
};
```

---

## COMPORTAMENTOS IMPORTANTES

### 1. Quick Add:
- Enter = salvar tarefa
- Escape = cancelar
- Tarefa criada vai para lista ativa
- Se em "Meu Dia", recebe vencimento_em = hoje

### 2. Checkbox da Tarefa:
- Click = toggle concluída/pendente
- Animação de check com delay 200ms
- Tarefa concluída move para fim da lista após 1s

### 3. Sidebar de Listas:
- Listas inteligentes sempre no topo
- Contador atualiza em tempo real (Realtime)
- Drag & drop para reordenar (futuro)

### 4. Painel de Detalhes:
- Abre com animação slideIn da direita
- Salva automaticamente ao alterar campos (debounce 500ms)
- Escape fecha o painel

### 5. Calendário:
- Click no dia = filtra tarefas daquele dia
- Double-click = abre modal nova tarefa com data preenchida
- Indicadores coloridos por prioridade

---

### Após implementar, verificar:

1. [ ] Layout responsivo (sidebar colapsa em mobile)
2. [ ] Realtime subscription funcionando
3. [ ] Todos os CRUD operacionais
4. [ ] Navegação entre listas fluida
5. [ ] Animações suaves
6. [ ] Dark mode consistente

Me avise quando terminar para prosseguir com integrações (WhatsApp/Calendar)!