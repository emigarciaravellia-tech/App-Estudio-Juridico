import { useEffect, useState } from 'react';
import { collection, query, limit, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Case, Task, Event, Invoice } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  CheckSquare,
  Calendar as CalendarIcon,
  Clock,
  ChevronRight,
  FileText,
  Gavel,
  Flag,
  Users,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-react';
import { format, isBefore, addDays, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';

type AgendaItem = {
  id: string;
  kind: 'audiencia' | 'vencimiento' | 'reunión' | 'tarea';
  title: string;
  date: string;
  time?: string;
  caseId?: string;
  type: 'event' | 'task';
};

const KIND_CONFIG = {
  audiencia:   { color: 'var(--oxblood)',  soft: 'var(--oxblood-soft)', icon: Gavel,    label: 'Audiencia' },
  vencimiento: { color: 'var(--mustard)',  soft: 'var(--mustard-soft)', icon: Flag,     label: 'Vencimiento' },
  reunión:     { color: 'var(--slate-c)',  soft: 'var(--slate-soft)',   icon: Users,    label: 'Reunión' },
  tarea:       { color: '#3d5a3d',         soft: 'var(--forest-soft)',  icon: CheckSquare, label: 'Tarea' },
} as const;

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [recentCases, setRecentCases] = useState<Case[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [activeCaseCount, setActiveCaseCount] = useState(0);
  const [pendingInvoiceTotal, setPendingInvoiceTotal] = useState(0);
  const [pendingInvoiceCount, setPendingInvoiceCount] = useState(0);
  const [hearingCount, setHearingCount] = useState(0);

  useEffect(() => {
    if (!profile) return;

    const unsubCases = onSnapshot(
      query(collection(db, 'cases'), orderBy('updatedAt', 'desc'), limit(8)),
      snap => setRecentCases(snap.docs.map(d => ({ id: d.id, ...d.data() } as Case))),
      e => handleFirestoreError(e, OperationType.LIST, 'cases'),
    );

    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('assignedUserId', '==', profile.uid), where('status', '==', 'pending'), orderBy('dueDate', 'asc'), limit(10)),
      snap => setPendingTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task))),
      e => handleFirestoreError(e, OperationType.LIST, 'tasks'),
    );

    const unsubEvents = onSnapshot(
      query(collection(db, 'events'), where('startTime', '>=', new Date().toISOString()), orderBy('startTime', 'asc'), limit(10)),
      snap => setUpcomingEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Event))),
      e => handleFirestoreError(e, OperationType.LIST, 'events'),
    );

    // Stats: active cases
    getDocs(query(collection(db, 'cases'), where('status', '==', 'activo'))).then(s => setActiveCaseCount(s.size));

    // Stats: pending invoices
    getDocs(query(collection(db, 'invoices'), where('status', 'in', ['pending', 'partial']))).then(s => {
      let total = 0;
      s.docs.forEach(d => { total += (d.data().amount || 0); });
      setPendingInvoiceTotal(total);
      setPendingInvoiceCount(s.size);
    });

    // Stats: upcoming hearings this month
    getDocs(query(collection(db, 'events'), where('type', '==', 'hearing'))).then(s => setHearingCount(s.size));

    return () => { unsubCases(); unsubTasks(); unsubEvents(); };
  }, [profile]);

  // Build unified agenda list
  const agendaItems: AgendaItem[] = [
    ...pendingTasks.map(t => ({
      id: t.id, kind: 'tarea' as const,
      title: t.title, date: t.dueDate,
      caseId: t.caseId, type: 'task' as const,
    })),
    ...upcomingEvents.map(e => ({
      id: e.id,
      kind: (e.type === 'hearing' ? 'audiencia' : e.type === 'deadline' ? 'vencimiento' : 'reunión') as AgendaItem['kind'],
      title: e.title,
      date: e.startTime?.slice(0, 10) || '',
      time: e.startTime ? format(new Date(e.startTime), 'HH:mm') : undefined,
      caseId: e.caseId,
      type: 'event' as const,
    })),
  ].filter(i => i.date).sort((a, b) => a.date.localeCompare(b.date));

  const hero = agendaItems[0];
  const remaining = agendaItems.slice(1, 8);

  const today = new Date();
  const dateStr = format(today, "EEEE d 'de' MMMM", { locale: es });
  const firstName = profile?.displayName?.split(' ')[0] || '';

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Page header */}
      <div style={{
        paddingBottom: 18, marginBottom: 22,
        borderBottom: '0.5px solid var(--rule)',
        position: 'relative',
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 18, height: 1, background: 'var(--ink-mute)', display: 'inline-block' }} />
          Despacho · {dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
        </div>
        <h1 className="lm-dash-h1" style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.015em', color: 'var(--ink)', margin: 0 }}>
          Buenos días, <em style={{ fontStyle: 'italic', color: 'var(--oxblood)' }}>{firstName}</em>.
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--ink-3)', fontSize: 13.5 }}>
          {agendaItems.length > 0
            ? `${agendaItems.length} vencimiento${agendaItems.length !== 1 ? 's' : ''} y audiencias en agenda.`
            : 'Sin vencimientos próximos. Buen momento para ponerse al día.'}
        </p>
        <span style={{ position: 'absolute', right: 0, bottom: 18, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-mute)', letterSpacing: '0.16em' }}>
          FOLIO {String(today.getFullYear()).slice(-2)}/{String(today.getMonth() + 1).padStart(2, '0')}
        </span>
      </div>

      {/* Hero: Ficha del día */}
      {hero && <HeroCard item={hero} navigate={navigate} />}

      {/* Stats ledger strip */}
      <StatsStrip
        activeCases={activeCaseCount}
        pendingTasks={pendingTasks.length}
        invoiceTotal={pendingInvoiceTotal}
        invoiceCount={pendingInvoiceCount}
        hearings={hearingCount}
      />

      {/* 2-column grid */}
      <div className="lm-dash-grid" style={{ gap: 20, marginTop: 20 }}>
        <AgendaList items={remaining} navigate={navigate} />
        <ActivityFeed cases={recentCases} navigate={navigate} />
      </div>
    </div>
  );
}

