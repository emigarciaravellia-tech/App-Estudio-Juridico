import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, updateDoc, doc, addDoc, deleteDoc, getDocs, writeBatch, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, UserRole, Credential } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Shield, User as UserIcon, CheckCircle, XCircle, Plus, X, Trash2, AlertTriangle, Key, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmationModal from './ConfirmationModal';

export default function UserManagement() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'credentials'>('members');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCredModalOpen, setIsCredModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    role: 'lawyer' as UserRole
  });

  const [credFormData, setCredFormData] = useState({
    username: '',
    password: '',
    userId: ''
  });

  useEffect(() => {
    if (!isAdmin) return;
    
    // Fetch Team Members (excluding clients)
    const qUsers = query(collection(db, 'users'), where('role', '!=', 'client'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Fetch Credentials
    const qCreds = query(collection(db, 'credentials'));
    const unsubscribeCreds = onSnapshot(qCreds, (snapshot) => {
      setCredentials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Credential)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'credentials');
    });

    return () => {
      unsubscribeUsers();
      unsubscribeCreds();
    };
  }, [isAdmin]);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    const path = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = 'users';
    try {
      await addDoc(collection(db, path), {
        ...formData,
        createdAt: new Date().toISOString()
      });
      setIsModalOpen(false);
      setFormData({ displayName: '', email: '', role: 'lawyer' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleAddCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = 'credentials';
    try {
      await addDoc(collection(db, path), {
        ...credFormData
      });
      setIsCredModalOpen(false);
      setCredFormData({ username: '', password: '', userId: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === currentUser?.uid) {
      alert("No puedes eliminarte a ti mismo.");
      return;
    }
    const path = `users/${uid}`;
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleDeleteCredential = async (id: string) => {
    const path = `credentials/${id}`;
    try {
      await deleteDoc(doc(db, 'credentials', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleDeleteAllUsers = async () => {
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      const otherUsers = users.filter(u => u.uid !== currentUser?.uid);
      
      otherUsers.forEach(u => {
        batch.delete(doc(db, 'users', u.uid));
      });
      
      await batch.commit();
      setIsDeleteAllModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users/batch-delete');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-red-500 font-bold">Acceso Denegado</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h2>
          <p className="text-slate-500">Administre los miembros del estudio y sus credenciales de acceso.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsDeleteAllModalOpen(true)}
            className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl hover:bg-red-100 transition-all border border-red-100 text-sm"
          >
            <Trash2 className="h-4 w-4" />
            Limpiar Equipo
          </button>
          {activeTab === 'members' ? (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 text-sm"
            >
              <Plus className="h-4 w-4" />
              Nuevo Miembro
            </button>
          ) : (
            <button 
              onClick={() => setIsCredModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 text-sm"
            >
              <Key className="h-4 w-4" />
              Nueva Credencial
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('members')}
          className={`pb-4 px-2 text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'members' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Users className="h-4 w-4" />
          Miembros del Estudio
        </button>
        <button 
          onClick={() => setActiveTab('credentials')}
          className={`pb-4 px-2 text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'credentials' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Key className="h-4 w-4" />
          Cuentas de Acceso
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {activeTab === 'members' ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Miembro</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rol</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <motion.tr layout key={user.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                        {user.displayName?.charAt(0) || 'U'}
                      </div>
                      <span className="font-bold text-slate-900">{user.displayName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      user.role === 'admin' ? 'bg-red-100 text-red-700' :
                      user.role === 'lawyer' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <select 
                      className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                    >
                      <option value="admin">Admin</option>
                      <option value="lawyer">Abogado</option>
                      <option value="assistant">Asistente</option>
                    </select>
                    {user.uid !== currentUser?.uid && (
                      <button 
                        onClick={() => handleDeleteUser(user.uid)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Usuario (Login)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contraseña</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Perfil Vinculado</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {credentials.map((cred) => (
                <motion.tr layout key={cred.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{cred.username}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">••••••••</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {users.find(u => u.uid === cred.userId)?.displayName || 'Sin vincular'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDeleteCredential(cred.id)}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
              {credentials.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                    No hay credenciales de acceso creadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Member */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-indigo-900 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold">Nuevo Miembro del Estudio</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-indigo-800 rounded-full transition-all">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nombre Completo</label>
                  <input required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                  <input type="email" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Rol</label>
                  <select className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                    <option value="lawyer">Abogado</option>
                    <option value="admin">Admin</option>
                    <option value="assistant">Asistente</option>
                  </select>
                </div>
                <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl mt-4 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                  Crear Miembro
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Credential */}
      <AnimatePresence>
        {isCredModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-emerald-900 text-white flex items-center justify-between">
                <h3 className="text-xl font-bold">Nueva Credencial de Acceso</h3>
                <button onClick={() => setIsCredModalOpen(false)} className="p-2 hover:bg-emerald-800 rounded-full transition-all">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleAddCredential} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Usuario (Login)</label>
                  <input required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" value={credFormData.username} onChange={e => setCredFormData({...credFormData, username: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label>
                  <input type="password" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" value={credFormData.password} onChange={e => setCredFormData({...credFormData, password: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Vincular a Perfil</label>
                  <select required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" value={credFormData.userId} onChange={e => setCredFormData({...credFormData, userId: e.target.value})}>
                    <option value="">Seleccionar miembro...</option>
                    {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>)}
                  </select>
                </div>
                <button type="submit" className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl mt-4 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">
                  Crear Credencial
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Delete All */}
      <ConfirmationModal 
        isOpen={isDeleteAllModalOpen}
        title="Limpiar Equipo"
        message="¿Está seguro de que desea eliminar a todos los demás miembros? Esta acción dejará solo su cuenta activa."
        onConfirm={handleDeleteAllUsers}
        onCancel={() => setIsDeleteAllModalOpen(false)}
      />
    </div>
  );
}
