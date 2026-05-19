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
  const roleBadge = (role: string) => role === 'lawyer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';

  if (!isAdmin) return <div className="p-8 text-center text-red-500 font-bold">Acceso Denegado</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Shield className="h-7 w-7 text-indigo-600" />
            Perfil de Administrador
          </h2>
          <p className="text-slate-500">Administre su perfil y credenciales de acceso.</p>
        </div>
        <button
          onClick={() => setIsNewUserOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200 whitespace-nowrap"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-200">
            {adminUser?.displayName?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div>
            <p className="font-black text-slate-900 text-lg">{adminUser?.displayName || '—'}</p>
            <p className="text-sm text-slate-500">{adminUser?.email || '—'}</p>
            <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">
              Administrador
            </span>
          </div>
        </div>
        <button
          onClick={() => {
            setProfileForm({ displayName: adminUser?.displayName || '', email: adminUser?.email || '' });
            setIsEditProfileOpen(true);
          }}
          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
          title="Editar Perfil"
        >
          <Pencil className="h-5 w-5" />
        </button>
      </div>

      {/* Credentials card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Key className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Credenciales de Acceso</p>
            <p className="font-black text-slate-900">{adminCred?.username || '—'}</p>
            <p className="text-sm text-slate-400 tracking-widest">••••••••</p>
          </div>
        </div>
        {adminCred && (
          <button
            onClick={() => {
              setEditingCredId(adminCred.id);
              setCredForm({ username: adminCred.username, password: adminCred.password });
              setIsEditCredOpen(true);
            }}
            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
            title="Editar Credenciales"
          >
            <Pencil className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Team section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-400" />
          <h3 className="font-bold text-slate-700">Equipo</h3>
          <span className="ml-auto text-xs text-slate-400">{teamUsers.length} usuario{teamUsers.length !== 1 ? 's' : ''}</span>
        </div>
        {teamUsers.length === 0 ? (
          <div className="bg-slate-50 rounded-3xl border border-dashed border-slate-200 p-8 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-400">Aún no hay abogados ni auxiliares registrados.</p>
            <button
              onClick={() => setIsNewUserOpen(true)}
              className="mt-3 text-sm font-bold text-indigo-600 hover:text-indigo-700"
            >
              + Agregar el primero
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {teamUsers.map(u => (
              <div key={u.uid} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-600 text-lg">
                    {u.displayName?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{u.displayName || '—'}</p>
                    <p className="text-xs text-slate-400">{u.email || '—'}</p>
                    <span className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${roleBadge(u.role)}`}>
                      {roleLabel(u.role)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteUser(u.uid)}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  title="Eliminar usuario"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orphan credentials warning — solo credenciales sin usuario asociado */}
      {orphanCreds.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-800">
              {orphanCreds.length} credencial{orphanCreds.length > 1 ? 'es' : ''} huérfana{orphanCreds.length > 1 ? 's' : ''} detectada{orphanCreds.length > 1 ? 's' : ''} (sin usuario asociado).
            </p>
          </div>
          <div className="space-y-2">
            {orphanCreds.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-amber-100">
                <p className="font-bold text-slate-800">{c.username}</p>
                <button
                  onClick={() => handleDeleteCred(c.id)}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  title="Eliminar credencial"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditProfileOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-indigo-900 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold">Editar Perfil</h3>
                <button onClick={() => setIsEditProfileOpen(false)} className="p-2 hover:bg-indigo-800 rounded-xl">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nombre Completo</label>
                  <input
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={profileForm.displayName}
                    onChange={e => setProfileForm({ ...profileForm, displayName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={profileForm.email}
                    onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsEditProfileOpen(false)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Nuevo Usuario
                </h3>
                <button onClick={() => setIsNewUserOpen(false)} className="p-2 hover:bg-indigo-700 rounded-xl">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                {/* Tipo de usuario */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tipo de Usuario</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewUserForm({ ...newUserForm, role: 'lawyer' })}
                      className={`py-3 px-4 rounded-2xl font-bold text-sm border-2 transition-all flex flex-col items-center gap-1 ${newUserForm.role === 'lawyer' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                    >
                      <Briefcase className="h-4 w-4" />
                      Abogado
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserForm({ ...newUserForm, role: 'assistant' })}
                      className={`py-3 px-4 rounded-2xl font-bold text-sm border-2 transition-all flex flex-col items-center gap-1 ${newUserForm.role === 'assistant' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                    >
                      <Users className="h-4 w-4" />
                      Auxiliar
                    </button>
                  </div>
                </div>
                {/* Datos del perfil */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nombre Completo</label>
                  <input
                    required
                    placeholder="Ej: Juan Pérez"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newUserForm.displayName}
                    onChange={e => setNewUserForm({ ...newUserForm, displayName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="usuario@estudio.com"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newUserForm.email}
                    onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  />
                </div>
                {/* Credenciales */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase">Credenciales de Acceso</p>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Usuario</label>
                    <input
                      required
                      placeholder="nombre.apellido"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newUserForm.username}
                      onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label>
                    <input
                      type="password"
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newUserForm.password}
                      onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsNewUserOpen(false)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isCreating} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all disabled:opacity-60">
                    {isCreating ? 'Creando...' : 'Crear Usuario'}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold">Editar Credenciales</h3>
                <button onClick={() => setIsEditCredOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleSaveCred} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Usuario (Login)</label>
                  <input
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={credForm.username}
                    onChange={e => setCredForm({ ...credForm, username: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nueva Contraseña</label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                    value={credForm.password}
                    onChange={e => setCredForm({ ...credForm, password: e.target.value })}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsEditCredOpen(false)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all">
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
