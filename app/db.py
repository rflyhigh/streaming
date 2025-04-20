from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings
import logging

class Database:
    client: AsyncIOMotorClient = None
    
db = Database()

async def get_database():
    if not db.client:
        await connect_to_mongodb()
    return db.client[settings.DB_NAME]

async def connect_to_mongodb():
    try:
        db.client = AsyncIOMotorClient(settings.MONGODB_URL)
        # Ping the server to check connection
        await db.client.admin.command('ping')
        print("Connected to MongoDB")
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        # Don't raise the exception, just log it
        logging.error(f"MongoDB connection error: {e}")

async def close_mongodb_connection():
    if db.client:
        db.client.close()
        print("Closed MongoDB connection")