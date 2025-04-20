from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from ..models.video import VideoCreate, VideoResponse, VideoInDB, VideoWithUser
from ..models.user import UserInDB
from ..utils.security import get_current_user
from ..config import settings
from ..db import get_database
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.post("/", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def create_video(
    video: VideoCreate, 
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database)
):
    video_in_db = VideoInDB(
        **video.dict(),
        user_id=current_user.id
    )
    
    result = await db["videos"].insert_one(video_in_db.dict(by_alias=True))
    
    created_video = await db["videos"].find_one({"_id": result.inserted_id})
    
    return created_video

@router.get("/", response_model=List[VideoWithUser])
async def get_videos(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db = Depends(get_database)
):
    query = {}
    if search:
        query = {"$or": [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]}
    
    cursor = db["videos"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    videos = await cursor.to_list(length=limit)
    
    # Get user info for each video
    result = []
    for video in videos:
        user = await db["users"].find_one({"_id": video["user_id"]})
        if user:
            video_with_user = {
                **video,
                "username": user["username"],
                "user_profile_image": user.get("profile_image")
            }
            result.append(video_with_user)
    
    return result

@router.get("/{video_id}", response_model=VideoWithUser)
async def get_video(video_id: str, db = Depends(get_database)):
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
    
    video_with_user = {
        **video,
        "username": user["username"],
        "user_profile_image": user.get("profile_image")
    }
    
    return video_with_user

@router.post("/{video_id}/like")
async def like_video(
    video_id: str, 
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database)
):
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