import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Scale, ShieldCheck, Globe, Zap, AlertCircle, User as UserIcon, Lock, LogIn } from 'lucide-react';
import { motion } from 'motion/react';

export default function Auth() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      console.error('Auth failed:', err);
      setError('Usuario o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row', background: 'var(--paper-2)' }}>

      {/* Left panel — branding */}
      <div className="lm-auth-brand" style={{
        width: '45%', minWidth: 320,
        background: 'var(--sidebar-bg)',
        color: 'var(--sidebar-fg)',
        padding: '48px 52px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* decorative grain blobs */}
        <div style={{
          position: 'absolute', top: -120, right: -120, width: 360, height: 360,
          borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -100, left: -100, width: 300, height: 300,
          borderRadius: '50%', background: 'rgba(255,255,255,0.02)', pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 52 }}>
            <Scale style={{ width: 32, height: 32, color: 'var(--oxblood)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.02em' }}>
              LexManage
            </span>
          </div>

          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 500, lineHeight: 1.1, margin: '0 0 20px', color: 'var(--sidebar-fg)' }}>
              Gestión Legal<br />
              <span style={{ color: 'var(--oxblood)' }}>Profesional.</span>
            </h2>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)', maxWidth: 340, lineHeight: 1.65, margin: 0 }}>
              Optimice sus expedientes, tareas y colaboración en una plataforma segura y moderna.
            </p>
          </motion.div>
        </div>

        {/* Feature strip */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28,
          paddingTop: 28, borderTop: '0.5px solid rgba(255,255,255,0.1)',
        }}>
          {[
            { Icon: ShieldCheck, label: 'Datos Seguros' },
            { Icon: Globe, label: 'Acceso Cloud' },
            { Icon: Zap, label: 'Sincronización' },
          ].map(({ Icon, label }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Icon style={{ width: 20, height: 20, color: 'var(--oxblood)' }} />
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'rgba(255,255,255,0.6)' }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="lm-auth-form" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ width: '100%', maxWidth: 400 }}
        >
          <div style={{ marginBottom: 32, textAlign: 'center' }}>
            <p className="lm-eyebrow" style={{ marginBottom: 8 }}>Bienvenido</p>
            <h1 className="lm-display" style={{ fontSize: '1.8rem', margin: 0 }}>Iniciar Sesión</h1>
            <p style={{ color: 'var(--ink-3)', marginTop: 6, fontSize: '0.875rem' }}>Acceda a su panel de control</p>
          </div>

          <div className="lm-card" style={{ padding: 32 }}>
            {error && (
              <div style={{
                padding: '12px 16px', marginBottom: 20,
                background: 'var(--oxblood-soft)', border: '0.5px solid var(--oxblood)',
                borderRadius: 'var(--r-md)', color: 'var(--oxblood)',
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: '0.85rem', fontFamily: 'var(--font-sans)',
              }}>
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="lm-eyebrow">Usuario</label>
                <div style={{ position: 'relative' }}>
                  <UserIcon style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--ink-3)' }} />
                  <input
                    type="text"
                    required
                    placeholder="admin"
                    className="lm-input"
                    style={{ paddingLeft: 36 }}
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="lm-eyebrow">Contraseña</label>
                <div style={{ position: 'relative' }}>
                  <Lock style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--ink-3)' }} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="lm-input"
                    style={{ paddingLeft: 36 }}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="lm-btn lm-btn--primary"
                style={{ marginTop: 8, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}
              >
                <LogIn style={{ width: 16, height: 16 }} />
                {loading ? 'Procesando…' : 'Entrar'}
              </button>
            </form>

            <div style={{ margin: '20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: '0.5px', background: 'var(--rule-soft)' }} />
              <span className="lm-eyebrow" style={{ fontSize: '0.65rem' }}>Acceso Autorizado</span>
              <div style={{ flex: 1, height: '0.5px', background: 'var(--rule-soft)' }} />
            </div>

            <div style={{
              padding: '12px 16px',
              background: 'var(--paper-2)', border: '0.5px solid var(--rule)',
              borderRadius: 'var(--r-md)',
            }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.5 }}>
                Sus datos están protegidos por encriptación de grado empresarial.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
