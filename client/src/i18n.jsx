import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useStoredToken } from './lib.js';
import { DEFAULT_LANG, STRINGS } from './strings.js';

const LANG_KEY = 'avalon.lang';
const TIPS_KEY = 'avalon.tips';

const Settings = createContext(null);

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

// Per-device preferences: language (Indonesian by default) and whether tips show.
export function SettingsProvider({ children }) {
  const [storedLang, setLang] = useStoredToken(LANG_KEY);
  const [storedTips, setStoredTips] = useStoredToken(TIPS_KEY);
  const lang = STRINGS[storedLang] ? storedLang : DEFAULT_LANG;
  const showTips = storedTips !== 'off';

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key, params = {}) => {
      const value = lookup(STRINGS[lang], key) ?? lookup(STRINGS.en, key) ?? key;
      if (typeof value === 'function') return value(params);
      if (typeof value !== 'string') return value;
      return value.replace(/\{(\w+)\}/g, (m, name) => (name in params ? params[name] : m));
    },
    [lang],
  );

  const value = useMemo(() => {
    const list = (names) =>
      names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} ${t('common.and')} ${names.at(-1)}`;
    // Server and network errors are English; translate the ones we know.
    const tError = (msg) => {
      if (!msg) return msg;
      const { exact, patterns } = STRINGS[lang].errors;
      if (exact[msg]) return exact[msg];
      for (const [re, out] of patterns) if (re.test(msg)) return msg.replace(re, out);
      return msg;
    };
    return {
      lang,
      setLang,
      showTips,
      setShowTips: (on) => setStoredTips(on ? null : 'off'),
      t,
      list,
      tError,
    };
  }, [lang, setLang, showTips, setStoredTips, t]);

  return <Settings.Provider value={value}>{children}</Settings.Provider>;
}

export const useI18n = () => useContext(Settings);