/* ── Hero "Ficha del día" ──────────────────────────────────── */
function HeroCard({ item, navigate }: { item: AgendaItem; navigate: (to: string) => void }) {
  const cfg = KIND_CONFIG[item.kind] || KIND_CONFIG.tarea;
  const Icon = cfg.icon;

  const dt = new Date(item.date + 'T12:00:00');
  const day = String(dt.getDate()).padStart(2, '0');
  const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const daysAway = differenceInCalendarDays(dt, new Date());
  const urgency = daysAway === 0 ? 'HOY' : daysAway === 1 ? 'MAÑANA'
    : daysAway < 0 ? `Hace ${-daysAway} días` : `En ${daysAway} días`;

  return (
    <article className="lm-card lm-card--paper lm-hero" style={{
      overflow: 'hidden', marginBottom: 18,
    }}>
      {/* Date ticket */}
      <div style={{
        background: cfg.soft, color: cfg.color,
        padding: '20px 14px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        borderRight: `0.5px dashed ${cfg.color}`,
        position: 'relative',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', marginBottom: 4 }}>{months[dt.getMonth()]}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 46, fontWeight: 500, lineHeight: 1, color: cfg.color }}>{day}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 6, opacity: 0.65 }}>{dt.getFullYear()}</div>
        {/* Punch holes */}
        <span style={{ position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)', width: 10, height: 10, background: 'var(--paper)', borderRadius: '50%', border: '0.5px solid var(--rule)' }} />
        <span style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 10, height: 10, background: 'var(--paper)', borderRadius: '50%', border: '0.5px solid var(--rule)' }} />
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span className="lm-chip" style={{ background: cfg.soft, color: cfg.color }}>
            <Icon size={11} />
            {cfg.label.toUpperCase()}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: cfg.color }}>
            {urgency}{item.time ? ` · ${item.time} hs` : ''}
          </span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 500, margin: '0 0 8px', lineHeight: 1.18, color: 'var(--ink)' }}>
          {item.title}
        </h2>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>
          {item.type === 'task' ? 'Tarea pendiente' : 'Evento en agenda'}
        </p>
      </div>

      {/* CTA */}
      <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, borderLeft: '0.5px solid var(--rule-soft)' }}>
        <button
          className="lm-btn"
          onClick={() => navigate(item.type === 'task' ? '/tasks' : '/calendar')}
        >
          Ver detalle <ArrowUpRight size={13} />
        </button>
        <button className="lm-btn lm-btn--ghost lm-btn--sm">
          <Clock size={12} /> Preparar
        </button>
      </div>
    </article>
  );
}

