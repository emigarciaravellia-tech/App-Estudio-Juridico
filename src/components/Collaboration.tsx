import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, where, orderBy, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Message, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Send, User as UserIcon, MessageSquare, Users, Search, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

    try {
      await addDoc(collection(db, 'messages'), {
        chatId: selectedChatId,
        authorId: profile.uid,
        authorName: profile.displayName,
        content: newMessage,
        timestamp: new Date().toISOString(),
        readBy: [profile.uid]
      });
      setNewMessage('');
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

  return (
    <div className="h-[calc(100vh-12rem)] flex gap-6 bg-slate-50 p-1">
      {/* Sidebar */}
      <aside className="w-80 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 space-y-4">
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-indigo-600" />
            Mensajes
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar usuario..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <button
            onClick={() => setSelectedChatId('global')}
            className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl transition-all group ${
              selectedChatId === 'global' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${selectedChatId === 'global' ? 'bg-indigo-500' : 'bg-indigo-50 text-indigo-600'}`}>
                <Users className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">Foro de Despacho</p>
                <p className={`text-[10px] ${selectedChatId === 'global' ? 'text-indigo-200' : 'text-slate-400'}`}>Estudio Jurídico</p>
              </div>
            </div>
            {unreadCounts['global'] > 0 && (
              <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse" />
            )}
          </button>

          <div className="pt-6 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Mensajes Privados
          </div>

          {filteredUsers.map(u => {
            const chatId = getPrivateChatId(u.uid);
            const isSelected = selectedChatId === chatId;
            return (
              <button
                key={u.uid}
                onClick={() => setSelectedChatId(chatId)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all group ${
                  isSelected 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold ${
                    isSelected ? 'bg-indigo-500' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {u.displayName?.[0] || 'U'}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm truncate max-w-[120px]">{u.displayName}</p>
                    <p className={`text-[10px] capitalize ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>{u.role}</p>
                  </div>
                </div>
                {unreadCounts[chatId] > 0 && (
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat Window */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xl">
              {getChatTitle()[0]}
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">{getChatTitle()}</h3>
              <div className="flex items-center gap-2">
                <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">En línea</span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30">
          {messages.length > 0 ? (
            messages.map((m, index) => {
              const isMe = m.authorId === profile?.uid;
              const showDate = index === 0 || format(new Date(messages[index-1].timestamp), 'yyyy-MM-dd') !== format(new Date(m.timestamp), 'yyyy-MM-dd');

              return (
                <React.Fragment key={m.id}>
                  {showDate && (
                    <div className="flex justify-center">
                      <span className="px-4 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest shadow-sm">
                        {format(new Date(m.timestamp), "EEEE d 'de' MMMM", { locale: es })}
                      </span>
                    </div>
                  )}
                  <div className={`flex gap-4 ${isMe ? 'flex-row-reverse' : ''}`}>
                    {!isMe && (
                      <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <UserIcon className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                    <div className={`max-w-[70%] ${isMe ? 'items-end' : ''} flex flex-col gap-1`}>
                      {!isMe && selectedChatId === 'global' && (
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{m.authorName}</span>
                      )}
                      <div className={`p-4 rounded-2xl text-sm shadow-sm ${
                        isMe 
                          ? 'bg-indigo-600 text-white rounded-tr-none' 
                          : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'
                      }`}>
                        {m.content}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {format(new Date(m.timestamp), 'HH:mm')} hs
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
              <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <MessageSquare className="h-12 w-12 opacity-20" />
              </div>
              <p className="text-sm font-medium">No hay mensajes en esta conversación.</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-6 bg-white border-t border-slate-100">
          <div className="flex gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
            <input
              type="text"
              placeholder="Escribe un mensaje..."
              className="flex-1 px-4 py-2 bg-transparent outline-none text-slate-700 text-sm"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-100"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
