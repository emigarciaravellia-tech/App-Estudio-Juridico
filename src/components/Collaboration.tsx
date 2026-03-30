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
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

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

      // Handle AI Assistant response
      if (currentChatId === 'ai_assistant') {
        setIsTyping(true);
        try {
          const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: messageContent,
              userName: profile.displayName,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al obtener respuesta de la IA');
          }

          const data = await response.json();
          const text = data.text;

          await addDoc(collection(db, 'messages'), {
            chatId: 'ai_assistant',
            authorId: 'ai_bot',
            authorName: 'LexIA Assistant',
            content: text,
            timestamp: new Date().toISOString(),
            readBy: [profile.uid]
          });
        } catch (aiError) {
          console.error("AI Error:", aiError);
          await addDoc(collection(db, 'messages'), {
            chatId: 'ai_assistant',
            authorId: 'ai_bot',
            authorName: 'LexIA Assistant',
            content: "Lo siento, he tenido un problema procesando tu consulta. Por favor, intenta de nuevo en unos momentos.",
            timestamp: new Date().toISOString(),
            readBy: [profile.uid]
          });
        } finally {
          setIsTyping(false);
        }
      }
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
    if (selectedChatId === 'ai_assistant') return 'LexIA Assistant';
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
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)] min-h-[600px] bg-slate-50/50 p-4 rounded-[2.5rem]">
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

          <button
            onClick={() => setSelectedChatId('ai_assistant')}
            className={`w-full flex items-center justify-between px-4 py-4 rounded-[1.5rem] transition-all duration-300 group ${
              selectedChatId === 'ai_assistant' 
                ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-200' 
                : 'text-slate-600 hover:bg-white hover:shadow-lg hover:shadow-slate-100'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl transition-colors ${selectedChatId === 'ai_assistant' ? 'bg-white/20' : 'bg-emerald-50 text-emerald-600'}`}>
                <Smile className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm tracking-tight">LexIA Assistant</p>
                <p className={`text-[10px] font-medium ${selectedChatId === 'ai_assistant' ? 'text-emerald-100' : 'text-slate-400'}`}>Inteligencia Artificial</p>
              </div>
            </div>
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
        <header className="px-6 md:px-10 py-6 md:py-8 border-b border-slate-100/50 flex items-center justify-between bg-white/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-5">
            <button 
              onClick={() => setSelectedChatId('')}
              className="lg:hidden p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="h-12 w-12 md:h-14 md:w-14 rounded-2xl md:rounded-[1.25rem] bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl md:text-2xl shadow-inner">
              {getChatTitle()[0]}
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight truncate max-w-[150px] md:max-w-none">{getChatTitle()}</h3>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Activo ahora</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile?.role === 'admin' && (
              <button 
                onClick={handleClearChat}
                className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all group"
                title="Limpiar chat"
              >
                <Trash2 className="h-5 w-5 group-hover:scale-110 transition-transform" />
              </button>
            )}
            <button className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 bg-slate-50/30 scroll-smooth">
          {messages.length > 0 ? (
            messages.map((m, index) => {
              const isMe = m.authorId === profile?.uid;
              const showDate = index === 0 || format(new Date(messages[index-1].timestamp), 'yyyy-MM-dd') !== format(new Date(m.timestamp), 'yyyy-MM-dd');

              return (
                <React.Fragment key={m.id}>
                  {showDate && (
                    <div className="flex justify-center py-4">
                      <span className="px-6 py-2 bg-white/80 backdrop-blur-sm border border-slate-100 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-sm">
                        {format(new Date(m.timestamp), "EEEE d 'de' MMMM", { locale: es })}
                      </span>
                    </div>
                  )}
                    <div className={`flex gap-3 md:gap-4 ${isMe ? 'flex-row-reverse' : ''} group`}>
                    {!isMe && (
                      <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                        <UserIcon className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                      </div>
                    )}
                    <div className={`max-w-[85%] md:max-w-[65%] ${isMe ? 'items-end' : ''} flex flex-col gap-2`}>
                      {!isMe && selectedChatId === 'global' && (
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">{m.authorName}</span>
                      )}
                      <div className={`p-3 md:p-4 rounded-[1.5rem] text-sm md:text-base leading-relaxed shadow-sm transition-all duration-300 ${
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
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 px-2">
                        {format(new Date(m.timestamp), 'HH:mm')} hs
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-6">
              <div className="p-10 bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-100/50">
                <MessageSquare className="h-16 w-16 text-indigo-100" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-lg font-black text-slate-900 tracking-tight">Comienza la conversación</p>
                <p className="text-sm font-medium text-slate-400">Envía un mensaje para iniciar el chat.</p>
              </div>
            </div>
          )}
          
          {isTyping && (
            <div className="flex gap-4 md:gap-6 group">
              <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Smile className="h-5 w-5 md:h-6 md:w-6 text-emerald-500" />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">LexIA Assistant</span>
                <div className="bg-white p-4 rounded-[1.5rem] rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-1">
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="h-1.5 w-1.5 bg-slate-400 rounded-full" />
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="h-1.5 w-1.5 bg-slate-400 rounded-full" />
                  <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="h-1.5 w-1.5 bg-slate-400 rounded-full" />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 md:p-6 bg-slate-50/30 border-t border-slate-100/50">
          <form onSubmit={handleSend} className="flex items-end gap-4">
            <div className="flex-1 flex items-center gap-3 bg-slate-100/50 p-3 md:p-4 rounded-[2rem] border border-transparent focus-within:border-indigo-500/20 focus-within:bg-white focus-within:ring-8 focus-within:ring-indigo-500/5 transition-all duration-300">
              <button type="button" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                <Smile className="h-6 w-6" />
              </button>
              <input
                type="text"
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-transparent outline-none text-slate-700 text-sm md:text-base placeholder:text-slate-400"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
              />
              <button type="button" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                <Paperclip className="h-6 w-6" />
              </button>
            </div>
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="p-4 md:p-5 bg-indigo-600 text-white rounded-[1.5rem] hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-200 hover:scale-105 active:scale-95"
            >
              <Send className="h-6 w-6" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
