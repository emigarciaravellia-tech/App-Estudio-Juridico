import { useState, useRef } from 'react';
import { Case } from '../types';
import { Search, X } from 'lucide-react';

interface Props {
  cases: Case[];
  value: string;       // caseId seleccionado
  onChange: (caseId: string) => void;
}

export default function CaseCombobox({ cases, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = cases.find(c => c.id === value);

  const filtered = query.trim() === ''
    ? cases
    : cases.filter(c =>
        c.caseNumber.toLowerCase().includes(query.toLowerCase()) ||
        c.caseTitle.toLowerCase().includes(query.toLowerCase()) ||
        c.clientName.toLowerCase().includes(query.toLowerCase())
      );

  const handleFocus = () => {
    setQuery('');
    setOpen(true);
  };

  const handleBlur = () => {
    // timeout para que onMouseDown de las opciones se dispare primero
    setTimeout(() => setOpen(false), 150);
  };

  const select = (caseId: string) => {
    onChange(caseId);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Input */}
      <div style={{ position: 'relative' }}>
        <Search
          size={13}
          style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--ink-mute)', pointerEvents: 'none',
          }}
        />
        <input
          ref={inputRef}
          className="lm-input"
          style={{ paddingLeft: 30, paddingRight: 28 }}
          placeholder="Buscar por Nº, título o cliente…"
          value={open ? query : selected ? `${selected.caseNumber} — ${selected.caseTitle}` : ''}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={e => setQuery(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            style={{
              position: 'absolute', right: 8, top: '50%',
              transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-mute)', padding: 2, display: 'flex',
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--paper)',
          border: '0.5px solid var(--rule)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 200,
          maxHeight: 220,
          overflowY: 'auto',
        }}>
          {/* Sin vincular */}
          <div
            onMouseDown={() => select('')}
            style={{
              padding: '8px 12px',
              fontSize: 12.5,
              color: 'var(--ink-mute)',
              cursor: 'pointer',
              borderBottom: '0.5px solid var(--rule-soft)',
              fontStyle: 'italic',
            }}
            className="lm-row-hover"
          >
            Sin vincular
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center' }}>
              Sin resultados para "{query}"
            </div>
          ) : (
            filtered.map(c => (
              <div
                key={c.id}
                onMouseDown={() => select(c.id)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: value === c.id ? 'var(--paper-2)' : 'transparent',
                  borderBottom: '0.5px solid var(--rule-soft)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
                className="lm-row-hover"
              >
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--oxblood)',
                  fontWeight: 600,
                }}>
                  {c.caseNumber}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>
                  {c.caseTitle}
                </span>
                {c.clientName && (
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                    {c.clientName}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
