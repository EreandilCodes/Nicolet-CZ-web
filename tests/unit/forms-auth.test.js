import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FormsManager } from '../../frontend/admin/forms.js';

function makeElement(value = '', extra = {}) {
  return {
    value,
    checked: true,
    ...extra,
  };
}

function installDocumentStub() {
  const els = {
    formName: makeElement('Test form'),
    formTitleCz: makeElement(),
    formTitleEn: makeElement(),
    formDescCz: makeElement(),
    formDescEn: makeElement(),
    formEmailRecipients: makeElement(),
    formSubmitLabelCz: makeElement(),
    formSubmitLabelEn: makeElement(),
    formSuccessMsgCz: makeElement(),
    formSuccessMsgEn: makeElement(),
    formBackgroundImage: makeElement(),
    formActive: makeElement('', { checked: true }),
    formFieldList: { querySelectorAll: () => [] },
    formsModal: { classList: { add: () => {}, remove: () => {} } },
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

let auth;
let manager;

beforeEach(() => {
  installDocumentStub();
  auth = { authenticatedFetch: vi.fn(() => Promise.resolve(okResponse())) };
  manager = new FormsManager(auth);
});

afterEach(() => {
  delete global.document;
  delete global.window;
});

describe('FormsManager save/load/delete use the refresh-aware authenticatedFetch', () => {
  it('saves an edited form through authenticatedFetch (PUT)', async () => {
    manager._editing = { id: 1 };
    await manager.saveItem();

    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/forms/admin/1',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('creates a form through authenticatedFetch (POST)', async () => {
    await manager.saveItem();

    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/forms/admin',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('loads form list through authenticatedFetch', async () => {
    await manager.loadItems();

    expect(auth.authenticatedFetch).toHaveBeenCalledWith('/api/forms/admin/all');
  });

  it('deletes a form through authenticatedFetch (DELETE)', async () => {
    global.confirm = () => true;
    manager.items = [{ id: 7, name: 'Test' }];
    await manager.deleteItem(7);

    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/forms/admin/7',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('surfaces a server-side auth error message on save failure', async () => {
    auth.authenticatedFetch.mockResolvedValueOnce({
      ok: false,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Invalid token' }),
    });
    const notifications = [];
    global.window = { admin: { showNotification: (msg, type) => notifications.push({ msg, type }) } };

    manager._editing = { id: 1 };
    await manager.saveItem();

    expect(notifications.some(n => n.msg.includes('Invalid token'))).toBe(true);
  });
});