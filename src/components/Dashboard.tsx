import { useEffect, useState } from 'react';
import { collection, query, limit, orderBy, onSnapshot, where, getDocs, addDoc, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Case, Task, Event, Invoice } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, NavigateFunction } from 'react-router-dom';
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
  Quote,
} from 'lucide-react';
import { format, isBefore, addDays, differenceInCalendarDays } from 'date-fns';
import { getFraseSemanal } from '../data/frases';
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
  const [semaforoEvents, setSemaforoEvents] = useState<Event[]>([]);

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

    // Semáforo: solo eventos tipo "deadline" (Plazo / Vencimiento) en los próximos 30 días
    getDocs(query(
      collection(db, 'events'),
      where('type', '==', 'deadline'),
      where('startTime', '>=', new Date().toISOString()),
      where('startTime', '<=', addDays(new Date(), 30).toISOString()),
      orderBy('startTime', 'asc'),
      limit(50),
    )).then(s => setSemaforoEvents(s.docs.map(d => ({ id: d.id, ...d.data() } as Event))));

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

      {/* Semáforo de vencimientos */}
      <SemaforoVencimientos events={semaforoEvents} navigate={navigate} />

      {/* Frase de la semana */}
      <FraseSemanal />

      {/* ── SEED TEMPORAL ── eliminar después de usar ── */}
      <SeedButton uid={profile?.uid || ''} />
    </div>
  );
}

