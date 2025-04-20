from fastapi import APIRouter, Depends, HTTPException, status
from ..models.user import UserResponse, UserInDB
from ..utils.security import get_current_user
from ..db import get_database
from bson import ObjectId

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: UserInDB = Depends(get_current_user)):
    return current_user

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db = Depends(get_database)):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user