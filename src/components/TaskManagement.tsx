import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, where, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Task, Case, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { CheckSquare, Plus, Clock, AlertCircle, Trash2, CheckCircle2, Circle, PlayCircle, X, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmationModal from './ConfirmationModal';

export default function TaskManagement() {
  const { profile, isAdmin, isLawyer } = useAuth();
  const location = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === 'true') {
      setIsModalOpen(true);
    }
  }, [location.search]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    caseId: '',
    dueDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    isPersonal: false,
    assignedUserId: profile?.uid || ''
  });

  useEffect(() => {
    if (!profile) return;
    
    // Fetch Tasks: Admins and Lawyers see all, Assistants see only theirs
    const q = (isAdmin || isLawyer) 
      ? query(collection(db, 'tasks'))
      : query(collection(db, 'tasks'), where('assignedUserId', '==', profile.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    const qCases = query(collection(db, 'cases'));
    const unsubscribeCases = onSnapshot(qCases, (snapshot) => {
      setCases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });

    // Fetch Users (excluding clients)
    const qUsers = query(collection(db, 'users'), where('role', '!=', 'client'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => {
      unsubscribe();
      unsubscribeCases();
      unsubscribeUsers();
    };
  }, [profile, isAdmin, isLawyer]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const path = 'tasks';
    try {
      await addDoc(collection(db, path), {
        ...formData,
        assignedUserId: formData.assignedUserId || profile.uid,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setIsModalOpen(false);
      setFormData({
        title: '',
        description: '',
        caseId: '',
        dueDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        isPersonal: false,
        assignedUserId: profile.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateStatus = async (taskId: string, newStatus: Task['status']) => {
    const path = `tasks/${taskId}`;
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: newStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleDelete = async (id: string) => {
    setTaskToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    const path = `tasks/${taskToDelete}`;
    try {
      await deleteDoc(doc(db, 'tasks', taskToDelete));
      setIsDeleteModalOpen(false);
      setTaskToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tareas</h2>
          <p className="text-slate-500">Gestione sus actividades diarias y plazos procesales.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          <Plus className="h-5 w-5" />
          Nueva Tarea
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pending */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 px-2">
            <Circle className="h-5 w-5 text-amber-500" />
            Pendientes
          </h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === 'pending').map(t => (
              <TaskCard key={t.id} task={t} updateStatus={updateStatus} handleDelete={handleDelete} cases={cases} users={users} />
            ))}
          </div>
        </div>

        {/* In Progress */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 px-2">
            <PlayCircle className="h-5 w-5 text-indigo-500" />
            En Proceso
          </h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === 'in-progress').map(t => (
              <TaskCard key={t.id} task={t} updateStatus={updateStatus} handleDelete={handleDelete} cases={cases} users={users} />
            ))}
          </div>
        </div>

        {/* Completed */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 px-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Terminadas
          </h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === 'completed').map(t => (
              <TaskCard key={t.id} task={t} updateStatus={updateStatus} handleDelete={handleDelete} cases={cases} users={users} />
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
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
                <h3 className="text-xl font-bold">Nueva Tarea</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-indigo-800 rounded-full transition-all">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Título</label>
                  <input required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
                  <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none resize-none focus:ring-2 focus:ring-indigo-500" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Vencimiento</label>
                  <input type="datetime-local" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Vincular a Expediente</label>
                  <select className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.caseId} onChange={e => setFormData({...formData, caseId: e.target.value})}>
                    <option value="">Ninguno</option>
                    {cases.map(c => <option key={c.id} value={c.id}>{c.caseNumber}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Asignar a</label>
                  <select required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.assignedUserId} onChange={e => setFormData({...formData, assignedUserId: e.target.value})}>
                    {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>)}
                  </select>
                </div>
                <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl mt-4 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                  Crear Tarea
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmationModal 
        isOpen={isDeleteModalOpen}
        title="Eliminar Tarea"
        message="¿Está seguro de que desea eliminar esta tarea? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setTaskToDelete(null);
        }}
      />
    </div>
  );
}

const TaskCard: React.FC<{ 
  task: Task, 
  updateStatus: (id: string, status: Task['status']) => void, 
  handleDelete: (id: string) => void,
  cases: Case[],
  users: UserProfile[]
}> = ({ task, updateStatus, handleDelete, cases, users }) => {
  const assignedUser = users.find(u => u.uid === task.assignedUserId);
  
  return (
    <motion.div 
      layout
      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-start gap-4 group hover:shadow-md transition-all"
    >
      <div className="flex flex-col gap-2">
        <button 
          onClick={() => updateStatus(task.id, 'completed')}
          className={`p-1 rounded-full transition-colors ${task.status === 'completed' ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}`}
        >
          <CheckCircle2 className="h-6 w-6" />
        </button>
        <button 
          onClick={() => updateStatus(task.id, 'in-progress')}
          className={`p-1 rounded-full transition-colors ${task.status === 'in-progress' ? 'text-indigo-500' : 'text-slate-300 hover:text-indigo-500'}`}
        >
          <PlayCircle className="h-6 w-6" />
        </button>
        <button 
          onClick={() => updateStatus(task.id, 'pending')}
          className={`p-1 rounded-full transition-colors ${task.status === 'pending' ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
        >
          <Circle className="h-6 w-6" />
        </button>
      </div>
      
      <div className="flex-1">
        <p className={`font-bold text-slate-900 ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
          {task.title}
        </p>
        <p className="text-sm text-slate-500 line-clamp-1">{task.description}</p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
            task.status === 'in-progress' ? 'bg-indigo-100 text-indigo-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {task.status === 'completed' ? 'Terminada' : task.status === 'in-progress' ? 'En Proceso' : 'Pendiente'}
          </span>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            Vence: {format(new Date(task.dueDate), 'dd/MM/yyyy HH:mm')}
          </span>
          {task.caseId && (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              Exp: {cases.find(c => c.id === task.caseId)?.caseNumber}
            </span>
          )}
          {assignedUser && (
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <UserIcon className="h-3 w-3" />
              {assignedUser.displayName}
            </span>
          )}
        </div>
      </div>
      
      <button 
        onClick={() => handleDelete(task.id)} 
        className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
