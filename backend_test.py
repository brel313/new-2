#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Music Player
Tests all endpoints with proper error handling and data validation
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Get backend URL from frontend .env
BACKEND_URL = "https://pova-music-player.preview.emergentagent.com/api"

class MusicPlayerAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.test_results = []
        self.created_song_id = None
        self.created_playlist_id = None
        
    def log_test(self, test_name, success, message, response_data=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        if response_data:
            result["response"] = response_data
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        
    def test_api_health(self):
        """Test basic API health check"""
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "Music Player API" in data["message"]:
                    self.log_test("API Health Check", True, "API is responding correctly", data)
                    return True
                else:
                    self.log_test("API Health Check", False, f"Unexpected response format: {data}")
            else:
                self.log_test("API Health Check", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("API Health Check", False, f"Connection error: {str(e)}")
        return False
    
    def test_add_song(self):
        """Test adding a new song"""
        song_data = {
            "title": "Bohemian Rhapsody",
            "artist": "Queen",
            "album": "A Night at the Opera",
            "duration": 355,
            "file_path": "/music/queen/bohemian_rhapsody.mp3",
            "folder_path": "/music/queen",
            "format": "mp3",
            "size": 8542880
        }
        
        try:
            response = self.session.post(f"{self.base_url}/songs", json=song_data)
            if response.status_code == 200:
                data = response.json()
                if "id" in data and data["title"] == song_data["title"]:
                    self.created_song_id = data["id"]
                    self.log_test("Add Song", True, f"Song added successfully with ID: {data['id']}", data)
                    return True
                else:
                    self.log_test("Add Song", False, f"Invalid response format: {data}")
            else:
                self.log_test("Add Song", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Add Song", False, f"Request error: {str(e)}")
        return False
    
    def test_get_all_songs(self):
        """Test retrieving all songs"""
        try:
            response = self.session.get(f"{self.base_url}/songs")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Get All Songs", True, f"Retrieved {len(data)} songs", {"count": len(data)})
                    return True
                else:
                    self.log_test("Get All Songs", False, f"Expected list, got: {type(data)}")
            else:
                self.log_test("Get All Songs", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get All Songs", False, f"Request error: {str(e)}")
        return False
    
    def test_get_specific_song(self):
        """Test retrieving a specific song by ID"""
        if not self.created_song_id:
            self.log_test("Get Specific Song", False, "No song ID available for testing")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/songs/{self.created_song_id}")
            if response.status_code == 200:
                data = response.json()
                if data["id"] == self.created_song_id:
                    self.log_test("Get Specific Song", True, f"Retrieved song: {data['title']}", data)
                    return True
                else:
                    self.log_test("Get Specific Song", False, f"ID mismatch: expected {self.created_song_id}, got {data.get('id')}")
            elif response.status_code == 404:
                self.log_test("Get Specific Song", False, "Song not found (404)")
            else:
                self.log_test("Get Specific Song", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Specific Song", False, f"Request error: {str(e)}")
        return False
    
    def test_random_song(self):
        """Test getting a random song"""
        try:
            response = self.session.get(f"{self.base_url}/songs/random")
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "title" in data:
                    self.log_test("Get Random Song", True, f"Got random song: {data['title']}", data)
                    return True
                else:
                    self.log_test("Get Random Song", False, f"Invalid song format: {data}")
            elif response.status_code == 404:
                self.log_test("Get Random Song", True, "No songs available for random selection (expected)")
                return True
            else:
                self.log_test("Get Random Song", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Random Song", False, f"Request error: {str(e)}")
        return False
    
    def test_add_favorite(self):
        """Test adding a song to favorites"""
        if not self.created_song_id:
            self.log_test("Add Favorite", False, "No song ID available for testing")
            return False
            
        favorite_data = {"song_id": self.created_song_id}
        
        try:
            response = self.session.post(f"{self.base_url}/favorites", json=favorite_data)
            if response.status_code == 200:
                data = response.json()
                if data["song_id"] == self.created_song_id:
                    self.log_test("Add Favorite", True, f"Added song to favorites: {data['id']}", data)
                    return True
                else:
                    self.log_test("Add Favorite", False, f"Song ID mismatch in favorite: {data}")
            else:
                self.log_test("Add Favorite", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Add Favorite", False, f"Request error: {str(e)}")
        return False
    
    def test_get_favorites(self):
        """Test retrieving all favorites"""
        try:
            response = self.session.get(f"{self.base_url}/favorites")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Get Favorites", True, f"Retrieved {len(data)} favorites", {"count": len(data)})
                    return True
                else:
                    self.log_test("Get Favorites", False, f"Expected list, got: {type(data)}")
            else:
                self.log_test("Get Favorites", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Favorites", False, f"Request error: {str(e)}")
        return False
    
    def test_user_settings(self):
        """Test user settings endpoints"""
        # Test GET settings
        try:
            response = self.session.get(f"{self.base_url}/settings")
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "volume" in data:
                    self.log_test("Get Settings", True, "Retrieved user settings", data)
                else:
                    self.log_test("Get Settings", False, f"Invalid settings format: {data}")
                    return False
            else:
                self.log_test("Get Settings", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Get Settings", False, f"Request error: {str(e)}")
            return False
        
        # Test PUT settings
        settings_update = {
            "selected_folders": ["/music", "/downloads/music"],
            "shuffle_mode": True,
            "repeat_mode": "all",
            "volume": 0.8,
            "equalizer_preset": "rock"
        }
        
        try:
            response = self.session.put(f"{self.base_url}/settings", json=settings_update)
            if response.status_code == 200:
                data = response.json()
                if data["volume"] == 0.8 and data["shuffle_mode"] == True:
                    self.log_test("Update Settings", True, "Settings updated successfully", data)
                    return True
                else:
                    self.log_test("Update Settings", False, f"Settings not updated correctly: {data}")
            else:
                self.log_test("Update Settings", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Update Settings", False, f"Request error: {str(e)}")
        return False
    
    def test_create_playlist(self):
        """Test creating a playlist"""
        playlist_data = {
            "name": "My Rock Playlist",
            "song_ids": [self.created_song_id] if self.created_song_id else []
        }
        
        try:
            response = self.session.post(f"{self.base_url}/playlists", json=playlist_data)
            if response.status_code == 200:
                data = response.json()
                if data["name"] == playlist_data["name"]:
                    self.created_playlist_id = data["id"]
                    self.log_test("Create Playlist", True, f"Playlist created: {data['name']}", data)
                    return True
                else:
                    self.log_test("Create Playlist", False, f"Playlist name mismatch: {data}")
            else:
                self.log_test("Create Playlist", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Create Playlist", False, f"Request error: {str(e)}")
        return False
    
    def test_get_playlists(self):
        """Test retrieving all playlists"""
        try:
            response = self.session.get(f"{self.base_url}/playlists")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Get Playlists", True, f"Retrieved {len(data)} playlists", {"count": len(data)})
                    return True
                else:
                    self.log_test("Get Playlists", False, f"Expected list, got: {type(data)}")
            else:
                self.log_test("Get Playlists", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Playlists", False, f"Request error: {str(e)}")
        return False
    
    def test_update_playlist(self):
        """Test updating a playlist"""
        if not self.created_playlist_id:
            self.log_test("Update Playlist", False, "No playlist ID available for testing")
            return False
            
        update_data = {
            "name": "Updated Rock Playlist",
            "song_ids": [self.created_song_id] if self.created_song_id else []
        }
        
        try:
            response = self.session.put(f"{self.base_url}/playlists/{self.created_playlist_id}", json=update_data)
            if response.status_code == 200:
                data = response.json()
                if data["name"] == update_data["name"]:
                    self.log_test("Update Playlist", True, f"Playlist updated: {data['name']}", data)
                    return True
                else:
                    self.log_test("Update Playlist", False, f"Playlist not updated correctly: {data}")
            else:
                self.log_test("Update Playlist", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Update Playlist", False, f"Request error: {str(e)}")
        return False
    
    def test_play_history(self):
        """Test play history endpoints"""
        if not self.created_song_id:
            self.log_test("Add Play History", False, "No song ID available for testing")
            return False
            
        # Test adding play history
        try:
            response = self.session.post(f"{self.base_url}/history", params={
                "song_id": self.created_song_id,
                "play_duration": 120
            })
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_test("Add Play History", True, "Play history added successfully", data)
                else:
                    self.log_test("Add Play History", False, f"Unexpected response: {data}")
                    return False
            else:
                self.log_test("Add Play History", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Add Play History", False, f"Request error: {str(e)}")
            return False
        
        # Test getting play history
        try:
            response = self.session.get(f"{self.base_url}/history")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_test("Get Play History", True, f"Retrieved {len(data)} history entries", {"count": len(data)})
                    return True
                else:
                    self.log_test("Get Play History", False, f"Expected list, got: {type(data)}")
            else:
                self.log_test("Get Play History", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Get Play History", False, f"Request error: {str(e)}")
        return False
    
    def test_delete_operations(self):
        """Test delete operations"""
        success_count = 0
        
        # Test remove from favorites
        if self.created_song_id:
            try:
                response = self.session.delete(f"{self.base_url}/favorites/{self.created_song_id}")
                if response.status_code == 200:
                    self.log_test("Remove Favorite", True, "Favorite removed successfully")
                    success_count += 1
                else:
                    self.log_test("Remove Favorite", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test("Remove Favorite", False, f"Request error: {str(e)}")
        
        # Test delete playlist
        if self.created_playlist_id:
            try:
                response = self.session.delete(f"{self.base_url}/playlists/{self.created_playlist_id}")
                if response.status_code == 200:
                    self.log_test("Delete Playlist", True, "Playlist deleted successfully")
                    success_count += 1
                else:
                    self.log_test("Delete Playlist", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test("Delete Playlist", False, f"Request error: {str(e)}")
        
        # Test delete song
        if self.created_song_id:
            try:
                response = self.session.delete(f"{self.base_url}/songs/{self.created_song_id}")
                if response.status_code == 200:
                    self.log_test("Delete Song", True, "Song deleted successfully")
                    success_count += 1
                else:
                    self.log_test("Delete Song", False, f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test("Delete Song", False, f"Request error: {str(e)}")
        
        return success_count > 0
    
    def run_all_tests(self):
        """Run all API tests in sequence"""
        print(f"🎵 Starting Music Player API Tests")
        print(f"🔗 Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Run tests in logical order
        tests = [
            self.test_api_health,
            self.test_add_song,
            self.test_get_all_songs,
            self.test_get_specific_song,
            self.test_random_song,
            self.test_add_favorite,
            self.test_get_favorites,
            self.test_user_settings,
            self.test_create_playlist,
            self.test_get_playlists,
            self.test_update_playlist,
            self.test_play_history,
            self.test_delete_operations
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ FAIL {test.__name__}: Unexpected error: {str(e)}")
                failed += 1
            print()  # Add spacing between tests
        
        print("=" * 60)
        print(f"📊 Test Results Summary:")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📈 Success Rate: {(passed/(passed+failed)*100):.1f}%")
        
        return passed, failed, self.test_results

def main():
    """Main test execution"""
    tester = MusicPlayerAPITester()
    passed, failed, results = tester.run_all_tests()
    
    # Save detailed results to file
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump({
            "summary": {
                "passed": passed,
                "failed": failed,
                "total": passed + failed,
                "success_rate": (passed/(passed+failed)*100) if (passed+failed) > 0 else 0
            },
            "tests": results,
            "timestamp": datetime.now().isoformat()
        }, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: /app/backend_test_results.json")
    
    # Return appropriate exit code
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())