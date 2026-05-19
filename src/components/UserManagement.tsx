import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Credential } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Shield, Key, Pencil, Trash2, AlertTriangle, X, UserPlus, Users, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type NewUserForm = {
  displayName: string;
  email: string;
  role: 'lawyer' | 'assistant';
  username: string;
  password: string;
};

const MODAL_OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
};

const MODAL_CARD: React.CSSProperties = {
  background: 'var(--paper)', width: '100%', maxWidth: 440,
  borderRadius: 'var(--r-lg)', boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
  overflow: 'hidden',
};

const MODAL_HEADER: React.CSSProperties = {
  padding: '20px 24px',
  background: 'var(--sidebar-bg)',
  color: 'var(--sidebar-fg)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

const MODAL_BODY: React.CSSProperties = { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 };

export default function UserManagement() {
  const { isAdmin, user: currentUser, refreshSession } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isEditCredOpen, setIsEditCredOpen] = useState(false);
  const [isNewUserOpen, setIsNewUserOpen] = useState(false);
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({ displayName: '', email: '' });
  const [credForm, setCredForm] = useState({ username: '', password: '' });
  const [newUserForm, setNewUserForm] = useState<NewUserForm>({ displayName: '', email: '', role: 'lawyer', username: '', password: '' });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isAdmin || !currentUser) return;

    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'users'));

    const unsubCreds = onSnapshot(query(collection(db, 'credentials')), (snap) => {
      setCredentials(snap.docs.map(d => ({ id: d.id, ...d.data() } as Credential)));
    }, (e) => handleFirestoreError(e, OperationType.LIST, 'credentials'));

    return () => { unsubUsers(); unsubCreds(); };
  }, [isAdmin, currentUser]);

  const adminUser = users.find(u => u.uid === currentUser?.uid);
  const adminCred = credentials.find(c => c.userId === currentUser?.uid);
  const teamUsers = users.filter(u => u.uid !== currentUser?.uid && (u.role === 'lawyer' || u.role === 'assistant'));
  const orphanCreds = credentials.filter(c => c.userId !== currentUser?.uid && !users.find(u => u.uid === c.userId));

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), profileForm);
      refreshSession(profileForm);
      setIsEditProfileOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleSaveCred = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCredId) return;
    try {
      await updateDoc(doc(db, 'credentials', editingCredId), credForm);
      setIsEditCredOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `credentials/${editingCredId}`);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      const linkedCred = credentials.find(c => c.userId === uid);
      if (linkedCred) await deleteDoc(doc(db, 'credentials', linkedCred.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  const handleDeleteCred = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'credentials', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `credentials/${id}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const userRef = await addDoc(collection(db, 'users'), {
        displayName: newUserForm.displayName,
        email: newUserForm.email,
        role: newUserForm.role,
        createdAt: new Date().toISOString(),
      });
      await addDoc(collection(db, 'credentials'), {
        username: newUserForm.username,
        password: newUserForm.password,
        userId: userRef.id,
      });
      setNewUserForm({ displayName: '', email: '', role: 'lawyer', username: '', password: '' });
      setIsNewUserOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    } finally {
      setIsCreating(false);
    }
  };

  const roleLabel = (role: string) => role === 'lawyer' ? 'Abogado' : 'Auxiliar';
  const roleChipStyle = (role: string): React.CSSProperties =>
    role === 'lawyer'
      ? { background: 'var(--forest-soft)', color: 'var(--forest)', border: '0.5px solid var(--forest)' }
      : { background: 'var(--mustard-soft)', color: 'var(--mustard-dark)', border: '0.5px solid var(--mustard)' };

  if (!isAdmin) return (
    <div className="lm-card" style={{ padding: 32, textAlign: 'center' }}>
      <Shield style={{ margin: '0 auto 12px', color: 'var(--oxblood)', width: 32, height: 32 }} />
      <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, color: 'var(--oxblood)' }}>Acceso Denegado</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <p className="lm-eyebrow">Administración</p>
          <h1 className="lm-display" style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield style={{ width: 22, height: 22, color: 'var(--oxblood)', flexShrink: 0 }} />
            Perfil de Administrador
          </h1>
        </div>
        <button className="lm-btn lm-btn--primary lm-btn--sm" onClick={() => setIsNewUserOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <UserPlus style={{ width: 14, height: 14 }} />
          Nuevo Usuario
        </button>
      </div>

      {/* Profile card */}
      <div className="lm-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 'var(--r-md)',
            background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900,
            flexShrink: 0,
          }}>
            {adminUser?.displayName?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, color: 'var(--ink)', fontSize: '1rem' }}>
              {adminUser?.displayName || '—'}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-3)', marginTop: 1 }}>{adminUser?.email || '—'}</p>
            <span className="lm-chip" style={{
              marginTop: 4, display: 'inline-block',
              background: 'var(--oxblood-soft)', color: 'var(--oxblood)',
              border: '0.5px solid var(--oxblood)',
            }}>
              Administrador
            </span>
          </div>
        </div>
        <button
          onClick={() => {
            setProfileForm({ displayName: adminUser?.displayName || '', email: adminUser?.email || '' });
            setIsEditProfileOpen(true);
          }}
          title="Editar Perfil"
          style={{
            padding: 8, borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent',
            color: 'var(--ink-3)', cursor: 'pointer', transition: 'color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--oxblood)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
        >
          <Pencil style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Credentials card */}
      <div className="lm-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 'var(--r-md)',
            background: 'var(--paper-2)', border: '0.5px solid var(--rule)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-3)', flexShrink: 0,
          }}>
            <Key style={{ width: 20, height: 20 }} />
          </div>
          <div>
            <p className="lm-eyebrow" style={{ marginBottom: 4 }}>Credenciales de Acceso</p>
            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, color: 'var(--ink)' }}>
              {adminCred?.username || '—'}
            </p>
            <p className="lm-mono" style={{ fontSize: '0.75rem', color: 'var(--ink-3)', letterSpacing: '0.15em' }}>
              ••••••••
            </p>
          </div>
        </div>
        {adminCred && (
          <button
            onClick={() => {
              setEditingCredId(adminCred.id);
              setCredForm({ username: adminCred.username, password: adminCred.password });
              setIsEditCredOpen(true);
            }}
            title="Editar Credenciales"
            style={{
              padding: 8, borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent',
              color: 'var(--ink-3)', cursor: 'pointer', transition: 'color .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--forest)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
          >
            <Pencil style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>

      {/* Team section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, color: 'var(--ink-2)', fontSize: '0.9rem' }}>
            Equipo
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
            {teamUsers.length} usuario{teamUsers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {teamUsers.length === 0 ? (
          <div className="lm-card" style={{
            border: '1px dashed var(--rule)', textAlign: 'center', padding: 40,
          }}>
            <Users style={{ width: 28, height: 28, margin: '0 auto 10px', color: 'var(--ink-4)' }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-3)' }}>
              Aún no hay abogados ni auxiliares registrados.
            </p>
            <button
              onClick={() => setIsNewUserOpen(true)}
              style={{
                marginTop: 12, fontSize: '0.85rem', fontWeight: 700,
                color: 'var(--oxblood)', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              + Agregar el primero
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {teamUsers.map(u => (
              <div key={u.uid} className="lm-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--r-sm)',
                    background: 'var(--paper-2)', border: '0.5px solid var(--rule)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-sans)', fontWeight: 800, color: 'var(--ink-2)', fontSize: '1rem',
                    flexShrink: 0,
                  }}>
                    {u.displayName?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, color: 'var(--ink)', fontSize: '0.9rem' }}>
                      {u.displayName || '—'}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: 1 }}>{u.email || '—'}</p>
                    <span className="lm-chip" style={{ marginTop: 4, display: 'inline-block', ...roleChipStyle(u.role) }}>
                      {roleLabel(u.role)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteUser(u.uid)}
                  title="Eliminar usuario"
                  style={{
                    padding: 8, borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent',
                    color: 'var(--ink-4)', cursor: 'pointer', transition: 'color .15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--oxblood)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-4)')}
                >
                  <Trash2 style={{ width: 15, height: 15 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orphan credentials warning */}
      {orphanCreds.length > 0 && (
        <div style={{
          background: 'var(--mustard-soft)', border: '0.5px solid var(--mustard)',
          borderRadius: 'var(--r-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle style={{ width: 18, height: 18, color: 'var(--mustard-dark)', flexShrink: 0 }} />
            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, color: 'var(--mustard-dark)', fontSize: '0.85rem' }}>
              {orphanCreds.length} credencial{orphanCreds.length > 1 ? 'es' : ''} huérfana{orphanCreds.length > 1 ? 's' : ''} detectada{orphanCreds.length > 1 ? 's' : ''} (sin usuario asociado).
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {orphanCreds.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--paper)', borderRadius: 'var(--r-md)',
                padding: '10px 14px', border: '0.5px solid var(--mustard)',
              }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--ink)', fontSize: '0.85rem' }}>
                  {c.username}
                </p>
                <button
                  onClick={() => handleDeleteCred(c.id)}
                  title="Eliminar credencial"
                  style={{
                    padding: 6, borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent',
                    color: 'var(--ink-3)', cursor: 'pointer', transition: 'color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--oxblood)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditProfileOpen && (
          <div style={MODAL_OVERLAY}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={MODAL_CARD}
            >
              <div style={MODAL_HEADER}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>
                  Editar Perfil
                </span>
                <button onClick={() => setIsEditProfileOpen(false)} style={{
                  background: 'none', border: 'none', color: 'var(--sidebar-fg)', cursor: 'pointer',
                  padding: 6, borderRadius: 6, opacity: 0.7,
                }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
              <form onSubmit={handleSaveProfile} style={MODAL_BODY}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="lm-eyebrow">Nombre Completo</label>
                  <input
                    required
                    className="lm-input"
                    value={profileForm.displayName}
                    onChange={e => setProfileForm({ ...profileForm, displayName: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="lm-eyebrow">Email</label>
                  <input
                    type="email"
                    required
                    className="lm-input"
                    value={profileForm.email}
                    onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                  <button type="button" onClick={() => setIsEditProfileOpen(false)}
                    className="lm-btn" style={{ flex: 1 }}>
                    Cancelar
                  </button>
                  <button type="submit" className="lm-btn lm-btn--primary" style={{ flex: 1 }}>
                    Guardar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New User Modal */}
      <AnimatePresence>
        {isNewUserOpen && (
          <div style={MODAL_OVERLAY}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={MODAL_CARD}
            >
              <div style={MODAL_HEADER}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserPlus style={{ width: 16, height: 16 }} />
                  Nuevo Usuario
                </span>
                <button onClick={() => setIsNewUserOpen(false)} style={{
                  background: 'none', border: 'none', color: 'var(--sidebar-fg)', cursor: 'pointer',
                  padding: 6, borderRadius: 6, opacity: 0.7,
                }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
              <form onSubmit={handleCreateUser} style={MODAL_BODY}>
                {/* Role toggle */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="lm-eyebrow">Tipo de Usuario</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([
                      { key: 'lawyer', label: 'Abogado', Icon: Briefcase },
                      { key: 'assistant', label: 'Auxiliar', Icon: Users },
                    ] as const).map(({ key, label, Icon }) => {
                      const active = newUserForm.role === key;
                      const isLawyer = key === 'lawyer';
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setNewUserForm({ ...newUserForm, role: key })}
                          style={{
                            padding: '12px 16px', borderRadius: 'var(--r-md)',
                            border: `1.5px solid ${active ? (isLawyer ? 'var(--forest)' : 'var(--mustard)') : 'var(--rule)'}`,
                            background: active ? (isLawyer ? 'var(--forest-soft)' : 'var(--mustard-soft)') : 'var(--paper-2)',
                            color: active ? (isLawyer ? 'var(--forest)' : 'var(--mustard-dark)') : 'var(--ink-3)',
                            fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '0.85rem',
                            cursor: 'pointer', transition: 'all .15s',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          }}
                        >
                          <Icon style={{ width: 16, height: 16 }} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Profile fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="lm-eyebrow">Nombre Completo</label>
                  <input
                    required
                    placeholder="Ej: Juan Pérez"
                    className="lm-input"
                    value={newUserForm.displayName}
                    onChange={e => setNewUserForm({ ...newUserForm, displayName: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="lm-eyebrow">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="usuario@estudio.com"
                    className="lm-input"
                    value={newUserForm.email}
                    onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  />
                </div>

                {/* Credentials */}
                <div style={{
                  borderTop: '0.5px solid var(--rule-soft)', paddingTop: 16,
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <p className="lm-eyebrow">Credenciales de Acceso</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label className="lm-eyebrow">Usuario (Login)</label>
                    <input
                      required
                      placeholder="nombre.apellido"
                      className="lm-input"
                      value={newUserForm.username}
                      onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label className="lm-eyebrow">Contraseña</label>
                    <input
                      type="password"
                      required
                      className="lm-input"
                      value={newUserForm.password}
                      onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                  <button type="button" onClick={() => setIsNewUserOpen(false)}
                    className="lm-btn" style={{ flex: 1 }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={isCreating} className="lm-btn lm-btn--primary" style={{ flex: 1 }}>
                    {isCreating ? 'Creando…' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Credentials Modal */}
      <AnimatePresence>
        {isEditCredOpen && (
          <div style={MODAL_OVERLAY}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={MODAL_CARD}
            >
              <div style={MODAL_HEADER}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Key style={{ width: 16, height: 16 }} />
                  Editar Credenciales
                </span>
                <button onClick={() => setIsEditCredOpen(false)} style={{
                  background: 'none', border: 'none', color: 'var(--sidebar-fg)', cursor: 'pointer',
                  padding: 6, borderRadius: 6, opacity: 0.7,
                }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
              <form onSubmit={handleSaveCred} style={MODAL_BODY}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="lm-eyebrow">Usuario (Login)</label>
                  <input
                    required
                    className="lm-input"
                    value={credForm.username}
                    onChange={e => setCredForm({ ...credForm, username: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="lm-eyebrow">Nueva Contraseña</label>
                  <input
                    type="password"
                    required
                    className="lm-input"
                    value={credForm.password}
                    onChange={e => setCredForm({ ...credForm, password: e.target.value })}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                  <button type="button" onClick={() => setIsEditCredOpen(false)}
                    className="lm-btn" style={{ flex: 1 }}>
                    Cancelar
                  </button>
                  <button type="submit" className="lm-btn lm-btn--primary" style={{ flex: 1 }}>
                    Guardar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
