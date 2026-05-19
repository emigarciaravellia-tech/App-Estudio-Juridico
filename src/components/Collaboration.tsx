import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, where, orderBy, updateDoc, doc, arrayUnion, writeBatch, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Message, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import ReactMarkdown from 'react-markdown';
import { Send, User as UserIcon, MessageSquare, Users, Search, ChevronLeft, Trash2, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Collaboration() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>('global');
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)).filter(u => u.uid !== profile?.uid && u.role !== 'client'));
    }, e => handleFirestoreError(e, OperationType.LIST, 'users'));
    return unsub;
  }, [profile?.uid]);

  useEffect(() => {
    const q = query(collection(db, 'messages'), where('chatId', '==', selectedChatId), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      if (profile) {
        msgs.forEach(async m => {
          if (!m.readBy.includes(profile.uid)) {
            try { await updateDoc(doc(db, 'messages', m.id), { readBy: arrayUnion(profile.uid) }); }
            catch (e) { handleFirestoreError(e, OperationType.UPDATE, `messages/${m.id}`); }
          }
        });
      }
    }, e => handleFirestoreError(e, OperationType.LIST, 'messages'));
    return unsub;
  }, [selectedChatId, profile]);

  useEffect(() => {
    if (!profile) return;
    const unsub = onSnapshot(query(collection(db, 'messages')), snap => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data() as Message;
        if (!data.readBy.includes(profile.uid)) counts[data.chatId] = (counts[data.chatId] || 0) + 1;
      });
      setUnreadCounts(counts);
    }, e => handleFirestoreError(e, OperationType.LIST, 'messages'));
    return unsub;
  }, [profile]);

  const getPrivateChatId = (otherUid: string) => profile ? [profile.uid, otherUid].sort().join('_') : '';

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;
    const content = newMessage;
    setNewMessage('');
    try {
      await addDoc(collection(db, 'messages'), { chatId: selectedChatId, authorId: profile.uid, authorName: profile.displayName, content, timestamp: new Date().toISOString(), readBy: [profile.uid] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'messages');
    }
  };

  const handleClearChat = async () => {
    if (!profile || profile.role !== 'admin') return;
    if (!window.confirm('¿Estás seguro de que deseas eliminar todos los mensajes de esta conversación?')) return;
    try {
      const snap = await getDocs(query(collection(db, 'messages'), where('chatId', '==', selectedChatId)));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'messages');
    }
  };

  const filteredUsers = users.filter(u =>
    (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getChatTitle = () => {
    if (selectedChatId === 'global') return 'Foro de Despacho';
    const otherUid = selectedChatId.split('_').find(id => id !== profile?.uid);
    return users.find(u => u.uid === otherUid)?.displayName || 'Chat privado';
  };

  const initials = (name?: string) => name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 140px)', minHeight: 520, gap: 12 }}>

      {/* Sidebar de chats */}
      <aside style={{
        width: 268,
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderRadius: 'var(--r-lg)',
        border: '0.5px solid rgba(221,201,159,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header sidebar */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '0.5px solid rgba(221,201,159,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: 'var(--r)', background: 'rgba(221,201,159,0.12)', display: 'grid', placeItems: 'center' }}>
              <MessageSquare size={14} color="var(--sidebar-fg)" />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sidebar-fg)', fontFamily: 'var(--font-display)', margin: 0 }}>Mensajes</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(221,201,159,0.07)', border: '0.5px solid rgba(221,201,159,0.15)', borderRadius: 'var(--r)', padding: '7px 10px' }}>
            <Search size={12} color="var(--sidebar-fg-mute)" />
            <input
              placeholder="Buscar contacto…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--sidebar-fg)' }}
            />
          </div>
        </div>

        {/* Canal global */}
        <div style={{ padding: '10px 10px 6px' }}>
          <button
            onClick={() => setSelectedChatId('global')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '9px 12px', borderRadius: 'var(--r)',
              background: selectedChatId === 'global' ? 'var(--sidebar-active-bg)' : 'transparent',
              color: selectedChatId === 'global' ? 'var(--sidebar-active-fg)' : 'var(--sidebar-fg)',
              border: 0, cursor: 'pointer', transition: 'background .12s',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => { if (selectedChatId !== 'global') e.currentTarget.style.background = 'var(--sidebar-bg-2)'; }}
            onMouseLeave={e => { if (selectedChatId !== 'global') e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: selectedChatId === 'global' ? 'rgba(26,20,12,0.15)' : 'rgba(221,201,159,0.12)', display: 'grid', placeItems: 'center' }}>
                <Users size={14} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>Foro de Despacho</p>
                <p style={{ margin: 0, fontSize: 10, opacity: 0.65 }}>Canal general</p>
              </div>
            </div>
            {(unreadCounts['global'] ?? 0) > 0 && (
              <span style={{ background: 'var(--oxblood)', color: '#fbf6e9', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, fontFamily: 'var(--font-mono)' }}>
                {unreadCounts['global']}
              </span>
            )}
          </button>
        </div>

        {/* Privados */}
        <div style={{ padding: '0 10px', marginTop: 4 }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--sidebar-fg-mute)', padding: '4px 4px 8px' }}>
            Privados
          </p>
        </div>
        <div className="lm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 10px 12px' }}>
          {filteredUsers.map(u => {
            const chatId = getPrivateChatId(u.uid);
            const active = selectedChatId === chatId;
            return (
              <button
                key={u.uid}
                onClick={() => setSelectedChatId(chatId)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '8px 10px', marginBottom: 2, borderRadius: 'var(--r)',
                  background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                  color: active ? 'var(--sidebar-active-fg)' : 'var(--sidebar-fg)',
                  border: 0, cursor: 'pointer', transition: 'background .12s',
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sidebar-bg-2)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: active ? 'rgba(26,20,12,0.2)' : 'rgba(221,201,159,0.12)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {initials(u.displayName)}
                  </div>
                  <div style={{ textAlign: 'left', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{u.displayName}</p>
                    <p style={{ margin: 0, fontSize: 10, opacity: 0.65, textTransform: 'capitalize' }}>{u.role === 'lawyer' ? 'Abogado/a' : 'Auxiliar'}</p>
                  </div>
                </div>
                {(unreadCounts[chatId] ?? 0) > 0 && (
                  <span style={{ background: 'var(--oxblood)', color: '#fbf6e9', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {unreadCounts[chatId]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Ventana de chat */}
      <div style={{ flex: 1, background: 'var(--surface)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Chat header */}
        <header style={{
          padding: '14px 20px', borderBottom: '0.5px solid var(--rule)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--paper-2)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: 'var(--paper)', border: '0.5px solid var(--rule)', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ink-2)', flexShrink: 0 }}>
              {getChatTitle()[0]}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>{getChatTitle()}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--forest)', display: 'inline-block' }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--forest)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>activo</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {profile?.role === 'admin' && (
              <button onClick={handleClearChat} title="Limpiar chat" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 7, color: 'var(--ink-3)', borderRadius: 'var(--r-sm)', transition: 'color .12s' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--oxblood)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </header>

        {/* Messages area */}
        <div className="lm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px' }}>
              <MessageSquare size={36} color="var(--rule)" style={{ marginBottom: 14 }} />
              <p className="lm-display" style={{ fontSize: 16, color: 'var(--ink-3)', fontStyle: 'italic', margin: '0 0 6px' }}>Comienza la conversación</p>
              <p style={{ fontSize: 13, color: 'var(--ink-mute)', margin: 0 }}>Envía el primer mensaje para abrir el hilo.</p>
            </div>
          ) : (
            messages.map((m, idx) => {
              const isMe = m.authorId === profile?.uid;
              const showDate = idx === 0 || format(new Date(messages[idx - 1].timestamp), 'yyyy-MM-dd') !== format(new Date(m.timestamp), 'yyyy-MM-dd');
              return (
                <React.Fragment key={m.id}>
                  {showDate && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                      <span style={{ padding: '2px 12px', background: 'var(--paper-2)', border: '0.5px solid var(--rule)', borderRadius: 999, fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {format(new Date(m.timestamp), "EEEE d 'de' MMMM", { locale: es })}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row', marginBottom: 6 }}>
                    {!isMe && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--paper-2)', border: '0.5px solid var(--rule)', display: 'grid', placeItems: 'center', flexShrink: 0, alignSelf: 'flex-end' }}>
                        <UserIcon size={13} color="var(--ink-3)" />
                      </div>
                    )}
                    <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 3, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      {!isMe && selectedChatId === 'global' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingLeft: 4 }}>{m.authorName}</span>
                      )}
                      <div style={{
                        padding: '9px 13px',
                        borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        background: isMe ? 'var(--sidebar-bg)' : 'var(--paper)',
                        color: isMe ? 'var(--sidebar-fg)' : 'var(--ink)',
                        border: `0.5px solid ${isMe ? 'rgba(221,201,159,0.15)' : 'var(--rule-soft)'}`,
                        fontSize: 13, lineHeight: 1.55,
                        fontFamily: 'var(--font-sans)',
                        boxShadow: 'var(--shadow-sm)',
                      }}>
                        {m.authorId === 'ai_bot' ? (
                          <div className="markdown-content"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                        ) : m.content}
                      </div>
                      <span className="lm-mono" style={{ fontSize: 9.5, color: 'var(--ink-mute)', paddingLeft: 4 }}>
                        {format(new Date(m.timestamp), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--rule)', background: 'var(--paper-2)', flexShrink: 0 }}>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--paper-3)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r-lg)', padding: '9px 14px', transition: 'border .14s, box-shadow .14s' }}
              onFocusCapture={e => { const el = e.currentTarget; el.style.borderColor = 'var(--oxblood)'; el.style.boxShadow = '0 0 0 3px rgba(122,46,34,0.07)'; }}
              onBlurCapture={e => { const el = e.currentTarget; el.style.borderColor = 'var(--rule)'; el.style.boxShadow = 'none'; }}
            >
              <input
                type="text"
                placeholder="Escribe un mensaje…"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}
              />
            </div>
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="lm-btn lm-btn--primary"
              style={{ padding: '9px 14px', opacity: newMessage.trim() ? 1 : 0.5, flexShrink: 0 }}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
