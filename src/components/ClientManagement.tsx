import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, where, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Case } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Users, Plus, Search, Mail, Phone, FileText, ChevronRight, User, Trash2, Edit2, X, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import ConfirmationModal from './ConfirmationModal';

export default function ClientManagement() {
  const { isAdmin, isLawyer, isAssistant } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [viewingClient, setViewingClient] = useState<UserProfile | null>(null);
  const [editingClient, setEditingClient] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    displayName: '', email: '', phone: '', cuit: '', dni: '', additionalInfo: '', role: 'client' as const
  });

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'client'));
    const unsubClients = onSnapshot(q, snap => {
      setClients(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, e => handleFirestoreError(e, OperationType.LIST, 'users'));

    const qCases = query(collection(db, 'cases'));
    const unsubCases = onSnapshot(qCases, snap => {
      setCases(snap.docs.map(d => ({ id: d.id, ...d.data() } as Case)));
    }, e => handleFirestoreError(e, OperationType.LIST, 'cases'));

    return () => { unsubClients(); unsubCases(); };
  }, []);

  const openNew = () => {
    setEditingClient(null);
    setFormData({ displayName: '', email: '', phone: '', cuit: '', dni: '', additionalInfo: '', role: 'client' });
    setIsModalOpen(true);
  };

  const openEdit = (client: UserProfile) => {
    setEditingClient(client);
    setFormData({ displayName: client.displayName || '', email: client.email || '', phone: client.phone || '', cuit: client.cuit || '', dni: client.dni || '', additionalInfo: client.additionalInfo || '', role: 'client' });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingClient) {
        await updateDoc(doc(db, 'users', editingClient.uid), formData);
      } else {
        const newRef = doc(collection(db, 'users'));
        await setDoc(newRef, { ...formData, uid: newRef.id, createdAt: new Date().toISOString() });
      }
      setIsModalOpen(false);
      setEditingClient(null);
    } catch (err) {
      setError('Error al guardar el cliente. Verifique sus permisos.');
      handleFirestoreError(err, editingClient ? OperationType.UPDATE : OperationType.CREATE, editingClient ? `users/${editingClient.uid}` : 'users');
    }
  };

  const handleDelete = (uid: string) => { setClientToDelete(uid); setIsDeleteModalOpen(true); };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', clientToDelete));
      if (viewingClient?.uid === clientToDelete) setViewingClient(null);
      setIsDeleteModalOpen(false);
      setClientToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${clientToDelete}`);
    }
  };

  const filteredClients = clients.filter(c =>
    (c.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.cuit || '').includes(searchTerm) ||
    (c.dni || '').includes(searchTerm)
  );

  const clientCases = viewingClient
    ? cases.filter(c => c.clientName?.toLowerCase() === viewingClient.displayName?.toLowerCase() || c.clientData?.email === viewingClient.email)
    : [];

  const initials = (name?: string) => name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p className="lm-eyebrow" style={{ marginBottom: 6 }}>Directorio</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="lm-display" style={{ fontSize: 28, fontWeight: 500, color: 'var(--ink)', margin: 0, lineHeight: 1.1 }}>
              Clientes
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
              {clients.length} {clients.length === 1 ? 'cliente registrado' : 'clientes registrados'}
            </p>
          </div>
          {(isAdmin || isLawyer || isAssistant) && (
            <button onClick={openNew} className="lm-btn lm-btn--primary lm-btn--sm">
              <Plus size={13} /> Nuevo cliente
            </button>
          )}
        </div>
      </div>

      {/* Master–detail layout */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* List panel */}
        <div style={{ width: 280, flexShrink: 0 }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-3)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: '7px 11px', marginBottom: 10 }}>
            <Search size={13} color="var(--ink-3)" />
            <input
              placeholder="Buscar clientes…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}
            />
          </div>

          {/* Client list */}
          <div className="lm-card lm-scroll" style={{ overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
            {filteredClients.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Users size={24} color="var(--rule)" style={{ margin: '0 auto 8px', display: 'block' }} />
                <p style={{ fontSize: 12.5, color: 'var(--ink-mute)', fontStyle: 'italic' }}>
                  {searchTerm ? 'Sin resultados.' : 'Sin clientes aún.'}
                </p>
              </div>
            )}
            {filteredClients.map(client => {
              const active = viewingClient?.uid === client.uid;
              return (
                <button
                  key={client.uid}
                  onClick={() => setViewingClient(client)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', textAlign: 'left',
                    padding: '10px 14px',
                    background: active ? 'var(--paper-2)' : 'transparent',
                    border: 0, borderBottom: '0.5px solid var(--rule-soft)',
                    cursor: 'pointer',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--paper-3)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: active ? 'var(--oxblood)' : 'var(--paper-2)',
                    color: active ? '#fbf6e9' : 'var(--ink-3)',
                    border: '0.5px solid var(--rule)',
                    display: 'grid', placeItems: 'center',
                    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
                  }}>
                    {initials(client.displayName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {client.displayName}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {client.email}
                    </p>
                  </div>
                  <ChevronRight size={13} color={active ? 'var(--ink-3)' : 'var(--rule)'} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <AnimatePresence mode="wait">
            {viewingClient ? (
              <motion.div
                key={viewingClient.uid}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {/* Ficha header */}
                <div className="lm-card" style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'var(--oxblood)', color: '#fbf6e9',
                        display: 'grid', placeItems: 'center',
                        fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-display)',
                        flexShrink: 0,
                      }}>
                        {initials(viewingClient.displayName)}
                      </div>
                      <div>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>
                          {viewingClient.displayName}
                        </h2>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>
                          Cliente desde {viewingClient.createdAt ? new Date(viewingClient.createdAt).toLocaleDateString('es-AR') : 'N/D'}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(viewingClient)} className="lm-btn lm-btn--ghost lm-btn--sm">
                        <Edit2 size={12} /> Editar
                      </button>
                      {(isAdmin || isLawyer) && (
                        <button onClick={() => handleDelete(viewingClient.uid)} style={{ background: 'none', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: '5px 8px', cursor: 'pointer', color: 'var(--ink-3)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--oxblood)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Contact info grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px 24px' }}>
                    {[
                      ['Email', viewingClient.email],
                      ['Teléfono', viewingClient.phone],
                      ['DNI', viewingClient.dni],
                      ['CUIT / CUIL', viewingClient.cuit],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="lm-eyebrow" style={{ marginBottom: 2, fontSize: 9.5 }}>{k}</p>
                        <p style={{ margin: 0, fontSize: 13, color: v ? 'var(--ink)' : 'var(--ink-mute)', fontStyle: v ? 'normal' : 'italic' }}>{v || 'No registrado'}</p>
                      </div>
                    ))}
                  </div>

                  {viewingClient.additionalInfo && (
                    <>
                      <hr className="lm-divider" style={{ margin: '14px 0' }} />
                      <p className="lm-eyebrow" style={{ marginBottom: 6, fontSize: 9.5 }}>Notas</p>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, fontStyle: 'italic' }}>{viewingClient.additionalInfo}</p>
                    </>
                  )}
                </div>

                {/* Related cases */}
                <div>
                  <p className="lm-eyebrow" style={{ marginBottom: 10 }}>
                    Expedientes vinculados ({clientCases.length})
                  </p>
                  {clientCases.length > 0 ? (
                    <div className="lm-card" style={{ overflow: 'hidden' }}>
                      {clientCases.map((c, i) => (
                        <button
                          key={c.id}
                          onClick={() => navigate('/cases')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            width: '100%', textAlign: 'left', padding: '12px 16px',
                            background: 'none', border: 0, cursor: 'pointer',
                            borderBottom: i < clientCases.length - 1 ? '0.5px solid var(--rule-soft)' : 'none',
                            transition: 'background .12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--paper-2)', border: '0.5px solid var(--rule)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <Briefcase size={14} color="var(--ink-3)" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.caseTitle || 'Sin carátula'}</p>
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-3)' }}>
                              <span className="lm-mono">{c.caseNumber}</span> · {c.status}
                            </p>
                          </div>
                          <ChevronRight size={13} color="var(--rule)" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="lm-card" style={{ padding: '24px', textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: 'var(--ink-mute)', fontStyle: 'italic', margin: 0 }}>
                        Sin expedientes vinculados a este cliente.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}
              >
                <Users size={36} color="var(--rule)" style={{ marginBottom: 14 }} />
                <h3 className="lm-display" style={{ fontSize: 17, color: 'var(--ink-3)', margin: '0 0 6px', fontStyle: 'italic' }}>
                  Seleccione un cliente
                </h3>
                <p style={{ fontSize: 13, color: 'var(--ink-mute)', maxWidth: 280, margin: 0 }}>
                  Elija un cliente de la lista para ver su ficha y expedientes relacionados.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal nuevo/editar cliente */}
      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(20,15,8,0.5)', backdropFilter: 'blur(3px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ background: 'var(--paper)', width: '100%', maxWidth: 480, borderRadius: 'var(--r-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', border: '0.5px solid var(--rule)' }}
            >
              <div style={{ padding: '18px 24px', background: 'var(--sidebar-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <p className="lm-eyebrow" style={{ color: 'var(--sidebar-fg-mute)', marginBottom: 2 }}>
                    {editingClient ? 'Modificar ficha' : 'Nuevo registro'}
                  </p>
                  <h3 className="lm-display" style={{ fontSize: 17, color: 'var(--sidebar-fg)', margin: 0 }}>
                    {editingClient ? 'Editar cliente' : 'Nuevo cliente'}
                  </h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--sidebar-fg-mute)', padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="lm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {error && (
                  <div style={{ padding: '10px 14px', background: 'var(--oxblood-soft)', border: '0.5px solid var(--oxblood)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--oxblood)' }}>
                    {error}
                  </div>
                )}

                <div>
                  <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Nombre completo</label>
                  <input required className="lm-input" value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Email</label>
                    <input type="email" required className="lm-input" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Teléfono</label>
                    <input className="lm-input" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>DNI</label>
                    <input className="lm-input" value={formData.dni} onChange={e => setFormData({ ...formData, dni: e.target.value })} />
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>CUIT / CUIL</label>
                    <input className="lm-input" value={formData.cuit} onChange={e => setFormData({ ...formData, cuit: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Notas adicionales</label>
                  <textarea className="lm-textarea" rows={3} value={formData.additionalInfo} onChange={e => setFormData({ ...formData, additionalInfo: e.target.value })} style={{ resize: 'none' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="lm-btn lm-btn--ghost lm-btn--sm">Cancelar</button>
                  <button type="submit" className="lm-btn lm-btn--primary lm-btn--sm">
                    {editingClient ? 'Guardar cambios' : 'Crear cliente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Eliminar cliente"
        message="¿Está seguro de que desea eliminar este cliente? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => { setIsDeleteModalOpen(false); setClientToDelete(null); }}
      />
    </div>
  );
}
