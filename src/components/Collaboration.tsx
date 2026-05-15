import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, where, orderBy, updateDoc, doc, arrayUnion, writeBatch, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Message, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import ReactMarkdown from 'react-markdown';
import { Send, User as UserIcon, MessageSquare, Users, Search, Circle, ChevronLeft, Trash2, MoreVertical, Paperclip, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch all users for private chats
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.uid !== profile?.uid && u.role !== 'client')
      );
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return unsubscribe;
  }, [profile?.uid]);

  // Fetch messages for selected chat
  useEffect(() => {
    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', selectedChatId),
      orderBy('timestamp', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);

      // Mark as read
      if (profile) {
        msgs.forEach(async (m) => {
          if (!m.readBy.includes(profile.uid)) {
            try {
              await updateDoc(doc(db, 'messages', m.id), {
                readBy: arrayUnion(profile.uid)
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, `messages/${m.id}`);
            }
          }
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });
    return unsubscribe;
  }, [selectedChatId, profile]);

  // Fetch unread counts for all chats
  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'messages'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as Message;
        if (!data.readBy.includes(profile.uid)) {
          counts[data.chatId] = (counts[data.chatId] || 0) + 1;
        }
      });
      setUnreadCounts(counts);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });
    return unsubscribe;
  }, [profile]);

  const getPrivateChatId = (otherUid: string) => {
    if (!profile) return '';
    return [profile.uid, otherUid].sort().join('_');
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    const messageContent = newMessage;
    const currentChatId = selectedChatId;
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        chatId: currentChatId,
        authorId: profile.uid,
        authorName: profile.displayName,
        content: messageContent,
        timestamp: new Date().toISOString(),
        readBy: [profile.uid]
      });

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'messages');
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getChatTitle = () => {
    if (selectedChatId === 'global') return 'Foro de Despacho';
    const otherUid = selectedChatId.split('_').find(id => id !== profile?.uid);
    const otherUser = users.find(u => u.uid === otherUid);
    return otherUser?.displayName || 'Chat Privado';
  };

  const handleClearChat = async () => {
    if (!profile || profile.role !== 'admin') return;
    if (!window.confirm('¿Estás seguro de que deseas eliminar todos los mensajes de esta conversación? Esta acción no se puede deshacer.')) return;

    try {
      const q = query(collection(db, 'messages'), where('chatId', '==', selectedChatId));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'messages');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] min-h-[600px] bg-slate-50/50 p-4 rounded-[2.5rem]">
      {/* Sidebar */}
      <aside className={`lg:w-80 bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-xl shadow-slate-200/50 border border-white flex flex-col overflow-hidden transition-all duration-300 ${selectedChatId !== null && selectedChatId !== '' ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-6 border-b border-slate-100/50">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
                <MessageSquare className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Mensajes</h3>
            </div>
          </div>
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar contacto..." 
              className="w-full pl-11 pr-4 py-3 bg-slate-100/50 border-transparent border focus:border-indigo-500/20 focus:bg-white rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <button
            onClick={() => setSelectedChatId('global')}
            className={`w-full flex items-center justify-between px-4 py-4 rounded-[1.5rem] transition-all duration-300 group ${
              selectedChatId === 'global' 
                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' 
                : 'text-slate-600 hover:bg-white hover:shadow-lg hover:shadow-slate-100'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl transition-colors ${selectedChatId === 'global' ? 'bg-white/20' : 'bg-indigo-50 text-indigo-600'}`}>
                <Users className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm tracking-tight">Foro de Despacho</p>
                <p className={`text-[10px] font-medium ${selectedChatId === 'global' ? 'text-indigo-100' : 'text-slate-400'}`}>Canal General</p>
              </div>
            </div>
            {unreadCounts['global'] > 0 && (
              <div className="h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-lg shadow-rose-200">
                {unreadCounts['global']}
              </div>
            )}
          </button>

          <div className="pt-6 pb-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            Mensajes Privados
          </div>

          {filteredUsers.map(u => {
            const chatId = getPrivateChatId(u.uid);
            const isSelected = selectedChatId === chatId;
            return (
              <button
                key={u.uid}
                onClick={() => setSelectedChatId(chatId)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-[1.5rem] transition-all duration-300 group ${
                  isSelected 
                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' 
                    : 'text-slate-600 hover:bg-white hover:shadow-lg hover:shadow-slate-100'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-colors ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {u.displayName?.[0] || 'U'}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm tracking-tight truncate max-w-[120px]">{u.displayName}</p>
                    <p className={`text-[10px] font-medium capitalize ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>{u.role}</p>
                  </div>
                </div>
                {unreadCounts[chatId] > 0 && (
                  <div className="h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-lg shadow-rose-200">
                    {unreadCounts[chatId]}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat Window */}
      <div className={`flex-1 bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-white flex flex-col overflow-hidden transition-all duration-300 ${selectedChatId === null || selectedChatId === '' ? 'hidden lg:flex' : 'flex'}`}>
        <header className="px-6 md:px-8 py-4 md:py-5 border-b border-slate-100/50 flex items-center justify-between bg-white/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedChatId('')}
              className="lg:hidden p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl md:rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-lg md:text-xl shadow-inner">
              {getChatTitle()[0]}
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-black text-slate-900 tracking-tight truncate max-w-[150px] md:max-w-none">{getChatTitle()}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Activo ahora</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {profile?.role === 'admin' && (
              <button 
                onClick={handleClearChat}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all group"
                title="Limpiar chat"
              >
                <Trash2 className="h-4 w-4 group-hover:scale-110 transition-transform" />
              </button>
            )}
            <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50/30 scroll-smooth">
          {messages.length > 0 ? (
            messages.map((m, index) => {
              const isMe = m.authorId === profile?.uid;
              const showDate = index === 0 || format(new Date(messages[index-1].timestamp), 'yyyy-MM-dd') !== format(new Date(m.timestamp), 'yyyy-MM-dd');

              return (
                <React.Fragment key={m.id}>
                  {showDate && (
                    <div className="flex justify-center py-2">
                      <span className="px-4 py-1 bg-white/80 backdrop-blur-sm border border-slate-100 rounded-xl text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-sm">
                        {format(new Date(m.timestamp), "EEEE d 'de' MMMM", { locale: es })}
                      </span>
                    </div>
                  )}
                    <div className={`flex gap-2 md:gap-3 ${isMe ? 'flex-row-reverse' : ''} group`}>
                    {!isMe && (
                      <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                        <UserIcon className="h-4 w-4 md:h-5 md:w-5 text-slate-400" />
                      </div>
                    )}
                    <div className={`max-w-[85%] md:max-w-[75%] ${isMe ? 'items-end' : ''} flex flex-col gap-1`}>
                      {!isMe && selectedChatId === 'global' && (
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{m.authorName}</span>
                      )}
                      <div className={`p-3 md:p-3.5 rounded-[1.25rem] text-sm md:text-base leading-relaxed shadow-sm transition-all duration-300 ${
                        isMe 
                          ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-100 hover:shadow-indigo-200' 
                          : 'bg-white text-slate-700 rounded-tl-none border border-slate-100 hover:shadow-md'
                      }`}>
                        {m.authorId === 'ai_bot' ? (
                          <div className="markdown-content prose prose-slate max-w-none prose-sm md:prose-base">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                        ) : (
                          m.content
                        )}
                      </div>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 px-1">
                        {format(new Date(m.timestamp), 'HH:mm')} hs
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
              <div className="p-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100/50">
                <MessageSquare className="h-12 w-12 text-indigo-100" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-black text-slate-900 tracking-tight">Comienza la conversación</p>
                <p className="text-sm font-medium text-slate-400">Envía un mensaje para iniciar el chat.</p>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 md:p-5 bg-slate-50/30 border-t border-slate-100/50">
          <form onSubmit={handleSend} className="flex items-end gap-3">
            <div className="flex-1 flex items-center gap-2 bg-slate-100/50 p-2.5 md:p-3 rounded-[1.5rem] border border-transparent focus-within:border-indigo-500/20 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/5 transition-all duration-300">
              <button type="button" className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                <Smile className="h-5 w-5" />
              </button>
              <input
                type="text"
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-transparent outline-none text-slate-700 text-sm md:text-base placeholder:text-slate-400"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
              />
              <button type="button" className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                <Paperclip className="h-5 w-5" />
              </button>
            </div>
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="p-3.5 md:p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-200 hover:scale-105 active:scale-95"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
