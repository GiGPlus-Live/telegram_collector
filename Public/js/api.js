/**
 * Telegram Collector Management Panel - API Client
 */

const API_BASE = '/api';

// Low-level fetch wrapper
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = localStorage.getItem('tg_collector_admin_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, { ...options, headers });
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      if (response.status === 401 && !endpoint.startsWith('/auth/login')) {
        localStorage.removeItem('tg_collector_admin_token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
      const errorMsg = data?.message || data?.error || `Request failed (${response.status})`;
      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    // If network error or 404/500, rethrow so callers or fallbacks handle it
    throw err;
  }
}

export const api = {
  // ==========================================
  // Auth & 2FA Management
  // ==========================================
  auth: {
    getToken() {
      return localStorage.getItem('tg_collector_admin_token');
    },
    setToken(token) {
      localStorage.setItem('tg_collector_admin_token', token);
    },
    clearToken() {
      localStorage.removeItem('tg_collector_admin_token');
      localStorage.removeItem('tg_collector_admin_user');
    },
    getUser() {
      try {
        return JSON.parse(localStorage.getItem('tg_collector_admin_user'));
      } catch (e) {
        return null;
      }
    },
    setUser(user) {
      localStorage.setItem('tg_collector_admin_user', JSON.stringify(user));
    },
    async login({ username, password, twoFactorCode }) {
      const res = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, twoFactorCode })
      });
      if (res.token) {
        this.setToken(res.token);
        if (res.user) this.setUser(res.user);
      }
      return res;
    },
    async getMe() {
      return await request('/auth/me');
    },
    async setup2FA() {
      return await request('/auth/2fa/setup', { method: 'POST' });
    },
    async confirm2FA(code) {
      return await request('/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
    },
    async disable2FA(password, code) {
      return await request('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password, code })
      });
    },
    async changePassword(oldPassword, newPassword) {
      return await request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword })
      });
    },
    logout() {
      this.clearToken();
      window.location.reload();
    }
  },
  // ==========================================
  // Channels Management
  // ==========================================
  channels: {
    async getAll() {
      const res = await request('/channels');
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return Array.isArray(res?.result) ? res.result : [];
    },

    async getOne(id) {
      const res = await request(`/channels/${id}`);
      return res?.data || res;
    },

    async create(payload) {
      const res = await request('/channels', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return res?.data || res;
    },

    async update(id, payload) {
      const res = await request(`/channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return res?.data || res;
    },

    async delete(id) {
      return await request(`/channels/${id}`, { method: 'DELETE' });
    }
  },

  // ==========================================
  // Settings & Proxy Management
  // ==========================================
  settings: {
    async get() {
      const res = await request('/settings');
      return res?.data || res;
    },

    async update(payload) {
      const res = await request('/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return res?.data || res;
    },

    async testProxy() {
      return await request('/settings/test-proxy', { method: 'POST' });
    }
  },

  // ==========================================
  // Media Download Settings
  // ==========================================
  media: {
    async getSettings() {
      return (await api.settings.get()).media;
    },
    async updateSettings(media) {
      return await api.settings.update({ media });
    }
  },

  // ==========================================
  // Telegram Authentication & Accounts
  // ==========================================
  telegram: {
    async getAccounts() {
      try {
        const res = await request('/telegram/accounts');
        if (Array.isArray(res?.data)) return res.data;
        if (Array.isArray(res)) return res;
        return [];
      } catch (err) {
        console.error('Failed to load telegram accounts from server:', err);
        return [];
      }
    },

    async sendCode({ phone, apiId, apiHash }) {
      const res = await request('/telegram/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ phone, apiId, apiHash })
      });
      const loginToken = res?.loginToken || res?.data?.loginToken;
      return {
        ...res,
        loginToken
      };
    },

    async verifyCode({ loginToken, code }) {
      const res = await request('/telegram/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ loginToken, code })
      });
      return res?.data || res;
    },

    async verify2FA({ loginToken, password }) {
      const res = await request('/telegram/auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({ loginToken, password })
      });
      return res?.data || res;
    },

    async toggleAccount(id, enabled) {
      return await request(`/telegram/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled })
      });
    },

    async deleteAccount(id) {
      return await request(`/telegram/accounts/${id}`, { method: 'DELETE' });
    }
  },

  // ==========================================
  // Matrix Multi-Server Management
  // ==========================================
  matrix: {
    async getServers() {
      try {
        const res = await request('/matrix/servers');
        if (Array.isArray(res?.data)) return res.data;
        if (Array.isArray(res)) return res;
        return [];
      } catch (err) {
        console.error('Failed to load matrix servers from server:', err);
        return [];
      }
    },

    async loginWithPassword({ serverUrl, userId, password }) {
      const res = await request('/matrix/servers/login', {
        method: 'POST',
        body: JSON.stringify({ serverUrl, userId, password })
      });
      return res?.data || res;
    },

    async createServer(payload) {
      const body = {
        name: payload.name,
        serverUrl: payload.serverUrl,
        userId: payload.userId,
        accessToken: payload.accessToken || payload.token,
        password: payload.password,
        defaultRoomId: payload.defaultRoomId,
        isActive: payload.isActive !== false
      };
      const res = await request('/matrix/servers', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      return res?.data || res;
    },

    async deleteServer(id) {
      return await request(`/matrix/servers/${id}`, { method: 'DELETE' });
    },

    async testSavedServer(id) {
      return await request(`/matrix/servers/${encodeURIComponent(id)}/connection`);
    },

    async reconnectServer(id, payload) {
      return await request(`/matrix/servers/${encodeURIComponent(id)}/reconnect`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    async deviceVerification(id, method = 'GET', attemptId = '') {
      const base = `/matrix/servers/${encodeURIComponent(id)}/verification`;
      const path = attemptId
        ? `${base}/${encodeURIComponent(attemptId)}${method === 'POST' ? '/confirm' : ''}`
        : base;
      return await request(path, { method });
    },

    async deviceRecovery(id, action, body) {
      const base = `/matrix/servers/${encodeURIComponent(id)}/verification/recovery`;
      return await request(action ? `${base}/${action}` : base, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    async testServer(credentials) {
      const body = {
        serverUrl: credentials.serverUrl,
        userId: credentials.userId,
        accessToken: credentials.accessToken || credentials.token,
        password: credentials.password,
        defaultRoomId: credentials.defaultRoomId
      };
      return await request('/matrix/servers/test', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    }
  },

  // ==========================================
  // Matrix Channels (Rooms & Upload Rules)
  // ==========================================
  matrixChannels: {
    async getAll() {
      const res = await request('/matrix/channels');
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return Array.isArray(res?.result) ? res.result : [];
    },

    async getOne(id) {
      const res = await request(`/matrix/channels/${id}`);
      return res?.data || res;
    },

    async create(payload) {
      const res = await request('/matrix/channels', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return res?.data || res;
    },

    async update(id, payload) {
      const res = await request(`/matrix/channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      return res?.data || res;
    },

    async delete(id) {
      return await request(`/matrix/channels/${id}`, { method: 'DELETE' });
    }
  },

  // ==========================================
  // System Overview Stats
  // ==========================================
  system: {
    async getStats() {
      const res = await request('/system/stats');
      return res?.data || res;
    }
  }
};
