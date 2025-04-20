// Main JavaScript file combining all functionality

// ==================== UTILITY FUNCTIONS ====================
// Format view count
function formatViews(views) {
  if (views >= 1000000) {
    return (views / 1000000).toFixed(1) + 'M';
  } else if (views >= 1000) {
    return (views / 1000).toFixed(1) + 'K';
  } else {
    return views.toString();
  }
}

// Format duration in seconds to MM:SS
function formatDuration(seconds) {
  if (!seconds) return '00:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Format date to relative time (e.g., "2 days ago")
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
  }
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
}

// Get element from template
function getTemplate(id) {
  const template = document.getElementById(id);
  if (!template) {
    console.error(`Template with id "${id}" not found`);
    return null;
  }
  
  return document.importNode(template.content, true);
}

// Show error message
function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

// Clear error message
function clearError(elementId) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.style.display = 'none';
  }
}

// ==================== API CLIENT ====================
// API client for backend communication
const API = {
  // Base URL for API requests
  baseUrl: '/api',
  
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
        Auth.logout();
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
  
  // Get streaming URL - now using our own endpoint
  getStreamUrl(rawVideoUrl) {
    // Check if the URL is valid
    if (!rawVideoUrl || typeof rawVideoUrl !== 'string' || !rawVideoUrl.startsWith('http')) {
      console.error('Invalid video URL:', rawVideoUrl);
      return '';
    }
    
    // Properly encode the URL
    const encodedUrl = encodeURIComponent(rawVideoUrl);
    console.log('Encoded URL for streaming:', encodedUrl);
    
    return `/api/stream?url=${encodedUrl}`;
  }
};

// ==================== AUTHENTICATION ====================
// Authentication handling
const Auth = {
  // Storage keys
  TOKEN_KEY: 'token',
  USER_KEY: 'user_data',
  
  // Check if user is logged in
  isLoggedIn() {
    return !!localStorage.getItem(this.TOKEN_KEY);
  },
  
  // Get current user data
  getUser() {
    const userData = localStorage.getItem(this.USER_KEY);
    return userData ? JSON.parse(userData) : null;
  },
  
  // Login user
  async login(email, password) {
    try {
      const data = await API.login(email, password);
      
      // Store token
      localStorage.setItem(this.TOKEN_KEY, data.access_token);
      
      // Get and store user data
      const user = await API.getCurrentUser();
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },
  
  // Register user
  async register(username, email, password) {
    try {
      await API.register(username, email, password);
      
      // Auto login after registration
      return this.login(email, password);
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  },
  
  // Logout user
  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    updateNavigation(false);
    Router.navigate('/');
  },
  
  // Check authentication status
  async checkAuthStatus() {
    if (this.isLoggedIn()) {
      try {
        // Verify token by getting current user
        const user = await API.getCurrentUser();
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        return true;
      } catch (error) {
        console.error('Auth check error:', error);
        this.logout();
        return false;
      }
    }
    return false;
  }
};

// Update navigation based on auth status
function updateNavigation(isLoggedIn) {
  const navMenu = document.getElementById('nav-menu');
  
  // Remove auth-related links
  const authLinks = navMenu.querySelectorAll('.auth-link');
  authLinks.forEach(link => link.remove());
  
  if (isLoggedIn) {
    const user = Auth.getUser();
    
    // Add authenticated links
    navMenu.innerHTML += `
      <li class="auth-link"><a href="/upload" class="nav-link">Upload</a></li>
      <li class="auth-link">
        <a href="/profile" class="nav-link">
          ${user?.username || 'Profile'}
        </a>
      </li>
      <li class="auth-link"><a href="#" id="logout-link" class="nav-link">Logout</a></li>
    `;
    
    // Add logout event listener
    document.getElementById('logout-link').addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
    });
  } else {
    // Add unauthenticated links
    navMenu.innerHTML += `
      <li class="auth-link"><a href="/login" class="nav-link">Login</a></li>
      <li class="auth-link"><a href="/register" class="nav-link">Register</a></li>
    `;
  }
}

