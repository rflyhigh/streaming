// API client for backend communication
const API = {
  // Base URL for API requests
  baseUrl: '/api',
  
  // Worker URL for video streaming
  workerUrl: 'https://lively-wind-62c0.skibiditoilet-9330jk.workers.dev',
  
  // Get auth token
  getToken() {
    return localStorage.getItem('token');
  },
  
  // Headers with auth token
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  },
  
  // Generic request method
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers
        }
      });
      
      if (response.status === 401) {
        // Unauthorized, clear token
        Auth.logout();
        throw new Error('Session expired. Please login again.');
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Something went wrong');
      }
      
      if (response.status === 204) {
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  },
  
  // Auth endpoints
  async login(email, password) {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    
    return this.request('/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
  },
  
  async register(username, email, password) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
  },
  
  // User endpoints
  async getCurrentUser() {
    return this.request('/users/me');
  },
  
  async getUser(userId) {
    return this.request(`/users/${userId}`);
  },
  
  // Video endpoints
  async getVideos(page = 1, limit = 20, search = '') {
    const params = new URLSearchParams({
      skip: (page - 1) * limit,
      limit
    });
    
    if (search) {
      params.append('search', search);
    }
    
    return this.request(`/videos?${params.toString()}`);
  },
  
  async getVideoById(videoId) {
    return this.request(`/videos/${videoId}`);
  },
  
  async uploadVideo(videoData) {
    return this.request('/videos', {
      method: 'POST',
      body: JSON.stringify(videoData)
    });
  },
  
  async likeVideo(videoId) {
    return this.request(`/videos/${videoId}/like`, {
      method: 'POST'
    });
  },
  
  // Get streaming URL
  getStreamUrl(rawVideoUrl) {
    return `${this.workerUrl}?url=${encodeURIComponent(rawVideoUrl)}`;
  }
};