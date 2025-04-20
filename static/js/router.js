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