// ==================== ROUTER ====================
// Simple SPA Router
const Router = {
  // Routes configuration
  routes: {},
  
  // Default route
  defaultRoute: '/',
  
  // Current route
  currentRoute: null,
  
  // Initialize router
  init(defaultRoute = '/') {
    this.defaultRoute = defaultRoute;
    
    // Handle navigation
    window.addEventListener('popstate', () => {
      this.navigate(window.location.pathname, false);
    });
    
    // Handle link clicks
    document.addEventListener('click', (e) => {
      if (e.target.matches('a') && e.target.href.startsWith(window.location.origin)) {
        e.preventDefault();
        this.navigate(new URL(e.target.href).pathname);
      }
    });
    
    // Initial navigation
    this.navigate(window.location.pathname, false);
  },
  
  // Add route
  add(path, callback) {
    this.routes[path] = callback;
  },
  
  // Navigate to route
  navigate(path, pushState = true) {
    // Update current route
    this.currentRoute = path;
    
    // Update URL if needed
    if (pushState) {
      history.pushState(null, null, path);
    }
    
    // Find matching route
    let route = null;
    
    // Exact match
    if (this.routes[path]) {
      route = this.routes[path];
    } 
    // Dynamic routes (e.g., /video/:id)
    else {
      const pathSegments = path.split('/').filter(Boolean);
      
      // Check for dynamic routes
      for (const [routePath, callback] of Object.entries(this.routes)) {
        const routeSegments = routePath.split('/').filter(Boolean);
        
        if (pathSegments.length === routeSegments.length) {
          const params = {};
          let match = true;
          
          for (let i = 0; i < routeSegments.length; i++) {
            if (routeSegments[i].startsWith(':')) {
              // Dynamic segment
              const paramName = routeSegments[i].slice(1);
              params[paramName] = pathSegments[i];
            } else if (routeSegments[i] !== pathSegments[i]) {
              // Static segment doesn't match
              match = false;
              break;
            }
          }
          
          if (match) {
            route = () => callback(params);
            break;
          }
        }
      }
    }
    
    // Use default route if no match found
    if (!route && this.routes[this.defaultRoute]) {
      route = this.routes[this.defaultRoute];
    }
    
    // Execute route callback
    if (route) {
      route();
    }
  }
};

// ==================== VIDEO PLAYER ====================
// Custom video player functionality
function initializeVideoPlayer(videoElement) {
  if (!videoElement) return;
  
  // Add keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') return;
    
    switch(e.key) {
      case ' ':
        e.preventDefault();
        videoElement.paused ? videoElement.play() : videoElement.pause();
        break;
      case 'ArrowRight':
        e.preventDefault();
        videoElement.currentTime += 10;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        videoElement.currentTime -= 10;
        break;
      case 'f':
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          videoElement.requestFullscreen();
        }
        break;
      case 'm':
        e.preventDefault();
        videoElement.muted = !videoElement.muted;
        break;
    }
  });
  
  // Add play/pause on click
  videoElement.addEventListener('click', () => {
    videoElement.paused ? videoElement.play() : videoElement.pause();
  });
  
  // Add double click for fullscreen
  videoElement.addEventListener('dblclick', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoElement.requestFullscreen();
    }
  });
  
  // Handle video errors
  videoElement.addEventListener('error', (e) => {
    console.error('Video error:', videoElement.error);
    console.error('Error details:', e);
    
    // Check the source
    const source = videoElement.querySelector('source');
    if (source) {
      console.log('Video source URL:', source.src);
    }
    
    const videoContainer = videoElement.parentElement;
    if (videoContainer) {
      videoContainer.innerHTML = `
        <div class="video-error">
          <p>Error streaming video: ${videoElement.error ? videoElement.error.message : 'Unknown error'}</p>
          <p>Please try again later or check the video URL.</p>
        </div>
      `;
    }
  });
  
  // Preload metadata
  videoElement.preload = 'metadata';
  
  // Log when video starts playing
  videoElement.addEventListener('playing', () => {
    console.log('Video started playing');
  });
  
  // Log when video fails to load
  videoElement.addEventListener('loadeddata', () => {
    console.log('Video data loaded successfully');
  });
}

// ==================== MAIN APPLICATION ====================
// Main application logic
document.addEventListener('DOMContentLoaded', () => {
  // Initialize router
  Router.init('/');
  
  // Define routes
  Router.add('/', loadHomePage);
  Router.add('/login', loadLoginPage);
  Router.add('/register', loadRegisterPage);
  Router.add('/upload', loadUploadPage);
  Router.add('/profile', loadProfilePage);
  Router.add('/video', loadVideoPage);
  
  // Set up search functionality
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  
  searchButton.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      Router.navigate(`/?search=${encodeURIComponent(query)}`);
    }
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) {
        Router.navigate(`/?search=${encodeURIComponent(query)}`);
      }
    }
  });
  
  // Check auth status
  Auth.checkAuthStatus()
    .then(isLoggedIn => {
      updateNavigation(isLoggedIn);
    });
});

