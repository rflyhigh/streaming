from fastapi import FastAPI, Request, HTTPException, Depends, Query, UploadFile, File, Header
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
from pydantic import BaseModel, Field, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt
import motor.motor_asyncio
import os
import io
import aiohttp
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Settings
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "streaming_platform")
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Create FastAPI app
app = FastAPI(title="Streaming Platform")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)
db = client[DB_NAME]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# Templates
templates = Jinja2Templates(directory="templates")

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Pydantic models
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate
    
    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)
    
    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserInDB(UserBase):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    profile_image: Optional[str] = None
    
    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class UserResponse(UserBase):
    id: str = Field(..., alias="_id")
    created_at: datetime
    profile_image: Optional[str] = None
    
    class Config:
        allow_population_by_field_name = True
        json_encoders = {ObjectId: str}

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class VideoBase(BaseModel):
    title: str
    description: Optional[str] = None
    thumbnail_url: str
    raw_video_url: str

class VideoCreate(VideoBase):
    pass

class VideoInDB(VideoBase):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    user_id: PyObjectId
    created_at: datetime = Field(default_factory=datetime.utcnow)
    views: int = 0
    likes: int = 0
    duration: Optional[int] = None
    
    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class VideoResponse(VideoBase):
    id: str = Field(..., alias="_id")
    user_id: str
    created_at: datetime
    views: int
    likes: int
    duration: Optional[int] = None
    
    class Config:
        allow_population_by_field_name = True
        json_encoders = {ObjectId: str}

class VideoWithUser(VideoResponse):
    username: str
    user_profile_image: Optional[str] = None

# Security functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = await db["users"].find_one({"email": token_data.email})
    if user is None:
        raise credentials_exception
    
    # Convert ObjectId to string
    user["_id"] = str(user["_id"])
    
    return UserInDB(**user)

# Video streaming function
async def stream_video(url: str, range_header: str = None):
    """Stream video from URL directly through the server with range support"""
    print(f"Attempting to stream video from: {url}, Range: {range_header}")
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br"
        }
        
        # Add range header if provided
        if range_header:
            headers["Range"] = range_header
            print(f"Forwarding range request: {range_header}")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                print(f"Stream response status: {response.status}")
                
                if response.status not in (200, 206):  # 200 OK or 206 Partial Content
                    print(f"Failed to fetch video: {await response.text()}")
                    raise HTTPException(status_code=response.status, detail=f"Failed to fetch video: {response.status}")
                
                # Get content type and headers
                content_type = response.headers.get("Content-Type", "video/mp4")
                content_length = response.headers.get("Content-Length")
                content_range = response.headers.get("Content-Range")
                
                print(f"Content-Type: {content_type}")
                print(f"Content-Length: {content_length}")
                print(f"Content-Range: {content_range}")
                
                # Prepare response headers
                resp_headers = {
                    "Content-Type": content_type,
                    "Accept-Ranges": "bytes",
                    "Access-Control-Allow-Origin": "*"
                }
                
                if content_length:
                    resp_headers["Content-Length"] = content_length
                
                if content_range:
                    resp_headers["Content-Range"] = content_range
                    status_code = 206  # Partial Content
                else:
                    status_code = 200  # OK
                
                # Create async generator to stream the content
                async def generate():
                    try:
                        async for chunk in response.content.iter_chunked(1024 * 1024):  # 1MB chunks
                            yield chunk
                    except Exception as e:
                        print(f"Error during streaming: {str(e)}")
                        raise
                
                return StreamingResponse(
                    generate(),
                    media_type=content_type,
                    headers=resp_headers,
                    status_code=status_code
                )
    except Exception as e:
        print(f"Streaming error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Streaming error: {str(e)}")