/* ── Hero "Ficha del día" ──────────────────────────────────── */
function HeroCard({ item, navigate }: { item: AgendaItem; navigate: NavigateFunction }) {
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
function AgendaList({ items, navigate }: { items: AgendaItem[]; navigate: NavigateFunction }) {
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
            onClick={() => item.type === 'task'
              ? navigate('/tasks')
              : navigate('/calendar', { state: { openEventId: item.id } })
            }
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
function ActivityFeed({ cases, navigate }: { cases: Case[]; navigate: NavigateFunction }) {
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

/* ── Semáforo de vencimientos ──────────────────────────────── */
type SemaforoItem = {
  id: string;
  title: string;
  date: string;
  kind: 'tarea' | 'audiencia' | 'vencimiento' | 'reunión';
  daysAway: number;
};

function SemaforoVencimientos({
  events, navigate,
}: {
  events: Event[];
  navigate: NavigateFunction;
}) {
  const today = new Date();

  const items: SemaforoItem[] = events
    .map(e => ({
      id: e.id,
      title: e.title,
      date: e.startTime?.slice(0, 10) || '',
      kind: 'vencimiento' as const,
      daysAway: differenceInCalendarDays(new Date((e.startTime?.slice(0, 10) || '') + 'T12:00:00'), today),
    }))
    .filter(i => i.date && i.daysAway >= 0 && i.daysAway <= 30)
    .sort((a, b) => a.daysAway - b.daysAway);

  const red    = items.filter(i => i.daysAway <= 7);
  const yellow = items.filter(i => i.daysAway > 7 && i.daysAway <= 14);
  const green  = items.filter(i => i.daysAway > 14);

  const ZONES = [
    {
      label: 'Urgente',
      sublabel: 'próximos 7 días',
      items: red,
      dot: '#c0392b',
      soft: '#fdf0f0',
      border: '#e8b4b4',
    },
    {
      label: 'Próximo',
      sublabel: '8 a 14 días',
      items: yellow,
      dot: '#b8860b',
      soft: '#fdf9e8',
      border: '#e8d89a',
    },
    {
      label: 'Holgado',
      sublabel: '15 a 30 días',
      items: green,
      dot: '#2d6a2d',
      soft: '#f0f7f0',
      border: '#a8cca8',
    },
  ] as const;

  const kindLabel: Record<SemaforoItem['kind'], string> = {
    tarea: 'Tarea',
    audiencia: 'Audiencia',
    vencimiento: 'Vcto.',
    reunión: 'Reunión',
  };

  return (
    <section className="lm-card" style={{ padding: 0, overflow: 'hidden', marginTop: 20 }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '0.5px solid var(--rule)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div className="lm-eyebrow">Semáforo</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 17, margin: '3px 0 0', color: 'var(--ink)' }}>
            Próximos vencimientos procesales
          </h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ZONES.map(z => (
            <span key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: z.dot, display: 'inline-block' }} />
              {z.label}
            </span>
          ))}
        </div>
      </div>

      {/* 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        {ZONES.map((zone, zi) => (
          <div
            key={zone.label}
            style={{
              borderRight: zi < 2 ? '0.5px dashed var(--rule-2)' : 'none',
              minHeight: 160,
            }}
          >
            {/* Zone header */}
            <div style={{
              padding: '10px 16px 8px',
              background: zone.soft,
              borderBottom: `0.5px solid ${zone.border}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: zone.dot, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: zone.dot }}>{zone.label}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 1 }}>{zone.sublabel}</div>
              </div>
              <span style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-display)',
                fontSize: 22, lineHeight: 1,
                color: zone.dot,
              }}>
                {zone.items.length}
              </span>
            </div>

            {/* Items */}
            {zone.items.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink-mute)' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>✓</div>
                <div style={{ fontSize: 11 }}>Sin vencimientos</div>
              </div>
            ) : (
              <div>
                {zone.items.slice(0, 5).map(item => (
                  <div
                    key={item.id}
                    onClick={() => navigate('/calendar', { state: { openEventId: item.id } })}
                    style={{
                      padding: '9px 16px',
                      borderBottom: '0.5px solid var(--rule-soft)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}
                    className="lm-row-hover"
                  >
                    <span style={{
                      marginTop: 2, flexShrink: 0,
                      width: 7, height: 7, borderRadius: '50%',
                      background: zone.dot, opacity: 0.7,
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                        <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: zone.dot }}>
                          {kindLabel[item.kind]}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-mute)' }}>
                          {item.daysAway === 0 ? 'HOY' : item.daysAway === 1 ? 'MAÑANA' : `en ${item.daysAway}d`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {zone.items.length > 5 && (
                  <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--ink-mute)', textAlign: 'center' }}>
                    +{zone.items.length - 5} más
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Frase de la semana ────────────────────────────────────── */
function FraseSemanal() {
  const frase = getFraseSemanal();

  // Separar texto del autor si tiene " — "
  const dashIndex = frase.lastIndexOf(' — ');
  const texto = dashIndex !== -1 ? frase.slice(0, dashIndex) : frase;
  const autor  = dashIndex !== -1 ? frase.slice(dashIndex + 3) : null;

  // Número de semana para mostrar
  const epoch = new Date('2024-01-01T00:00:00Z');
  const semana = Math.floor((new Date().getTime() - epoch.getTime()) / (7 * 24 * 60 * 60 * 1000)) % 1000 + 1;

  return (
    <div style={{ marginTop: 20, marginBottom: 8 }}>
      <div style={{
        position: 'relative',
        padding: '28px 32px 24px 40px',
        borderTop: '0.5px solid var(--rule)',
        borderBottom: '0.5px solid var(--rule)',
      }}>
        {/* Comilla decorativa */}
        <Quote
          size={28}
          style={{
            position: 'absolute', top: 20, left: 8,
            color: 'var(--oxblood)', opacity: 0.18,
          }}
        />

        <p style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: 16,
          lineHeight: 1.55,
          color: 'var(--ink-2)',
          margin: '0 0 10px',
          maxWidth: 760,
        }}>
          "{texto}"
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {autor && (
            <span style={{
              fontSize: 11.5, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--oxblood)',
            }}>
              {autor}
            </span>
          )}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--ink-mute)',
            letterSpacing: '0.14em',
            marginLeft: autor ? 0 : 'auto',
          }}>
            FRASE Nº {String(semana).padStart(3, '0')} · SEMANA {format(new Date(), 'ww/yyyy')}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── SEED TEMPORAL ────────────────────────────────────────────
   Eliminar este componente después de usarlo una vez.
   ─────────────────────────────────────────────────────────── */
function SeedButton({ uid }: { uid: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const seed = async () => {
    if (!uid) { alert('Esperá a que cargue tu sesión'); return; }
    setStatus('loading');
    try {
      const now = new Date();
      const d = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();
      const ds = (days: number) => d(days).slice(0, 10);

      // ── 5 Clientes ──────────────────────────────────────
      const clientIds: string[] = [];
      const clientes = [
        { displayName: 'María González',    email: 'mgonzalez@mail.com',  phone: '351-111-2233', dni: '32456789', role: 'client' },
        { displayName: 'Carlos Rodríguez',  email: 'crodriguez@mail.com', phone: '351-222-3344', dni: '28123456', role: 'client' },
        { displayName: 'Laura Martínez',    email: 'lmartinez@mail.com',  phone: '351-333-4455', dni: '35789012', role: 'client' },
        { displayName: 'Roberto Fernández', email: 'rfernandez@mail.com', phone: '351-444-5566', dni: '25654321', role: 'client' },
        { displayName: 'Ana Pérez',         email: 'aperez@mail.com',     phone: '351-555-6677', dni: '40123456', role: 'client' },
      ];
      for (const c of clientes) {
        const ref = doc(collection(db, 'users'));
        await setDoc(ref, { ...c, uid: ref.id, createdAt: now.toISOString() });
        clientIds.push(ref.id);
      }

      // ── 10 Expedientes ───────────────────────────────────
      const cases = [
        { caseNumber: '2024/001', caseTitle: 'González c/ González - Divorcio',          clientName: 'María González',    status: 'activo',     jurisdiction: 'Cordoba',     processType: 'juicio',        roleInProcess: 'actor',      opposingParty: 'Jorge González' },
        { caseNumber: '2024/002', caseTitle: 'Rodríguez c/ Empresa SA - Laboral',         clientName: 'Carlos Rodríguez',  status: 'activo',     jurisdiction: 'Alta Gracia', processType: 'juicio',        roleInProcess: 'actor',      opposingParty: 'Empresa SA' },
        { caseNumber: '2024/003', caseTitle: 'Sucesión Martínez',                          clientName: 'Laura Martínez',    status: 'activo',     jurisdiction: 'Cordoba',     processType: 'otro',          roleInProcess: 'asesoramiento', opposingParty: '' },
        { caseNumber: '2024/004', caseTitle: 'Fernández c/ Municipalidad - Contencioso',  clientName: 'Roberto Fernández', status: 'activo',     jurisdiction: 'Cordoba',     processType: 'juicio',        roleInProcess: 'actor',      opposingParty: 'Municipalidad de Córdoba' },
        { caseNumber: '2024/005', caseTitle: 'Pérez - Accidente de Tránsito',             clientName: 'Ana Pérez',         status: 'activo',     jurisdiction: 'Carlos Paz',  processType: 'juicio',        roleInProcess: 'actor',      opposingParty: 'Seguros XYZ SA' },
        { caseNumber: '2024/006', caseTitle: 'López c/ Banco Nacional - Ejecución',       clientName: 'Hugo López',        status: 'paralizado', jurisdiction: 'Cordoba',     processType: 'juicio',        roleInProcess: 'demandado',  opposingParty: 'Banco Nacional' },
        { caseNumber: '2024/007', caseTitle: 'Herrera - Asesoramiento Societario',        clientName: 'Silvia Herrera',    status: 'activo',     jurisdiction: 'Cordoba',     processType: 'asesoramiento', roleInProcess: 'asesoramiento', opposingParty: '' },
        { caseNumber: '2024/008', caseTitle: 'Sánchez c/ Empleador - Despido',            clientName: 'Pablo Sánchez',     status: 'activo',     jurisdiction: 'Cordoba',     processType: 'juicio',        roleInProcess: 'actor',      opposingParty: 'Distribuidora Sur SRL' },
        { caseNumber: '2023/009', caseTitle: 'Torres - Mediación Familiar',               clientName: 'Claudia Torres',    status: 'archivado',  jurisdiction: 'Jesus Maria', processType: 'mediacion',     roleInProcess: 'actor',      opposingParty: 'Martín Torres' },
        { caseNumber: '2024/010', caseTitle: 'Díaz - Trámite Administrativo AFIP',        clientName: 'Ernesto Díaz',      status: 'activo',     jurisdiction: 'Cordoba',     processType: 'otro',          roleInProcess: 'asesoramiento', opposingParty: 'AFIP' },
      ];
      const caseIds: string[] = [];
      for (const c of cases) {
        const ref = await addDoc(collection(db, 'cases'), {
          ...c, assignedLawyerId: uid, notes: '',
          createdAt: d(-Math.floor(Math.random() * 60)),
          updatedAt: d(-Math.floor(Math.random() * 5)),
        });
        caseIds.push(ref.id);
      }

      // ── 10 Tareas ────────────────────────────────────────
      const tareas = [
        { title: 'Presentar demanda inicial',         dueDate: ds(7),  caseIdx: 0 },
        { title: 'Contestar traslado de la demanda',  dueDate: ds(3),  caseIdx: 1 },
        { title: 'Enviar documentación al cliente',   dueDate: ds(1),  caseIdx: 2 },
        { title: 'Preparar alegato final',            dueDate: ds(14), caseIdx: 3 },
        { title: 'Renovar contrato de honorarios',   dueDate: ds(5),  caseIdx: 4 },
        { title: 'Revisar pericia contable',          dueDate: ds(10), caseIdx: 5 },
        { title: 'Notificar resolución al cliente',   dueDate: ds(0),  caseIdx: 6 },
        { title: 'Preparar lista de testigos',        dueDate: ds(21), caseIdx: 7 },
        { title: 'Gestionar oficio al registro',      dueDate: ds(4),  caseIdx: 8 },
        { title: 'Verificar estado del expediente',   dueDate: ds(6),  caseIdx: 9 },
      ];
      for (const t of tareas) {
        await addDoc(collection(db, 'tasks'), {
          title: t.title,
          description: '',
          assignedUserId: uid,
          dueDate: t.dueDate,
          status: 'pending',
          isPersonal: false,
          caseId: caseIds[t.caseIdx],
          createdAt: now.toISOString(),
        });
      }

      // ── 10 Eventos ───────────────────────────────────────
      const eventos = [
        { title: 'Audiencia preliminar - González',           type: 'hearing',  days: 8  },
        { title: 'Vencimiento contestación - Rodríguez',      type: 'deadline', days: 3  },
        { title: 'Audiencia de conciliación - Fernández',     type: 'hearing',  days: 15 },
        { title: 'Vencimiento recurso de apelación - Torres', type: 'deadline', days: 1  },
        { title: 'Vencimiento ofrecimiento de prueba - Pérez',type: 'deadline', days: 5  },
        { title: 'Vencimiento traslado pericia - López',      type: 'deadline', days: 12 },
        { title: 'Audiencia de vista de causa - Sánchez',     type: 'hearing',  days: 25 },
        { title: 'Vencimiento traslado - Díaz',               type: 'deadline', days: 8  },
        { title: 'Reunión con cliente - Herrera',             type: 'meeting',  days: 4  },
        { title: 'Vencimiento presentación memorial - Martínez', type: 'deadline', days: 20 },
      ];
      for (let i = 0; i < eventos.length; i++) {
        const ev = eventos[i];
        const start = new Date(now.getTime() + ev.days * 86400000);
        start.setHours(10, 0, 0, 0);
        const end = new Date(start.getTime() + 60 * 60000);
        await addDoc(collection(db, 'events'), {
          title: ev.title,
          description: '',
          type: ev.type,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          assignedUserIds: [uid],
          caseId: caseIds[i],
          createdAt: now.toISOString(),
        });
      }

      setStatus('done');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  return (
    <div style={{
      margin: '24px 0 8px',
      padding: '16px 20px',
      border: '1px dashed #c0392b',
      borderRadius: 8,
      background: '#fdf0f0',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#c0392b', marginBottom: 4 }}>
          ⚠ SEED TEMPORAL — eliminar después de usar
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          Crea 5 clientes · 10 expedientes · 10 tareas · 10 eventos de prueba
        </div>
      </div>
      <button
        onClick={seed}
        disabled={status === 'loading' || status === 'done'}
        style={{
          padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: status === 'done' ? '#2d6a2d' : status === 'error' ? '#c0392b' : '#333',
          color: '#fff', fontSize: 13, fontWeight: 600,
        }}
      >
        {status === 'idle' ? 'Crear datos de prueba' :
         status === 'loading' ? 'Creando…' :
         status === 'done' ? '✓ Listo' : '✗ Error (ver consola)'}
      </button>
    </div>
  );
}
