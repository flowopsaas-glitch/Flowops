import axios from 'axios';
import { FLOWOPS_API_URL } from '../lib/env';
import { getToken, setToken, clearClientSession } from './api';

const AI_API_BASE = `${FLOWOPS_API_URL}/api/v1/ai`;

// Create AI-specific axios instance with auth interceptors
const aiAxios = axios.create();

aiAxios.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

aiAxios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Try to refresh token or redirect to login
        clearClientSession();
        window.location.href = '/login';
        return Promise.reject(error);
      } catch (refreshError) {
        clearClientSession();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export const aiClient = {
  // 🛡️ Fraud Detection
  analyzeFraud: async (inboxId: string) => {
    const response = await aiAxios.post(`${FLOWOPS_API_URL}/api/v1/dispatch-inbox/${inboxId}/analyze-fraud`);
    return response.data;
  },

  getInboxWithFraudAnalysis: async () => {
    const response = await aiAxios.get(`${FLOWOPS_API_URL}/api/v1/dispatch-inbox`);
    return response.data;
  },

  // ⏱️ Predictive Delivery
  predictDeliveryTime: async (waybillId: number) => {
    const response = await aiAxios.post(`${AI_API_BASE}/predictive-delivery/predict/${waybillId}`);
    return response.data;
  },

  updatePredictionWithLocation: async (waybillId: number, lat: number, lng: number) => {
    const response = await aiAxios.post(
      `${AI_API_BASE}/predictive-delivery/update-location/${waybillId}?lat=${lat}&lng=${lng}`
    );
    return response.data;
  },

  getPredictionAccuracy: async (days: number = 30) => {
    const response = await aiAxios.get(`${AI_API_BASE}/predictive-delivery/accuracy?days=${days}`);
    return response.data;
  },

  // 🗺️ Smart Routing
  optimizeRoute: async (driverId: number) => {
    const response = await aiAxios.post(`${AI_API_BASE}/smart-routing/optimize/${driverId}`);
    return response.data;
  },

  reoptimizeWithTraffic: async (driverId: number, lat: number, lng: number) => {
    const response = await aiAxios.post(
      `${AI_API_BASE}/smart-routing/reoptimize/${driverId}?lat=${lat}&lng=${lng}`
    );
    return response.data;
  },

  getRoutingAnalytics: async (days: number = 30) => {
    const response = await aiAxios.get(`${AI_API_BASE}/smart-routing/analytics?days=${days}`);
    return response.data;
  },

  // 💰 Dynamic Pricing
  calculateDynamicPrice: async (params: {
    origin: string;
    destination: string;
    weight?: number;
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    preferredDate?: string;
  }) => {
    const response = await aiAxios.post(`${AI_API_BASE}/dynamic-pricing/calculate`, params);
    return response.data;
  },

  getPricingAnalytics: async (days: number = 30) => {
    const response = await aiAxios.get(`${AI_API_BASE}/dynamic-pricing/analytics?days=${days}`);
    return response.data;
  },

  getPriceRecommendations: async () => {
    const response = await aiAxios.get(`${AI_API_BASE}/dynamic-pricing/recommendations`);
    return response.data;
  },

  // 💬 Sentiment Analysis
  analyzeMessage: async (message: string, context?: any) => {
    const response = await aiAxios.post(`${AI_API_BASE}/sentiment-analysis/analyze-message`, {
      message,
      context,
    });
    return response.data;
  },

  analyzeConversation: async (customerPhone: string) => {
    const response = await aiAxios.post(`${AI_API_BASE}/sentiment-analysis/analyze-conversation`, {
      customerPhone,
    });
    return response.data;
  },

  getSentimentAnalytics: async (days: number = 30) => {
    const response = await aiAxios.get(`${AI_API_BASE}/sentiment-analysis/analytics?days=${days}`);
    return response.data;
  },
};
