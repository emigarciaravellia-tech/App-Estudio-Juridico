import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, where, orderBy, updateDoc, doc, arrayUnion, writeBatch, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Message, MessageAttachment, UserProfile, Case } from '../types';
import { useAuth } from '../hooks/useAuth';
import ReactMarkdown from 'react-markdown';
import { Send, User as UserIcon, MessageSquare, Users, Search, ChevronLeft, Trash2, MoreVertical, Paperclip, X, Briefcase, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function Collaboration() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>('global');
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [attachTab, setAttachTab] = useState<'case' | 'client'>('case');
  const [attachSearch, setAttachSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      setUsers(all.filter(u => u.uid !== profile?.uid && u.role !== 'client'));
      setClients(all.filter(u => u.role === 'client'));
    }, e => handleFirestoreError(e, OperationType.LIST, 'users'));
    return unsub;
  }, [profile?.uid]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'cases'), orderBy('updatedAt', 'desc')),
      snap => setCases(snap.docs.map(d => ({ id: d.id, ...d.data() } as Case))),
      e => handleFirestoreError(e, OperationType.LIST, 'cases')
    );
    return unsub;
  }, []);

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

  useEffect(() => {
    setPendingAttachment(null);
    setShowAttachPicker(false);
  }, [selectedChatId]);

  const getPrivateChatId = (otherUid: string) => profile ? [profile.uid, otherUid].sort().join('_') : '';

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingAttachment) || !profile) return;
    const content = newMessage;
    const attachment = pendingAttachment;
    setNewMessage('');
    setPendingAttachment(null);
    setShowAttachPicker(false);
    try {
      const msgData: Omit<Message, 'id'> = {
        chatId: selectedChatId,
        authorId: profile.uid,
        authorName: profile.displayName,
        content,
        timestamp: new Date().toISOString(),
        readBy: [profile.uid],
        ...(attachment ? { attachment } : {}),
      };
      await addDoc(collection(db, 'messages'), msgData);
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

  const filteredCases = cases.filter(c =>
    (c.caseTitle || '').toLowerCase().includes(attachSearch.toLowerCase()) ||
    (c.caseNumber || '').toLowerCase().includes(attachSearch.toLowerCase()) ||
    (c.clientName || '').toLowerCase().includes(attachSearch.toLowerCase())
  );

  const filteredClients = clients.filter(cl =>
    (cl.displayName || '').toLowerCase().includes(attachSearch.toLowerCase()) ||
    (cl.email || '').toLowerCase().includes(attachSearch.toLowerCase())
  );

  const getChatTitle = () => {
    if (selectedChatId === 'global') return 'Foro de Despacho';
    const otherUid = selectedChatId.split('_').find(id => id !== profile?.uid);
    return users.find(u => u.uid === otherUid)?.displayName || 'Chat privado';
  };

  const initials = (name?: string) => name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  const AVATAR_PALETTE = [
    { bg: '#7a2e22', fg: '#fbf6e9' },
    { bg: '#2d5a3d', fg: '#fbf6e9' },
    { bg: '#6b4c11', fg: '#fbf6e9' },
    { bg: '#3b5378', fg: '#fbf6e9' },
    { bg: '#5a3472', fg: '#fbf6e9' },
    { bg: '#1a5252', fg: '#fbf6e9' },
  ];
  const avatarColor = (uid: string) => {
    const hash = uid.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  };

  return (
    <div className="lm-collab" style={{ height: 'calc(100vh - 140px)', minHeight: 520, gap: 12 }}>

      {/* Sidebar de chats */}
      <aside className="lm-collab-aside" style={{
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
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(u.uid).bg, color: avatarColor(u.uid).fg, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-sans)' }}>
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
      <div className="lm-collab-chat" style={{ flex: 1, background: 'var(--surface)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Chat header */}
        <header style={{
          padding: '14px 20px', borderBottom: '0.5px solid var(--rule)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--paper-2)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {(() => {
              if (selectedChatId === 'global') {
                return (
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: 'var(--paper)', border: '0.5px solid var(--rule)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Users size={16} color="var(--ink-2)" />
                  </div>
                );
              }
              const otherUid = selectedChatId.split('_').find(id => id !== profile?.uid) || '';
              const other = users.find(u => u.uid === otherUid);
              const ac = avatarColor(otherUid);
              return (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: ac.bg, color: ac.fg, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
                  {initials(other?.displayName)}
                </div>
              );
            })()}
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
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(m.authorId).bg, color: avatarColor(m.authorId).fg, display: 'grid', placeItems: 'center', flexShrink: 0, alignSelf: 'flex-end', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-sans)' }}>
                        {initials(m.authorName)}
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
                        {m.content && (
                          m.authorId === 'ai_bot'
                            ? <div className="markdown-content"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                            : m.content
                        )}
                        {m.attachment && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            marginTop: m.content ? 8 : 0,
                            padding: '7px 10px',
                            background: isMe ? 'rgba(26,20,12,0.15)' : 'var(--paper-2)',
                            border: `0.5px solid ${m.attachment.type === 'case' ? 'rgba(122,46,34,0.25)' : 'rgba(45,90,61,0.25)'}`,
                            borderRadius: 'var(--r)',
                          }}>
                            {m.attachment.type === 'case'
                              ? <Briefcase size={13} color="var(--oxblood)" style={{ flexShrink: 0 }} />
                              : <UserCheck size={13} color="var(--forest)" style={{ flexShrink: 0 }} />
                            }
                            <div style={{ minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: m.attachment.type === 'case' ? 'var(--oxblood)' : 'var(--forest)' }}>
                                {m.attachment.type === 'case' ? 'Expediente' : 'Cliente'}
                              </p>
                              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: isMe ? 'var(--sidebar-fg)' : 'var(--ink)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.attachment.label}
                              </p>
                            </div>
                          </div>
                        )}
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

        {/* Input area */}
        <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--rule)', background: 'var(--paper-2)', flexShrink: 0, position: 'relative' }}>

          {/* Pending attachment chip */}
          {pendingAttachment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '5px 10px', background: 'var(--paper-3)', border: `0.5px solid ${pendingAttachment.type === 'case' ? 'rgba(122,46,34,0.3)' : 'rgba(45,90,61,0.3)'}`, borderRadius: 'var(--r)', width: 'fit-content', maxWidth: '100%' }}>
              {pendingAttachment.type === 'case'
                ? <Briefcase size={11} color="var(--oxblood)" style={{ flexShrink: 0 }} />
                : <UserCheck size={11} color="var(--forest)" style={{ flexShrink: 0 }} />
              }
              <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                {pendingAttachment.label}
              </span>
              <button
                type="button"
                onClick={() => setPendingAttachment(null)}
                style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
              >
                <X size={11} />
              </button>
            </div>
          )}

          {/* Attachment picker */}
          {showAttachPicker && (
            <>
              <div
                onClick={() => setShowAttachPicker(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 49 }}
              />
              <div style={{
                position: 'absolute', bottom: '100%', left: 16, marginBottom: 6,
                background: 'var(--surface)', border: '0.5px solid var(--rule)',
                borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow)',
                width: 320, zIndex: 50, overflow: 'hidden',
              }}>
                {/* Picker header */}
                <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => { setAttachTab('case'); setAttachSearch(''); }}
                      style={{ padding: '4px 11px', borderRadius: 'var(--r-sm)', border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-sans)', background: attachTab === 'case' ? 'var(--oxblood)' : 'transparent', color: attachTab === 'case' ? '#fbf6e9' : 'var(--ink-2)', transition: 'all .1s' }}
                    >
                      Expedientes
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAttachTab('client'); setAttachSearch(''); }}
                      style={{ padding: '4px 11px', borderRadius: 'var(--r-sm)', border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-sans)', background: attachTab === 'client' ? 'var(--oxblood)' : 'transparent', color: attachTab === 'client' ? '#fbf6e9' : 'var(--ink-2)', transition: 'all .1s' }}
                    >
                      Clientes
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAttachPicker(false)}
                    style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)', padding: 2, display: 'flex', alignItems: 'center' }}
                  >
                    <X size={13} />
                  </button>
                </div>

                {/* Search */}
                <div style={{ padding: '8px 12px', borderBottom: '0.5px solid var(--rule)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--paper-3)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r)', padding: '5px 9px' }}>
                    <Search size={11} color="var(--ink-3)" />
                    <input
                      autoFocus
                      placeholder={attachTab === 'case' ? 'Buscar expediente…' : 'Buscar cliente…'}
                      value={attachSearch}
                      onChange={e => setAttachSearch(e.target.value)}
                      style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontSize: 11.5, fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}
                    />
                  </div>
                </div>

                {/* Results */}
                <div className="lm-scroll" style={{ maxHeight: 200, overflowY: 'auto', padding: '4px 0' }}>
                  {attachTab === 'case' ? (
                    filteredCases.length === 0 ? (
                      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-mute)', padding: '20px 0', margin: 0 }}>Sin resultados</p>
                    ) : filteredCases.slice(0, 25).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setPendingAttachment({ type: 'case', id: c.id, label: `${c.caseNumber ? '#' + c.caseNumber + ' — ' : ''}${c.caseTitle}` });
                          setShowAttachPicker(false);
                          setAttachSearch('');
                        }}
                        style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '7px 14px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.caseTitle || '(sin título)'}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                          {[c.caseNumber ? `#${c.caseNumber}` : null, c.clientName].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    ))
                  ) : (
                    filteredClients.length === 0 ? (
                      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-mute)', padding: '20px 0', margin: 0 }}>Sin resultados</p>
                    ) : filteredClients.slice(0, 25).map(cl => (
                      <button
                        key={cl.uid}
                        type="button"
                        onClick={() => {
                          setPendingAttachment({ type: 'client', id: cl.uid, label: cl.displayName || cl.email });
                          setShowAttachPicker(false);
                          setAttachSearch('');
                        }}
                        style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '7px 14px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
                          {cl.displayName || '(sin nombre)'}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{cl.email}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSend} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            {/* Paperclip button */}
            <button
              type="button"
              onClick={() => { setShowAttachPicker(p => !p); setAttachSearch(''); }}
              title="Adjuntar expediente o cliente"
              style={{
                padding: '9px 10px',
                background: showAttachPicker ? 'var(--paper-3)' : 'none',
                border: '0.5px solid var(--rule)',
                borderRadius: 'var(--r)',
                cursor: 'pointer',
                color: pendingAttachment ? 'var(--oxblood)' : 'var(--ink-3)',
                transition: 'all .12s',
                flexShrink: 0,
                display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={e => { if (!showAttachPicker) e.currentTarget.style.background = 'var(--paper-3)'; }}
              onMouseLeave={e => { if (!showAttachPicker) e.currentTarget.style.background = 'none'; }}
            >
              <Paperclip size={14} />
            </button>

            <div
              style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--paper-3)', border: '0.5px solid var(--rule)', borderRadius: 'var(--r-lg)', padding: '9px 14px', transition: 'border .14s, box-shadow .14s' }}
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
              disabled={!newMessage.trim() && !pendingAttachment}
              className="lm-btn lm-btn--primary"
              style={{ padding: '9px 14px', opacity: (newMessage.trim() || pendingAttachment) ? 1 : 0.5, flexShrink: 0 }}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
