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
  
  // Show toast notification
  function showToast(message, type = 'success') {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Add icon based on type
    let icon = '';
    switch (type) {
      case 'success':
        icon = '<i class="fas fa-check-circle"></i>';
        break;
      case 'error':
        icon = '<i class="fas fa-exclamation-circle"></i>';
        break;
      case 'info':
        icon = '<i class="fas fa-info-circle"></i>';
        break;
      case 'warning':
        icon = '<i class="fas fa-exclamation-triangle"></i>';
        break;
    }
    
    toast.innerHTML = `
      <div class="toast-content">
        ${icon}
        <span>${message}</span>
      </div>
      <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Add close functionality
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.classList.add('toast-hiding');
      setTimeout(() => {
        toast.remove();
      }, 300);
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.classList.add('toast-hiding');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 5000);
    
    // Animate in
    setTimeout(() => {
      toast.classList.add('toast-visible');
    }, 10);
  }
  
  // Copy to clipboard helper
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast('Link copied to clipboard!', 'success');
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy link', 'error');
      });
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
        
        showToast('Login successful! Welcome back!', 'success');
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
        
        showToast('Registration successful!', 'success');
        
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
      showToast('You have been logged out', 'info');
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
        <li class="auth-link"><a href="/upload" class="nav-link"><i class="fas fa-upload"></i> Upload</a></li>
        <li class="auth-link">
          <a href="/profile" class="nav-link">
            <i class="fas fa-user"></i> ${user?.username || 'Profile'}
          </a>
        </li>
        <li class="auth-link"><a href="#" id="logout-link" class="nav-link"><i class="fas fa-sign-out-alt"></i> Logout</a></li>
      `;
      
      // Add logout event listener
      document.getElementById('logout-link').addEventListener('click', (e) => {
        e.preventDefault();
        Auth.logout();
      });
    } else {
      // Add unauthenticated links
      navMenu.innerHTML += `
        <li class="auth-link"><a href="/login" class="nav-link"><i class="fas fa-sign-in-alt"></i> Login</a></li>
        <li class="auth-link"><a href="/register" class="nav-link"><i class="fas fa-user-plus"></i> Register</a></li>
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
    
    console.log('Initializing video player for element:', videoElement);
    
    // Add error handling with retry logic
    videoElement.addEventListener('error', (e) => {
      console.error('Video error:', videoElement.error);
      console.error('Error details:', e);
      
      const videoContainer = videoElement.parentElement;
      if (videoContainer) {
        // Create error message with retry button
        const errorDiv = document.createElement('div');
        errorDiv.className = 'video-error';
        errorDiv.innerHTML = `
          <p>Error streaming video: ${videoElement.error ? videoElement.error.message : 'Unknown error'}</p>
          <div class="error-actions">
            <button id="retry-video" class="btn">
              <i class="fas fa-sync"></i> Retry
            </button>
            <button id="direct-video" class="btn btn-secondary">
              <i class="fas fa-external-link-alt"></i> Open Direct Link
            </button>
          </div>
        `;
        
        videoContainer.appendChild(errorDiv);
        
        // Add retry functionality
        document.getElementById('retry-video')?.addEventListener('click', () => {
          console.log('Retrying video playback...');
          errorDiv.remove();
          
          // Get the source element and its URL
          const source = videoElement.querySelector('source');
          const directUrl = source?.dataset?.original || source?.src;
          
          if (directUrl) {
            // Try with direct URL
            videoElement.innerHTML = `
              <source src="${directUrl}" type="video/mp4">
            `;
          }
          
          videoElement.load();
          videoElement.play().catch(err => console.error('Play failed after retry:', err));
        });
        
        // Add direct link functionality
        document.getElementById('direct-video')?.addEventListener('click', () => {
          const source = videoElement.querySelector('source');
          const directUrl = source?.dataset?.original || source?.src;
          
          if (directUrl) {
            window.open(directUrl, '_blank');
          }
        });
      }
    });
    
    // Add loading indicator
    videoElement.addEventListener('loadstart', () => {
      console.log('Video loading started');
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'video-loading';
      loadingDiv.innerHTML = `
        <div class="spinner"></div>
        <p>Loading video...</p>
      `;
      videoElement.parentElement.appendChild(loadingDiv);
    });
    
    // Remove loading indicator when can play
    videoElement.addEventListener('canplay', () => {
      console.log('Video can play now');
      const loadingDiv = videoElement.parentElement.querySelector('.video-loading');
      if (loadingDiv) loadingDiv.remove();
    });
    
    // Log when metadata is loaded
    videoElement.addEventListener('loadedmetadata', () => {
      console.log('Video metadata loaded:', videoElement.videoWidth, 'x', videoElement.videoHeight, 'duration:', videoElement.duration);
    });
    
    // Log when video starts playing
    videoElement.addEventListener('playing', () => {
      console.log('Video started playing');
      showToast('Video playback started', 'success');
    });
    
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
    mainContent.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading videos...</p>
      </div>
    `;
    
    // Fetch videos
    API.getVideos(1, 20, searchQuery)
      .then(videos => {
        if (!videos || videos.length === 0) {
          mainContent.innerHTML = `
            <div class="no-results">
              <i class="fas fa-search fa-3x"></i>
              <h2>${searchQuery ? 'No videos found for "' + searchQuery + '"' : 'No videos available'}</h2>
              <p>Be the first to upload a video!</p>
              ${Auth.isLoggedIn() ? '<a href="/upload" class="btn btn-primary"><i class="fas fa-upload"></i> Upload Video</a>' : ''}
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
          heading.innerHTML = `<i class="fas fa-search"></i> Search results for "${searchQuery}"`;
          mainContent.appendChild(heading);
        } else {
          // Add featured section
          const featuredSection = document.createElement('div');
          featuredSection.className = 'featured-section';
          
          // Use the first video as featured if available
          if (videos.length > 0) {
            const featuredVideo = videos[0];
            featuredSection.innerHTML = `
              <h2>Featured Video</h2>
              <div class="featured-video">
                <a href="/video?id=${featuredVideo._id}" class="featured-thumbnail">
                  <img src="${featuredVideo.thumbnail_url}" alt="${featuredVideo.title}">
                  <div class="featured-overlay">
                    <i class="fas fa-play-circle"></i>
                  </div>
                </a>
                <div class="featured-info">
                  <h3><a href="/video?id=${featuredVideo._id}">${featuredVideo.title}</a></h3>
                  <p class="featured-creator">
                    <i class="fas fa-user"></i> ${featuredVideo.username || 'Unknown'}
                  </p>
                  <p class="featured-views">
                    <i class="fas fa-eye"></i> ${formatViews(featuredVideo.views)} views • ${formatDate(featuredVideo.created_at)}
                  </p>
                  <p class="featured-description">${featuredVideo.description || 'No description provided.'}</p>
                  <a href="/video?id=${featuredVideo._id}" class="btn btn-primary">
                    <i class="fas fa-play"></i> Watch Now
                  </a>
                </div>
              </div>
            `;
            mainContent.appendChild(featuredSection);
          }
          
          // Add trending section heading
          const trendingHeading = document.createElement('h2');
          trendingHeading.className = 'trending-heading';
          trendingHeading.innerHTML = '<i class="fas fa-fire"></i> Trending Videos';
          mainContent.appendChild(trendingHeading);
        }
        
        mainContent.appendChild(videoGrid);
      })
      .catch(error => {
        console.error('Error in loadHomePage:', error);
        mainContent.innerHTML = `
          <div class="error">
            <i class="fas fa-exclamation-triangle fa-3x"></i>
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
          <div class="play-overlay">
            <i class="fas fa-play"></i>
          </div>
        </div>
        <div class="video-info">
          <h3>${video.title}</h3>
          <p class="creator">
            <i class="fas fa-user"></i> ${video.username || 'Unknown'}
          </p>
          <p class="views">
            <i class="fas fa-eye"></i> ${formatViews(video.views)} views • ${formatDate(video.created_at)}
          </p>
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
      
      // Add loading state to button
      const submitButton = loginForm.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.innerHTML;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
      submitButton.disabled = true;
      
      try {
        await Auth.login(email, password);
        updateNavigation(true);
        Router.navigate('/');
      } catch (error) {
        showError('login-error', error.message);
        // Reset button
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
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
      
      // Add loading state to button
      const submitButton = registerForm.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.innerHTML;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
      submitButton.disabled = true;
      
      try {
        await Auth.register(username, email, password);
        updateNavigation(true);
        Router.navigate('/');
      } catch (error) {
        showError('register-error', error.message);
        // Reset button
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
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
      
      // Add loading state to button
      const submitButton = uploadForm.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.innerHTML;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
      submitButton.disabled = true;
      
      try {
        const video = await API.uploadVideo({
          title,
          description,
          raw_video_url: rawVideoUrl,
          thumbnail_url: thumbnailUrl
        });
        
        showToast('Video uploaded successfully!', 'success');
        
        // Redirect to the video page
        Router.navigate(`/video?id=${video._id}`);
      } catch (error) {
        showError('upload-error', error.message);
        // Reset button
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
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
            <h1><i class="fas fa-user-circle"></i> ${user.username}</h1>
            <p><i class="fas fa-envelope"></i> ${user.email}</p>
            <p><i class="fas fa-calendar-alt"></i> Joined ${formatDate(user.created_at)}</p>
          </div>
        </div>
        <div class="profile-content">
          <h2><i class="fas fa-film"></i> Your Videos</h2>
          <div id="user-videos" class="video-grid">
            <div class="loading">
              <div class="spinner"></div>
              <p>Loading your videos...</p>
            </div>
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
              <i class="fas fa-video-slash fa-3x"></i>
              <p>You haven't uploaded any videos yet.</p>
              <a href="/upload" class="btn btn-primary">
                <i class="fas fa-upload"></i> Upload Video
              </a>
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
            <i class="fas fa-exclamation-triangle fa-3x"></i>
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
    mainContent.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading video...</p>
      </div>
    `;
    
    API.getVideoById(videoId)
      .then(video => {
        // Log the raw video URL for debugging
        console.log('Raw video URL:', video.raw_video_url);
        
        // Check if the video URL is valid
        if (!video.raw_video_url || typeof video.raw_video_url !== 'string' || !video.raw_video_url.startsWith('http')) {
          throw new Error('Invalid video URL provided');
        }
        
        // Get the streaming URL - IMPORTANT: This is where we create the stream URL
        const streamUrl = `/api/stream?url=${encodeURIComponent(video.raw_video_url)}`;
        console.log('Stream URL:', streamUrl);
        
        // Create video container
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        
        // Create video player with direct URL as fallback
        videoContainer.innerHTML = `
          <div class="player-wrapper">
            <video id="video-player" controls preload="auto" poster="${video.thumbnail_url}">
              <source src="${streamUrl}" type="video/mp4" data-original="${video.raw_video_url}">
              Your browser does not support the video tag.
            </video>
          </div>
          <div class="video-details">
            <h1>${video.title}</h1>
            <div class="video-stats">
              <span><i class="fas fa-eye"></i> ${formatViews(video.views)} views</span>
              <span><i class="fas fa-calendar-alt"></i> ${formatDate(video.created_at)}</span>
            </div>
            <div class="video-actions">
              <button id="like-button" class="like-button">
                <i class="fas fa-thumbs-up"></i>
                <span>${video.likes}</span>
              </button>
              <button id="share-button" class="btn btn-secondary">
                <i class="fas fa-share"></i> Share
              </button>
              <button id="direct-link-button" class="btn btn-secondary" data-url="${video.raw_video_url}">
                <i class="fas fa-external-link-alt"></i> Direct Link
              </button>
              <button id="debug-button" class="btn btn-secondary">
                <i class="fas fa-bug"></i> Debug Stream
              </button>
            </div>
            <div class="uploader-info">
              <div class="uploader-avatar">
                <img src="${video.user_profile_image || 'https://via.placeholder.com/40'}" alt="${video.username}">
              </div>
              <div class="uploader-details">
                <h3>Uploaded by <a href="/profile?id=${video.user_id}">${video.username}</a></h3>
              </div>
            </div>
            <div class="video-description">
              <h3>Description</h3>
              <p>${video.description || 'No description provided.'}</p>
            </div>
          </div>
        `;
        
        mainContent.innerHTML = '';
        mainContent.appendChild(videoContainer);
        
        // Initialize video player
        const videoElement = document.getElementById('video-player');
        
        // Add debug button functionality
        document.getElementById('debug-button')?.addEventListener('click', () => {
          // Open the stream URL in a new tab for debugging
          window.open(streamUrl, '_blank');
          
          // Also try to fetch the stream URL with fetch API to see if it works
          fetch(streamUrl)
            .then(response => {
              console.log('Debug fetch response:', response);
              showToast(`Stream status: ${response.status} ${response.statusText}`, 'info');
            })
            .catch(error => {
              console.error('Debug fetch error:', error);
              showToast(`Stream error: ${error.message}`, 'error');
            });
        });
        
        // Add direct link functionality
        document.getElementById('direct-link-button')?.addEventListener('click', () => {
          window.open(video.raw_video_url, '_blank');
        });
        
        // Log when video starts loading
        videoElement.addEventListener('loadstart', () => {
          console.log('Video loading started');
        });
        
        // Log when metadata is loaded
        videoElement.addEventListener('loadedmetadata', () => {
          console.log('Video metadata loaded');
        });
        
        // Log when video can play
        videoElement.addEventListener('canplay', () => {
          console.log('Video can play now');
        });
        
        // Initialize video player with keyboard shortcuts, etc.
        initializeVideoPlayer(videoElement);
        
        // Handle like button
        const likeButton = document.getElementById('like-button');
        likeButton.addEventListener('click', async () => {
          if (Auth.isLoggedIn()) {
            try {
              const response = await API.likeVideo(video._id);
              likeButton.innerHTML = `
                <i class="fas fa-thumbs-up"></i>
                <span>${response.likes}</span>
              `;
              
              showToast(response.message, 'success');
            } catch (error) {
              console.error('Error liking video:', error);
              showToast('Error liking video', 'error');
            }
          } else {
            Router.navigate('/login');
          }
        });
        
        // Add share functionality
        document.getElementById('share-button')?.addEventListener('click', () => {
          const videoUrl = window.location.href;
          
          // Use Web Share API if available
          if (navigator.share) {
            navigator.share({
              title: video.title,
              text: `Check out this video: ${video.title}`,
              url: videoUrl
            })
            .then(() => {
              console.log('Successfully shared');
            })
            .catch((error) => {
              console.error('Error sharing:', error);
              // Fallback to clipboard
              copyToClipboard(videoUrl);
            });
          } else {
            // Fallback to clipboard
            copyToClipboard(videoUrl);
          }
        });
        
        // Load related videos
        loadRelatedVideos(video._id, video.user_id);
      })
      .catch(error => {
        console.error('Error loading video:', error);
        mainContent.innerHTML = `
          <div class="error">
            <i class="fas fa-exclamation-triangle fa-3x"></i>
            <p>Error loading video: ${error.message}</p>
            <a href="/" class="btn">Go Home</a>
          </div>
        `;
      });
  }
  
  // Load related videos
  function loadRelatedVideos(currentVideoId, userId) {
    API.getVideos(1, 10)
      .then(videos => {
        // Filter out current video and get related videos (same user or random)
        const filteredVideos = (videos || []).filter(video => video._id !== currentVideoId);
        
        if (filteredVideos.length === 0) return;
        
        // Create related videos section
        const relatedSection = document.createElement('div');
        relatedSection.className = 'related-videos';
        relatedSection.innerHTML = '<h2><i class="fas fa-film"></i> Related Videos</h2>';
        
        const relatedGrid = document.createElement('div');
        relatedGrid.className = 'related-grid';
        
        // Add up to 6 related videos
        filteredVideos.slice(0, 6).forEach(video => {
          const videoCard = document.createElement('div');
          videoCard.className = 'related-video-card';
          
          videoCard.innerHTML = `
            <a href="/video?id=${video._id}">
              <div class="related-thumbnail">
                <img src="${video.thumbnail_url}" alt="${video.title}" loading="lazy">
                <span class="duration">${formatDuration(video.duration || 0)}</span>
                <div class="play-overlay">
                  <i class="fas fa-play"></i>
                </div>
              </div>
              <div class="related-info">
                <h3>${video.title}</h3>
                <p class="creator">${video.username || 'Unknown'}</p>
                <p class="views">${formatViews(video.views)} views</p>
              </div>
            </a>
          `;
          
          relatedGrid.appendChild(videoCard);
        });
        
        relatedSection.appendChild(relatedGrid);
        
        // Add to main content
        document.getElementById('main-content').appendChild(relatedSection);
      })
      .catch(error => {
        console.error('Error loading related videos:', error);
      });
  }