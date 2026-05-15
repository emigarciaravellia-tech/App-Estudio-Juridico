import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, deleteDoc, arrayUnion, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { Case, FollowUp, UserProfile, DocumentMetadata } from '../types';
import { CaseRepository } from '../services/caseRepository';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Filter, Edit2, Trash2, X, ChevronRight, Save, Calendar as CalendarIcon, User, FileText, Upload, Download, ExternalLink, Loader2, Clock, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import ConfirmationModal from './ConfirmationModal';

const JURISDICTIONS = [
  'Cordoba', 'Alta Gracia', 'Rio segundo', 'Rio primero', 'Rio tercero', 
  'Carlos Paz', 'Cosquin', 'Jesus Maria', 'Rio Cuarto', 'Villa Maria'
];

const PROCESS_TYPES = ['mediacion', 'juicio', 'asesoramiento', 'otro'];
const ROLES_IN_PROCESS = ['actor', 'demandado', 'asesoramiento', 'tercero', 'otro'];

export default function CaseManagement() {
  const { profile, isAdmin, isLawyer, isAssistant } = useAuth();
  const location = useLocation();
  const [cases, setCases] = useState<Case[]>([]);
  const [lawyers, setLawyers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTermClient, setSearchTermClient] = useState('');
  const [filterJurisdiction, setFilterJurisdiction] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProcessType, setFilterProcessType] = useState('');
  const [filterLawyer, setFilterLawyer] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === 'true') {
      setIsModalOpen(true);
    }
  }, [location.search]);
  const [showClientSelector, setShowClientSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [viewingCase, setViewingCase] = useState<Case | null>(null);
  const [newFollowUp, setNewFollowUp] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentMetadata | null>(null);
  const [formData, setFormData] = useState<Partial<Case>>({
    caseNumber: '',
    caseTitle: '',
    clientName: '',
    opposingParty: '',
    jurisdiction: '',
    status: 'activo',
    assignedLawyerId: '',
    notes: '',
    startDate: '',
    systemDate: format(new Date(), 'yyyy-MM-dd'),
    processType: '',
    roleInProcess: '',
    clientData: { address: '', phone: '', email: '', dni: '', cuit: '' },
    defendantData: { address: '', phone: '', email: '', dni: '', cuit: '' },
    observations: ''
  });

  useEffect(() => {
    const unsubscribe = CaseRepository.subscribeToCases(setCases);

    const qLawyers = query(collection(db, 'users'));
    const unsubscribeLawyers = onSnapshot(qLawyers, (snapshot) => {
      setLawyers(snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.role === 'lawyer' || u.role === 'admin')
      );
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const qClients = query(collection(db, 'users'), where('role', '==', 'client'));
    const unsubscribeClients = onSnapshot(qClients, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => {
      unsubscribe();
      unsubscribeLawyers();
      unsubscribeClients();
    };
  }, []);

  // Update viewingCase if the underlying data changes in real-time
  useEffect(() => {
    if (viewingCase) {
      const updated = cases.find(c => c.id === viewingCase.id);
      if (updated) setViewingCase(updated);
    }
  }, [cases, viewingCase?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const data = {
        ...formData,
        caseNumber: formData.caseNumber || '',
        caseTitle: formData.caseTitle || '',
        clientName: formData.clientName || '',
        status: formData.status || 'activo',
      };

      if (selectedCase) {
        await CaseRepository.update(selectedCase.id, data);
      } else {
        await CaseRepository.create(data);
      }
      setIsModalOpen(false);
      setSelectedCase(null);
      resetForm();
    } catch (err) {
      console.error('Error saving case:', err);
      setError('Error al guardar el expediente. Verifique sus permisos y campos obligatorios.');
    }
  };

  const resetForm = () => {
    setFormData({
      caseNumber: '',
      caseTitle: '',
      clientName: '',
      opposingParty: '',
      jurisdiction: '',
      status: 'activo',
      assignedLawyerId: '',
      notes: '',
      startDate: '',
      systemDate: format(new Date(), 'yyyy-MM-dd'),
      processType: '',
      roleInProcess: '',
      clientData: { address: '', phone: '', email: '', dni: '', cuit: '' },
      defendantData: { address: '', phone: '', email: '', dni: '', cuit: '' },
      observations: ''
    });
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCaseToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!caseToDelete) return;
    const path = `cases/${caseToDelete}`;
    try {
      await deleteDoc(doc(db, 'cases', caseToDelete));
      if (viewingCase?.id === caseToDelete) setViewingCase(null);
      setIsDeleteModalOpen(false);
      setCaseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleAddFollowUp = async () => {
    if (!newFollowUp.trim() || !viewingCase) return;

    const followUp: FollowUp = {
      id: crypto.randomUUID(),
      content: newFollowUp,
      date: new Date().toISOString(),
      authorName: profile?.displayName || 'Usuario'
    };

    const path = `cases/${viewingCase.id}`;
    try {
      await updateDoc(doc(db, 'cases', viewingCase.id), {
        followUps: arrayUnion(followUp),
        updatedAt: new Date().toISOString()
      });
      setNewFollowUp('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingCase) return;

    setIsUploading(true);
    const path = `cases/${viewingCase.id}/documents/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);

    try {
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const docMetadata: DocumentMetadata = {
        id: crypto.randomUUID(),
        caseId: viewingCase.id,
        name: file.name,
        url: downloadURL,
        uploadedBy: profile?.displayName || 'Usuario',
        uploadedAt: new Date().toISOString(),
        contentType: file.type
      };

      await updateDoc(doc(db, 'cases', viewingCase.id), {
        documents: arrayUnion(docMetadata),
        updatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Error uploading file:', error);
      let errorMessage = 'Error al subir el archivo.';
      
      if (error.code === 'storage/unauthorized') {
        errorMessage = 'No tiene permisos para subir archivos. Verifique la configuración de Firebase Storage.';
      } else if (error.code === 'storage/canceled') {
        errorMessage = 'Carga cancelada.';
      } else if (error.code === 'storage/unknown') {
        errorMessage = 'Error desconocido al subir el archivo.';
      }
      
      setError(errorMessage + ' ' + (error.message || ''));
    } finally {
      setIsUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const exportToCSV = () => {
    const headers = ['Número de Expediente', 'Cliente', 'Contraparte', 'Estado', 'Abogado Asignado', 'Jurisdicción', 'Tipo de Proceso', 'Rol', 'Fecha de Inicio', 'Última Actualización'];
    const rows = filteredCases.map(c => [
      c.caseNumber,
      c.clientName,
      c.opposingParty,
      c.status,
      lawyers.find(l => l.uid === c.assignedLawyerId)?.displayName || 'Sin asignar',
      c.jurisdiction,
      c.processType,
      c.roleInProcess,
      c.startDate,
      format(new Date(c.updatedAt), 'dd/MM/yyyy')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_expedientes_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = 
      c.caseNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.opposingParty.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.caseTitle && c.caseTitle.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesJurisdiction = !filterJurisdiction || c.jurisdiction === filterJurisdiction;
    const matchesStatus = !filterStatus || c.status === filterStatus;
    const matchesProcessType = !filterProcessType || c.processType === filterProcessType;
    const matchesLawyer = !filterLawyer || c.assignedLawyerId === filterLawyer;

    return matchesSearch && matchesJurisdiction && matchesStatus && matchesProcessType && matchesLawyer;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Expedientes</h2>
          <p className="text-slate-500">Gestión integral de causas judiciales y mediaciones.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <FileText className="h-5 w-5 text-slate-400" />
            Generar Reporte
          </button>
          {(isAdmin || isLawyer || isAssistant) && (
            <button 
              onClick={() => {
                setSelectedCase(null);
                resetForm();
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <Plus className="h-5 w-5" />
              Nuevo Expediente
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por número, cliente o contraparte..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => {
              setFilterJurisdiction('');
              setFilterStatus('');
              setFilterProcessType('');
              setFilterLawyer('');
              setSearchTerm('');
            }}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-2"
          >
            <X className="h-4 w-4" />
            Limpiar Filtros
          </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Jurisdicción</label>
            <select 
              className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              value={filterJurisdiction}
              onChange={(e) => setFilterJurisdiction(e.target.value)}
            >
              <option value="">Todas</option>
              {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Estado</label>
            <select 
              className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="activo">Activo</option>
              <option value="archivado">Archivado</option>
              <option value="paralizado">Paralizado</option>
              <option value="cancelado">Cancelado</option>
              <option value="terminado">Terminado</option>
              <option value="renunciado">Renunciado</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tipo de Proceso</label>
            <select 
              className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              value={filterProcessType}
              onChange={(e) => setFilterProcessType(e.target.value)}
            >
              <option value="">Todos</option>
              {PROCESS_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Abogado</label>
            <select 
              className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              value={filterLawyer}
              onChange={(e) => setFilterLawyer(e.target.value)}
            >
              <option value="">Todos</option>
              {lawyers.map(l => <option key={l.uid} value={l.uid}>{l.displayName}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Cases List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Expediente</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Carátula</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Cliente vs Contraparte</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Abogado Asignado</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Jurisdicción</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Estado</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">Actualización</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCases.map((c) => (
                <tr 
                  key={c.id} 
                  onClick={() => setViewingCase(c)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4 font-bold text-indigo-600">{c.caseNumber || 'S/N'}</td>
                  <td className="px-6 py-4 text-sm text-slate-900 font-medium">{c.caseTitle || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-900">{c.clientName}</div>
                    <div className="text-xs text-slate-400">vs {c.opposingParty}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {lawyers.find(l => l.uid === c.assignedLawyerId)?.displayName || 'Sin asignar'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{c.jurisdiction || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      c.status === 'activo' ? 'bg-indigo-100 text-indigo-700' :
                      c.status === 'archivado' ? 'bg-slate-100 text-slate-700' :
                      c.status === 'paralizado' ? 'bg-amber-100 text-amber-700' :
                      c.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                      c.status === 'terminado' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {format(new Date(c.updatedAt), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCase(c);
                          setFormData(c);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={(e) => handleDelete(c.id, e)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredCases.map((c) => (
            <div 
              key={c.id} 
              onClick={() => setViewingCase(c)}
              className="p-4 space-y-3 active:bg-slate-50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-indigo-600">{c.caseNumber || 'S/N'}</p>
                  <h4 className="font-bold text-slate-900">{c.caseTitle || 'Sin carátula'}</h4>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  c.status === 'activo' ? 'bg-indigo-100 text-indigo-700' :
                  c.status === 'archivado' ? 'bg-slate-100 text-slate-700' :
                  c.status === 'paralizado' ? 'bg-amber-100 text-amber-700' :
                  c.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                  c.status === 'terminado' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {c.status}
                </span>
              </div>
              
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <User className="h-3 w-3" />
                    <span>{c.clientName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock className="h-3 w-3" />
                    <span>{format(new Date(c.updatedAt), 'dd/MM/yyyy')}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCase(c);
                      setFormData(c);
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-indigo-600 bg-indigo-50 rounded-lg"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={(e) => handleDelete(c.id, e)}
                      className="p-2 text-red-600 bg-red-50 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Case Details View (Modal) */}
      <AnimatePresence>
        {viewingCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="bg-white w-full max-w-5xl h-full md:h-[90vh] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-4 md:p-6 bg-indigo-900 text-white flex items-center justify-between sticky top-0 z-10">
                <div className="min-w-0">
                  <h3 className="text-xl md:text-2xl font-bold truncate">{viewingCase.caseNumber || 'Expediente sin número'}</h3>
                  <p className="text-indigo-200 text-[10px] md:text-sm font-bold uppercase tracking-wider mt-1 truncate">Carátula: {viewingCase.caseTitle || '-'}</p>
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                  <button
                    onClick={() => {
                      setSelectedCase(viewingCase);
                      setFormData(viewingCase);
                      setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-600 px-3 py-1.5 md:px-4 md:py-2 rounded-xl transition-all text-xs md:text-sm"
                  >
                    <Edit2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Editar</span>
                  </button>
                  <button onClick={() => setViewingCase(null)} className="p-2 hover:bg-indigo-800 rounded-full transition-all">
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                {/* Left Column: Info */}
                <div className="lg:col-span-2 space-y-6 md:space-y-8">
                  <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                      <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2">Datos del Proceso</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400 font-medium">Jurisdicción</p>
                          <p className="text-slate-900 font-bold">{viewingCase.jurisdiction || '-'}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium">Tipo de Proceso</p>
                          <p className="text-slate-900 font-bold capitalize">{viewingCase.processType || '-'}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium">Rol en Proceso</p>
                          <p className="text-slate-900 font-bold capitalize">{viewingCase.roleInProcess || '-'}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium">Fecha Inicio</p>
                          <p className="text-slate-900 font-bold">{viewingCase.startDate || '-'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                      <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2">Asignación</h4>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 font-medium">Abogado Asignado</p>
                          <p className="text-sm font-bold text-slate-900">
                            {lawyers.find(l => l.uid === viewingCase.assignedLawyerId)?.displayName || 'Sin asignar'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                      <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2">Datos del Cliente</h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-slate-400">Nombre:</span> <span className="font-bold">{viewingCase.clientName}</span></p>
                        <p><span className="text-slate-400">DNI/CUIT:</span> <span className="font-bold">{viewingCase.clientData?.dni || viewingCase.clientData?.cuit || '-'}</span></p>
                        <p><span className="text-slate-400">Teléfono:</span> <span className="font-bold">{viewingCase.clientData?.phone || '-'}</span></p>
                        <p><span className="text-slate-400">Email:</span> <span className="font-bold">{viewingCase.clientData?.email || '-'}</span></p>
                        <p><span className="text-slate-400">Domicilio:</span> <span className="font-bold">{viewingCase.clientData?.address || '-'}</span></p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                      <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2">Datos de la Contraparte</h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-slate-400">Nombre:</span> <span className="font-bold">{viewingCase.opposingParty}</span></p>
                        <p><span className="text-slate-400">DNI/CUIT:</span> <span className="font-bold">{viewingCase.defendantData?.dni || viewingCase.defendantData?.cuit || '-'}</span></p>
                        <p><span className="text-slate-400">Teléfono:</span> <span className="font-bold">{viewingCase.defendantData?.phone || '-'}</span></p>
                        <p><span className="text-slate-400">Email:</span> <span className="font-bold">{viewingCase.defendantData?.email || '-'}</span></p>
                        <p><span className="text-slate-400">Domicilio:</span> <span className="font-bold">{viewingCase.defendantData?.address || '-'}</span></p>
                      </div>
                    </div>
                  </section>

                  <section className="bg-slate-50 p-6 rounded-2xl space-y-2">
                    <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2">Observaciones</h4>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{viewingCase.observations || 'Sin observaciones.'}</p>
                  </section>

                </div>

                {/* Right Column: Seguimiento & Documentos */}
                <div className="flex flex-col h-full space-y-6">
                  {/* Seguimiento */}
                  <div className="bg-white border border-slate-200 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-sm">
                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                      <h4 className="font-bold text-slate-900">Seguimiento del Caso</h4>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <div className="space-y-2">
                        <textarea 
                          placeholder="Escriba un nuevo seguimiento..."
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          rows={3}
                          value={newFollowUp}
                          onChange={(e) => setNewFollowUp(e.target.value)}
                        />
                        <button 
                          onClick={handleAddFollowUp}
                          disabled={!newFollowUp.trim()}
                          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all"
                        >
                          <Save className="h-4 w-4" />
                          Guardar Seguimiento
                        </button>
                      </div>

                      <div className="pt-4 space-y-4">
                        <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest">SEGUIMIENTOS ANTERIORES</h5>
                        {viewingCase.followUps && viewingCase.followUps.length > 0 ? (
                          [...viewingCase.followUps].reverse().map((f) => (
                            <div key={f.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                              <div className="flex justify-between items-center">
                                <p className="text-xs font-bold text-indigo-600">{format(new Date(f.date), 'dd/MM/yyyy HH:mm')}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{f.authorName || 'Sistema'}</p>
                              </div>
                              <p className="text-sm text-slate-700">{f.content}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400 text-center py-4">No hay seguimientos registrados.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Documentos */}
                  <div className="bg-white border border-slate-200 rounded-2xl h-72 flex flex-col overflow-hidden shadow-sm">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <h4 className="font-bold text-slate-900">Documentos</h4>
                      <label className="cursor-pointer p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 flex items-center gap-2 text-xs font-bold">
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {isUploading ? 'Subiendo...' : 'Subir'}
                        <input 
                          type="file" 
                          className="hidden" 
                          onChange={handleFileUpload}
                          disabled={isUploading}
                        />
                      </label>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      {viewingCase.documents && viewingCase.documents.length > 0 ? (
                        [...viewingCase.documents].reverse().map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group/doc">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 bg-white rounded-lg border border-slate-200">
                                <FileText className="h-4 w-4 text-slate-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">{doc.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{doc.uploadedBy} • {format(new Date(doc.uploadedAt), 'dd/MM/yy')}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => setPreviewDoc(doc)}
                                className="p-2 text-slate-400 hover:text-indigo-600 transition-all"
                                title="Previsualizar"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <a 
                                href={doc.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="p-2 text-slate-400 hover:text-indigo-600 transition-all"
                                title="Ver documento"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 py-8">
                          <Upload className="h-8 w-8 opacity-20" />
                          <p className="text-xs">Sin documentos cargados.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Document Preview Modal */}
      <AnimatePresence>
        {previewDoc && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-5xl h-full md:h-[90vh] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-slate-400" />
                  <h3 className="font-bold truncate max-w-md">{previewDoc.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    href={previewDoc.url} 
                    download={previewDoc.name}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
                  >
                    <Download className="h-4 w-4" />
                    Descargar
                  </a>
                  <button onClick={() => setPreviewDoc(null)} className="p-2 hover:bg-slate-800 rounded-full transition-all">
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-100 overflow-hidden flex items-center justify-center">
                {previewDoc.contentType?.startsWith('image/') ? (
                  <img 
                    src={previewDoc.url} 
                    alt={previewDoc.name} 
                    className="max-w-full max-h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : previewDoc.contentType === 'application/pdf' ? (
                  <iframe 
                    src={previewDoc.url} 
                    className="w-full h-full border-none"
                    title={previewDoc.name}
                  />
                ) : (
                  <div className="text-center space-y-4 p-8">
                    <div className="h-20 w-20 bg-white rounded-3xl shadow-sm border border-slate-200 flex items-center justify-center mx-auto">
                      <FileText className="h-10 w-10 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-slate-900 font-bold">Vista previa no disponible</p>
                      <p className="text-slate-500 text-sm">Este tipo de archivo ({previewDoc.contentType || 'desconocido'}) no se puede previsualizar directamente.</p>
                    </div>
                    <a 
                      href={previewDoc.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all"
                    >
                      <ExternalLink className="h-5 w-5" />
                      Abrir en nueva pestaña
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New/Edit Case Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center md:p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl h-full md:max-h-[90vh] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-900 text-white">
                <h3 className="text-xl font-bold">{selectedCase ? 'Editar Expediente' : 'Nuevo Expediente'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-indigo-800 rounded-full transition-all">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-8 overflow-y-auto space-y-8">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
                    {error}
                  </div>
                )}
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nº de Expediente</label>
                    <input 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.caseNumber}
                      onChange={e => setFormData({...formData, caseNumber: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Carátula</label>
                    <input 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.caseTitle}
                      onChange={e => setFormData({...formData, caseTitle: e.target.value})}
                      placeholder="Carátula oficial del tribunal"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Jurisdicción</label>
                    <select 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.jurisdiction}
                      onChange={e => setFormData({...formData, jurisdiction: e.target.value as any})}
                    >
                      <option value="">Seleccionar...</option>
                      {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                    <select 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value as any})}
                    >
                      <option value="activo">Activo</option>
                      <option value="archivado">Archivado</option>
                      <option value="paralizado">Paralizado</option>
                      <option value="cancelado">Cancelado</option>
                      <option value="terminado">Terminado</option>
                      <option value="renunciado">Renunciado</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Tipo de Proceso</label>
                    <select 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.processType}
                      onChange={e => setFormData({...formData, processType: e.target.value as any})}
                    >
                      <option value="">Seleccionar...</option>
                      {PROCESS_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Rol en Proceso</label>
                    <select 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.roleInProcess}
                      onChange={e => setFormData({...formData, roleInProcess: e.target.value as any})}
                    >
                      <option value="">Seleccionar...</option>
                      {ROLES_IN_PROCESS.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Fecha de Inicio</label>
                    <input 
                      type="date"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.startDate}
                      onChange={e => setFormData({...formData, startDate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Client Data */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                      <h4 className="font-bold text-indigo-600">Datos del Cliente</h4>
                      <button 
                        type="button"
                        onClick={() => setShowClientSelector(!showClientSelector)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                      >
                        {showClientSelector ? 'Ingreso Manual' : 'Seleccionar Existente'}
                      </button>
                    </div>

                    {showClientSelector ? (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Buscar cliente..." 
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            value={searchTermClient}
                            onChange={e => setSearchTermClient(e.target.value)}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 p-1 bg-slate-50 rounded-xl border border-slate-200">
                          {clients
                            .filter(c => c.displayName?.toLowerCase().includes(searchTermClient.toLowerCase()) || c.cuit?.includes(searchTermClient))
                            .map(client => (
                              <button
                                key={client.uid}
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    clientName: client.displayName || '',
                                    clientData: {
                                      dni: client.dni || '',
                                      cuit: client.cuit || '',
                                      phone: client.phone || '',
                                      email: client.email || '',
                                      address: ''
                                    }
                                  });
                                  setShowClientSelector(false);
                                  setSearchTermClient('');
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-sm"
                              >
                                <p className="font-bold text-slate-900">{client.displayName}</p>
                                <p className="text-xs text-slate-500">{client.email} • {client.cuit || 'Sin CUIT'}</p>
                              </button>
                            ))}
                          {clients.length === 0 && (
                            <p className="text-center py-4 text-xs text-slate-400">No hay clientes registrados.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Nombre Completo</label>
                          <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">DNI</label>
                            <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.clientData?.dni} onChange={e => setFormData({...formData, clientData: {...formData.clientData, dni: e.target.value}})} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">CUIT</label>
                            <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.clientData?.cuit} onChange={e => setFormData({...formData, clientData: {...formData.clientData, cuit: e.target.value}})} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Teléfono</label>
                            <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.clientData?.phone} onChange={e => setFormData({...formData, clientData: {...formData.clientData, phone: e.target.value}})} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Email</label>
                            <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.clientData?.email} onChange={e => setFormData({...formData, clientData: {...formData.clientData, email: e.target.value}})} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Domicilio</label>
                          <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.clientData?.address} onChange={e => setFormData({...formData, clientData: {...formData.clientData, address: e.target.value}})} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Defendant Data */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-red-600 border-b border-red-100 pb-2">Datos de la Contraparte</h4>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Nombre / Razón Social</label>
                        <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.opposingParty} onChange={e => setFormData({...formData, opposingParty: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">DNI</label>
                          <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.defendantData?.dni} onChange={e => setFormData({...formData, defendantData: {...formData.defendantData, dni: e.target.value}})} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">CUIT</label>
                          <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.defendantData?.cuit} onChange={e => setFormData({...formData, defendantData: {...formData.defendantData, cuit: e.target.value}})} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Teléfono</label>
                          <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.defendantData?.phone} onChange={e => setFormData({...formData, defendantData: {...formData.defendantData, phone: e.target.value}})} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Email</label>
                          <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.defendantData?.email} onChange={e => setFormData({...formData, defendantData: {...formData.defendantData, email: e.target.value}})} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Domicilio</label>
                        <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={formData.defendantData?.address} onChange={e => setFormData({...formData, defendantData: {...formData.defendantData, address: e.target.value}})} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Abogado Asignado</label>
                    <select 
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.assignedLawyerId}
                      onChange={e => setFormData({...formData, assignedLawyerId: e.target.value})}
                    >
                      <option value="">Seleccionar abogado...</option>
                      {lawyers.map(l => <option key={l.uid} value={l.uid}>{l.displayName}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Observaciones</label>
                    <textarea 
                      rows={4}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      value={formData.observations}
                      onChange={e => setFormData({...formData, observations: e.target.value})}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="px-8 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    {selectedCase ? 'Guardar Cambios' : 'Crear Expediente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={isDeleteModalOpen}
        title="Eliminar Expediente"
        message="¿Está seguro de que desea eliminar este expediente? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setCaseToDelete(null);
        }}
      />
    </div>
  );
}
