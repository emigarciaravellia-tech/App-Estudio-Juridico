import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, where, updateDoc, doc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Task, Case, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import {
  Plus, X, Trash2, History,
  CheckCircle2, Circle, PlayCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmationModal from './ConfirmationModal';

const COLUMNS: { key: Task['status']; label: string; color: string; dot: string }[] = [
  { key: 'pending',     label: 'Pendientes',  color: 'var(--mustard)',  dot: 'var(--mustard)' },
  { key: 'in-progress', label: 'En proceso',  color: 'var(--slate-c)', dot: 'var(--slate-c)' },
  { key: 'completed',   label: 'Terminadas',  color: 'var(--forest)',  dot: 'var(--forest)' },
];

export default function TaskManagement() {
  const { profile, isAdmin, isLawyer } = useAuth();
  const location = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === 'true') setIsModalOpen(true);
  }, [location.search]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    caseId: '',
    dueDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    isPersonal: false,
    assignedUserId: profile?.uid || '',
    isRecurring: false,
    recurrence: {
      frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
      interval: 1,
      endDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd')
    }
  });

  useEffect(() => {
    if (!profile) return;
    const q = (isAdmin || isLawyer)
      ? query(collection(db, 'tasks'))
      : query(collection(db, 'tasks'), where('assignedUserId', '==', profile.uid));
    const unsubTasks = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    }, e => handleFirestoreError(e, OperationType.LIST, 'tasks'));

    const unsubCases = onSnapshot(query(collection(db, 'cases')), snap => {
      setCases(snap.docs.map(d => ({ id: d.id, ...d.data() } as Case)));
    }, e => handleFirestoreError(e, OperationType.LIST, 'cases'));

    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('role', '!=', 'client')), snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, e => handleFirestoreError(e, OperationType.LIST, 'users'));

    return () => { unsubTasks(); unsubCases(); unsubUsers(); };
  }, [profile, isAdmin, isLawyer]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const initialStatus = 'pending';
    const baseTask = {
      title: formData.title,
      description: formData.description,
      caseId: formData.caseId,
      isPersonal: formData.isPersonal,
      assignedUserId: formData.assignedUserId || profile.uid,
      status: initialStatus,
      createdAt: new Date().toISOString(),
      history: [{ id: crypto.randomUUID(), status: initialStatus, changedBy: profile.uid, changedByName: profile.displayName || profile.email, timestamp: new Date().toISOString() }]
    };
    try {
      if (formData.isRecurring) {
        let current = new Date(formData.dueDate);
        const end = new Date(formData.recurrence.endDate);
        const parentId = crypto.randomUUID();
        let count = 0;
        while (current <= end && count < 50) {
          await addDoc(collection(db, 'tasks'), { ...baseTask, dueDate: current.toISOString(), isRecurring: true, recurrence: formData.recurrence, parentId });
          if (formData.recurrence.frequency === 'daily') current.setDate(current.getDate() + formData.recurrence.interval);
          else if (formData.recurrence.frequency === 'weekly') current.setDate(current.getDate() + 7 * formData.recurrence.interval);
          else if (formData.recurrence.frequency === 'monthly') current.setMonth(current.getMonth() + formData.recurrence.interval);
          else current.setFullYear(current.getFullYear() + formData.recurrence.interval);
          count++;
        }
      } else {
        await addDoc(collection(db, 'tasks'), { ...baseTask, dueDate: new Date(formData.dueDate).toISOString() });
      }
      setIsModalOpen(false);
      setFormData({ title: '', description: '', caseId: '', dueDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"), isPersonal: false, assignedUserId: profile.uid, isRecurring: false, recurrence: { frequency: 'monthly', interval: 1, endDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd') } });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const updateStatus = async (taskId: string, newStatus: Task['status']) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: newStatus,
        history: arrayUnion({ id: crypto.randomUUID(), status: newStatus, changedBy: profile.uid, changedByName: profile.displayName || profile.email, timestamp: new Date().toISOString() })
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleDelete = (id: string) => { setTaskToDelete(id); setIsDeleteModalOpen(true); };
  const confirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskToDelete));
      setIsDeleteModalOpen(false);
      setTaskToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskToDelete}`);
    }
  };

  const counts = { pending: tasks.filter(t => t.status === 'pending').length, 'in-progress': tasks.filter(t => t.status === 'in-progress').length, completed: tasks.filter(t => t.status === 'completed').length };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p className="lm-eyebrow" style={{ marginBottom: 6 }}>Actividad</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="lm-display" style={{ fontSize: 28, fontWeight: 500, color: 'var(--ink)', margin: 0, lineHeight: 1.1 }}>Tareas</h1>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
              {counts.pending} pendiente{counts.pending !== 1 ? 's' : ''} · {counts['in-progress']} en proceso · {counts.completed} terminada{counts.completed !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="lm-btn lm-btn--primary lm-btn--sm">
            <Plus size={13} /> Nueva tarea
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {COLUMNS.map(col => (
          <div key={col.key}>
            {/* Column header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 2px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.dot, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>{col.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>{counts[col.key]}</span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <AnimatePresence>
                {tasks.filter(t => t.status === col.key).map(task => (
                  <TaskCard key={task.id} task={task} updateStatus={updateStatus} handleDelete={handleDelete} cases={cases} users={users} />
                ))}
              </AnimatePresence>
              {tasks.filter(t => t.status === col.key).length === 0 && (
                <div style={{ padding: '20px 12px', textAlign: 'center', border: '1px dashed var(--rule-soft)', borderRadius: 'var(--r-md)' }}>
                  <p style={{ fontSize: 12, color: 'var(--ink-mute)', fontStyle: 'italic', margin: 0 }}>Sin tareas</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal nueva tarea */}
      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(20,15,8,0.5)', backdropFilter: 'blur(3px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ background: 'var(--paper)', width: '100%', maxWidth: 480, maxHeight: '90vh', borderRadius: 'var(--r-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', border: '0.5px solid var(--rule)' }}
            >
              <div style={{ padding: '18px 24px', background: 'var(--sidebar-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <p className="lm-eyebrow" style={{ color: 'var(--sidebar-fg-mute)', marginBottom: 2 }}>Nueva actividad</p>
                  <h3 className="lm-display" style={{ fontSize: 17, color: 'var(--sidebar-fg)', margin: 0 }}>Nueva tarea</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--sidebar-fg-mute)', padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="lm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Título</label>
                  <input required className="lm-input" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Descripción breve de la tarea" />
                </div>
                <div>
                  <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Descripción</label>
                  <textarea className="lm-textarea" rows={3} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ resize: 'none' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Vencimiento</label>
                    <input type="datetime-local" className="lm-input" value={formData.dueDate} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Asignar a</label>
                    <select required className="lm-select" value={formData.assignedUserId} onChange={e => setFormData({ ...formData, assignedUserId: e.target.value })}>
                      {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Vincular a expediente</label>
                  <select className="lm-select" value={formData.caseId} onChange={e => setFormData({ ...formData, caseId: e.target.value })}>
                    <option value="">Sin vincular</option>
                    {cases.map(c => <option key={c.id} value={c.id}>{c.caseNumber} — {c.caseTitle}</option>)}
                  </select>
                </div>

                <hr className="lm-divider" />

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--ink-2)' }}>
                  <input type="checkbox" checked={formData.isRecurring} onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })} style={{ accentColor: 'var(--oxblood)', width: 14, height: 14 }} />
                  <span style={{ fontWeight: 600 }}>Tarea periódica (recurrente)</span>
                </label>

                {formData.isRecurring && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    style={{ overflow: 'hidden', background: 'var(--paper-2)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r-md)', padding: '14px' }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 4 }}>Frecuencia</label>
                        <select className="lm-select" value={formData.recurrence.frequency} onChange={e => setFormData({ ...formData, recurrence: { ...formData.recurrence, frequency: e.target.value as any } })}>
                          <option value="daily">Diaria</option>
                          <option value="weekly">Semanal</option>
                          <option value="monthly">Mensual</option>
                          <option value="yearly">Anual</option>
                        </select>
                      </div>
                      <div>
                        <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 4 }}>Cada (intervalo)</label>
                        <input type="number" min="1" className="lm-input" value={formData.recurrence.interval} onChange={e => setFormData({ ...formData, recurrence: { ...formData.recurrence, interval: parseInt(e.target.value) || 1 } })} />
                      </div>
                    </div>
                    <div>
                      <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 4 }}>Fecha de finalización</label>
                      <input type="date" className="lm-input" value={formData.recurrence.endDate} onChange={e => setFormData({ ...formData, recurrence: { ...formData.recurrence, endDate: e.target.value } })} />
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--ink-mute)', fontStyle: 'italic', marginTop: 8, marginBottom: 0 }}>
                      Se crearán múltiples instancias hasta la fecha indicada (máx. 50).
                    </p>
                  </motion.div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="lm-btn lm-btn--ghost lm-btn--sm">Cancelar</button>
                  <button type="submit" className="lm-btn lm-btn--primary lm-btn--sm">Crear tarea</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Eliminar tarea"
        message="¿Está seguro de que desea eliminar esta tarea? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => { setIsDeleteModalOpen(false); setTaskToDelete(null); }}
      />
    </div>
  );
}

const TaskCard: React.FC<{
  task: Task;
  updateStatus: (id: string, status: Task['status']) => void;
  handleDelete: (id: string) => void;
  cases: Case[];
  users: UserProfile[];
}> = ({ task, updateStatus, handleDelete, cases, users }) => {
  const [showHistory, setShowHistory] = useState(false);
  const assignedUser = users.find(u => u.uid === task.assignedUserId);
  const linkedCase = cases.find(c => c.id === task.caseId);
  const isDone = task.status === 'completed';
  const isOverdue = !isDone && new Date(task.dueDate) < new Date();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
      className="lm-card"
      style={{ padding: '12px 14px' }}
    >
      {/* Title + actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
        {/* Status toggle buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, marginTop: 1 }}>
          <button title="Marcar completada" onClick={() => updateStatus(task.id, 'completed')} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 2, color: isDone ? 'var(--forest)' : 'var(--rule-2)', transition: 'color .12s' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--forest)')} onMouseLeave={e => (e.currentTarget.style.color = isDone ? 'var(--forest)' : 'var(--rule-2)')}>
            <CheckCircle2 size={15} />
          </button>
          <button title="En proceso" onClick={() => updateStatus(task.id, 'in-progress')} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 2, color: task.status === 'in-progress' ? 'var(--slate-c)' : 'var(--rule-2)', transition: 'color .12s' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--slate-c)')} onMouseLeave={e => (e.currentTarget.style.color = task.status === 'in-progress' ? 'var(--slate-c)' : 'var(--rule-2)')}>
            <PlayCircle size={15} />
          </button>
          <button title="Pendiente" onClick={() => updateStatus(task.id, 'pending')} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 2, color: task.status === 'pending' ? 'var(--mustard)' : 'var(--rule-2)', transition: 'color .12s' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--mustard)')} onMouseLeave={e => (e.currentTarget.style.color = task.status === 'pending' ? 'var(--mustard)' : 'var(--rule-2)')}>
            <Circle size={15} />
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: isDone ? 'var(--ink-mute)' : 'var(--ink)', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.3 }}>
            {task.title}
          </p>
          {task.description && (
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {task.description}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
          <button title="Eliminar" onClick={() => handleDelete(task.id)} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 3, color: 'var(--rule-2)', transition: 'color .12s' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--oxblood)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--rule-2)')}>
            <Trash2 size={13} />
          </button>
          <button title="Historial" onClick={() => setShowHistory(!showHistory)} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 3, color: showHistory ? 'var(--slate-c)' : 'var(--rule-2)', transition: 'color .12s' }}>
            <History size={13} />
          </button>
        </div>
      </div>

      {/* Meta chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 999, background: isOverdue ? 'var(--oxblood-soft)' : 'var(--paper-2)', color: isOverdue ? 'var(--oxblood)' : 'var(--ink-3)', fontWeight: 600, border: `0.5px solid ${isOverdue ? 'var(--oxblood)' : 'var(--rule)'}` }}>
          {format(new Date(task.dueDate), 'dd/MM HH:mm')}
        </span>
        {linkedCase && (
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 999, background: 'var(--mustard-soft)', color: 'var(--mustard)', fontWeight: 600 }}>
            {linkedCase.caseNumber}
          </span>
        )}
        {assignedUser && (
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'var(--paper-2)', color: 'var(--ink-3)', fontWeight: 600 }}>
            {assignedUser.displayName}
          </span>
        )}
      </div>

      {/* History */}
      <AnimatePresence>
        {showHistory && task.history && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--rule-soft)' }}
          >
            <p className="lm-eyebrow" style={{ marginBottom: 8, fontSize: 9 }}>Historial</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...task.history].reverse().map(entry => (
                <div key={entry.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: entry.status === 'completed' ? 'var(--forest)' : entry.status === 'in-progress' ? 'var(--slate-c)' : 'var(--mustard)' }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-2)' }}>
                      → <strong>{entry.status === 'completed' ? 'Terminada' : entry.status === 'in-progress' ? 'En proceso' : 'Pendiente'}</strong>
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: 'var(--ink-mute)' }}>
                      {entry.changedByName} · {format(new Date(entry.timestamp), 'dd/MM HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
