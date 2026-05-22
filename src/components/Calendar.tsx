import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Event, Case } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Clock, X, LayoutGrid, List, Trash2 } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek, addDays, subDays,
  isToday, parseISO, isAfter
} from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmationModal from './ConfirmationModal';

const EVENT_COLORS: Record<string, { bg: string; color: string; dot: string }> = {
  hearing:  { bg: 'var(--oxblood-soft)',  color: 'var(--oxblood)',  dot: 'var(--oxblood)' },
  deadline: { bg: 'var(--mustard-soft)',  color: 'var(--mustard)',  dot: 'var(--mustard)' },
  meeting:  { bg: 'var(--slate-soft)',    color: 'var(--slate-c)',  dot: 'var(--slate-c)' },
  other:    { bg: 'var(--forest-soft)',   color: 'var(--forest)',   dot: 'var(--forest)' },
};

const TYPE_LABELS: Record<string, string> = {
  hearing: 'Audiencia', deadline: 'Plazo / Vencimiento', meeting: 'Reunión', other: 'Otro'
};

export default function Calendar() {
  const { profile, isAdmin, isLawyer, isAssistant } = useAuth();
  const location = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'agenda'>('month');
  const [events, setEvents] = useState<Event[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
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
    type: 'meeting' as const,
    isRecurring: false,
    recurrence: {
      frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
      interval: 1,
      endDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd')
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') === 'true') setIsModalOpen(true);
  }, [location.search]);

  useEffect(() => {
    const unsubEvents = onSnapshot(query(collection(db, 'events')), snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Event)));
    }, e => handleFirestoreError(e, OperationType.LIST, 'events'));
    const unsubCases = onSnapshot(query(collection(db, 'cases')), snap => {
      setCases(snap.docs.map(d => ({ id: d.id, ...d.data() } as Case)));
    }, e => handleFirestoreError(e, OperationType.LIST, 'cases'));
    return () => { unsubEvents(); unsubCases(); };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const baseEvent = { title: formData.title, description: formData.description, caseId: formData.caseId, type: formData.type, assignedUserIds: [profile.uid], createdAt: new Date().toISOString() };
    try {
      if (formData.isRecurring) {
        let curStart = new Date(formData.startTime);
        let curEnd = new Date(formData.endTime);
        const end = new Date(formData.recurrence.endDate);
        const parentId = crypto.randomUUID();
        let count = 0;
        while (curStart <= end && count < 50) {
          await addDoc(collection(db, 'events'), { ...baseEvent, startTime: curStart.toISOString(), endTime: curEnd.toISOString(), isRecurring: true, recurrence: formData.recurrence, parentId });
          if (formData.recurrence.frequency === 'daily') { curStart.setDate(curStart.getDate() + formData.recurrence.interval); curEnd.setDate(curEnd.getDate() + formData.recurrence.interval); }
          else if (formData.recurrence.frequency === 'weekly') { curStart.setDate(curStart.getDate() + 7 * formData.recurrence.interval); curEnd.setDate(curEnd.getDate() + 7 * formData.recurrence.interval); }
          else if (formData.recurrence.frequency === 'monthly') { curStart.setMonth(curStart.getMonth() + formData.recurrence.interval); curEnd.setMonth(curEnd.getMonth() + formData.recurrence.interval); }
          else { curStart.setFullYear(curStart.getFullYear() + formData.recurrence.interval); curEnd.setFullYear(curEnd.getFullYear() + formData.recurrence.interval); }
          count++;
        }
      } else {
        await addDoc(collection(db, 'events'), { ...baseEvent, startTime: new Date(formData.startTime).toISOString(), endTime: new Date(formData.endTime).toISOString() });
      }
      setIsModalOpen(false);
      setFormData({ title: '', description: '', caseId: '', startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"), endTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"), type: 'meeting', isRecurring: false, recurrence: { frequency: 'monthly', interval: 1, endDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), 'yyyy-MM-dd') } });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEventToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!eventToDelete) return;
    try {
      await deleteDoc(doc(db, 'events', eventToDelete));
      setIsDeleteModalOpen(false);
      setEventToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${eventToDelete}`);
    }
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });

    return (
      <div className="lm-hscroll">
      <div className="lm-card" style={{ overflow: 'hidden', minWidth: 560 }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '0.5px solid var(--rule)' }}>
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
            <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)', fontFamily: 'var(--font-sans)', background: 'var(--paper-2)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map((day, idx) => {
            const dayEvents = events.filter(e => isSameDay(parseISO(e.startTime), day));
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isSelected = isSameDay(day, selectedDay);
            const isTodayDay = isToday(day);

            return (
              <div
                key={idx}
                onClick={() => setSelectedDay(day)}
                style={{
                  minHeight: 96,
                  padding: '6px 8px',
                  borderRight: (idx + 1) % 7 !== 0 ? '0.5px solid var(--rule-soft)' : 'none',
                  borderBottom: idx < days.length - 7 ? '0.5px solid var(--rule-soft)' : 'none',
                  background: isSelected ? 'var(--paper-2)' : isCurrentMonth ? 'var(--surface)' : 'var(--paper)',
                  cursor: 'pointer',
                  transition: 'background .1s',
                  outline: isSelected ? '1.5px solid var(--oxblood)' : 'none',
                  outlineOffset: -1.5,
                  zIndex: isSelected ? 1 : 0,
                  position: 'relative',
                }}
              >
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%',
                  background: isTodayDay ? 'var(--oxblood)' : 'transparent',
                  fontSize: 12, fontWeight: isTodayDay ? 700 : isCurrentMonth ? 500 : 400,
                  color: isTodayDay ? '#fbf6e9' : isCurrentMonth ? 'var(--ink)' : 'var(--rule-2)',
                  marginBottom: 4,
                }}>
                  {format(day, 'd')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dayEvents.slice(0, 3).map(ev => {
                    const cfg = EVENT_COLORS[ev.type] ?? EVENT_COLORS['other'];
                    return (
                      <div
                        key={ev.id}
                        onClick={e => { e.stopPropagation(); setViewingEvent(ev); }}
                        style={{
                          fontSize: 10, fontWeight: 600, padding: '1px 5px',
                          borderRadius: 3, truncate: 'hidden',
                          background: cfg.bg, color: cfg.color,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        {format(parseISO(ev.startTime), 'HH:mm')} {ev.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span style={{ fontSize: 9.5, color: 'var(--ink-mute)', paddingLeft: 4 }}>+{dayEvents.length - 3} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected day events strip */}
        {events.filter(e => isSameDay(parseISO(e.startTime), selectedDay)).length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--rule)', background: 'var(--paper-2)' }}>
            <p className="lm-eyebrow" style={{ marginBottom: 8 }}>
              {format(selectedDay, "d 'de' MMMM", { locale: es })}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {events.filter(e => isSameDay(parseISO(e.startTime), selectedDay)).map(ev => {
                const cfg = EVENT_COLORS[ev.type] ?? EVENT_COLORS['other'];
                return (
                  <div key={ev.id} onClick={() => setViewingEvent(ev)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', border: '0.5px solid var(--rule-soft)', borderRadius: 'var(--r)', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{ev.title}</span>
                    <span className="lm-mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{format(parseISO(ev.startTime), 'HH:mm')}</span>
                    <span style={{ fontSize: 10.5, color: cfg.color, fontWeight: 600 }}>{TYPE_LABELS[ev.type]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </div>
    );
  };

  const renderAgendaView = () => {
    const sorted = [...events].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const upcoming = sorted.filter(e => isAfter(parseISO(e.startTime), subDays(new Date(), 1)));

    if (upcoming.length === 0) {
      return (
        <div className="lm-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <CalendarIcon size={32} color="var(--rule)" style={{ margin: '0 auto 12px', display: 'block' }} />
          <p style={{ fontSize: 13, color: 'var(--ink-mute)', fontStyle: 'italic' }}>No hay eventos próximos en la agenda.</p>
        </div>
      );
    }

    return (
      <div className="lm-card" style={{ overflow: 'hidden' }}>
        {upcoming.map((ev, idx) => {
          const date = parseISO(ev.startTime);
          const showHeader = idx === 0 || !isSameDay(date, parseISO(upcoming[idx - 1].startTime));
          const cfg = EVENT_COLORS[ev.type] ?? EVENT_COLORS['other'];
          return (
            <React.Fragment key={ev.id}>
              {showHeader && (
                <div style={{ padding: '8px 16px', background: 'var(--paper-2)', borderBottom: '0.5px solid var(--rule-soft)' }}>
                  <p className="lm-eyebrow" style={{ fontSize: 9.5 }}>
                    {format(date, "EEEE d 'de' MMMM", { locale: es })}
                  </p>
                </div>
              )}
              <div
                onClick={() => setViewingEvent(ev)}
                className="lm-row"
                style={{ gridTemplateColumns: '48px 1fr auto', borderLeft: `3px solid ${cfg.dot}` }}
              >
                <div style={{ textAlign: 'center' }}>
                  <p className="lm-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>{format(date, 'HH')}</p>
                  <p className="lm-mono" style={{ fontSize: 10, color: 'var(--ink-3)', margin: 0 }}>{format(date, 'mm')}</p>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.description || TYPE_LABELS[ev.type]}</p>
                </div>
                <span className="lm-chip" style={{ background: cfg.bg, color: cfg.color, fontSize: 10 }}>
                  <span className="lm-dot" style={{ background: cfg.dot }} />
                  {TYPE_LABELS[ev.type]}
                </span>
              </div>
            </React.Fragment>
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
      <div className="lm-hscroll">
      <div className="lm-card" style={{ overflow: 'hidden', height: 680, display: 'flex', flexDirection: 'column', minWidth: 700 }}>
        {/* Week day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', background: 'var(--paper-2)', borderBottom: '0.5px solid var(--rule)', flexShrink: 0 }}>
          <div />
          {days.map(day => (
            <div key={day.toString()} style={{ padding: '8px 4px', textAlign: 'center', borderLeft: '0.5px solid var(--rule-soft)' }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {format(day, 'EEE', { locale: es })}
              </p>
              <p style={{ margin: 0, fontSize: 16, fontWeight: isToday(day) ? 700 : 400, color: isToday(day) ? 'var(--oxblood)' : 'var(--ink)' }}>
                {format(day, 'd')}
              </p>
            </div>
          ))}
        </div>

        {/* Hour grid */}
        <div className="lm-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', position: 'relative' }}>
            <div>
              {hours.map(h => (
                <div key={h} style={{ height: 80, borderBottom: '0.5px solid var(--rule-soft)', padding: '4px 8px', textAlign: 'right' }}>
                  <span className="lm-mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)' }}>{h}:00</span>
                </div>
              ))}
            </div>
            {days.map(day => (
              <div key={day.toString()} style={{ borderLeft: '0.5px solid var(--rule-soft)', position: 'relative' }}>
                {hours.map(h => (
                  <div key={h} style={{ height: 80, borderBottom: '0.5px solid var(--rule-soft)' }} />
                ))}
                {events.filter(e => isSameDay(parseISO(e.startTime), day)).map(ev => {
                  const start = parseISO(ev.startTime);
                  const end = parseISO(ev.endTime);
                  const top = start.getHours() * 80 + start.getMinutes() * 80 / 60;
                  const height = Math.max(32, ((end.getTime() - start.getTime()) / (1000 * 60 * 60)) * 80);
                  const cfg = EVENT_COLORS[ev.type] ?? EVENT_COLORS['other'];
                  return (
                    <div
                      key={ev.id}
                      onClick={() => setViewingEvent(ev)}
                      style={{ position: 'absolute', left: 2, right: 2, top, height, background: cfg.bg, color: cfg.color, borderLeft: `3px solid ${cfg.dot}`, borderRadius: 'var(--r)', padding: '2px 6px', fontSize: 10, fontWeight: 600, overflow: 'hidden', cursor: 'pointer', zIndex: 1 }}
                    >
                      {format(start, 'HH:mm')} {ev.title}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p className="lm-eyebrow" style={{ marginBottom: 6 }}>Agenda judicial</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <h1 className="lm-display" style={{ fontSize: 28, fontWeight: 500, color: 'var(--ink)', margin: 0, lineHeight: 1.1 }}>Calendario</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--paper-2)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: 3 }}>
              {([['month', 'Mes', LayoutGrid], ['week', 'Semana', List], ['agenda', 'Agenda', Clock]] as const).map(([v, label, Icon]) => (
                <button key={v} onClick={() => setView(v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 4, border: 0, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)', background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? 'var(--ink)' : 'var(--ink-3)', boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', transition: 'all .12s' }}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
            {(isAdmin || isLawyer || isAssistant) && (
              <button onClick={() => setIsModalOpen(true)} className="lm-btn lm-btn--primary lm-btn--sm">
                <Plus size={13} /> Nuevo evento
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Month/Period navigation */}
      <div className="lm-card" style={{ padding: '10px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setCurrentDate(view === 'month' ? subMonths(currentDate, 1) : subDays(currentDate, 7))} style={{ background: 'none', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: '5px 8px', cursor: 'pointer', color: 'var(--ink-3)' }}>
            <ChevronLeft size={14} />
          </button>
          <h3 className="lm-display" style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 500, color: 'var(--ink)', margin: 0, textTransform: 'capitalize' }}>
            {view === 'month'
              ? format(currentDate, 'MMMM yyyy', { locale: es })
              : view === 'agenda'
              ? 'Próximos eventos'
              : `Semana del ${format(startOfWeek(currentDate), "d 'de' MMMM", { locale: es })}`}
          </h3>
          <button onClick={() => setCurrentDate(new Date())} style={{ padding: '5px 10px', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', background: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: 'var(--oxblood)', fontFamily: 'var(--font-sans)' }}>
            Hoy
          </button>
          <button onClick={() => setCurrentDate(view === 'month' ? addMonths(currentDate, 1) : addDays(currentDate, 7))} style={{ background: 'none', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: '5px 8px', cursor: 'pointer', color: 'var(--ink-3)' }}>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Color legend */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 10, marginTop: 10, borderTop: '0.5px solid var(--rule-soft)' }}>
          {(Object.entries(TYPE_LABELS) as [string, string][]).map(([type, label]) => {
            const cfg = EVENT_COLORS[type];
            return (
              <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: cfg.dot, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', letterSpacing: '0.03em' }}>{label}</span>
              </span>
            );
          })}
        </div>
      </div>

      {view === 'month' ? renderMonthView() : view === 'week' ? renderWeekView() : renderAgendaView()}

      {/* New Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(20,15,8,0.5)', backdropFilter: 'blur(3px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ background: 'var(--paper)', width: '100%', maxWidth: 480, maxHeight: '90vh', borderRadius: 'var(--r-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', border: '0.5px solid var(--rule)' }}
            >
              <div style={{ padding: '18px 24px', background: 'var(--sidebar-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <p className="lm-eyebrow" style={{ color: 'var(--sidebar-fg-mute)', marginBottom: 2 }}>Agendar</p>
                  <h3 className="lm-display" style={{ fontSize: 17, color: 'var(--sidebar-fg)', margin: 0 }}>Nuevo evento</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--sidebar-fg-mute)', padding: 6 }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="lm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Título</label>
                  <input required className="lm-input" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                </div>
                <div className="lm-form-grid" style={{ gap: 12 }}>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Inicio</label>
                    <input type="datetime-local" className="lm-input" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} />
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Fin</label>
                    <input type="datetime-local" className="lm-input" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} />
                  </div>
                </div>
                <div className="lm-form-grid" style={{ gap: 12 }}>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Tipo</label>
                    <select className="lm-select" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })}>
                      <option value="meeting">Reunión</option>
                      <option value="hearing">Audiencia</option>
                      <option value="deadline">Plazo / Vencimiento</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Expediente</label>
                    <select className="lm-select" value={formData.caseId} onChange={e => setFormData({ ...formData, caseId: e.target.value })}>
                      <option value="">Sin vincular</option>
                      {cases.map(c => <option key={c.id} value={c.id}>{c.caseNumber}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 5 }}>Descripción</label>
                  <textarea className="lm-textarea" rows={3} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ resize: 'none' }} />
                </div>

                <hr className="lm-divider" />

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--ink-2)' }}>
                  <input type="checkbox" checked={formData.isRecurring} onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })} style={{ accentColor: 'var(--oxblood)', width: 14, height: 14 }} />
                  <span style={{ fontWeight: 600 }}>Evento periódico (recurrente)</span>
                </label>

                {formData.isRecurring && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    style={{ overflow: 'hidden', background: 'var(--paper-2)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r-md)', padding: 14 }}
                  >
                    <div className="lm-form-grid" style={{ gap: 10, marginBottom: 10 }}>
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
                        <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 4 }}>Intervalo</label>
                        <input type="number" min="1" className="lm-input" value={formData.recurrence.interval} onChange={e => setFormData({ ...formData, recurrence: { ...formData.recurrence, interval: parseInt(e.target.value) || 1 } })} />
                      </div>
                    </div>
                    <div>
                      <label className="lm-eyebrow" style={{ display: 'block', marginBottom: 4 }}>Hasta</label>
                      <input type="date" className="lm-input" value={formData.recurrence.endDate} onChange={e => setFormData({ ...formData, recurrence: { ...formData.recurrence, endDate: e.target.value } })} />
                    </div>
                  </motion.div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="lm-btn lm-btn--ghost lm-btn--sm">Cancelar</button>
                  <button type="submit" className="lm-btn lm-btn--primary lm-btn--sm">Crear evento</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Event Details Modal */}
      <AnimatePresence>
        {viewingEvent && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(20,15,8,0.5)', backdropFilter: 'blur(3px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ background: 'var(--paper)', width: '100%', maxWidth: 380, borderRadius: 'var(--r-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', border: '0.5px solid var(--rule)' }}
            >
              {(() => {
                const cfg = EVENT_COLORS[viewingEvent.type] ?? EVENT_COLORS['other'];
                return (
                  <>
                    <div style={{ padding: '18px 22px', background: 'var(--sidebar-bg)', borderBottom: `3px solid ${cfg.dot}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <span className="lm-chip" style={{ background: cfg.bg, color: cfg.color, marginBottom: 8, display: 'inline-flex' }}>
                          <span className="lm-dot" style={{ background: cfg.dot }} />
                          {TYPE_LABELS[viewingEvent.type]}
                        </span>
                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--sidebar-fg)', fontFamily: 'var(--font-display)' }}>{viewingEvent.title}</h3>
                      </div>
                      <button onClick={() => setViewingEvent(null)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--sidebar-fg-mute)', padding: 4 }}>
                        <X size={16} />
                      </button>
                    </div>
                    <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <Clock size={14} color="var(--ink-3)" style={{ marginTop: 2, flexShrink: 0 }} />
                        <div>
                          <p className="lm-eyebrow" style={{ marginBottom: 2 }}>Horario</p>
                          <p className="lm-mono" style={{ fontSize: 13, color: 'var(--ink)', margin: 0 }}>
                            {format(parseISO(viewingEvent.startTime), 'dd/MM/yyyy HH:mm')} — {format(parseISO(viewingEvent.endTime), 'HH:mm')}
                          </p>
                        </div>
                      </div>
                      {viewingEvent.caseId && (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <CalendarIcon size={14} color="var(--ink-3)" style={{ marginTop: 2, flexShrink: 0 }} />
                          <div>
                            <p className="lm-eyebrow" style={{ marginBottom: 2 }}>Expediente</p>
                            <p className="lm-mono" style={{ fontSize: 13, color: 'var(--oxblood)', margin: 0 }}>
                              {cases.find(c => c.id === viewingEvent.caseId)?.caseNumber || '—'}
                            </p>
                          </div>
                        </div>
                      )}
                      {viewingEvent.description && (
                        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{viewingEvent.description}</p>
                      )}
                      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                        {(isAdmin || isLawyer || isAssistant) && (
                          <button
                            onClick={e => { handleDelete(viewingEvent.id, e as any); setViewingEvent(null); }}
                            style={{ flex: 1, padding: '7px 0', background: 'var(--oxblood-soft)', border: '0.5px solid var(--oxblood)', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--oxblood)', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        )}
                        <button onClick={() => setViewingEvent(null)} className="lm-btn lm-btn--ghost lm-btn--sm" style={{ flex: 1 }}>Cerrar</button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Eliminar evento"
        message="¿Está seguro de que desea eliminar este evento? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => { setIsDeleteModalOpen(false); setEventToDelete(null); }}
      />
    </div>
  );
}