// Home page
function loadHomePage() {
  const mainContent = document.getElementById('main-content');
  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('search');
  
  // Show loading state
  mainContent.innerHTML = '<div class="loading">Loading videos...</div>';
  
  // Fetch videos
  API.getVideos(1, 20, searchQuery)
    .then(videos => {
      if (!videos || videos.length === 0) {
        mainContent.innerHTML = `
          <div class="no-results">
            <h2>${searchQuery ? 'No videos found for "' + searchQuery + '"' : 'No videos available'}</h2>
            <p>Be the first to upload a video!</p>
          </div>
        `;
        return;
      }
      
      // Create video grid
      const videoGrid = document.createElement('div');
      videoGrid.className = 'video-grid';
      
      videos.forEach(video => {
        const videoCard = createVideoCard(video);
        videoGrid.appendChild(videoCard);
      });
      
      mainContent.innerHTML = '';
      
      // Add search results heading if searching
      if (searchQuery) {
        const heading = document.createElement('h2');
        heading.className = 'search-results-heading';
        heading.textContent = `Search results for "${searchQuery}"`;
        mainContent.appendChild(heading);
      }
      
      mainContent.appendChild(videoGrid);
    })
    .catch(error => {
      console.error('Error in loadHomePage:', error);
      mainContent.innerHTML = `
        <div class="error">
          <p>Error loading videos: ${error.message}</p>
          <button onclick="loadHomePage()" class="btn">Try Again</button>
        </div>
      `;
    });
}

// Create video card element
function createVideoCard(video) {
  const card = document.createElement('div');
  card.className = 'video-card';
  
  card.innerHTML = `
    <a href="/video?id=${video._id}">
      <div class="thumbnail">
        <img src="${video.thumbnail_url}" alt="${video.title}" loading="lazy">
        <span class="duration">${formatDuration(video.duration || 0)}</span>
      </div>
      <div class="video-info">
        <h3>${video.title}</h3>
        <p class="creator">${video.username || 'Unknown'}</p>
        <p class="views">${formatViews(video.views)} views • ${formatDate(video.created_at)}</p>
      </div>
    </a>
  `;
  
  return card;
}

// Login page
function loadLoginPage() {
  // Redirect if already logged in
  if (Auth.isLoggedIn()) {
    Router.navigate('/');
    return;
  }
  
  const mainContent = document.getElementById('main-content');
  const template = getTemplate('login-template');
  
  mainContent.innerHTML = '';
  mainContent.appendChild(template);
  
  // Handle login form submission
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    clearError('login-error');
    
    try {
      await Auth.login(email, password);
      updateNavigation(true);
      Router.navigate('/');
    } catch (error) {
      showError('login-error', error.message);
    }
  });
}

// Register page
function loadRegisterPage() {
  // Redirect if already logged in
  if (Auth.isLoggedIn()) {
    Router.navigate('/');
    return;
  }
  
  const mainContent = document.getElementById('main-content');
  const template = getTemplate('register-template');
  
  mainContent.innerHTML = '';
  mainContent.appendChild(template);
  
  // Handle register form submission
  const registerForm = document.getElementById('register-form');
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    clearError('register-error');
    
    try {
      await Auth.register(username, email, password);
      updateNavigation(true);
      Router.navigate('/');
    } catch (error) {
      showError('register-error', error.message);
    }
  });
}

// Upload page
function loadUploadPage() {
  // Redirect if not logged in
  if (!Auth.isLoggedIn()) {
    Router.navigate('/login');
    return;
  }
  
  const mainContent = document.getElementById('main-content');
  const template = getTemplate('upload-template');
  
  mainContent.innerHTML = '';
  mainContent.appendChild(template);
  
  // Handle upload form submission
  const uploadForm = document.getElementById('upload-form');
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('video-title').value;
    const description = document.getElementById('video-description').value;
    const rawVideoUrl = document.getElementById('video-url').value;
    const thumbnailUrl = document.getElementById('thumbnail-url').value;
    
    clearError('upload-error');
    
    try {
      await API.uploadVideo({
        title,
        description,
        raw_video_url: rawVideoUrl,
        thumbnail_url: thumbnailUrl
      });
      
      Router.navigate('/');
    } catch (error) {
      showError('upload-error', error.message);
    }
  });
}

