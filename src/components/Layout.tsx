import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LayoutDashboard,
  Briefcase,
  CheckSquare,
  Calendar as CalendarIcon,
  MessageSquare,
  Users,
  LogOut,
  Menu,
  X,
  Shield,
  Receipt,
  Search,
  Bell,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const NAV_GROUPS = [
  {
    label: 'Trabajo',
    items: [
      { name: 'Panel',        path: '/',              icon: LayoutDashboard, roles: ['admin','lawyer','assistant'] },
      { name: 'Expedientes',  path: '/cases',         icon: Briefcase,       roles: ['admin','lawyer','assistant'] },
      { name: 'Clientes',     path: '/clients',       icon: Users,           roles: ['admin','lawyer','assistant'] },
    ],
  },
  {
    label: 'Agenda',
    items: [
      { name: 'Calendario', path: '/calendar', icon: CalendarIcon, roles: ['admin','lawyer','assistant'] },
      { name: 'Tareas',     path: '/tasks',    icon: CheckSquare,  roles: ['admin','lawyer','assistant'] },
    ],
  },
  {
    label: 'Estudio',
    items: [
      { name: 'Facturación', path: '/billing',       icon: Receipt,      roles: ['admin','lawyer'] },
      { name: 'Mensajes',    path: '/collaboration', icon: MessageSquare, roles: ['admin','lawyer','assistant'], badgeKey: 'messages' },
      { name: 'Mi Perfil',   path: '/users',         icon: Shield,        roles: ['admin'] },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!profile) return;
    const unsub = onSnapshot(query(collection(db, 'messages')), (snap) => {
      const count = snap.docs.filter(d => {
        const data = d.data();
        const chatId = data.chatId || '';
        const readBy = data.readBy || [];
        return (chatId === 'global' || chatId.includes(profile.uid)) && !readBy.includes(profile.uid);
      }).length;
      setUnread(count);
    }, e => handleFirestoreError(e, OperationType.LIST, 'messages'));
    return unsub;
  }, [profile]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const initials = profile?.displayName
    ?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const badges: Record<string, number> = { messages: unread };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--paper)' }}>
        <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--rule) var(--rule) transparent' }} />
      </div>
    );
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '6px 8px 16px',
        borderBottom: '0.5px solid rgba(221,201,159,0.12)',
        marginBottom: 4,
      }}>
        <div style={{
          width: 34, height: 34,
          background: 'var(--sidebar-fg)',
          color: 'var(--sidebar-bg)',
          borderRadius: 'var(--r-sm)',
          display: 'grid', placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: 18, fontWeight: 600,
          letterSpacing: '-0.02em',
          flexShrink: 0,
        }}>L</div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--sidebar-fg)' }}>
            LexManage
          </div>
          <div style={{ fontSize: 10, color: 'var(--sidebar-fg-mute)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Estudio García·Ravellia
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }} className="lm-scroll">
        {NAV_GROUPS.map(group => {
          const filtered = group.items.filter(item => profile && item.roles.includes(profile.role));
          if (!filtered.length) return null;
          return (
            <div key={group.label}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: 'var(--sidebar-fg-mute)', padding: '4px 10px 6px',
              }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filtered.map(item => {
                  const active = location.pathname === item.path;
                  const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px',
                        borderRadius: 'var(--r)',
                        color: active ? 'var(--sidebar-active-fg)' : 'var(--sidebar-fg)',
                        background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13, fontWeight: active ? 600 : 500,
                        textDecoration: 'none',
                        transition: 'background .12s, color .12s',
                      }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg-2)'; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <item.icon size={16} />
                      <span style={{ flex: 1 }}>{item.name}</span>
                      {badge > 0 && (
                        <span style={{
                          background: 'var(--oxblood)', color: '#fbf6e9',
                          fontSize: 10, fontWeight: 700,
                          padding: '1px 6px', borderRadius: 999,
                          fontFamily: 'var(--font-mono)',
                        }}>{badge}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ borderTop: '0.5px solid rgba(221,201,159,0.12)', paddingTop: 10, marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--oxblood)',
            color: '#fbf6e9',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 13, fontWeight: 500,
            flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--sidebar-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.displayName}
            </p>
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--sidebar-fg-mute)', textTransform: 'capitalize' }}>
              {profile?.role === 'admin' ? 'Administrador' : profile?.role === 'lawyer' ? 'Abogado/a' : 'Auxiliar'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              padding: 6, borderRadius: 'var(--r)',
              color: 'var(--sidebar-fg-mute)',
              transition: 'color .12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--sidebar-fg)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--sidebar-fg-mute)')}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--paper)', overflow: 'hidden' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex" style={{
        flexDirection: 'column',
        width: 240,
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderRight: '0.5px solid #000',
        padding: '18px 12px 14px',
        gap: 0,
        position: 'relative',
      }}>
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,8,0.55)', backdropFilter: 'blur(2px)', zIndex: 60 }}
              className="md:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 200 }}
              className="md:hidden"
              style={{
                position: 'fixed', inset: '0 auto 0 0',
                width: 260,
                background: 'var(--sidebar-bg)',
                borderRight: '0.5px solid #000',
                padding: '18px 12px 14px',
                display: 'flex', flexDirection: 'column', gap: 0,
                zIndex: 70,
              }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                style={{
                  position: 'absolute', top: 14, right: 12,
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: 'var(--sidebar-fg-mute)', padding: 6, borderRadius: 'var(--r)',
                }}
              >
                <X size={18} />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '10px 24px',
          borderBottom: '0.5px solid var(--rule)',
          background: 'var(--paper)',
          position: 'relative',
          zIndex: 2,
          flexShrink: 0,
        }}>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden"
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}
          >
            <Menu size={20} />
          </button>

          {/* Search box */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '7px 12px',
            background: 'var(--paper-3)',
            border: '0.5px solid var(--rule)',
            borderRadius: 'var(--r)',
            flex: 1, maxWidth: 420,
            color: 'var(--ink-3)',
          }}>
            <Search size={14} />
            <input
              placeholder="Buscar expedientes, clientes…"
              style={{
                border: 0, background: 'transparent', outline: 'none',
                flex: 1, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink)',
              }}
            />
            <kbd style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '0 5px', height: 18,
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              color: 'var(--ink-3)',
              background: 'var(--paper-3)',
              border: '0.5px solid var(--rule)',
              borderBottomWidth: 1.5,
              borderRadius: 3,
            }}>⌘K</kbd>
          </div>

          <div style={{ flex: 1 }} />

          <button
            title="Notificaciones"
            style={{
              background: 'transparent', border: '0.5px solid var(--rule)',
              borderRadius: 'var(--r)', padding: '7px 8px', cursor: 'pointer',
              color: 'var(--ink-3)',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Bell size={15} />
          </button>

          <button
            className="lm-btn lm-btn--primary lm-btn--sm hidden md:inline-flex"
            onClick={() => navigate('/cases')}
          >
            <Plus size={13} />
            Nuevo expediente
          </button>
        </header>

        {/* Dotted rule under topbar */}
        <div style={{
          height: 3,
          background: 'repeating-linear-gradient(90deg, var(--rule) 0 4px, transparent 4px 9px)',
          opacity: 0.35,
          flexShrink: 0,
        }} />

        {/* Page content */}
        <main className="lm-scroll" style={{ flex: 1, overflowY: 'auto', background: 'var(--paper)' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 32px 56px' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