/* ── Stats ledger strip ────────────────────────────────────── */
function StatsStrip({ activeCases, pendingTasks, invoiceTotal, invoiceCount, hearings }: {
  activeCases: number; pendingTasks: number;
  invoiceTotal: number; invoiceCount: number; hearings: number;
}) {
  const fmtAR = (n: number) => '$ ' + n.toLocaleString('es-AR');

  const stats = [
    { label: 'Expedientes activos', value: activeCases, hint: 'en el estudio', icon: Briefcase },
    { label: 'Tareas pendientes',   value: pendingTasks, hint: 'asignadas a vos', icon: CheckSquare },
    { label: 'Facturado por cobrar', value: fmtAR(invoiceTotal), hint: `${invoiceCount} facturas`, icon: FileText, mono: true },
    { label: 'Audiencias en agenda', value: hearings, hint: 'próximas', icon: CalendarIcon },
  ];

  return (
    <div className="lm-card lm-stats-4" style={{ padding: 0 }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          padding: '17px 20px',
          borderRight: i < stats.length - 1 ? '0.5px dashed var(--rule-2)' : 'none',
          display: 'flex', flexDirection: 'column', gap: 7,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="lm-eyebrow">{s.label}</span>
            <s.icon size={13} style={{ color: 'var(--ink-mute)' }} />
          </div>
          <div style={{
            fontFamily: s.mono ? 'var(--font-mono)' : 'var(--font-display)',
            fontSize: 28, lineHeight: 1, color: 'var(--ink)',
          }}>
            {s.value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{s.hint}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Agenda list ───────────────────────────────────────────── */
function AgendaList({ items, navigate }: { items: AgendaItem[]; navigate: (to: string) => void }) {
  return (
    <section className="lm-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '0.5px solid var(--rule)',
      }}>
        <div>
          <div className="lm-eyebrow">Agenda</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 17, margin: '3px 0 0', color: 'var(--ink)' }}>
            Próximos vencimientos
          </h3>
        </div>
        <button className="lm-btn lm-btn--ghost lm-btn--sm" onClick={() => navigate('/calendar')}>
          Ver calendario <ChevronRight size={12} />
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-mute)' }}>
          <CheckSquare size={24} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
          <p style={{ margin: 0, fontSize: 13 }}>Sin vencimientos próximos.</p>
        </div>
      ) : items.map(item => {
        const cfg = KIND_CONFIG[item.kind] || KIND_CONFIG.tarea;
        const Icon = cfg.icon;
        const dt = new Date(item.date + 'T12:00:00');
        const day = dt.getDate();
        const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][dt.getMonth()];

        return (
          <div
            key={item.id}
            className="lm-row"
            style={{ gridTemplateColumns: '44px 1fr auto auto', gap: 14 }}
            onClick={() => navigate(item.type === 'task' ? '/tasks' : '/calendar')}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-mute)', letterSpacing: '0.08em' }}>{mon.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: 1, color: cfg.color }}>{day}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <Icon size={11} style={{ color: cfg.color }} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: cfg.color }}>{item.kind}</span>
              </div>
              <div style={{ fontWeight: 500, fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </div>
            </div>
            {item.time && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{item.time}</span>
            )}
            <ChevronRight size={13} style={{ color: 'var(--ink-mute)' }} />
          </div>
        );
      })}

      {items.length > 0 && (
        <div style={{ padding: '10px 20px', borderTop: '0.5px solid var(--rule-soft)', background: 'var(--paper-2)', display: 'flex', justifyContent: 'flex-end' }}>
          <a className="lm-link" style={{ fontSize: 12 }} onClick={() => navigate('/calendar')}>
            Ver calendario completo →
          </a>
        </div>
      )}
    </section>
  );
}

/* ── Activity feed ─────────────────────────────────────────── */
function ActivityFeed({ cases, navigate }: { cases: Case[]; navigate: (to: string) => void }) {
  return (
    <section className="lm-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--rule)' }}>
        <div className="lm-eyebrow">Movimientos</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 17, margin: '3px 0 0', color: 'var(--ink)' }}>
          Actividad del estudio
        </h3>
      </div>

      <div style={{ padding: '18px 20px 8px', flex: 1 }}>
        {cases.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-mute)' }}>
            <AlertCircle size={20} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: 12.5 }}>Sin actividad reciente.</p>
          </div>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 0.5, background: 'var(--rule)' }} />
            {cases.slice(0, 7).map((c, i) => {
              const dt = new Date(c.updatedAt || '');
              const valid = !isNaN(dt.getTime());
              return (
                <li key={c.id} style={{ position: 'relative', paddingLeft: 30, paddingBottom: 16, cursor: 'pointer' }}
                    onClick={() => navigate('/cases')}>
                  <span style={{ position: 'absolute', left: 5, top: 5, width: 11, height: 11, borderRadius: '50%', background: 'var(--paper-3)', border: '1.5px solid var(--oxblood)' }} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.06em', marginBottom: 2 }}>
                    {valid ? format(dt, "dd/MM · HH:mm") : '—'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong style={{ color: 'var(--ink)' }}>{c.caseTitle || c.caseNumber}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
                    Exp. {c.caseNumber}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div style={{ padding: '10px 20px', borderTop: '0.5px solid var(--rule-soft)', background: 'var(--paper-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.16em' }}>
          {cases.length} movimientos recientes
        </span>
        <a className="lm-link" style={{ fontSize: 12 }} onClick={() => navigate('/cases')}>
          Ver expedientes →
        </a>
      </div>
    </section>
  );
}