// Profile page
function loadProfilePage() {
  // Redirect if not logged in
  if (!Auth.isLoggedIn()) {
    Router.navigate('/login');
    return;
  }
  
  const mainContent = document.getElementById('main-content');
  const user = Auth.getUser();
  
  mainContent.innerHTML = `
    <div class="profile-container">
      <div class="profile-header">
        <div class="profile-avatar">
          <img src="${user.profile_image || 'https://via.placeholder.com/100'}" alt="${user.username}">
        </div>
        <div class="profile-info">
          <h1>${user.username}</h1>
          <p>${user.email}</p>
        </div>
      </div>
      <div class="profile-content">
        <h2>Your Videos</h2>
        <div id="user-videos" class="video-grid">
          <div class="loading">Loading your videos...</div>
        </div>
      </div>
    </div>
  `;
  
  // Load user videos
  loadUserVideos(user._id);
}

// Load user videos
function loadUserVideos(userId) {
  const videosContainer = document.getElementById('user-videos');
  
  API.getVideos(1, 50, '')
    .then(videos => {
      // Filter videos by user ID (if videos is null or undefined, use empty array)
      const userVideos = (videos || []).filter(video => video.user_id === userId);
      
      if (!userVideos || userVideos.length === 0) {
        videosContainer.innerHTML = `
          <div class="no-videos">
            <p>You haven't uploaded any videos yet.</p>
            <a href="/upload" class="btn">Upload Video</a>
          </div>
        `;
        return;
      }
      
      videosContainer.innerHTML = '';
      userVideos.forEach(video => {
        const videoCard = createVideoCard(video);
        videosContainer.appendChild(videoCard);
      });
    })
    .catch(error => {
      console.error('Error loading user videos:', error);
      videosContainer.innerHTML = `
        <div class="error">
          <p>Error loading videos: ${error.message}</p>
          <button onclick="loadUserVideos('${userId}')" class="btn">Try Again</button>
        </div>
      `;
    });
}

// Video page
function loadVideoPage() {
  const mainContent = document.getElementById('main-content');
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('id');
  
  if (!videoId) {
    Router.navigate('/');
    return;
  }
  
  // Show loading state
  mainContent.innerHTML = '<div class="loading">Loading video...</div>';
  
  API.getVideoById(videoId)
    .then(video => {
      // Log the raw video URL for debugging
      console.log('Raw video URL:', video.raw_video_url);
      
      // Check if the video URL is valid
      if (!video.raw_video_url || typeof video.raw_video_url !== 'string' || !video.raw_video_url.startsWith('http')) {
        throw new Error('Invalid video URL provided');
      }
      
      // Get the streaming URL
      const streamUrl = API.getStreamUrl(video.raw_video_url);
      console.log('Stream URL:', streamUrl);
      
      // Create video container
      const videoContainer = document.createElement('div');
      videoContainer.className = 'video-container';
      
      // Create video player
      videoContainer.innerHTML = `
        <div class="player-wrapper">
          <video id="video-player" controls>
            <source src="${streamUrl}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </div>
        <div class="video-details">
          <h1>${video.title}</h1>
          <div class="video-stats">
            <span>${formatViews(video.views)} views</span>
            <span>${formatDate(video.created_at)}</span>
          </div>
          <div class="video-actions">
            <button id="like-button" class="like-button">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
              </svg>
              ${video.likes}
            </button>
          </div>
          <div class="uploader-info">
            <p>Uploaded by <a href="/profile?id=${video.user_id}">${video.username}</a></p>
          </div>
          <div class="video-description">
            <p>${video.description || 'No description provided.'}</p>
          </div>
        </div>
      `;
      
      mainContent.innerHTML = '';
      mainContent.appendChild(videoContainer);
      
      // Initialize video player
      const videoElement = document.getElementById('video-player');
      initializeVideoPlayer(videoElement);
      
      // Handle like button
      const likeButton = document.getElementById('like-button');
      likeButton.addEventListener('click', async () => {
        if (Auth.isLoggedIn()) {
          try {
            const response = await API.likeVideo(video._id);
            likeButton.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
              </svg>
              ${response.likes}
            `;
          } catch (error) {
            console.error('Error liking video:', error);
          }
        } else {
          Router.navigate('/login');
        }
      });
    })
    .catch(error => {
      console.error('Error loading video:', error);
      mainContent.innerHTML = `
        <div class="error">
          <p>Error loading video: ${error.message}</p>
          <a href="/" class="btn">Go Home</a>
        </div>
      `;
    });
}