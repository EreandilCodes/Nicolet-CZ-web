import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProductsManager } from '../../frontend/admin/products.js';

function makeEl(value = '') {
  return { value, checked: true };
}

function installDocumentStub() {
  const els = {
    productsTableBody: null,
    productsModal: { classList: { add: () => {}, remove: () => {} } },
    productsForm: { dataset: {} },
    prodNameCz: makeEl('Test product'),
    prodNameEn: makeEl('Test product EN'),
    prodSlug: makeEl('test-product'),
    prodDescCz: makeEl('desc cz'),
    prodDescEn: makeEl('desc en'),
    prodExcerptCz: makeEl(''),
    prodExcerptEn: makeEl(''),
    prodThumbnailUrl: makeEl(''),
    prodFeatured: { checked: false },
    prodPublished: { checked: true },
    prodOrder: makeEl('1'),
    prodSeoTitleCz: makeEl(''),
    prodSeoTitleEn: makeEl(''),
    prodSeoDescCz: makeEl(''),
    prodSeoDescEn: makeEl(''),
    prodCategoryList: null,
    prodAppSearch: null,
    prodAppSuggestions: null,
    prodAppChips: null,
    prodImageUrlInput: { value: '' },
  };
  global.document = {
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  global.window = { admin: { showNotification: () => {} } };
  return els;
}

const okResponse = () => ({
  ok: true,
  headers: { get: () => 'application/json' },
  json: async () => [],
});

const formDataOkResponse = () => ({
  ok: true,
  headers: { get: () => 'application/json' },
  json: async () => ({ image_url: '/uploads/test.jpg' }),
});

let auth;
let manager;

beforeEach(() => {
  installDocumentStub();
  auth = { authenticatedFetch: vi.fn(() => Promise.resolve(okResponse())) };
  manager = new ProductsManager(auth);
});

afterEach(() => {
  delete global.document;
  delete global.window;
});

describe('ProductsManager routes CRUD through authenticatedFetch', () => {
  it('loads items through authenticatedFetch', async () => {
    await manager.loadItems();
    expect(auth.authenticatedFetch).toHaveBeenCalledWith('/api/products/admin/all');
  });

  it('creates a product through authenticatedFetch (POST)', async () => {
    manager._editing = null;
    await manager.saveItem();
    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/products/admin',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates a product through authenticatedFetch (PUT)', async () => {
    manager._editing = { id: 7 };
    await manager.saveItem();
    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/products/admin/7',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('deletes a product through authenticatedFetch (DELETE)', async () => {
    global.confirm = () => true;
    manager.items = [{ id: 9, name: 'Old' }];
    await manager.deleteItem(9);
    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/products/admin/9',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});