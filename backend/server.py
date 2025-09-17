from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from bson import ObjectId


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class Song(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    artist: str = ""
    album: str = ""
    duration: int = 0  # in seconds
    file_path: str
    folder_path: str
    artwork: Optional[str] = None  # base64 encoded image
    format: str = ""
    size: int = 0
    added_date: datetime = Field(default_factory=datetime.utcnow)

class SongCreate(BaseModel):
    title: str
    artist: str = ""
    album: str = ""
    duration: int = 0
    file_path: str
    folder_path: str
    artwork: Optional[str] = None
    format: str = ""
    size: int = 0

class Favorite(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    song_id: str
    added_date: datetime = Field(default_factory=datetime.utcnow)

class FavoriteCreate(BaseModel):
    song_id: str

class Playlist(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    song_ids: List[str] = []
    created_date: datetime = Field(default_factory=datetime.utcnow)
    updated_date: datetime = Field(default_factory=datetime.utcnow)

class PlaylistCreate(BaseModel):
    name: str
    song_ids: List[str] = []

class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    song_ids: Optional[List[str]] = None

class UserSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    selected_folders: List[str] = []
    shuffle_mode: bool = True
    repeat_mode: str = "none"  # none, one, all
    volume: float = 1.0
    equalizer_preset: str = "normal"
    updated_date: datetime = Field(default_factory=datetime.utcnow)

class UserSettingsUpdate(BaseModel):
    selected_folders: Optional[List[str]] = None
    shuffle_mode: Optional[bool] = None
    repeat_mode: Optional[str] = None
    volume: Optional[float] = None
    equalizer_preset: Optional[str] = None

class PlayHistory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    song_id: str
    played_date: datetime = Field(default_factory=datetime.utcnow)
    play_duration: int = 0  # seconds actually played

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
