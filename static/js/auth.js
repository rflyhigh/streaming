// Authentication handling
const Auth = {
  // Storage keys
  TOKEN_KEY: 'auth_token',
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