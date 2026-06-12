import axios from 'axios';
import { FLOWOPS_API_URL } from '../lib/env';
import { getAccessToken } from '../lib/session';

const API_BASE = FLOWOPS_API_URL;

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
