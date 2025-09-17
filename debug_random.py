#!/usr/bin/env python3
import requests
import json

# Test the random endpoint
url = "http://localhost:8001/api/songs/random"
try:
    response = requests.get(url)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Random song: {data['title']} by {data['artist']}")
    else:
        print("Failed to get random song")
        
    # Also test with folder filter
    url_with_folder = "http://localhost:8001/api/songs/random?folder_paths=/music/folder"
    response2 = requests.get(url_with_folder)
    print(f"\nWith folder filter:")
    print(f"Status Code: {response2.status_code}")
    print(f"Response: {response2.text}")
    
except Exception as e:
    print(f"Error: {e}")