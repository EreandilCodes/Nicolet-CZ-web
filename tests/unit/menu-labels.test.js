import { describe, it, expect, beforeEach } from 'vitest';
import { MenuManager } from '../../frontend/admin/menu.js';

let manager;

beforeEach(() => {
  manager = new MenuManager(null);
  manager._pages = [
    { slug: 'o-nas', title_cz: 'O nás', title_en: 'About us' },
  ];
  manager._products = [
    { slug: 'ft-ir-mikroskopy', name_cz: 'FT-IR mikroskopy', name_en: 'FT-IR microscopes' },
    { slug: 'bez-en-nazvu', name_cz: 'Produkt bez EN', name_en: '' },
  ];
  manager._apps = [
    { slug: 'polymery', name_cz: 'Analýza polymerů', name_en: 'Polymer analysis' },
  ];
  manager._cats = [
    { slug: 'prumysl', name_cz: 'Průmysl', name_en: 'Industry' },
  ];
  manager._newsCats = [
    { slug: 'novinky', name_cz: 'Novinky', name_en: 'News' },
  ];
  manager._appGroups = [
    { slug: 'veda-a-vyzkum', name_cz: 'Věda a výzkum', name_en: 'Science and research' },
  ];
  manager._labelCzDirty = false;
  manager._labelEnDirty = false;
});

describe('MenuManager._findTargetMeta', () => {
  it('returns CZ and EN names for a product target', () => {
    expect(manager._findTargetMeta('product', '/produkty/ft-ir-mikroskopy'))
      .toEqual({ cz: 'FT-IR mikroskopy', en: 'FT-IR microscopes' });
  });

  it('returns CZ and EN names for an application target', () => {
    expect(manager._findTargetMeta('application', '/aplikace/polymery'))
      .toEqual({ cz: 'Analýza polymerů', en: 'Polymer analysis' });
  });

  it('returns CZ and EN names for a page target', () => {
    expect(manager._findTargetMeta('page', '/stranka/o-nas'))
      .toEqual({ cz: 'O nás', en: 'About us' });
  });

  it('returns CZ and EN names for a product category target', () => {
    expect(manager._findTargetMeta('category', '/produkty?kategorie=prumysl'))
      .toEqual({ cz: 'Průmysl', en: 'Industry' });
  });

  it('returns CZ and EN names for a news category target', () => {
    expect(manager._findTargetMeta('news_category', '/novinky?rubrika=novinky'))
      .toEqual({ cz: 'Novinky', en: 'News' });
  });

  it('returns CZ and EN names for an application group target', () => {
    expect(manager._findTargetMeta('app_group', '/aplikace?okruh=veda-a-vyzkum'))
      .toEqual({ cz: 'Věda a výzkum', en: 'Science and research' });
  });

  it('returns null EN when the target has no English name', () => {
    expect(manager._findTargetMeta('product', '/produkty/bez-en-nazvu'))
      .toEqual({ cz: 'Produkt bez EN', en: null });
  });

  it('returns null for an unknown value', () => {
    expect(manager._findTargetMeta('product', '/produkty/neexistujici')).toBeNull();
  });

  it('returns null for types without a resolvable target', () => {
    expect(manager._findTargetMeta('internal', '/novinky')).toBeNull();
    expect(manager._findTargetMeta('external', 'https://example.com')).toBeNull();
    expect(manager._findTargetMeta('product', '')).toBeNull();
  });
});

function stubLabelElements(czValue = '', enValue = '') {
  const els = {
    'menuLabelCz': { value: czValue },
    'menuLabelEn': { value: enValue },
  };
  global.document = {
    getElementById: (id) => els[id] || null,
  };
  return els;
}

describe('MenuManager._fillLabelsFromTarget', () => {
  it('fills CZ and EN labels from the selected product target', () => {
    const els = stubLabelElements();
    manager._fillLabelsFromTarget('product', '/produkty/ft-ir-mikroskopy');
    expect(els['menuLabelCz'].value).toBe('FT-IR mikroskopy');
    expect(els['menuLabelEn'].value).toBe('FT-IR microscopes');
  });

  it('fills only CZ when the target has no English name', () => {
    const els = stubLabelElements();
    manager._fillLabelsFromTarget('product', '/produkty/bez-en-nazvu');
    expect(els['menuLabelCz'].value).toBe('Produkt bez EN');
    expect(els['menuLabelEn'].value).toBe('');
  });

  it('does not overwrite a manually edited CZ label', () => {
    const els = stubLabelElements('FT-IR mikroskopy – laboratorní systémy');
    manager._labelCzDirty = true;
    manager._fillLabelsFromTarget('product', '/produkty/ft-ir-mikroskopy');
    expect(els['menuLabelCz'].value).toBe('FT-IR mikroskopy – laboratorní systémy');
    expect(els['menuLabelEn'].value).toBe('FT-IR microscopes');
  });

  it('does not overwrite a manually edited EN label', () => {
    const els = stubLabelElements('', 'Microscopes customized');
    manager._labelEnDirty = true;
    manager._fillLabelsFromTarget('product', '/produkty/ft-ir-mikroskopy');
    expect(els['menuLabelCz'].value).toBe('FT-IR mikroskopy');
    expect(els['menuLabelEn'].value).toBe('Microscopes customized');
  });

  it('re-fills both labels when switching target while fields are not user-edited', () => {
    const els = stubLabelElements();
    manager._fillLabelsFromTarget('product', '/produkty/ft-ir-mikroskopy');
    manager._fillLabelsFromTarget('application', '/aplikace/polymery');
    expect(els['menuLabelCz'].value).toBe('Analýza polymerů');
    expect(els['menuLabelEn'].value).toBe('Polymer analysis');
  });

  it('does nothing when the target cannot be resolved', () => {
    const els = stubLabelElements();
    manager._fillLabelsFromTarget('internal', '/novinky');
    expect(els['menuLabelCz'].value).toBe('');
    expect(els['menuLabelEn'].value).toBe('');
  });
});