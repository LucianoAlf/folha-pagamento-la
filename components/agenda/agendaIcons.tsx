import React from 'react';
import type { Categoria, Prioridade, TarefaLista } from '../../types/agenda';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BriefcaseBusiness,
  Calendar,
  ClipboardList,
  Coins,
  FileText,
  Home,
  ListTodo,
  Star,
  Sun,
  Users,
} from 'lucide-react';

export const prioridadeIcon = (p: Prioridade) => {
  switch (p) {
    case 'urgente':
      return AlertCircle;
    case 'alta':
      return ArrowUp;
    case 'media':
      return ArrowRight;
    case 'baixa':
      return ArrowDown;
    default:
      return ArrowRight;
  }
};

export const categoriaIcon = (c: Categoria) => {
  switch (c) {
    case 'financeiro':
      return Coins;
    case 'rh':
      return Users;
    case 'administrativo':
      return ClipboardList;
    case 'pessoal':
      return Home;
    case 'geral':
    default:
      return FileText;
  }
};

export const smartListIcon = (key: string) => {
  if (key === 'smart:meu-dia') return Sun;
  if (key === 'smart:importante') return Star;
  if (key === 'smart:planejado') return Calendar;
  return ListTodo;
};

export const listaIcon = (lista: TarefaLista | null | undefined) => {
  const nome = (lista?.nome || '').toLowerCase();
  if (nome.includes('finance')) return Coins;
  if (nome === 'rh' || nome.includes('rh')) return Users;
  if (nome.includes('admin')) return ClipboardList;
  if (nome.includes('pessoal')) return Home;
  if (nome.includes('neg') || nome.includes('plan')) return BriefcaseBusiness;
  return ListTodo;
};

