/**
 * AuthManager – JWT token storage, auth headers, and automatic token refresh.
 * Same pattern as Eolite / KanjoWin.
 */
export class AuthManager {
  constructor() {
    this.token = localStorage.getItem('nicolet_token');
    this.user  = null;
    this._refreshTimer = null;
    try {
      const raw = localStorage.getItem('nicolet_user');
      if (raw) this.user = JSON.parse(raw);
    } catch {
      this.user = null;
    }
    if (this.token) this._scheduleRefresh();
  }

  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type':  'application/json'
    };
  }

  async logout() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    try {
      if (this.token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` },
        });
      }
    } catch { /* best-effort */ }
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

  /** Silently refresh the token ~5 minutes before expiry */
  _scheduleRefresh() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    try {
      const payload = JSON.parse(atob(this.token.split('.')[1]));
      const expiresAt = payload.exp * 1000;
      const refreshIn = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 30 * 1000);
      this._refreshTimer = setTimeout(() => this._refreshToken(), refreshIn);
    } catch { /* malformed token — will fail on next API call */ }
  }

  async _refreshToken() {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
      });
      if (!res.ok) { this.logout(); return; }
      const data = await res.json();
      this.token = data.token;
      localStorage.setItem('nicolet_token', data.token);
      this._scheduleRefresh();
    } catch {
      this.logout();
    }
  }
}
