/**
 * AuthManager – JWT token storage and auth headers.
 * Same pattern as Eolite / KanjoWin.
 */
export class AuthManager {
  constructor() {
    this.token = localStorage.getItem('nicolet_token');
    this.user  = null;
    try {
      const raw = localStorage.getItem('nicolet_user');
      if (raw) this.user = JSON.parse(raw);
    } catch {
      this.user = null;
    }
  }

  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type':  'application/json'
    };
  }

  logout() {
    localStorage.removeItem('nicolet_token');
    localStorage.removeItem('nicolet_user');
    window.location.href = '/login';
  }

  async checkAuth() {
    if (!this.token) {
      window.location.href = '/login';
      return false;
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) {
        this.logout();
        return false;
      }

      const user = await response.json();
      this.user = user;
      localStorage.setItem('nicolet_user', JSON.stringify(user));
      return true;
    } catch {
      this.logout();
      return false;
    }
  }
}
