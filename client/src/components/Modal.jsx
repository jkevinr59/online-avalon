import { useEffect, useId } from 'react';
import { useI18n } from '../i18n.jsx';
import { LANGS } from '../strings.js';

// A dialog over the page. Closes on the ✕ button, Escape, or a tap outside.
export function Modal({ title, onClose, children, tone = '' }) {
  const { t } = useI18n();
  const titleId = useId();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${tone}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// Small ID / EN switch.
export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('common.language')}>
      {LANGS.map((l) => (
        <button key={l.code} type="button" className={lang === l.code ? 'active' : ''} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
