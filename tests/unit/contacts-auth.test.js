import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContactsManager } from '../../frontend/admin/contacts.js';

function installDocumentStub() {
  const els = {
    contactName: { value: 'Jan Novák' },
    contactRoleCz: { value: '' },
    contactRoleEn: { value: '' },
    contactEmail: { value: 'jan@nicolet.cz' },
    contactPhone: { value: '' },
    contactImageUrl: { value: '' },
    contactOrder: { value: '1' },
    contactActive: { checked: true },
    contactsTableBody: null,
    contactModal: { classList: { add: () => {}, remove: () => {} } },
    contactForm: { dataset: {} },
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
  manager = new ContactsManager(auth);
});

afterEach(() => {
  delete global.document;
  delete global.window;
});

describe('ContactsManager routes CRUD through authenticatedFetch', () => {
  it('loads items through authenticatedFetch', async () => {
    await manager.loadItems();
    expect(auth.authenticatedFetch).toHaveBeenCalledWith('/api/contacts/admin/all');
  });

  it('creates a contact through authenticatedFetch (POST)', async () => {
    manager._editing = null;
    await manager.saveItem();
    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/contacts',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates a contact through authenticatedFetch (PUT)', async () => {
    manager._editing = { id: 5 };
    await manager.saveItem();
    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/contacts/5',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('deletes a contact through authenticatedFetch (DELETE)', async () => {
    global.confirm = () => true;
    manager.contacts = [{ id: 3, name: 'Old' }];
    await manager.deleteItem(3);
    expect(auth.authenticatedFetch).toHaveBeenCalledWith(
      '/api/contacts/admin/3',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});