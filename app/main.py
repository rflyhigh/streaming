from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
import uvicorn
from .routers import auth, videos, users
from .db import connect_to_mongodb, close_mongodb_connection
from .config import settings

app = FastAPI(title=settings.APP_NAME)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database events
app.add_event_handler("startup", connect_to_mongodb)
app.add_event_handler("shutdown", close_mongodb_connection)

# API routes - Define these BEFORE mounting static files
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(videos.router, prefix="/api/videos", tags=["Videos"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Debug endpoints
@app.get("/debug/routes")
async def debug_routes():
    """List all registered routes for debugging"""
    routes = []
    for route in app.routes:
        routes.append({
            "path": getattr(route, "path", None),
            "name": getattr(route, "name", None),
            "methods": getattr(route, "methods", None),
        })
    return {"routes": routes}

@app.get("/debug/api-test")
async def debug_api_test():
    """Simple API test endpoint"""
    return {"status": "ok", "message": "API is working"}

# Exception handler for 404 errors
@app.exception_handler(404)
async def custom_404_handler(request: Request, exc: HTTPException):
    if request.url.path.startswith("/api/"):
        return JSONResponse(
            status_code=404,
            content={"detail": "API endpoint not found"}
        )
    return templates.TemplateResponse("index.html", {"request": request})

# Exception handler for 405 errors
@app.exception_handler(405)
async def custom_405_handler(request: Request, exc: HTTPException):
    if request.url.path.startswith("/api/"):
        return JSONResponse(
            status_code=405,
            content={"detail": "Method not allowed for this endpoint"}
        )
    return templates.TemplateResponse("index.html", {"request": request})

# Frontend route - This must be the last route
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_frontend(request: Request, full_path: str):
    # Check if it's a static file request without /static prefix
    if full_path.startswith(('css/', 'js/', 'assets/')):
        return RedirectResponse(url=f"/static/{full_path}")
    
    return templates.TemplateResponse("index.html", {"request": request})

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)