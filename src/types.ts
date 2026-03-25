export type UserRole = 'admin' | 'lawyer' | 'assistant' | 'client';

export interface AdminConfig {
  username: string;
  password: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  photoURL?: string;
  phone?: string;
  cuit?: string;
  dni?: string;
  additionalInfo?: string;
  createdAt?: string;
}

export interface FollowUp {
  id: string;
  content: string;
  date: string;
  authorName?: string;
}

export interface Case {
  id: string;
  caseNumber: string;
  caseTitle: string;
  clientName: string;
  opposingParty: string;
  jurisdiction: 'Cordoba' | 'Alta Gracia' | 'Rio segundo' | 'Rio primero' | 'Rio tercero' | 'Carlos Paz' | 'Cosquin' | 'Jesus Maria' | 'Rio Cuarto' | 'Villa Maria' | '';
  status: 'activo' | 'archivado' | 'paralizado' | 'cancelado' | 'terminado' | 'renunciado';
  assignedLawyerId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // New fields
  startDate?: string;
  systemDate?: string;
  processType?: 'mediacion' | 'juicio' | 'asesoramiento' | 'otro' | '';
  roleInProcess?: 'actor' | 'demandado' | 'asesoramiento' | 'tercero' | 'otro' | '';
  clientData?: {
    address?: string;
    phone?: string;
    email?: string;
    dni?: string;
    cuit?: string;
  };
  defendantData?: {
    address?: string;
    phone?: string;
    email?: string;
    dni?: string;
    cuit?: string;
  };
  observations?: string;
  followUps?: FollowUp[];
  documents?: DocumentMetadata[];
}

export interface TaskHistoryEntry {
  id: string;
  status: 'pending' | 'in-progress' | 'completed';
  changedBy: string;
  changedByName?: string;
  timestamp: string;
}

export interface Task {
  id: string;
  caseId?: string;
  title: string;
  description: string;
  assignedUserId: string;
  dueDate: string;
  status: 'pending' | 'in-progress' | 'completed';
  isPersonal: boolean;
  history?: TaskHistoryEntry[];
  isRecurring?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: string;
  };
  parentId?: string; // For recurring instances
}

export interface Event {
  id: string;
  caseId?: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  type: 'hearing' | 'meeting' | 'deadline' | 'other';
  assignedUserIds: string[];
  isRecurring?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: string;
  };
  parentId?: string;
}

export interface Message {
  id: string;
  chatId: string;
  authorId: string;
  authorName?: string;
  content: string;
  timestamp: string;
  readBy: string[];
}

export interface DocumentMetadata {
  id: string;
  caseId: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
  contentType?: string;
}

export interface Credential {
  id: string;
  username: string;
  password: string;
  userId: string;
}

export interface Invoice {
  id: string;
  caseId: string;
  clientId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'partial';
  dueDate: string;
  issueDate: string;
  description: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  payments: {
    id: string;
    amount: number;
    date: string;
    method: 'cash' | 'transfer' | 'card' | 'other';
    reference?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}
