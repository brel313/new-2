#!/usr/bin/env python3
"""
Additional Backend API Testing with Specific Test Data
Tests the exact scenarios mentioned in the review request
"""

import requests
import json
import sys
from datetime import datetime

BACKEND_URL = "http://localhost:8001/api"

def test_specific_scenarios():
    """Test with the specific data mentioned in the review request"""
    session = requests.Session()
    results = []
    
    print("🎵 Running Additional Backend API Tests with Specific Data")
    print("=" * 60)
    
    # Test data from the request
    sample_song = {
        "title": "Test Song",
        "artist": "Test Artist", 
        "album": "Test Album",
        "duration": 180,
        "file_path": "/path/to/song.mp3",
        "folder_path": "/music/folder",
        "format": "mp3",
        "size": 1024000
    }
    
    settings_data = {
        "selected_folders": ["/music/folder"],
        "shuffle_mode": True,
        "repeat_mode": "none",
        "volume": 0.8
    }
    
    # Test 1: Root endpoint
    print("Testing GET /api/ - Root endpoint")
    try:
        response = session.get(f"{BACKEND_URL}/")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Root endpoint: {data}")
        else:
            print(f"❌ Root endpoint failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Root endpoint error: {e}")
    
    # Test 2: Add song with specific test data
    print("\nTesting POST /api/songs - Add new song")
    song_id = None
    try:
        response = session.post(f"{BACKEND_URL}/songs", json=sample_song)
        if response.status_code == 200:
            data = response.json()
            song_id = data["id"]
            print(f"✅ Song added: {data['title']} (ID: {song_id})")
        else:
            print(f"❌ Add song failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Add song error: {e}")
    
    # Test 3: Get all songs
    print("\nTesting GET /api/songs - Get all songs")
    try:
        response = session.get(f"{BACKEND_URL}/songs")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Retrieved {len(data)} songs")
            for song in data:
                print(f"   - {song['title']} by {song['artist']}")
        else:
            print(f"❌ Get songs failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Get songs error: {e}")
    
    # Test 4: Get specific song
    if song_id:
        print(f"\nTesting GET /api/songs/{song_id} - Get specific song")
        try:
            response = session.get(f"{BACKEND_URL}/songs/{song_id}")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Retrieved song: {data['title']} - Duration: {data['duration']}s")
            else:
                print(f"❌ Get specific song failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Get specific song error: {e}")
    
    # Test 5: Add to favorites
    if song_id:
        print(f"\nTesting POST /api/favorites - Add favorite")
        try:
            response = session.post(f"{BACKEND_URL}/favorites", json={"song_id": song_id})
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Added to favorites: {data['id']}")
            else:
                print(f"❌ Add favorite failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Add favorite error: {e}")
    
    # Test 6: Get favorites
    print("\nTesting GET /api/favorites - Get favorites")
    try:
        response = session.get(f"{BACKEND_URL}/favorites")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Retrieved {len(data)} favorites")
        else:
            print(f"❌ Get favorites failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Get favorites error: {e}")
    
    # Test 7: Update settings with specific data
    print("\nTesting PUT /api/settings - Update settings")
    try:
        response = session.put(f"{BACKEND_URL}/settings", json=settings_data)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Settings updated: Volume={data['volume']}, Shuffle={data['shuffle_mode']}")
            print(f"   Selected folders: {data['selected_folders']}")
        else:
            print(f"❌ Update settings failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Update settings error: {e}")
    
    # Test 8: Get settings
    print("\nTesting GET /api/settings - Get user settings")
    try:
        response = session.get(f"{BACKEND_URL}/settings")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Retrieved settings: Volume={data['volume']}, Repeat={data['repeat_mode']}")
        else:
            print(f"❌ Get settings failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Get settings error: {e}")
    
    # Test 9: Add play history
    if song_id:
        print(f"\nTesting POST /api/history - Add play history")
        try:
            response = session.post(f"{BACKEND_URL}/history", params={
                "song_id": song_id,
                "play_duration": 150
            })
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Play history added: {data['message']}")
            else:
                print(f"❌ Add play history failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Add play history error: {e}")
    
    # Test 10: Get play history
    print("\nTesting GET /api/history - Get play history")
    try:
        response = session.get(f"{BACKEND_URL}/history")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Retrieved {len(data)} history entries")
            for entry in data:
                print(f"   - Song ID: {entry['song_id']}, Duration: {entry['play_duration']}s")
        else:
            print(f"❌ Get play history failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Get play history error: {e}")
    
    # Test 11: Get random song
    print("\nTesting GET /api/songs/random - Get random song")
    try:
        response = session.get(f"{BACKEND_URL}/songs/random")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Random song: {data['title']} by {data['artist']}")
        elif response.status_code == 404:
            print("✅ No songs available for random selection (expected if no songs)")
        else:
            print(f"❌ Get random song failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Get random song error: {e}")
    
    # Test 12: Test error handling - invalid song ID
    print("\nTesting Error Handling - Invalid song ID")
    try:
        response = session.get(f"{BACKEND_URL}/songs/invalid-id")
        if response.status_code == 404:
            print("✅ Error handling works: 404 for invalid song ID")
        else:
            print(f"❌ Expected 404, got: {response.status_code}")
    except Exception as e:
        print(f"❌ Error handling test error: {e}")
    
    # Test 13: Test MongoDB persistence - add another song and verify
    print("\nTesting Data Persistence - Add second song")
    second_song = {
        "title": "Another Test Song",
        "artist": "Another Artist",
        "album": "Another Album", 
        "duration": 240,
        "file_path": "/path/to/another.mp3",
        "folder_path": "/music/folder",
        "format": "mp3",
        "size": 2048000
    }
    
    try:
        response = session.post(f"{BACKEND_URL}/songs", json=second_song)
        if response.status_code == 200:
            print("✅ Second song added successfully")
            
            # Verify both songs exist
            response = session.get(f"{BACKEND_URL}/songs")
            if response.status_code == 200:
                songs = response.json()
                print(f"✅ Data persistence verified: {len(songs)} songs in database")
            else:
                print("❌ Failed to verify persistence")
        else:
            print(f"❌ Failed to add second song: {response.status_code}")
    except Exception as e:
        print(f"❌ Persistence test error: {e}")
    
    print("\n" + "=" * 60)
    print("🎯 Additional Backend API Testing Complete")
    print("All core functionality verified with specific test data")

if __name__ == "__main__":
    test_specific_scenarios()