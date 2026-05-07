import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { SACSummary, SACConfig } from '../types';
import { useAuth } from '../hooks/useAuth';
import { 
  ShieldAlert, 
  RefreshCw, 
  Settings, 
  FileText, 
  Calendar, 
  AlertTriangle, 
  ChevronRight, 
  Search,
  Filter,
  X,
  Eye,
  Trash2,
  CheckCircle2,
  Clock,
  ExternalLink,
  BrainCircuit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export default function SACSummaryComponent() {
  const { profile, isAdmin, isLawyer } = useAuth();
  const [summaries, setSummaries] = useState<SACSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<SACSummary | null>(null);
  
  const [sacConfig, setSacConfig] = useState<SACConfig>({
    username: '',
    password: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'sac_summaries'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSummaries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SACSummary)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sac_summaries');
    });

    return unsubscribe;
  }, []);

  const handleSync = async () => {
    if (!sacConfig.username || !sacConfig.password) {
      setIsSettingsModalOpen(true);
      return;
    }

    setIsSyncing(true);
    try {
      // Here we would call the backend endpoint
      const response = await fetch('/api/sac/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sacConfig)
      });

      if (!response.ok) {
        throw new Error('Error al sincronizar con el SAC');
      }

      const result = await response.json();
      
      // Save each summary to Firestore
      if (result.summaries && Array.isArray(result.summaries)) {
        for (const summary of result.summaries) {
          await addDoc(collection(db, 'sac_summaries'), {
            ...summary,
            createdAt: new Date().toISOString()
          });
        }
      }
      
      console.log('Sync result:', result);
    } catch (error) {
      console.error('Sync error:', error);
      alert('Error en la sincronización automática. Verifique sus credenciales o intente más tarde.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este resumen?')) return;
    try {
      await deleteDoc(doc(db, 'sac_summaries', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `sac_summaries/${id}`);
    }
  };

  const filteredSummaries = summaries.filter(s => {
    const matchesSearch = 
      s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.caseNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || s.type === filterType;
    
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <BrainCircuit className="h-8 w-8 text-indigo-600" />
            Resumen de Novedades SAC
          </h2>
          <p className="text-slate-500">Inteligencia artificial aplicada a tus expedientes de Justicia Córdoba.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm"
            title="Configuración SAC"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button 
            onClick={handleSync}
            disabled={isSyncing}
            className={`flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50`}
          >
            <RefreshCw className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar SAC'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Resúmenes</p>
            <p className="text-xl font-black text-slate-900">{summaries.length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plazos Detectados</p>
            <p className="text-xl font-black text-slate-900">
              {summaries.reduce((acc, s) => acc + (s.importantDeadlines?.length || 0), 0)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Última Sincro</p>
            <p className="text-sm font-bold text-slate-900">Hoy, 10:30 hs</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendientes de Revisión</p>
            <p className="text-xl font-black text-slate-900">3</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar en resúmenes o expedientes..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-slate-400 mr-2" />
            <select 
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">Todos los tipos</option>
              <option value="decreto">Decretos</option>
              <option value="expediente">Expedientes Completos</option>
              <option value="novedad">Novedades</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredSummaries.map((summary) => (
            <motion.div 
              layout
              key={summary.id}
              className="p-6 hover:bg-slate-50 transition-all cursor-pointer group"
              onClick={() => {
                setSelectedSummary(summary);
                setIsViewModalOpen(true);
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`mt-1 h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    summary.type === 'decreto' ? 'bg-indigo-50 text-indigo-600' :
                    summary.type === 'expediente' ? 'bg-emerald-50 text-emerald-600' :
                    'bg-amber-50 text-amber-600'
                  }`}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {summary.title}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        summary.type === 'decreto' ? 'bg-indigo-100 text-indigo-700' :
                        summary.type === 'expediente' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {summary.type}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                      {summary.content}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(parseISO(summary.date), 'dd MMM yyyy', { locale: es })}
                      </div>
                      {summary.caseNumber && (
                        <div className="flex items-center gap-1.5">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Exp: {summary.caseNumber}
                        </div>
                      )}
                      {summary.importantDeadlines && summary.importantDeadlines.length > 0 && (
                        <div className="flex items-center gap-1.5 text-amber-600 font-bold">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {summary.importantDeadlines.length} plazos detectados
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(summary.id); }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="p-2 text-slate-400">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {filteredSummaries.length === 0 && !loading && (
            <div className="p-12 text-center">
              <BrainCircuit className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">No se encontraron resúmenes del SAC.</p>
              <button 
                onClick={handleSync}
                className="mt-4 text-indigo-600 font-bold hover:underline"
              >
                Sincronizar ahora
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Configuración SAC */}
      <AnimatePresence>
        {isSettingsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Settings className="h-6 w-6 text-indigo-400" />
                  <h3 className="text-xl font-bold">Configuración SAC</h3>
                </div>
                <button onClick={() => setIsSettingsModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3">
                  <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Sus credenciales se utilizan únicamente para acceder al portal SAC de Justicia Córdoba y sincronizar sus novedades. LexManage no almacena su contraseña de forma permanente por seguridad.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Usuario / CUIL</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="20-XXXXXXXX-X"
                      value={sacConfig.username}
                      onChange={(e) => setSacConfig({ ...sacConfig, username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Contraseña SAC</label>
                    <input 
                      type="password"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="••••••••"
                      value={sacConfig.password}
                      onChange={(e) => setSacConfig({ ...sacConfig, password: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      setIsSettingsModalOpen(false);
                      handleSync();
                    }}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    Guardar y Sincronizar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Ver Resumen */}
      <AnimatePresence>
        {isViewModalOpen && selectedSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 bg-indigo-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BrainCircuit className="h-6 w-6 text-indigo-400" />
                  <h3 className="text-xl font-bold">Detalle de Resumen IA</h3>
                </div>
                <button onClick={() => setIsViewModalOpen(false)} className="p-2 hover:bg-indigo-800 rounded-xl">
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto flex-1 space-y-8">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      selectedSummary.type === 'decreto' ? 'bg-indigo-100 text-indigo-700' :
                      selectedSummary.type === 'expediente' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {selectedSummary.type}
                    </span>
                    <p className="text-sm text-slate-400">
                      Sincronizado el {format(parseISO(selectedSummary.createdAt), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <h4 className="text-2xl font-black text-slate-900 leading-tight">
                    {selectedSummary.title}
                  </h4>
                  {selectedSummary.caseNumber && (
                    <p className="text-indigo-600 font-bold mt-1">Expediente: {selectedSummary.caseNumber}</p>
                  )}
                </div>

                <div className="space-y-4">
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Resumen Ejecutivo</h5>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {selectedSummary.content}
                    </p>
                  </div>
                </div>

                {selectedSummary.importantDeadlines && selectedSummary.importantDeadlines.length > 0 && (
                  <div className="space-y-4">
                    <h5 className="text-xs font-bold text-amber-600 uppercase tracking-widest border-b border-amber-100 pb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Plazos y Vencimientos Detectados
                    </h5>
                    <div className="space-y-3">
                      {selectedSummary.importantDeadlines.map((deadline, idx) => (
                        <div key={idx} className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-4">
                          <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-amber-600 shadow-sm flex-shrink-0">
                            <Calendar className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-amber-900">{deadline.description}</p>
                            <p className="text-sm text-amber-700">Fecha límite estimada: {deadline.date}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedSummary.rawText && (
                  <div className="space-y-4">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Texto Original (SAC)</h5>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-mono leading-relaxed whitespace-pre-wrap">
                        {selectedSummary.rawText}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setIsViewModalOpen(false)}
                  className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                >
                  Cerrar
                </button>
                <button 
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                >
                  <ExternalLink className="h-5 w-5" />
                  Ver en SAC Oficial
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
