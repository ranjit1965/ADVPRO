// Thin fetch wrapper for the FastAPI backend.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const TOKEN_KEY = 'der.token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** FastAPI sends a string, or a list of field errors for invalid input (422). */
function errorMessage(data, status) {
  const d = data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) {
    const e = d[0];
    const field = (e.loc || []).filter((x) => x !== 'body').join(' › ');
    return `${field ? `${field}: ` : ''}${String(e.msg || 'Invalid value').replace(/^Value error, /, '')}`;
  }
  if (status === 0 || status >= 500) return 'The server is not responding. Check that the backend is running.';
  return `Request failed (${status})`;
}

export async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  const token = tokenStore.get();
  let res;
  try {
    const raw = typeof Blob !== 'undefined' && body instanceof Blob; // a file sent as it is (uploads)
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': raw ? 'application/octet-stream' : 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(errorMessage(data, res.status), res.status, data);
  }
  return data;
}
