import axios from 'axios';
import { auth } from '@/lib/firebase';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/v1`;

const api = axios.create({ baseURL: API });

// Attach a fresh Firebase ID token to every request
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Unwrap the Go backend envelope: { data, meta, error }
api.interceptors.response.use(
  (res) => {
    // Attach unwrapped data and meta for convenience
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      res._data = res.data.data;
      res._meta = res.data.meta || null;
    } else {
      res._data = res.data;
      res._meta = null;
    }
    return res;
  },
  (err) => {
    // Normalize error message from Go envelope
    if (err.response?.data?.error?.message) {
      err._message = err.response.data.error.message;
      err._code = err.response.data.error.code;
    }
    return Promise.reject(err);
  }
);

export { api, API };
