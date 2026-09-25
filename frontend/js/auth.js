/**
 * AuthManager – httpOnly cookie-based authentication
 * Reactive refresh interceptor pattern
 * Cross-tab logout via storage events
 */
export class AuthManager {
  constructor() {
    this.user = null;
    this._logoutHandler = null;
    
    // Load user from localStorage (token is NOT stored)
    try {
      const raw = localStorage.getItem('nicolet_user');
      if (raw) this.user = JSON.parse(raw);
    } catch {
      this.user = null;
    }
    
    // Listen for cross-tab logout signal
    this._setupCrossTabListener();
  }

  /**
   * Setup cross-tab logout listener
   */
  _setupCrossTabListener() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'logout_signal' && e.newValue) {
        window.location.href = '/login';
      }
    });
  }

  /**
   * Authenticated fetch wrapper with reactive refresh
   * On 401: try refresh → retry original request
   * On refresh fail: logout
   */
  async authenticatedFetch(url, options = {}) {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {
      ...options.headers
    };
    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const opts = {
      ...options,
      credentials: 'include',
      headers
    };

    const response = await fetch(url, opts);

    // If 401, try to refresh token
    if (response.status === 401) {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      if (refreshResponse.ok) {
        // Refresh succeeded, retry original request
        const retryResponse = await fetch(url, opts);
        return retryResponse;
      } else {
        // Refresh failed, logout
        this._signalLogout();
        window.location.href = '/login';
        return response;
      }
    }

    return response;
  }

  /**
   * Signal logout to other tabs via localStorage
   */
  _signalLogout() {
    localStorage.setItem('logout_signal', Date.now());
    localStorage.removeItem('logout_signal');
    localStorage.removeItem('nicolet_user');
  }

  async login(email, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(err.error || 'Login failed');
      }

      const { user } = await response.json();
      this.user = user;
      localStorage.setItem('nicolet_user', JSON.stringify(user));
      return user;
    } catch (err) {
      throw err;
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch { /* best-effort */ }
    
    this._signalLogout();
    window.location.href = '/login';
  }

  async checkAuth() {
    try {
      const response = await this.authenticatedFetch('/api/auth/me');
      
      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) {
        this._signalLogout();
        window.location.href = '/login';
        return false;
      }

      const user = await response.json();
      this.user = user;
      localStorage.setItem('nicolet_user', JSON.stringify(user));
      return true;
    } catch {
      this._signalLogout();
      window.location.href = '/login';
      return false;
    }
  }
}
