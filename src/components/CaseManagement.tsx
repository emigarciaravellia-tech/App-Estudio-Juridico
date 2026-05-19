import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, deleteDoc, arrayUnion, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { Case, FollowUp, UserProfile, DocumentMetadata } from '../types';
import { CaseRepository } from '../services/caseRepository';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import {
  Plus, Search, Edit2, Trash2, X, Save, Calendar as CalendarIcon,
  User, FileText, Upload, Download, ExternalLink, Loader2, Eye,
  Gavel, Scale, FolderOpen, ChevronRight, ArrowUpRight, Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import ConfirmationModal from './ConfirmationModal';

const JURISDICTIONS = [
  'Cordoba', 'Alta Gracia', 'Rio segundo', 'Rio primero', 'Rio tercero',
  'Carlos Paz', 'Cosquin', 'Jesus Maria', 'Rio Cuarto', 'Villa Maria'
];
const PROCESS_TYPES = ['mediacion', 'juicio', 'asesoramiento', 'otro'];
const ROLES_IN_PROCESS = ['actor', 'demandado', 'asesoramiento', 'tercero', 'otro'];

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; color: string }> = {
  activo:     { label: 'Activo',     dot: 'var(--forest)',   bg: 'var(--forest-soft)',  color: 'var(--forest)' },
  paralizado: { label: 'Paralizado', dot: 'var(--mustard)',  bg: 'var(--mustard-soft)', color: 'var(--mustard)' },
  terminado:  { label: 'Terminado',  dot: 'var(--slate-c)',  bg: 'var(--slate-soft)',   color: 'var(--slate-c)' },
  archivado:  { label: 'Archivado',  dot: 'var(--ink-mute)', bg: 'var(--paper-2)',      color: 'var(--ink-mute)' },
  cancelado:  { label: 'Cancelado',  dot: 'var(--oxblood)',  bg: 'var(--oxblood-soft)', color: 'var(--oxblood)' },
  renunciado: { label: 'Renunciado', dot: 'var(--oxblood)',  bg: 'var(--oxblood-soft)', color: 'var(--oxblood)' },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['archivado'];
  return (
    <span className="lm-chip" style={{ background: cfg.bg, color: cfg.color }}>
      <span className="lm-dot" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

export default function CaseManagement() {
  const { profile, isAdmin, isLawyer, isAssistant } = useAuth();
  const location = useLocation();
  const [cases, setCases] = useState<Case[]>([]);
  const [lawyers, setLawyers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTermClient, setSearchTermClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLawyer, setFilterLawyer] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === 'true') setIsModalOpen(true);
  }, [location.search]);

  const [showClientSelector, setShowClientSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [viewingCase, setViewingCase] = useState<Case | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'seguimiento' | 'documentos'>('info');
  const [newFollowUp, setNewFollowUp] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentMetadata | null>(null);
  const [formData, setFormData] = useState<Partial<Case>>({
    caseNumber: '', caseTitle: '', clientName: '', opposingParty: '',
    jurisdiction: '', status: 'activo', assignedLawyerId: '', notes: '',
    startDate: '', systemDate: format(new Date(), 'yyyy-MM-dd'),
    processType: '', roleInProcess: '',
    clientData: { address: '', phone: '', email: '', dni: '', cuit: '' },
    defendantData: { address: '', phone: '', email: '', dni: '', cuit: '' },
    observations: ''
  });

  useEffect(() => {
    const unsubscribe = CaseRepository.subscribeToCases(setCases);
    const qLawyers = query(collection(db, 'users'));
    const unsubLawyers = onSnapshot(qLawyers, snap => {
      setLawyers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)).filter(u => u.role === 'lawyer' || u.role === 'admin'));
    }, e => handleFirestoreError(e, OperationType.LIST, 'users'));
    const qClients = query(collection(db, 'users'), where('role', '==', 'client'));
    const unsubClients = onSnapshot(qClients, snap => {
      setClients(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, e => handleFirestoreError(e, OperationType.LIST, 'users'));
    return () => { unsubscribe(); unsubLawyers(); unsubClients(); };
  }, []);

  useEffect(() => {
    if (viewingCase) {
      const updated = cases.find(c => c.id === viewingCase.id);
      if (updated) setViewingCase(updated);
    }
  }, [cases, viewingCase?.id]);

  const resetForm = () => setFormData({
    caseNumber: '', caseTitle: '', clientName: '', opposingParty: '',
    jurisdiction: '', status: 'activo', assignedLawyerId: '', notes: '',
    startDate: '', systemDate: format(new Date(), 'yyyy-MM-dd'),
    processType: '', roleInProcess: '',
    clientData: { address: '', phone: '', email: '', dni: '', cuit: '' },
    defendantData: { address: '', phone: '', email: '', dni: '', cuit: '' },
    observations: ''
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const data = { ...formData, caseNumber: formData.caseNumber || '', caseTitle: formData.caseTitle || '', clientName: formData.clientName || '', status: formData.status || 'activo' };
      if (selectedCase) {
        await CaseRepository.update(selectedCase.id, data);
      } else {
        await CaseRepository.create(data);
      }
      setIsModalOpen(false);
      setSelectedCase(null);
      resetForm();
    } catch (err) {
      setError('Error al guardar el expediente. Verifique sus permisos y campos obligatorios.');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCaseToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!caseToDelete) return;
    try {
      await deleteDoc(doc(db, 'cases', caseToDelete));
      if (viewingCase?.id === caseToDelete) setViewingCase(null);
      setIsDeleteModalOpen(false);
      setCaseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cases/${caseToDelete}`);
    }
  };

  const handleAddFollowUp = async () => {
    if (!newFollowUp.trim() || !viewingCase) return;
    const followUp: FollowUp = { id: crypto.randomUUID(), content: newFollowUp, date: new Date().toISOString(), authorName: profile?.displayName || 'Usuario' };
    try {
      await updateDoc(doc(db, 'cases', viewingCase.id), { followUps: arrayUnion(followUp), updatedAt: new Date().toISOString() });
      setNewFollowUp('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${viewingCase.id}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingCase) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `cases/${viewingCase.id}/documents/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      const docMetadata: DocumentMetadata = { id: crypto.randomUUID(), caseId: viewingCase.id, name: file.name, url: downloadURL, uploadedBy: profile?.displayName || 'Usuario', uploadedAt: new Date().toISOString(), contentType: file.type };
      await updateDoc(doc(db, 'cases', viewingCase.id), { documents: arrayUnion(docMetadata), updatedAt: new Date().toISOString() });
    } catch (error: any) {
      setError(error.code === 'storage/unauthorized' ? 'Sin permisos para subir archivos.' : 'Error al subir el archivo.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const exportToCSV = () => {
    const headers = ['Nº Expediente', 'Carátula', 'Cliente', 'Contraparte', 'Estado', 'Abogado', 'Jurisdicción', 'Tipo', 'Rol', 'Inicio', 'Actualización'];
    const rows = filteredCases.map(c => [
      c.caseNumber, c.caseTitle, c.clientName, c.opposingParty, c.status,
      lawyers.find(l => l.uid === c.assignedLawyerId)?.displayName || 'Sin asignar',
      c.jurisdiction, c.processType, c.roleInProcess, c.startDate,
      format(new Date(c.updatedAt), 'dd/MM/yyyy')
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `expedientes_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
  };

  const filteredCases = cases.filter(c => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q || c.caseNumber.toLowerCase().includes(q) || c.clientName.toLowerCase().includes(q) || c.opposingParty.toLowerCase().includes(q) || (c.caseTitle || '').toLowerCase().includes(q);
    const matchStatus = !filterStatus || c.status === filterStatus;
    const matchLawyer = !filterLawyer || c.assignedLawyerId === filterLawyer;
    return matchSearch && matchStatus && matchLawyer;
  });

  const activeCount  = cases.filter(c => c.status === 'activo').length;
  const totalCount   = cases.length;

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <p className="lm-eyebrow" style={{ marginBottom: 6 }}>Gestión de causas</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="lm-display" style={{ fontSize: 28, fontWeight: 500, color: 'var(--ink)', margin: 0, lineHeight: 1.1 }}>
              Expedientes
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
              {activeCount} activos · {totalCount} en total
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportToCSV} className="lm-btn lm-btn--ghost lm-btn--sm">
              <FileText size={13} />
              Exportar CSV
            </button>
            {(isAdmin || isLawyer || isAssistant) && (
              <button
                onClick={() => { setSelectedCase(null); resetForm(); setIsModalOpen(true); }}
                className="lm-btn lm-btn--primary lm-btn--sm"
              >
                <Plus size={13} />
                Nuevo expediente
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="lm-card" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220, background: 'var(--paper-3)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: '7px 11px' }}>
          <Search size={13} color="var(--ink-3)" />
          <input
            placeholder="Buscar por número, cliente, carátula…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}
          />
          {searchTerm && <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)', padding: 0, lineHeight: 1 }}><X size={12} /></button>}
        </div>

        {/* Status segmented */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--paper-2)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: 3 }}>
          {[['', 'Todos'], ['activo', 'Activos'], ['paralizado', 'Paralizados'], ['terminado', 'Terminados']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              style={{
                padding: '4px 10px', borderRadius: 4, border: 0, cursor: 'pointer',
                fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                background: filterStatus === val ? 'var(--surface)' : 'transparent',
                color: filterStatus === val ? 'var(--ink)' : 'var(--ink-3)',
                boxShadow: filterStatus === val ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                transition: 'all .12s',
              }}
            >{label}</button>
          ))}
        </div>

        {/* Lawyer filter */}
        <select
          value={filterLawyer}
          onChange={e => setFilterLawyer(e.target.value)}
          style={{ padding: '6px 10px', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', background: 'var(--paper-3)', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)', outline: 'none' }}
        >
          <option value="">Todos los abogados</option>
          {lawyers.map(l => <option key={l.uid} value={l.uid}>{l.displayName}</option>)}
        </select>

        {(filterStatus || filterLawyer) && (
          <button onClick={() => { setFilterStatus(''); setFilterLawyer(''); }} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            <X size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
            Limpiar
          </button>
        )}
      </div>

      {/* Ledger table */}
      <div className="lm-hscroll">
      <div className="lm-card" style={{ overflow: 'hidden', minWidth: 720 }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140px 1fr 160px 110px 120px 44px',
          padding: '8px 16px',
          borderBottom: '0.5px solid var(--rule)',
          background: 'var(--paper-2)',
        }}>
          {['Nº Expediente', 'Carátula / Partes', 'Abogado', 'Jurisdicción', 'Estado', ''].map(h => (
            <span key={h} className="lm-eyebrow" style={{ fontSize: 9.5 }}>{h}</span>
          ))}
        </div>

        {/* Empty state */}
        {filteredCases.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Scale size={32} color="var(--rule)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13.5, color: 'var(--ink-3)', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
              {searchTerm || filterStatus || filterLawyer ? 'Sin resultados para los filtros aplicados.' : 'Aún no hay expedientes registrados.'}
            </p>
          </div>
        )}

        {/* Rows */}
        {filteredCases.map(c => {
          const lawyer = lawyers.find(l => l.uid === c.assignedLawyerId);
          return (
            <div
              key={c.id}
              className="lm-row"
              style={{ gridTemplateColumns: '140px 1fr 160px 110px 120px 44px' }}
              onClick={() => { setViewingCase(c); setActiveTab('info'); }}
            >
              <div>
                <span className="lm-mono" style={{ fontSize: 12, color: 'var(--oxblood)', fontWeight: 600 }}>
                  {c.caseNumber || 'S/N'}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.caseTitle || '—'}
                </p>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.clientName} <span style={{ opacity: 0.5 }}>vs.</span> {c.opposingParty || '—'}
                </p>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lawyer?.displayName || <span style={{ color: 'var(--ink-mute)', fontStyle: 'italic' }}>Sin asignar</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.jurisdiction || '—'}</div>
              <div><StatusChip status={c.status} /></div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button
                  title="Editar"
                  onClick={e => { e.stopPropagation(); setSelectedCase(c); setFormData(c); setIsModalOpen(true); }}
                  style={{ background: 'none', border: 0, cursor: 'pointer', padding: 4, color: 'var(--ink-3)', borderRadius: 'var(--r-sm)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                >
                  <Edit2 size={13} />
                </button>
                {isAdmin && (
                  <button
                    title="Eliminar"
                    onClick={e => handleDelete(c.id, e)}
                    style={{ background: 'none', border: 0, cursor: 'pointer', padding: 4, color: 'var(--ink-3)', borderRadius: 'var(--r-sm)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--oxblood)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* ── Case Detail Drawer ── */}
      <AnimatePresence>
        {viewingCase && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setViewingCase(null)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(20,15,8,0.45)', backdropFilter: 'blur(2px)' }}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              style={{
                position: 'relative', zIndex: 1,
                width: '100%', maxWidth: 820,
                background: 'var(--paper)',
                borderLeft: '0.5px solid var(--rule)',
                display: 'flex', flexDirection: 'column',
                height: '100%',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {/* Drawer header */}
              <div style={{
                padding: '18px 24px 0',
                background: 'var(--sidebar-bg)',
                borderBottom: '0.5px solid rgba(221,201,159,0.15)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <p className="lm-eyebrow" style={{ color: 'var(--sidebar-fg-mute)', marginBottom: 4 }}>Expediente</p>
                    <h2 className="lm-mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--sidebar-fg)', margin: 0 }}>
                      {viewingCase.caseNumber || 'S/N'}
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--sidebar-fg-mute)', marginTop: 2, fontStyle: 'italic' }}>
                      {viewingCase.caseTitle || 'Sin carátula'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={() => { setSelectedCase(viewingCase); setFormData(viewingCase); setIsModalOpen(true); }}
                      className="lm-btn lm-btn--sm"
                      style={{ background: 'rgba(221,201,159,0.12)', border: '0.5px solid rgba(221,201,159,0.25)', color: 'var(--sidebar-fg)' }}
                    >
                      <Edit2 size={12} /> Editar
                    </button>
                    <button onClick={() => setViewingCase(null)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--sidebar-fg-mute)', padding: 6 }}>
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Folder tabs */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {([['info', 'Información'], ['seguimiento', 'Seguimiento'], ['documentos', 'Documentos']] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`lm-folder-tab${activeTab === tab ? ' lm-folder-tab--active' : ''}`}
                      style={activeTab !== tab ? { background: 'rgba(221,201,159,0.07)', color: 'var(--sidebar-fg-mute)', borderColor: 'rgba(221,201,159,0.15)' } : {}}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="lm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

                {/* INFO TAB */}
                {activeTab === 'info' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Status + lawyer strip */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <div className="lm-card" style={{ flex: 1, minWidth: 200, padding: '14px 18px' }}>
                        <p className="lm-eyebrow" style={{ marginBottom: 8 }}>Estado</p>
                        <StatusChip status={viewingCase.status} />
                      </div>
                      <div className="lm-card" style={{ flex: 2, minWidth: 220, padding: '14px 18px' }}>
                        <p className="lm-eyebrow" style={{ marginBottom: 8 }}>Abogado asignado</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--oxblood)', color: '#fbf6e9', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                            {lawyers.find(l => l.uid === viewingCase.assignedLawyerId)?.displayName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'SA'}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                            {lawyers.find(l => l.uid === viewingCase.assignedLawyerId)?.displayName || 'Sin asignar'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Process data */}
                    <div className="lm-card" style={{ padding: '16px 18px' }}>
                      <p className="lm-eyebrow" style={{ marginBottom: 14 }}>Datos del proceso</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 24px' }}>
                        {[
                          ['Jurisdicción', viewingCase.jurisdiction],
                          ['Tipo de proceso', viewingCase.processType],
                          ['Rol', viewingCase.roleInProcess],
                          ['Fecha de inicio', viewingCase.startDate],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <p style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-mute)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</p>
                            <p style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, margin: 0, textTransform: 'capitalize' }}>{val || '—'}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Parties */}
                    <div className="lm-two-col" style={{ gap: 12 }}>
                      {/* Client */}
                      <div className="lm-card" style={{ padding: '16px 18px' }}>
                        <p className="lm-eyebrow" style={{ marginBottom: 14 }}>Cliente (actor)</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{viewingCase.clientName || '—'}</p>
                          <hr className="lm-divider" style={{ margin: '4px 0' }} />
                          {[
                            ['DNI', viewingCase.clientData?.dni],
                            ['CUIT', viewingCase.clientData?.cuit],
                            ['Teléfono', viewingCase.clientData?.phone],
                            ['Email', viewingCase.clientData?.email],
                            ['Domicilio', viewingCase.clientData?.address],
                          ].map(([k, v]) => v ? (
                            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                              <span style={{ color: 'var(--ink-mute)', minWidth: 64 }}>{k}</span>
                              <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{v}</span>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                      {/* Opposing party */}
                      <div className="lm-card" style={{ padding: '16px 18px', borderColor: 'var(--oxblood-soft)' }}>
                        <p className="lm-eyebrow" style={{ marginBottom: 14, color: 'var(--oxblood)' }}>Contraparte (demandado)</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{viewingCase.opposingParty || '—'}</p>
                          <hr className="lm-divider" style={{ margin: '4px 0' }} />
                          {[
                            ['DNI', viewingCase.defendantData?.dni],
                            ['CUIT', viewingCase.defendantData?.cuit],
                            ['Teléfono', viewingCase.defendantData?.phone],
                            ['Email', viewingCase.defendantData?.email],
                            ['Domicilio', viewingCase.defendantData?.address],
                          ].map(([k, v]) => v ? (
                            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                              <span style={{ color: 'var(--ink-mute)', minWidth: 64 }}>{k}</span>
                              <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{v}</span>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    </div>

                    {/* Observations */}
                    {viewingCase.observations && (
                      <div className="lm-card" style={{ padding: '16px 18px' }}>
                        <p className="lm-eyebrow" style={{ marginBottom: 10 }}>Observaciones</p>
                        <p style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>
                          {viewingCase.observations}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* SEGUIMIENTO TAB */}
                {activeTab === 'seguimiento' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* New entry */}
                    <div className="lm-card" style={{ padding: '16px 18px' }}>
                      <p className="lm-eyebrow" style={{ marginBottom: 10 }}>Nuevo seguimiento</p>
                      <textarea
                        placeholder="Registre una novedad, movimiento o nota del expediente…"
                        className="lm-textarea"
                        rows={3}
                        value={newFollowUp}
                        onChange={e => setNewFollowUp(e.target.value)}
                        style={{ marginBottom: 10, resize: 'none' }}
                      />
                      <button
                        onClick={handleAddFollowUp}
                        disabled={!newFollowUp.trim()}
                        className="lm-btn lm-btn--primary lm-btn--sm"
                        style={{ opacity: newFollowUp.trim() ? 1 : 0.5 }}
                      >
                        <Save size={12} /> Guardar
                      </button>
                    </div>

                    {/* History */}
                    {viewingCase.followUps && viewingCase.followUps.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {[...viewingCase.followUps].reverse().map((f, i, arr) => (
                          <div key={f.id} style={{ display: 'flex', gap: 14, position: 'relative' }}>
                            {/* Timeline connector */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 20 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rule-2)', border: '1.5px solid var(--rule)', marginTop: 18, flexShrink: 0 }} />
                              {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--rule-soft)', marginTop: 4 }} />}
                            </div>
                            <div style={{ flex: 1, paddingBottom: 16 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, marginTop: 12 }}>
                                <span className="lm-mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                                  {format(new Date(f.date), 'dd/MM/yyyy HH:mm')}
                                </span>
                                <span className="lm-eyebrow" style={{ fontSize: 9.5 }}>{f.authorName}</span>
                              </div>
                              <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.55, margin: 0 }}>{f.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13, fontStyle: 'italic', padding: '24px 0' }}>
                        Sin seguimientos registrados.
                      </p>
                    )}
                  </div>
                )}

                {/* DOCUMENTOS TAB */}
                {activeTab === 'documentos' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Upload */}
                    <div className="lm-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>
                        {viewingCase.documents?.length || 0} documento{(viewingCase.documents?.length || 0) !== 1 ? 's' : ''} adjunto{(viewingCase.documents?.length || 0) !== 1 ? 's' : ''}
                      </p>
                      <label className="lm-btn lm-btn--primary lm-btn--sm" style={{ cursor: 'pointer' }}>
                        {isUploading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />}
                        {isUploading ? 'Subiendo…' : 'Subir archivo'}
                        <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} />
                      </label>
                    </div>

                    {/* File list */}
                    {viewingCase.documents && viewingCase.documents.length > 0 ? (
                      <div className="lm-card" style={{ overflow: 'hidden' }}>
                        {[...viewingCase.documents].reverse().map((document, i, arr) => (
                          <div
                            key={document.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 16px',
                              borderBottom: i < arr.length - 1 ? '0.5px solid var(--rule-soft)' : 'none',
                            }}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--paper-2)', border: '0.5px solid var(--rule)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              <FileText size={14} color="var(--ink-3)" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.name}</p>
                              <p style={{ margin: 0, fontSize: 10.5, color: 'var(--ink-mute)' }}>{document.uploadedBy} · {format(new Date(document.uploadedAt), 'dd/MM/yy')}</p>
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => setPreviewDoc(document)} title="Previsualizar" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)', padding: 5 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
                                <Eye size={14} />
                              </button>
                              <a href={document.url} target="_blank" rel="noopener noreferrer" title="Abrir" style={{ color: 'var(--ink-3)', padding: 5, lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
                                <ExternalLink size={14} />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <Upload size={28} color="var(--rule)" style={{ margin: '0 auto 10px', display: 'block' }} />
                        <p style={{ fontSize: 13, color: 'var(--ink-mute)', fontStyle: 'italic' }}>Sin documentos adjuntos.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Document Preview Modal */}
      <AnimatePresence>
        {previewDoc && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(20,15,8,0.8)', backdropFilter: 'blur(4px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ background: 'var(--paper)', borderRadius: 'var(--r-lg)', overflow: 'hidden', width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}
            >
              <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--sidebar-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileText size={14} color="var(--sidebar-fg-mute)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sidebar-fg)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewDoc.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={previewDoc.url} download={previewDoc.name} className="lm-btn lm-btn--sm" style={{ background: 'rgba(221,201,159,0.12)', border: '0.5px solid rgba(221,201,159,0.2)', color: 'var(--sidebar-fg)' }}>
                    <Download size={12} /> Descargar
                  </a>
                  <button onClick={() => setPreviewDoc(null)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--sidebar-fg-mute)', padding: 6 }}><X size={16} /></button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'hidden', background: 'var(--paper-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                {previewDoc.contentType?.startsWith('image/') ? (
                  <img src={previewDoc.url} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} referrerPolicy="no-referrer" />
                ) : previewDoc.contentType === 'application/pdf' ? (
                  <iframe src={previewDoc.url} style={{ width: '100%', height: '70vh', border: 'none' }} title={previewDoc.name} />
                ) : (
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <FileText size={40} color="var(--rule)" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Vista previa no disponible para este tipo de archivo.</p>
                    <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="lm-btn lm-btn--primary lm-btn--sm" style={{ marginTop: 12 }}>
                      <ExternalLink size={12} /> Abrir en nueva pestaña
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── New/Edit Case Modal ── */}
      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(20,15,8,0.5)', backdropFilter: 'blur(3px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ background: 'var(--paper)', width: '100%', maxWidth: 820, maxHeight: '90vh', borderRadius: 'var(--r-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', border: '0.5px solid var(--rule)' }}
            >
              {/* Modal header */}
              <div style={{ padding: '18px 24px', background: 'var(--sidebar-bg)', borderBottom: '0.5px solid rgba(221,201,159,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <p className="lm-eyebrow" style={{ color: 'var(--sidebar-fg-mute)', marginBottom: 2 }}>
                    {selectedCase ? 'Modificar registro' : 'Nuevo registro'}
                  </p>
                  <h3 className="lm-display" style={{ fontSize: 18, color: 'var(--sidebar-fg)', margin: 0 }}>
                    {selectedCase ? 'Editar expediente' : 'Nuevo expediente'}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--sidebar-fg-mute)', padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="lm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
                {error && (
                  <div style={{ padding: '10px 14px', background: 'var(--oxblood-soft)', border: '0.5px solid var(--oxblood)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--oxblood)' }}>
                    {error}
                  </div>
                )}

                {/* Row 1: core fields */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                  {[
                    { label: 'Nº de expediente', key: 'caseNumber', type: 'text' },
                    { label: 'Carátula', key: 'caseTitle', type: 'text' },
                    { label: 'Fecha de inicio', key: 'startDate', type: 'date' },
                  ].map(({ label, key, type }) => (
                    <div key={key}>
                      <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>{label}</label>
                      <input
                        type={type}
                        className="lm-input"
                        value={(formData as any)[key] || ''}
                        onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Jurisdicción</label>
                    <select className="lm-select" value={formData.jurisdiction} onChange={e => setFormData({ ...formData, jurisdiction: e.target.value as any })}>
                      <option value="">Seleccionar…</option>
                      {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Tipo de proceso</label>
                    <select className="lm-select" value={formData.processType} onChange={e => setFormData({ ...formData, processType: e.target.value as any })}>
                      <option value="">Seleccionar…</option>
                      {PROCESS_TYPES.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Rol en proceso</label>
                    <select className="lm-select" value={formData.roleInProcess} onChange={e => setFormData({ ...formData, roleInProcess: e.target.value as any })}>
                      <option value="">Seleccionar…</option>
                      {ROLES_IN_PROCESS.map(r => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Estado</label>
                    <select className="lm-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })}>
                      <option value="activo">Activo</option>
                      <option value="paralizado">Paralizado</option>
                      <option value="terminado">Terminado</option>
                      <option value="archivado">Archivado</option>
                      <option value="cancelado">Cancelado</option>
                      <option value="renunciado">Renunciado</option>
                    </select>
                  </div>
                </div>

                <hr className="lm-divider" />

                {/* Parties */}
                <div className="lm-two-col" style={{ gap: 20 }}>
                  {/* Client */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', margin: 0 }}>Cliente (actor)</p>
                      <button type="button" onClick={() => setShowClientSelector(!showClientSelector)} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                        {showClientSelector ? 'Ingreso manual' : 'Seleccionar existente'}
                      </button>
                    </div>
                    {showClientSelector ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: 'var(--paper-3)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: '6px 10px' }}>
                          <Search size={12} color="var(--ink-3)" />
                          <input placeholder="Buscar cliente…" value={searchTermClient} onChange={e => setSearchTermClient(e.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 12.5, fontFamily: 'var(--font-sans)', color: 'var(--ink)' }} />
                        </div>
                        <div className="lm-card lm-scroll" style={{ maxHeight: 160, overflowY: 'auto' }}>
                          {clients.filter(c => (c.displayName || '').toLowerCase().includes(searchTermClient.toLowerCase())).map(client => (
                            <button key={client.uid} type="button" onClick={() => { setFormData({ ...formData, clientName: client.displayName || '', clientData: { dni: client.dni || '', cuit: client.cuit || '', phone: client.phone || '', email: client.email || '', address: '' } }); setShowClientSelector(false); setSearchTermClient(''); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 0, cursor: 'pointer', borderBottom: '0.5px solid var(--rule-soft)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{client.displayName}</p>
                              <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-3)' }}>{client.email}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input className="lm-input" placeholder="Nombre completo" value={formData.clientName} onChange={e => setFormData({ ...formData, clientName: e.target.value })} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <input className="lm-input" placeholder="DNI" value={formData.clientData?.dni} onChange={e => setFormData({ ...formData, clientData: { ...formData.clientData, dni: e.target.value } })} />
                          <input className="lm-input" placeholder="CUIT" value={formData.clientData?.cuit} onChange={e => setFormData({ ...formData, clientData: { ...formData.clientData, cuit: e.target.value } })} />
                          <input className="lm-input" placeholder="Teléfono" value={formData.clientData?.phone} onChange={e => setFormData({ ...formData, clientData: { ...formData.clientData, phone: e.target.value } })} />
                          <input className="lm-input" placeholder="Email" value={formData.clientData?.email} onChange={e => setFormData({ ...formData, clientData: { ...formData.clientData, email: e.target.value } })} />
                        </div>
                        <input className="lm-input" placeholder="Domicilio" value={formData.clientData?.address} onChange={e => setFormData({ ...formData, clientData: { ...formData.clientData, address: e.target.value } })} />
                      </div>
                    )}
                  </div>

                  {/* Opposing party */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--oxblood)', margin: 0 }}>Contraparte (demandado)</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="lm-input" placeholder="Nombre / Razón social" value={formData.opposingParty} onChange={e => setFormData({ ...formData, opposingParty: e.target.value })} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <input className="lm-input" placeholder="DNI" value={formData.defendantData?.dni} onChange={e => setFormData({ ...formData, defendantData: { ...formData.defendantData, dni: e.target.value } })} />
                        <input className="lm-input" placeholder="CUIT" value={formData.defendantData?.cuit} onChange={e => setFormData({ ...formData, defendantData: { ...formData.defendantData, cuit: e.target.value } })} />
                        <input className="lm-input" placeholder="Teléfono" value={formData.defendantData?.phone} onChange={e => setFormData({ ...formData, defendantData: { ...formData.defendantData, phone: e.target.value } })} />
                        <input className="lm-input" placeholder="Email" value={formData.defendantData?.email} onChange={e => setFormData({ ...formData, defendantData: { ...formData.defendantData, email: e.target.value } })} />
                      </div>
                      <input className="lm-input" placeholder="Domicilio" value={formData.defendantData?.address} onChange={e => setFormData({ ...formData, defendantData: { ...formData.defendantData, address: e.target.value } })} />
                    </div>
                  </div>
                </div>

                <hr className="lm-divider" />

                {/* Lawyer + observations */}
                <div className="lm-case-cols" style={{ gap: 20 }}>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Abogado asignado</label>
                    <select className="lm-select" value={formData.assignedLawyerId} onChange={e => setFormData({ ...formData, assignedLawyerId: e.target.value })}>
                      <option value="">Sin asignar</option>
                      {lawyers.map(l => <option key={l.uid} value={l.uid}>{l.displayName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Observaciones</label>
                    <textarea className="lm-textarea" rows={3} value={formData.observations} onChange={e => setFormData({ ...formData, observations: e.target.value })} style={{ resize: 'none' }} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="lm-btn lm-btn--ghost lm-btn--sm">Cancelar</button>
                  <button type="submit" className="lm-btn lm-btn--primary lm-btn--sm">
                    {selectedCase ? 'Guardar cambios' : 'Crear expediente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Eliminar expediente"
        message="¿Está seguro de que desea eliminar este expediente? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => { setIsDeleteModalOpen(false); setCaseToDelete(null); }}
      />
    </div>
  );
}
