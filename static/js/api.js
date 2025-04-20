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
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  },
  
  // Generic request method
  async request(endpoint, options = {}) {
    // Ensure endpoint starts with a slash
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint;
    }
    
    const url = `${this.baseUrl}${endpoint}`;
    console.log('Making API request to:', url);
    
    try {
      // Log request body for debugging
      if (options.body) {
        console.log('Request body:', options.body);
      }
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers
        }
      });
      
      // Log response status
      console.log(`Response status: ${response.status} ${response.statusText}`);
      
      if (response.status === 401) {
        // Unauthorized, clear token
        if (typeof Auth !== 'undefined') {
          Auth.logout();
        }
        throw new Error('Session expired. Please login again.');
      }
      
      // Get a clone of the response for text in case JSON parsing fails
      const responseClone = response.clone();
      
      try {
        const data = await response.json();
        console.log('Response data:', data);
        
        if (!response.ok) {
          throw new Error(data.detail || JSON.stringify(data) || 'Something went wrong');
        }
        
        return data;
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        const text = await responseClone.text();
        console.error('Non-JSON response:', text);
        throw new Error(text || 'Server returned non-JSON response');
      }
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
    
    try {
      return await this.request(`/videos?${params.toString()}`);
    } catch (error) {
      console.error('Error in getVideos:', error);
      // Return empty array instead of throwing
      return [];
    }
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