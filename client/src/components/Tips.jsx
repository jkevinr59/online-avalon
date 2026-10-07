import { useI18n } from '../i18n.jsx';
import { LangSwitch, Modal } from './Modal.jsx';

// A short list of tips for the current moment. Hidden when the player turned
// tips off, unless `always` (the role reveal always explains the role).
export function Tips({ tipKey, title, always = false }) {
  const { t, showTips, setShowTips } = useI18n();
  const items = t(tipKey);
  if ((!showTips && !always) || !Array.isArray(items)) return null;
  return (
    <aside className="tips">
      <div className="tips-head">
        <strong>{title ?? t('tips.title')}</strong>
        {!always && (
          <button type="button" className="link-btn" onClick={() => setShowTips(false)}>
            {t('tips.hide')}
          </button>
        )}
      </div>
      <ul>
        {items.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </aside>
  );
}

// "How to play": the rules in brief, plus the tips and language settings.
export function HelpModal({ onClose }) {
  const { t, showTips, setShowTips } = useI18n();
  return (
    <Modal title={t('help.title')} onClose={onClose}>
      {t('help.sections').map((s) => (
        <section key={s.title} className="help-section">
          <h3>{s.title}</h3>
          <ul>
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <div className="help-settings">
        <label className="check">
          <input type="checkbox" checked={showTips} onChange={(e) => setShowTips(e.target.checked)} />
          {t('help.showTips')}
        </label>
        <div className="row-between">
          <span>{t('common.language')}</span>
          <LangSwitch />
        </div>
      </div>
    </Modal>
  );
}
