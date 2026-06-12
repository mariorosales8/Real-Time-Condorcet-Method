// ==========================================
// TRANSLATION SYSTEM (i18n)
// ==========================================
// Pure helper functions for parsing CSV translations and looking up
// translated strings.  No DOM dependencies.

const STORAGE_KEY_LANG = 'condorcet_lang';

/**
 * Parse a CSV string into a translations dictionary.
 *
 * Expected CSV format:
 *   key,en,es,hu
 *   app_title,Real-Time Condorcet Method,Método...,Valós...
 *   ...
 *
 * Handles quoted fields that contain commas.
 *
 * @param {string} csvText — raw CSV content
 * @returns {Object<string, Object<string,string>>}
 *   { key: { en: "…", es: "…", hu: "…" } }
 */
export function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  const dict = {};

  for (let i = 1; i < lines.length; i++) {
    const row = splitCSVLine(lines[i]);
    const key = row[0].trim();
    if (!key) continue;

    dict[key] = {};
    for (let j = 1; j < headers.length; j++) {
      if (headers[j]) {
        dict[key][headers[j].trim()] = row[j] ? row[j].trim() : '';
      }
    }
  }
  return dict;
}

/**
 * Split a single CSV line into fields, respecting double-quote escaping.
 * @param {string} line
 * @returns {string[]}
 */
function splitCSVLine(line) {
  const row = [];
  let inQuotes = false;
  let val = '';
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(val);
      val = '';
    } else {
      val += char;
    }
  }
  row.push(val);
  return row;
}

/**
 * Return a translation function bound to a specific dictionary and language.
 *
 * @param {Object<string, Object<string,string>>} translations — parsed CSV dict
 * @param {string} lang — e.g. "en", "es", "hu"
 * @returns {(key: string) => string}
 */
export function createT(translations, lang) {
  return function t(key) {
    return translations[key] && translations[key][lang]
      ? translations[key][lang]
      : key;
  };
}

/**
 * Load the saved language preference from localStorage (or return the default).
 * @param {Storage} storage — typically window.localStorage
 * @param {string} [defaultLang='en']
 * @returns {string}
 */
export function loadLang(storage, defaultLang = 'en') {
  return storage.getItem(STORAGE_KEY_LANG) || defaultLang;
}

/**
 * Persist the selected language.
 * @param {Storage} storage
 * @param {string} lang
 */
export function saveLang(storage, lang) {
  storage.setItem(STORAGE_KEY_LANG, lang);
}