# API routes
@app.post("/api/auth/register")
async def register(user: UserCreate):
    # Check if user exists
    existing_user = await db["users"].find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if username exists
    existing_username = await db["users"].find_one({"username": user.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    user_in_db = UserInDB(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password
    )
    
    result = await db["users"].insert_one(user_in_db.dict(by_alias=True))
    
    created_user = await db["users"].find_one({"_id": result.inserted_id})
    
    # Convert ObjectId to string
    created_user["_id"] = str(created_user["_id"])
    
    # Remove hashed_password from response
    if "hashed_password" in created_user:
        del created_user["hashed_password"]
    
    return created_user

@app.post("/api/auth/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    # Find user by email
    user = await db["users"].find_one({"email": form_data.username})
    
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Convert ObjectId to string
    user["_id"] = str(user["_id"])
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/users/me")
async def read_users_me(current_user: UserInDB = Depends(get_current_user)):
    # Convert to dict and ensure _id is a string
    user_dict = current_user.dict(by_alias=True)
    user_dict["_id"] = str(user_dict["_id"])
    
    # Remove hashed_password from response
    if "hashed_password" in user_dict:
        del user_dict["hashed_password"]
    
    return user_dict

@app.get("/api/users/{user_id}")
async def get_user(user_id: str):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Convert ObjectId to string
    user["_id"] = str(user["_id"])
    
    # Remove hashed_password from response
    if "hashed_password" in user:
        del user["hashed_password"]
    
    return user

@app.get("/api/videos")
async def get_videos(skip: int = 0, limit: int = 20, search: Optional[str] = None):
    query = {}
    if search:
        query = {"$or": [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]}
    
    try:
        cursor = db["videos"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        videos = await cursor.to_list(length=limit)
        
        # If no videos, return empty list
        if not videos:
            return []
        
        # Get user info for each video
        result = []
        for video in videos:
            # Convert ObjectIds to strings
            video["_id"] = str(video["_id"])
            video["user_id"] = str(video["user_id"])
            
            user = await db["users"].find_one({"_id": ObjectId(video["user_id"])})
            if user:
                video_with_user = {
                    **video,
                    "username": user["username"],
                    "user_profile_image": user.get("profile_image")
                }
                result.append(video_with_user)
        
        return result
    except Exception as e:
        print(f"Error getting videos: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/videos", status_code=201)
async def create_video(video: VideoCreate, current_user: UserInDB = Depends(get_current_user)):
    video_in_db = VideoInDB(
        **video.dict(),
        user_id=current_user.id
    )
    
    result = await db["videos"].insert_one(video_in_db.dict(by_alias=True))
    
    created_video = await db["videos"].find_one({"_id": result.inserted_id})
    
    # Convert ObjectIds to strings
    created_video["_id"] = str(created_video["_id"])
    created_video["user_id"] = str(created_video["user_id"])
    
    return created_video

@app.get("/api/videos/{video_id}")
async def get_video(video_id: str):
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID")
    
    video = await db["videos"].find_one({"_id": ObjectId(video_id)})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Increment view count
    await db["videos"].update_one(
        {"_id": ObjectId(video_id)},
        {"$inc": {"views": 1}}
    )
    
    # Get user info
    user = await db["users"].find_one({"_id": video["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="Video creator not found")
    
    # Convert ObjectIds to strings
    video["_id"] = str(video["_id"])
    video["user_id"] = str(video["user_id"])
    
    video_with_user = {
        **video,
        "username": user["username"],
        "user_profile_image": user.get("profile_image")
    }
    
    return video_with_user

@app.post("/api/videos/{video_id}/like")
async def like_video(video_id: str, current_user: UserInDB = Depends(get_current_user)):
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID")
    
    # Check if video exists
    video = await db["videos"].find_one({"_id": ObjectId(video_id)})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check if user already liked the video
    like = await db["likes"].find_one({
        "video_id": ObjectId(video_id),
        "user_id": current_user.id
    })
    
    if like:
        # Unlike
        await db["likes"].delete_one({
            "video_id": ObjectId(video_id),
            "user_id": current_user.id
        })
        await db["videos"].update_one(
            {"_id": ObjectId(video_id)},
            {"$inc": {"likes": -1}}
        )
        message = "Video unliked"
    else:
        # Like
        await db["likes"].insert_one({
            "video_id": ObjectId(video_id),
            "user_id": current_user.id,
            "created_at": datetime.utcnow()
        })
        await db["videos"].update_one(
            {"_id": ObjectId(video_id)},
            {"$inc": {"likes": 1}}
        )
        message = "Video liked"
    
    # Get updated like count
    updated_video = await db["videos"].find_one({"_id": ObjectId(video_id)})
    
    return {
        "message": message,
        "likes": updated_video["likes"]
    }

# Direct video streaming endpoint with support for both GET and HEAD
@app.api_route("/api/stream", methods=["GET", "HEAD"])
async def stream_video_endpoint(request: Request, url: str, range: str = Header(None)):
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL parameter")
    
    print(f"Stream request received for URL: {url}, Method: {request.method}, Range: {range}")
    
    # For HEAD requests, just return headers without body
    if request.method == "HEAD":
        try:
            headers = {
                "Accept-Ranges": "bytes",
                "Content-Type": "video/mp4",  # Default content type
                "Access-Control-Allow-Origin": "*"
            }
            return Response(headers=headers)
        except Exception as e:
            print(f"Error handling HEAD request: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error handling HEAD request: {str(e)}")
    
    # For GET requests, stream the video
    try:
        return await stream_video(url, range)
    except Exception as e:
        print(f"Error streaming video: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error streaming video: {str(e)}")

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

@app.get("/debug/test-stream")
async def debug_test_stream():
    """Test page for video streaming"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Stream Test</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #0e0e10; color: #fff; }
            .video-container { width: 100%; margin: 20px 0; }
            video { width: 100%; background: #000; }
            input { width: 100%; padding: 10px; margin-bottom: 10px; background: #18181b; border: 1px solid #303032; color: #fff; }
            button { padding: 10px 20px; background: #53fc18; color: #000; border: none; cursor: pointer; font-weight: bold; }
            button:hover { background: #3dd909; }
            h1 { color: #53fc18; }
            #error { margin-top: 10px; }
        </style>
    </head>
    <body>
        <h1>Video Stream Test</h1>
        <div>
            <input type="text" id="video-url" placeholder="Enter video URL" 
                   value="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4">
            <button onclick="loadVideo()">Load Video</button>
        </div>
        <div class="video-container">
            <video id="video-player" controls></video>
        </div>
        <div id="error" style="color: #ff4d4d;"></div>
        
        <script>
            function loadVideo() {
                const videoUrl = document.getElementById('video-url').value;
                const errorDiv = document.getElementById('error');
                errorDiv.textContent = '';
                
                if (!videoUrl) {
                    errorDiv.textContent = 'Please enter a video URL';
                    return;
                }
                
                const encodedUrl = encodeURIComponent(videoUrl);
                const streamUrl = `/api/stream?url=${encodedUrl}`;
                
                const videoPlayer = document.getElementById('video-player');
                videoPlayer.src = streamUrl;
                
                videoPlayer.onerror = function() {
                    errorDiv.textContent = 'Error loading video: ' + (videoPlayer.error ? videoPlayer.error.message : 'Unknown error');
                };
                
                videoPlayer.load();
                videoPlayer.play().catch(err => {
                    console.error('Play failed:', err);
                });
            }
            
            // Load a default video on page load
            window.onload = loadVideo;
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/debug/direct-stream-test")
async def debug_direct_stream_test():
    """Test page for direct video streaming"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Direct Stream Test</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #0e0e10; color: #fff; }
            .video-container { width: 100%; margin: 20px 0; }
            video { width: 100%; background: #000; }
            input { width: 100%; padding: 10px; margin-bottom: 10px; background: #18181b; border: 1px solid #303032; color: #fff; }
            button { padding: 10px 20px; background: #53fc18; color: #000; border: none; cursor: pointer; font-weight: bold; }
            button:hover { background: #3dd909; }
            h1 { color: #53fc18; }
            #error { margin-top: 10px; }
            pre { background: #18181b; padding: 10px; overflow: auto; }
            .option-buttons { display: flex; gap: 10px; margin-top: 10px; }
        </style>
    </head>
    <body>
        <h1>Direct Stream Test</h1>
        <div>
            <input type="text" id="video-url" placeholder="Enter video URL" 
                   value="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4">
            <div class="option-buttons">
                <button onclick="loadVideo('stream')">Use Stream API</button>
                <button onclick="loadVideo('direct')">Use Direct URL</button>
                <button onclick="loadVideo('iframe')">Use Iframe</button>
                <button onclick="loadVideo('external')">Use External Player</button>
            </div>
        </div>
        <div class="video-container" id="player-container">
            <video id="video-player" controls></video>
        </div>
        <div id="error" style="color: #ff4d4d;"></div>
        <div>
            <h2>Debug Info:</h2>
            <pre id="debug-info"></pre>
        </div>
        
        <script>
            function loadVideo(method) {
                const videoUrl = document.getElementById('video-url').value;
                const errorDiv = document.getElementById('error');
                const debugInfo = document.getElementById('debug-info');
                const playerContainer = document.getElementById('player-container');
                
                errorDiv.textContent = '';
                
                if (!videoUrl) {
                    errorDiv.textContent = 'Please enter a video URL';
                    return;
                }
                
                // Log the process
                debugInfo.textContent = `Starting video load process using ${method}...\\n`;
                debugInfo.textContent += `Original URL: ${videoUrl}\\n`;
                
                if (method === 'stream') {
                    // Use streaming API
                    const encodedUrl = encodeURIComponent(videoUrl);
                    const streamUrl = `/api/stream?url=${encodedUrl}`;
                    
                    debugInfo.textContent += `Encoded URL: ${encodedUrl}\\n`;
                    debugInfo.textContent += `Stream URL: ${streamUrl}\\n`;
                    
                    playerContainer.innerHTML = '<video id="video-player" controls></video>';
                    const videoPlayer = document.getElementById('video-player');
                    
                    videoPlayer.src = streamUrl;
                    
                    videoPlayer.onerror = function() {
                        errorDiv.textContent = 'Error loading video: ' + (videoPlayer.error ? videoPlayer.error.message : 'Unknown error');
                        debugInfo.textContent += `Video error: ${videoPlayer.error ? videoPlayer.error.message : 'Unknown error'}\\n`;
                    };
                    
                    videoPlayer.onloadstart = function() {
                        debugInfo.textContent += 'Video load started\\n';
                    };
                    
                    videoPlayer.onloadedmetadata = function() {
                        debugInfo.textContent += `Video metadata loaded: ${videoPlayer.videoWidth}x${videoPlayer.videoHeight}, duration: ${videoPlayer.duration}s\\n`;
                    };
                    
                    videoPlayer.oncanplay = function() {
                        debugInfo.textContent += 'Video can play now\\n';
                    };
                    
                    videoPlayer.onplaying = function() {
                        debugInfo.textContent += 'Video is playing\\n';
                    };
                    
                    videoPlayer.load();
                    videoPlayer.play().catch(err => {
                        debugInfo.textContent += `Play failed: ${err.message}\\n`;
                        console.error('Play failed:', err);
                    });
                } 
                else if (method === 'direct') {
                    // Use direct URL
                    playerContainer.innerHTML = '<video id="video-player" controls></video>';
                    const videoPlayer = document.getElementById('video-player');
                    
                    debugInfo.textContent += `Using direct URL for playback\\n`;
                    
                    videoPlayer.src = videoUrl;
                    
                    videoPlayer.onerror = function() {
                        errorDiv.textContent = 'Error loading video: ' + (videoPlayer.error ? videoPlayer.error.message : 'Unknown error');
                        debugInfo.textContent += `Video error: ${videoPlayer.error ? videoPlayer.error.message : 'Unknown error'}\\n`;
                    };
                    
                    videoPlayer.onloadstart = function() {
                        debugInfo.textContent += 'Video load started\\n';
                    };
                    
                    videoPlayer.onloadedmetadata = function() {
                        debugInfo.textContent += `Video metadata loaded: ${videoPlayer.videoWidth}x${videoPlayer.videoHeight}, duration: ${videoPlayer.duration}s\\n`;
                    };
                    
                    videoPlayer.load();
                    videoPlayer.play().catch(err => {
                        debugInfo.textContent += `Play failed: ${err.message}\\n`;
                        console.error('Play failed:', err);
                    });
                }
                else if (method === 'iframe') {
                    // Use iframe
                    debugInfo.textContent += `Using iframe for playback\\n`;
                    
                    // Create HTML for iframe content
                    const playerHtml = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Video Player</title>
                            <style>
                                body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
                                video { width: 100%; height: 100%; }
                            </style>
                        </head>
                        <body>
                            <video controls autoplay src="${videoUrl}"></video>
                        </body>
                        </html>
                    `;
                    
                    // Create blob URL
                    const blob = new Blob([playerHtml], { type: 'text/html' });
                    const blobUrl = URL.createObjectURL(blob);
                    
                    debugInfo.textContent += `Created blob URL: ${blobUrl}\\n`;
                    
                    // Create iframe
                    playerContainer.innerHTML = `<iframe id="video-iframe" style="width:100%; height:400px; border:none;" allowfullscreen></iframe>`;
                    const iframe = document.getElementById('video-iframe');
                    iframe.src = blobUrl;
                }
                else if (method === 'external') {
                    // Use external player
                    debugInfo.textContent += `Using external player for playback\\n`;
                    
                    // For MKV files, use an external player
                    let externalPlayerUrl;
                    
                    if (videoUrl.toLowerCase().endsWith('.mkv')) {
                        externalPlayerUrl = `https://www.hlsplayer.org/play?url=${encodeURIComponent(videoUrl)}`;
                        debugInfo.textContent += `MKV file detected, using HLS player\\n`;
                    } else {
                        externalPlayerUrl = `https://www.hlsplayer.org/play?url=${encodeURIComponent(videoUrl)}`;
                        debugInfo.textContent += `Using HLS player\\n`;
                    }
                    
                    debugInfo.textContent += `External player URL: ${externalPlayerUrl}\\n`;
                    
                    // Create iframe for external player
                    playerContainer.innerHTML = `<iframe id="external-player" style="width:100%; height:400px; border:none;" allowfullscreen></iframe>`;
                    const iframe = document.getElementById('external-player');
                    iframe.src = externalPlayerUrl;
                }
            }
            
            // Load a default video on page load
            window.onload = function() {
                loadVideo('direct');
            };
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

# Frontend route - This must be the last route
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_frontend(request: Request, full_path: str):
    # Skip API routes - they're handled by the routers above
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    
    # Check if it's a static file request without /static prefix
    if full_path.startswith(('css/', 'js/', 'assets/')):
        return RedirectResponse(url=f"/static/{full_path}")
    
    return templates.TemplateResponse("index.html", {"request": request})

# Run the app
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)