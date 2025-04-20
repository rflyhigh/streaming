from fastapi import FastAPI, Request, HTTPException, Depends, Query, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
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
async def stream_video(url: str):
    """Stream video from URL directly through the server"""
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            if response.status != 200:
                raise HTTPException(status_code=response.status, detail="Failed to fetch video")
            
            # Get content type and headers
            content_type = response.headers.get("Content-Type", "video/mp4")
            
            # Create async generator to stream the content
            async def generate():
                while True:
                    chunk = await response.content.read(1024 * 1024)  # 1MB chunks
                    if not chunk:
                        break
                    yield chunk
            
            return StreamingResponse(
                generate(),
                media_type=content_type,
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Type": content_type,
                }
            )

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

# Direct video streaming endpoint - no need for Cloudflare Worker
@app.get("/api/stream")
async def stream_video_endpoint(url: str):
    if not url:
        raise HTTPException(status_code=400, detail="Missing URL parameter")
    
    try:
        return await stream_video(url)
    except Exception as e:
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