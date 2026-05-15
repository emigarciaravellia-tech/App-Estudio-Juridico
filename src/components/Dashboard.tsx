import { useEffect, useState } from 'react';
import { collection, query, limit, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Case, Task, Event, Invoice } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { 
  Briefcase, 
  CheckSquare, 
  Calendar as CalendarIcon, 
  Clock,
  AlertCircle,
  History,
  Bell,
  Plus,
  ChevronRight,
  FileText,
  User,
} from 'lucide-react';
import { motion } from 'motion/react';
import { format, isBefore, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [recentCases, setRecentCases] = useState<Case[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [upcomingInvoices, setUpcomingInvoices] = useState<Invoice[]>([]);
  useEffect(() => {
    if (!profile) return;

    // Recent Cases (Últimos movimientos)
    const casesQuery = query(collection(db, 'cases'), orderBy('updatedAt', 'desc'), limit(10));
    const unsubscribeCases = onSnapshot(casesQuery, (snapshot) => {
      const cases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case));
      setRecentCases(cases);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });

    // Pending Tasks (Vencimientos)
    const tasksQuery = query(
      collection(db, 'tasks'), 
      where('assignedUserId', '==', profile.uid),
      where('status', '==', 'pending'),
      orderBy('dueDate', 'asc'),
      limit(10)
    );
    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      setPendingTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    });

    // Upcoming Events
    const eventsQuery = query(
      collection(db, 'events'),
      where('startTime', '>=', new Date().toISOString()),
      orderBy('startTime', 'asc'),
      limit(10)
    );
    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      setUpcomingEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Event)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
    });

    // Upcoming Invoices (Vencimientos de facturas en la próxima semana)
    const nextWeek = addDays(new Date(), 7).toISOString();
    const today = new Date().toISOString();
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('dueDate', '<=', nextWeek),
      where('dueDate', '>=', today),
      orderBy('dueDate', 'asc')
    );
    const unsubscribeInvoices = onSnapshot(invoicesQuery, (snapshot) => {
      const invoices = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Invoice))
        .filter(inv => inv.status === 'pending' || inv.status === 'partial');
      setUpcomingInvoices(invoices);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    return () => {
      unsubscribeCases();
      unsubscribeTasks();
      unsubscribeEvents();
      unsubscribeInvoices();
    };
  }, [profile]);

  const allDeadlines = [
    ...pendingTasks.map(t => ({ id: t.id, title: t.title, date: t.dueDate, type: 'task' as const })),
    ...upcomingEvents.map(e => ({ id: e.id, title: e.title, date: e.startTime, type: 'event' as const }))
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4 md:p-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">
            Hola, {profile?.displayName?.split(' ')[0]}
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Esto es lo más importante para hoy, {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Bell className="h-5 w-5" />
          </button>
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-200">
            {profile?.displayName?.[0]}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Deadlines & Quick Actions */}
        <div className="lg:col-span-8 space-y-8">
          {/* Upcoming Deadlines */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Próximos Vencimientos</h3>
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Próximos 7 días</span>
            </div>
            <div className="divide-y divide-slate-100">
              {allDeadlines.length > 0 ? (
                allDeadlines.slice(0, 6).map((item) => {
                  const date = new Date(item.date);
                  const isUrgent = isBefore(date, addDays(new Date(), 2));
                  
                  return (
                    <motion.div 
                      key={item.id} 
                      whileHover={{ x: 5 }}
                      onClick={() => navigate(item.type === 'task' ? '/tasks' : '/calendar')}
                      className="p-6 flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-2xl flex flex-col items-center justify-center ${
                          isUrgent ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'
                        }`}>
                          <span className="text-[10px] font-bold uppercase">{format(date, 'MMM', { locale: es })}</span>
                          <span className="text-lg font-black leading-none">{format(date, 'd')}</span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{item.title}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {item.type === 'task' ? 'Tarea' : 'Evento'} • {format(date, 'HH:mm')} hs
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-600 transition-all" />
                    </motion.div>
                  );
                })
              ) : (
                <div className="p-12 text-center space-y-3">
                  <CheckSquare className="h-12 w-12 text-slate-200 mx-auto" />
                  <p className="text-slate-400 font-medium">No tienes vencimientos próximos.</p>
                </div>
              )}
            </div>
          </section>

          {/* Upcoming Invoices */}
          {upcomingInvoices.length > 0 && (
            <section className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                    <FileText className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Facturas por Vencer</h3>
                </div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Semana actual</span>
              </div>
              <div className="divide-y divide-slate-100">
                {upcomingInvoices.map((invoice) => (
                  <motion.div 
                    key={invoice.id} 
                    whileHover={{ x: 5 }}
                    onClick={() => navigate('/billing')}
                    className="p-6 flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold uppercase">{format(new Date(invoice.dueDate), 'MMM', { locale: es })}</span>
                        <span className="text-lg font-black leading-none">{format(new Date(invoice.dueDate), 'd')}</span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                          Factura #{invoice.id.slice(-6).toUpperCase()}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {invoice.amount.toLocaleString('es-AR', { style: 'currency', currency: invoice.currency })} • {invoice.status === 'partial' ? 'Pago Parcial' : 'Pendiente'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-slate-900">
                        {invoice.amount.toLocaleString('es-AR', { style: 'currency', currency: invoice.currency })}
                      </span>
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-emerald-600 transition-all" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Quick Actions Grid */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button 
              onClick={() => navigate('/cases?new=true')}
              className="flex flex-col items-center justify-center p-6 bg-indigo-600 text-white rounded-3xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 group"
            >
              <Plus className="h-8 w-8 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">Nuevo Expediente</span>
            </button>
            <button 
              onClick={() => navigate('/tasks?new=true')}
              className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 text-slate-600 rounded-3xl hover:border-indigo-600 hover:text-indigo-600 transition-all group"
            >
              <CheckSquare className="h-8 w-8 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">Nueva Tarea</span>
            </button>
            <button 
              onClick={() => navigate('/calendar?new=true')}
              className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 text-slate-600 rounded-3xl hover:border-indigo-600 hover:text-indigo-600 transition-all group"
            >
              <CalendarIcon className="h-8 w-8 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-wider">Agendar</span>
            </button>
          </section>
        </div>

        {/* Right Column: Recent Activity */}
        <div className="lg:col-span-4">
          <section className="bg-slate-900 rounded-3xl shadow-xl overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 text-indigo-400 rounded-xl">
                  <History className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-white">Actividad Reciente</h3>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {recentCases.length > 0 ? (
                recentCases.map((c) => (
                  <div 
                    key={c.id} 
                    onClick={() => navigate('/cases')}
                    className="relative pl-6 border-l border-slate-800 space-y-1 cursor-pointer group"
                  >
                    <div className="absolute left-[-5px] top-1 h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {format(new Date(c.updatedAt), "d 'de' MMM, HH:mm", { locale: es })}
                    </p>
                    <p className="text-sm font-bold text-slate-200 line-clamp-1 group-hover:text-indigo-400 transition-colors">{c.caseTitle || c.caseNumber}</p>
                    <p className="text-xs text-slate-400">
                      Actualización en expediente <span className="text-indigo-400 font-medium">{c.caseNumber}</span>
                    </p>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                  <History className="h-8 w-8 opacity-20" />
                  <p className="text-xs">Sin actividad reciente.</p>
                </div>
              )}
            </div>
            <div className="p-6 bg-slate-800/50">
              <button 
                onClick={() => navigate('/cases')}
                className="w-full py-3 bg-slate-800 text-slate-300 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-slate-700 transition-all"
              >
                Ver historial completo
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
