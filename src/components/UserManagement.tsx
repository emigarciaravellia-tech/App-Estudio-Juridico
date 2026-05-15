import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Credential } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Shield, Key, Pencil, Trash2, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function UserManagement() {
  const { isAdmin, user: currentUser, refreshSession } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isEditCredOpen, setIsEditCredOpen] = useState(false);
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({ displayName: '', email: '' });
  const [credForm, setCredForm] = useState({ username: '', password: '' });

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
  const duplicateUsers = users.filter(u => u.uid !== currentUser?.uid);
  const duplicateCreds = credentials.filter(c => c.userId !== currentUser?.uid);

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

  if (!isAdmin) return <div className="p-8 text-center text-red-500 font-bold">Acceso Denegado</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Shield className="h-7 w-7 text-indigo-600" />
          Perfil de Administrador
        </h2>
        <p className="text-slate-500">Administre su perfil y credenciales de acceso.</p>
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

      {/* Duplicate users warning */}
      {duplicateUsers.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-800">
              {duplicateUsers.length} usuario{duplicateUsers.length > 1 ? 's' : ''} adicional{duplicateUsers.length > 1 ? 'es' : ''} detectado{duplicateUsers.length > 1 ? 's' : ''}. Elimínelo{duplicateUsers.length > 1 ? 's' : ''} para mantener solo el administrador.
            </p>
          </div>
          <div className="space-y-2">
            {duplicateUsers.map(u => (
              <div key={u.uid} className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-amber-100">
                <div>
                  <p className="font-bold text-slate-800">{u.displayName || u.email}</p>
                  <p className="text-xs text-slate-400">{u.email} · {u.role}</p>
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
        </div>
      )}

      {/* Orphan credentials warning */}
      {duplicateCreds.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-800">
              {duplicateCreds.length} credencial{duplicateCreds.length > 1 ? 'es' : ''} huérfana{duplicateCreds.length > 1 ? 's' : ''} detectada{duplicateCreds.length > 1 ? 's' : ''}.
            </p>
          </div>
          <div className="space-y-2">
            {duplicateCreds.map(c => (
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
