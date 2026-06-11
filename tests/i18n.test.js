import { describe, it, expect, beforeEach } from 'vitest';
import { parseCSV, createT, loadLang, saveLang } from '../src/i18n.js';

const SAMPLE_CSV = `key,en,es,hu
app_title,Real-Time Condorcet Method,Método de Condorcet en Tiempo Real,Valós idejű Condorcet-módszer
btn_signup,Sign Up,Registrarse,Regisztráció
status,Status: ,Estado: ,Állapot: 
`;

describe('parseCSV', () => {
  it('parses a simple CSV into the expected dictionary', () => {
    const dict = parseCSV(SAMPLE_CSV);
    expect(dict['app_title']['en']).toBe('Real-Time Condorcet Method');
    expect(dict['app_title']['es']).toBe('Método de Condorcet en Tiempo Real');
    expect(dict['app_title']['hu']).toBe('Valós idejű Condorcet-módszer');
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = `key,en
msg,"Hello, world"
`;
    const dict = parseCSV(csv);
    expect(dict['msg']['en']).toBe('Hello, world');
  });

  it('returns an empty dict for header-only CSV', () => {
    const dict = parseCSV('key,en,es\n');
    expect(Object.keys(dict)).toHaveLength(0);
  });

  it('skips rows with empty keys', () => {
    const csv = `key,en
,ignored
real,value
`;
    const dict = parseCSV(csv);
    expect(Object.keys(dict)).toHaveLength(1);
    expect(dict['real']['en']).toBe('value');
  });
});

describe('createT', () => {
  let t;

  beforeEach(() => {
    const dict = parseCSV(SAMPLE_CSV);
    t = createT(dict, 'en');
  });

  it('returns the translation for a known key', () => {
    expect(t('app_title')).toBe('Real-Time Condorcet Method');
    expect(t('btn_signup')).toBe('Sign Up');
  });

  it('returns the key itself when the key is missing', () => {
    expect(t('nonexistent_key')).toBe('nonexistent_key');
  });

  it('works with a different language', () => {
    const dict = parseCSV(SAMPLE_CSV);
    const tEs = createT(dict, 'es');
    expect(tEs('btn_signup')).toBe('Registrarse');
  });

  it('falls back to key when the language is missing for that key', () => {
    const dict = parseCSV(SAMPLE_CSV);
    const tFr = createT(dict, 'fr');
    expect(tFr('btn_signup')).toBe('btn_signup');
  });
});

describe('loadLang / saveLang', () => {
  it('returns the default language when nothing is stored', () => {
    const storage = new Map();
    storage.getItem = (k) => storage.get(k) ?? null;
    expect(loadLang(storage)).toBe('en');
  });

  it('returns the stored language preference', () => {
    const storage = new Map();
    storage.getItem = (k) => storage.get(k) ?? null;
    storage.setItem = (k, v) => storage.set(k, v);
    saveLang(storage, 'hu');
    expect(loadLang(storage)).toBe('hu');
  });

  it('allows a custom default', () => {
    const storage = new Map();
    storage.getItem = () => null;
    expect(loadLang(storage, 'es')).toBe('es');
  });
});
