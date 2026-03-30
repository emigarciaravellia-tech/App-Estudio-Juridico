import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Message } from '../types';
import { 
  LayoutDashboard, 
  Briefcase, 
  CheckSquare, 
  Calendar as CalendarIcon, 
  MessageSquare, 
  Users, 
  LogOut,
  Scale,
  Menu,
  X,
  Shield,
  Receipt
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'messages'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.docs.filter(doc => {
        const data = doc.data();
        const chatId = data.chatId || '';
        const readBy = data.readBy || [];
        
        // Only count unread messages from chats the user is part of
        const isGlobal = chatId === 'global';
        const isParticipant = chatId.includes(profile.uid);
        
        return (isGlobal || isParticipant) && !readBy.includes(profile.uid);
      }).length;
      setUnreadCount(count);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    return unsubscribe;
  }, [profile]);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['admin', 'lawyer', 'assistant'] },
    { name: 'Expedientes', path: '/cases', icon: Briefcase, roles: ['admin', 'lawyer', 'assistant'] },
    { name: 'Clientes', path: '/clients', icon: Users, roles: ['admin', 'lawyer', 'assistant'] },
    { name: 'Calendario', path: '/calendar', icon: CalendarIcon, roles: ['admin', 'lawyer', 'assistant'] },
    { name: 'Tareas', path: '/tasks', icon: CheckSquare, roles: ['admin', 'lawyer', 'assistant'] },
    { name: 'Facturación', path: '/billing', icon: Receipt, roles: ['admin', 'lawyer'] },
    { name: 'Mensajes', path: '/collaboration', icon: MessageSquare, roles: ['admin', 'lawyer', 'assistant'], badge: unreadCount > 0 },
    { name: 'Usuarios', path: '/users', icon: Shield, roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(item => 
    profile && item.roles.includes(profile.role)
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans relative">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-indigo-900 text-white shadow-xl flex-shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-indigo-800">
          <Scale className="h-8 w-8 text-indigo-400" />
          <h1 className="text-xl font-bold tracking-tight">LexManage</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {filteredNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                location.pathname === item.path
                  ? 'bg-indigo-700 text-white shadow-lg'
                  : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.name}</span>
              </div>
              {item.badge && (
                <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)] animate-pulse" />
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-indigo-800">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-indigo-700 flex items-center justify-center text-indigo-200 font-bold">
              {profile?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.displayName}</p>
              <p className="text-xs text-indigo-400 capitalize">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-indigo-200 hover:bg-indigo-800 hover:text-white transition-all"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] md:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-indigo-900 text-white z-[70] md:hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 flex items-center justify-between border-b border-indigo-800">
                <div className="flex items-center gap-3">
                  <Scale className="h-8 w-8 text-indigo-400" />
                  <h1 className="text-xl font-bold tracking-tight">LexManage</h1>
                </div>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 hover:bg-indigo-800 rounded-xl transition-all"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {filteredNavItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                      location.pathname === item.path
                        ? 'bg-indigo-700 text-white shadow-lg'
                        : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    {item.badge && (
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)] animate-pulse" />
                    )}
                  </Link>
                ))}
              </nav>

              <div className="p-4 border-t border-indigo-800">
                <div className="flex items-center gap-3 px-4 py-3 mb-2">
                  <div className="h-10 w-10 rounded-full bg-indigo-700 flex items-center justify-center text-indigo-200 font-bold">
                    {profile?.displayName?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{profile?.displayName}</p>
                    <p className="text-xs text-indigo-400 capitalize">{profile?.role}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-indigo-200 hover:bg-indigo-800 hover:text-white transition-all"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-indigo-900 text-white p-4 flex items-center justify-between shadow-md z-50">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-indigo-400" />
            <span className="font-bold text-lg tracking-tight">LexManage</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 hover:bg-indigo-800 rounded-xl transition-all"
          >
            <Menu className="h-6 w-6" />
          </button>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
