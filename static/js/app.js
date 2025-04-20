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