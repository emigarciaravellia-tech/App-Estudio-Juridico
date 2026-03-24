import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, where, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Case } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Users, Plus, Search, Mail, Phone, FileText, ChevronRight, User, Trash2, Edit2, X, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    cuit: '',
    dni: '',
    additionalInfo: '',
    role: 'client' as const
  });

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'client'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const qCases = query(collection(db, 'cases'));
    const unsubscribeCases = onSnapshot(qCases, (snapshot) => {
      setCases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });

    return () => {
      unsubscribe();
      unsubscribeCases();
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (viewingClient) {
        const path = `users/${viewingClient.uid}`;
        await updateDoc(doc(db, 'users', viewingClient.uid), formData);
      } else {
        const path = 'users';
        const newDocRef = doc(collection(db, 'users'));
        await setDoc(newDocRef, {
          ...formData,
          uid: newDocRef.id,
          createdAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
      setViewingClient(null);
      setFormData({ displayName: '', email: '', phone: '', cuit: '', dni: '', additionalInfo: '', role: 'client' });
    } catch (err) {
      console.error('Error saving client:', err);
      setError('Error al guardar el cliente. Verifique sus permisos.');
      handleFirestoreError(err, viewingClient ? OperationType.UPDATE : OperationType.CREATE, viewingClient ? `users/${viewingClient.uid}` : 'users');
    }
  };

  const handleDelete = async (uid: string) => {
    setClientToDelete(uid);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    const path = `users/${clientToDelete}`;
    try {
      await deleteDoc(doc(db, 'users', clientToDelete));
      if (viewingClient?.uid === clientToDelete) setViewingClient(null);
      setIsDeleteModalOpen(false);
      setClientToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const filteredClients = clients.filter(c => 
    c.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cuit?.includes(searchTerm) ||
    c.dni?.includes(searchTerm)
  );

  const ClientDetails = ({ client }: { client: UserProfile }) => {
    const clientCases = cases.filter(c => 
      c.clientName?.toLowerCase() === client.displayName?.toLowerCase() || 
      c.clientData?.email === client.email
    );

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
              <User className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900">{client.displayName}</h3>
              <p className="text-slate-500">Cliente desde {client.createdAt ? new Date(client.createdAt).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setFormData({
                  displayName: client.displayName || '',
                  email: client.email || '',
                  phone: client.phone || '',
                  cuit: client.cuit || '',
                  dni: client.dni || '',
                  additionalInfo: client.additionalInfo || '',
                  role: 'client'
                });
                setIsModalOpen(true);
              }}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            >
              <Edit2 className="h-5 w-5" />
            </button>
            {(isAdmin || isLawyer) && (
              <button 
                onClick={() => handleDelete(client.uid)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 p-4 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Información de Contacto</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="h-4 w-4" />
                <span className="text-sm font-medium">{client.email}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4" />
                <span className="text-sm font-medium">{client.phone || 'No registrado'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">DNI: {client.dni || 'No registrado'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">CUIT: {client.cuit || 'No registrado'}</span>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Información Adicional</h4>
            <p className="text-sm text-slate-600 italic">
              {client.additionalInfo || 'Sin información adicional registrada.'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-indigo-600" />
            Expedientes Relacionados
          </h4>
          <div className="space-y-2">
            {clientCases.length > 0 ? (
              clientCases.map(c => (
                <button 
                  key={c.id}
                  onClick={() => navigate('/expedientes')}
                  className="w-full flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-200 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-900">{c.title}</p>
                      <p className="text-xs text-slate-500">Exp: {c.caseNumber} • {c.status}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-600 transition-all" />
                </button>
              ))
            ) : (
              <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm">No hay expedientes vinculados a este cliente.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Gestión de Clientes</h2>
          <p className="text-slate-500">Administre la base de datos de clientes y sus expedientes.</p>
        </div>
        {(isAdmin || isLawyer || isAssistant) && (
          <button 
            onClick={() => {
              setViewingClient(null);
              setFormData({ displayName: '', email: '', phone: '', cuit: '', dni: '', additionalInfo: '', role: 'client' });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Plus className="h-5 w-5" />
            Nuevo Cliente
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* List */}
        <div className={`lg:w-1/3 space-y-4 ${viewingClient ? 'hidden lg:block' : 'block'}`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por nombre, email o CUIT..." 
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
            {filteredClients.map(client => (
              <button 
                key={client.uid}
                onClick={() => setViewingClient(client)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                  viewingClient?.uid === client.uid 
                    ? 'bg-indigo-50 border-indigo-200 shadow-md' 
                    : 'bg-white border-slate-100 hover:border-indigo-100'
                }`}
              >
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold ${
                  viewingClient?.uid === client.uid ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {client.displayName?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate">{client.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{client.email}</p>
                </div>
                <ChevronRight className={`h-5 w-5 transition-all ${viewingClient?.uid === client.uid ? 'text-indigo-600 translate-x-1' : 'text-slate-300'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className={`lg:w-2/3 ${viewingClient ? 'block' : 'hidden lg:block'}`}>
          <AnimatePresence mode="wait">
            {viewingClient ? (
              <motion.div 
                key={viewingClient.uid}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white p-4 md:p-8 rounded-3xl border border-slate-100 shadow-xl relative"
              >
                <button 
                  onClick={() => setViewingClient(null)}
                  className="lg:hidden absolute top-4 right-4 p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-full transition-all z-10"
                >
                  <X className="h-5 w-5" />
                </button>
                <ClientDetails client={viewingClient} />
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-4">
                  <Users className="h-10 w-10" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Seleccione un cliente</h3>
                <p className="text-slate-500 max-w-xs">Elija un cliente de la lista para ver su perfil detallado y expedientes relacionados.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md h-full md:h-auto md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 bg-indigo-900 text-white flex items-center justify-between sticky top-0 z-10">
                <h3 className="text-xl font-bold">{viewingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-indigo-800 rounded-full transition-all">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-6 space-y-4 flex-1 overflow-y-auto">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
                    {error}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nombre Completo</label>
                  <input required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                    <input type="email" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Teléfono</label>
                    <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">DNI</label>
                    <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">CUIT / CUIL</label>
                    <input className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.cuit} onChange={e => setFormData({...formData, cuit: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Información Adicional</label>
                  <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none resize-none focus:ring-2 focus:ring-indigo-500" rows={3} value={formData.additionalInfo} onChange={e => setFormData({...formData, additionalInfo: e.target.value})} />
                </div>
                <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl mt-4 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                  {viewingClient ? 'Guardar Cambios' : 'Crear Cliente'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmationModal 
        isOpen={isDeleteModalOpen}
        title="Eliminar Cliente"
        message="¿Está seguro de que desea eliminar este cliente? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setClientToDelete(null);
        }}
      />
    </div>
  );
}
