import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, where, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Event, Case } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Clock, X, LayoutGrid, List, Trash2 } from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  subDays,
  isToday,
  startOfDay,
  parseISO
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmationModal from './ConfirmationModal';

export default function Calendar() {
  const { profile, isAdmin, isLawyer, isAssistant } = useAuth();
  const location = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [events, setEvents] = useState<Event[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === 'true') {
      setIsModalOpen(true);
    }
  }, [location.search]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [viewingEvent, setViewingEvent] = useState<Event | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    caseId: '',
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    endTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    type: 'meeting' as const
  });

  useEffect(() => {
    const q = query(collection(db, 'events'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Event)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
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
    if (!profile) return;
    const path = 'events';
    try {
      await addDoc(collection(db, path), {
        ...formData,
        assignedUserIds: [profile.uid]
      });
      setIsModalOpen(false);
      setFormData({
        title: '',
        description: '',
        caseId: '',
        startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        endTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        type: 'meeting'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEventToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!eventToDelete) return;
    const path = `events/${eventToDelete}`;
    try {
      await deleteDoc(doc(db, 'events', eventToDelete));
      setIsDeleteModalOpen(false);
      setEventToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
          <div key={day} className="bg-slate-50 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            {day}
          </div>
        ))}
        {days.map((day, idx) => {
          const dayEvents = events.filter(e => isSameDay(parseISO(e.startTime), day));
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          
          return (
            <div 
              key={idx} 
              className={`bg-white min-h-[120px] p-2 transition-colors hover:bg-slate-50 ${!isCurrentMonth ? 'bg-slate-50/50' : ''}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${
                  isToday(day) ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-slate-900' : 'text-slate-300'
                }`}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-1">
                {dayEvents.map(e => (
                  <div 
                    key={e.id} 
                    onClick={() => setViewingEvent(e)}
                    className={`text-[10px] p-1.5 rounded-lg truncate font-bold shadow-sm relative group/event cursor-pointer ${
                      e.type === 'hearing' ? 'bg-red-100 text-red-700' :
                      e.type === 'deadline' ? 'bg-amber-100 text-amber-700' :
                      e.type === 'other' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    {format(parseISO(e.startTime), 'HH:mm')} {e.title}
                    {(isAdmin || isLawyer || isAssistant) && (
                      <button 
                        onClick={(event) => handleDelete(e.id, event)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/event:opacity-100 p-0.5 hover:bg-black/10 rounded transition-all"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWeekView = () => {
    const startDate = startOfWeek(currentDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[700px]">
        <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50">
          <div className="p-4 border-r border-slate-200"></div>
          {days.map(day => (
            <div key={day.toString()} className="p-4 text-center border-r border-slate-200 last:border-r-0">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{format(day, 'EEE')}</p>
              <p className={`text-lg font-bold ${isToday(day) ? 'text-indigo-600' : 'text-slate-900'}`}>{format(day, 'd')}</p>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-8 relative">
            <div className="col-span-1 border-r border-slate-100">
              {hours.map(hour => (
                <div key={hour} className="h-20 border-b border-slate-100 p-2 text-right text-[10px] font-bold text-slate-400">
                  {hour}:00
                </div>
              ))}
            </div>
            {days.map(day => (
              <div key={day.toString()} className="col-span-1 border-r border-slate-100 last:border-r-0 relative">
                {hours.map(hour => (
                  <div key={hour} className="h-20 border-b border-slate-100"></div>
                ))}
                {events.filter(e => isSameDay(parseISO(e.startTime), day)).map(e => {
                  const start = parseISO(e.startTime);
                  const end = parseISO(e.endTime);
                  const top = (start.getHours() * 80) + (start.getMinutes() * 80 / 60);
                  const height = Math.max(40, ((end.getTime() - start.getTime()) / (1000 * 60 * 60)) * 80);
                  
                  return (
                    <div 
                      key={e.id}
                      onClick={() => setViewingEvent(e)}
                      className={`absolute left-1 right-1 p-2 rounded-xl text-[10px] font-bold shadow-md overflow-hidden z-10 group/event cursor-pointer ${
                        e.type === 'hearing' ? 'bg-red-100 text-red-700 border-l-4 border-red-500' :
                        e.type === 'deadline' ? 'bg-amber-100 text-amber-700 border-l-4 border-amber-500' :
                        e.type === 'other' ? 'bg-emerald-100 text-emerald-700 border-l-4 border-emerald-500' :
                        'bg-indigo-100 text-indigo-700 border-l-4 border-indigo-500'
                      }`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="flex justify-between items-start">
                        <span>{format(start, 'HH:mm')} - {e.title}</span>
                        {(isAdmin || isLawyer || isAssistant) && (
                          <button 
                            onClick={(event) => handleDelete(e.id, event)}
                            className="opacity-0 group-hover/event:opacity-100 p-1 hover:bg-black/10 rounded transition-all"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Calendario Judicial</h2>
          <p className="text-slate-500">Agenda mensual y semanal de audiencias y plazos.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm">
            <button 
              onClick={() => setView('month')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${view === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <LayoutGrid className="h-4 w-4" />
              Mes
            </button>
            <button 
              onClick={() => setView('week')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${view === 'week' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <List className="h-4 w-4" />
              Semana
            </button>
          </div>
          {(isAdmin || isLawyer || isAssistant) && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <Plus className="h-5 w-5" />
              Nuevo Evento
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900">
          {view === 'month' ? format(currentDate, 'MMMM yyyy') : `Semana del ${format(startOfWeek(currentDate), 'd MMM')}`}
        </h3>
        <div className="flex gap-2">
          <button 
            onClick={() => setCurrentDate(view === 'month' ? subMonths(currentDate, 1) : subDays(currentDate, 7))} 
            className="p-2 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button 
            onClick={() => setCurrentDate(new Date())}
            className="px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded-xl transition-all"
          >
            Hoy
          </button>
          <button 
            onClick={() => setCurrentDate(view === 'month' ? addMonths(currentDate, 1) : addDays(currentDate, 7))} 
            className="p-2 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {view === 'month' ? renderMonthView() : renderWeekView()}

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
                <h3 className="text-xl font-bold">Nuevo Evento</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-indigo-800 rounded-full transition-all">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Título</label>
                  <input required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Inicio</label>
                    <input type="datetime-local" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Fin</label>
                    <input type="datetime-local" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tipo</label>
                  <select className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}>
                    <option value="meeting">Reunión</option>
                    <option value="hearing">Audiencia</option>
                    <option value="deadline">Plazo / Vencimiento</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Vincular a Expediente</label>
                  <select className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.caseId} onChange={e => setFormData({...formData, caseId: e.target.value})}>
                    <option value="">Ninguno</option>
                    {cases.map(c => <option key={c.id} value={c.id}>{c.caseNumber}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
                  <textarea 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 resize-none" 
                    rows={3}
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                  />
                </div>
                <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl mt-4 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                  Crear Evento
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Event Details Modal */}
      <AnimatePresence>
        {viewingEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className={`p-6 text-white flex items-center justify-between ${
                viewingEvent.type === 'hearing' ? 'bg-red-600' :
                viewingEvent.type === 'deadline' ? 'bg-amber-600' :
                viewingEvent.type === 'other' ? 'bg-emerald-600' :
                'bg-indigo-900'
              }`}>
                <div>
                  <h3 className="text-xl font-bold">{viewingEvent.title}</h3>
                  <p className="text-white/80 text-xs uppercase tracking-widest font-bold mt-1">
                    {viewingEvent.type === 'hearing' ? 'Audiencia' :
                     viewingEvent.type === 'deadline' ? 'Plazo / Vencimiento' :
                     viewingEvent.type === 'meeting' ? 'Reunión' : 'Otro'}
                  </p>
                </div>
                <button onClick={() => setViewingEvent(null)} className="p-2 hover:bg-black/10 rounded-full transition-all">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                  <Clock className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Horario</p>
                    <p className="font-bold">
                      {format(parseISO(viewingEvent.startTime), 'dd/MM/yyyy HH:mm')} - {format(parseISO(viewingEvent.endTime), 'HH:mm')}
                    </p>
                  </div>
                </div>
                
                {viewingEvent.caseId && (
                  <div className="flex items-center gap-3 text-slate-600">
                    <CalendarIcon className="h-5 w-5 text-indigo-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Expediente</p>
                      <p className="font-bold">
                        {cases.find(c => c.id === viewingEvent.caseId)?.caseNumber || 'Cargando...'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 uppercase">Descripción</p>
                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                    {viewingEvent.description || 'Sin descripción.'}
                  </p>
                </div>

                <div className="pt-4 flex gap-2">
                  {(isAdmin || isLawyer || isAssistant) && (
                    <button 
                      onClick={(e) => {
                        handleDelete(viewingEvent.id, e as any);
                        setViewingEvent(null);
                      }}
                      className="flex-1 py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </button>
                  )}
                  <button 
                    onClick={() => setViewingEvent(null)}
                    className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={isDeleteModalOpen}
        title="Eliminar Evento"
        message="¿Está seguro de que desea eliminar este evento? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => {
          setIsDeleteModalOpen(false);
          setEventToDelete(null);
        }}
      />
    </div>
  );
}
