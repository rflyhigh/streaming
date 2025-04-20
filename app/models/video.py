from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from .user import PyObjectId

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
    duration: Optional[int] = None  # in seconds
    
    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class VideoResponse(VideoBase):
    id: str = Field(..., alias="_id")  # Changed from PyObjectId to str
    user_id: str  # Changed from PyObjectId to str
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