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
    return {"message": "Music Player API"}

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

# Songs endpoints
@api_router.post("/songs", response_model=Song)
async def add_song(song: SongCreate):
    song_dict = song.dict()
    song_obj = Song(**song_dict)
    result = await db.songs.insert_one(song_obj.dict())
    return song_obj

@api_router.get("/songs", response_model=List[Song])
async def get_songs(folder_path: Optional[str] = None):
    query = {}
    if folder_path:
        query["folder_path"] = folder_path
    songs = await db.songs.find(query).to_list(1000)
    return [Song(**song) for song in songs]

# Random song endpoint - MUST be before /songs/{song_id}
@api_router.get("/songs/random", response_model=Song)
async def get_random_song(folder_paths: Optional[str] = None):
    import random
    
    query = {}
    if folder_paths:
        folder_list = folder_paths.split(",")
        query["folder_path"] = {"$in": folder_list}
    
    # Get all songs matching the query
    all_songs = await db.songs.find(query).to_list(1000)
    
    print(f"DEBUG: Query: {query}")
    print(f"DEBUG: Found {len(all_songs)} songs")
    
    if not all_songs:
        raise HTTPException(status_code=404, detail="No songs found")
    
    # Pick a random song
    random_song = random.choice(all_songs)
    return Song(**random_song)

@api_router.get("/songs/{song_id}", response_model=Song)
async def get_song(song_id: str):
    song = await db.songs.find_one({"id": song_id})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return Song(**song)

@api_router.delete("/songs/{song_id}")
async def delete_song(song_id: str):
    result = await db.songs.delete_one({"id": song_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Song not found")
    return {"message": "Song deleted successfully"}

@api_router.delete("/songs")
async def clear_all_songs():
    await db.songs.delete_many({})
    return {"message": "All songs cleared"}

# Favorites endpoints
@api_router.post("/favorites", response_model=Favorite)
async def add_favorite(favorite: FavoriteCreate):
    # Check if song exists
    song = await db.songs.find_one({"id": favorite.song_id})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    # Check if already favorited
    existing = await db.favorites.find_one({"song_id": favorite.song_id})
    if existing:
        return Favorite(**existing)
    
    favorite_dict = favorite.dict()
    favorite_obj = Favorite(**favorite_dict)
    await db.favorites.insert_one(favorite_obj.dict())
    return favorite_obj

@api_router.get("/favorites", response_model=List[Favorite])
async def get_favorites():
    favorites = await db.favorites.find().to_list(1000)
    return [Favorite(**favorite) for favorite in favorites]

@api_router.delete("/favorites/{song_id}")
async def remove_favorite(song_id: str):
    result = await db.favorites.delete_one({"song_id": song_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"message": "Favorite removed successfully"}

# Playlists endpoints
@api_router.post("/playlists", response_model=Playlist)
async def create_playlist(playlist: PlaylistCreate):
    playlist_dict = playlist.dict()
    playlist_obj = Playlist(**playlist_dict)
    await db.playlists.insert_one(playlist_obj.dict())
    return playlist_obj

@api_router.get("/playlists", response_model=List[Playlist])
async def get_playlists():
    playlists = await db.playlists.find().to_list(1000)
    return [Playlist(**playlist) for playlist in playlists]

@api_router.get("/playlists/{playlist_id}", response_model=Playlist)
async def get_playlist(playlist_id: str):
    playlist = await db.playlists.find_one({"id": playlist_id})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return Playlist(**playlist)

@api_router.put("/playlists/{playlist_id}", response_model=Playlist)
async def update_playlist(playlist_id: str, playlist_update: PlaylistUpdate):
    existing = await db.playlists.find_one({"id": playlist_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    update_dict = {k: v for k, v in playlist_update.dict().items() if v is not None}
    update_dict["updated_date"] = datetime.utcnow()
    
    await db.playlists.update_one({"id": playlist_id}, {"$set": update_dict})
    updated_playlist = await db.playlists.find_one({"id": playlist_id})
    return Playlist(**updated_playlist)

@api_router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str):
    result = await db.playlists.delete_one({"id": playlist_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"message": "Playlist deleted successfully"}

# User settings endpoints
@api_router.get("/settings", response_model=UserSettings)
async def get_settings():
    settings = await db.settings.find_one({})
    if not settings:
        # Create default settings
        default_settings = UserSettings()
        await db.settings.insert_one(default_settings.dict())
        return default_settings
    return UserSettings(**settings)

@api_router.put("/settings", response_model=UserSettings)
async def update_settings(settings_update: UserSettingsUpdate):
    existing = await db.settings.find_one({})
    if not existing:
        # Create new settings
        update_dict = {k: v for k, v in settings_update.dict().items() if v is not None}
        new_settings = UserSettings(**update_dict)
        await db.settings.insert_one(new_settings.dict())
        return new_settings
    
    update_dict = {k: v for k, v in settings_update.dict().items() if v is not None}
    update_dict["updated_date"] = datetime.utcnow()
    
    await db.settings.update_one({"id": existing["id"]}, {"$set": update_dict})
    updated_settings = await db.settings.find_one({"id": existing["id"]})
    return UserSettings(**updated_settings)

# Play history endpoints
@api_router.post("/history")
async def add_play_history(song_id: str, play_duration: int = 0):
    history = PlayHistory(song_id=song_id, play_duration=play_duration)
    await db.play_history.insert_one(history.dict())
    return {"message": "Play history added"}

@api_router.get("/history")
async def get_play_history(limit: int = 50):
    history = await db.play_history.find().sort("played_date", -1).limit(limit).to_list(limit)
    return [PlayHistory(**item) for item in history]

# Random song endpoint
@api_router.get("/songs/random", response_model=Song)
async def get_random_song(folder_paths: Optional[str] = None):
    import random
    
    query = {}
    if folder_paths:
        folder_list = folder_paths.split(",")
        query["folder_path"] = {"$in": folder_list}
    
    # Get all songs matching the query
    all_songs = await db.songs.find(query).to_list(1000)
    
    print(f"DEBUG: Query: {query}")
    print(f"DEBUG: Found {len(all_songs)} songs")
    
    if not all_songs:
        raise HTTPException(status_code=404, detail="No songs found")
    
    # Pick a random song
    random_song = random.choice(all_songs)
    return Song(**random_song)

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
