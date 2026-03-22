import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Scale, ShieldCheck, Globe, Zap, AlertCircle, User as UserIcon, Lock, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Auth() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      console.error("Auth failed:", err);
      setError("Usuario o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden">
      {/* Left Side - Branding */}
      <div className="md:w-1/2 bg-indigo-900 p-12 flex flex-col justify-between text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-800 rounded-full -mr-48 -mt-48 blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-700 rounded-full -ml-48 -mb-48 blur-3xl opacity-30" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <Scale className="h-10 w-10 text-indigo-400" />
            <h1 className="text-3xl font-bold tracking-tight">LexManage</h1>
          </div>
          
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-5xl font-bold leading-tight mb-6">
              Gestión Legal <br />
              <span className="text-indigo-400">Profesional.</span>
            </h2>
            <p className="text-xl text-indigo-200 max-w-md leading-relaxed">
              Optimice sus expedientes, tareas y colaboración en una plataforma segura y moderna.
            </p>
          </motion.div>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-8 pt-12 border-t border-indigo-800">
          <div className="space-y-2">
            <ShieldCheck className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-bold">Datos Seguros</p>
          </div>
          <div className="space-y-2">
            <Globe className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-bold">Acceso Cloud</p>
          </div>
          <div className="space-y-2">
            <Zap className="h-6 w-6 text-indigo-400" />
            <p className="text-sm font-bold">Sincronización</p>
          </div>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="md:w-1/2 flex items-center justify-center p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center">
            <h3 className="text-3xl font-bold text-slate-900">Iniciar Sesión</h3>
            <p className="text-slate-500 mt-2">Acceda a su panel de control</p>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200 border border-slate-100 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                {error}
              </div>
            )}
            
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Usuario</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="password"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-indigo-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                <LogIn className="h-5 w-5" />
                {loading ? 'Procesando...' : 'Entrar'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-4 text-slate-400 font-bold tracking-widest">Acceso Autorizado</span>
              </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
              <p className="text-xs text-indigo-700 leading-relaxed text-center">
                Sus datos están protegidos por encriptación de grado empresarial.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
