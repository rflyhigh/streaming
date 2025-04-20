from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from ..models.user import UserCreate, UserResponse, Token, UserInDB
from ..utils.security import get_password_hash, authenticate_user, create_access_token
from ..config import settings
from ..db import get_database
from bson import ObjectId

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(user: UserCreate, db = Depends(get_database)):
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
    
    # Convert ObjectId to string before returning
    if created_user:
        created_user["_id"] = str(created_user["_id"])
    
    return created_user

@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db = Depends(get_database)):
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}