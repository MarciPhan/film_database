import asyncio
import sys
import os

# Add custom_components to path
sys.path.append(os.path.join(os.path.dirname(__file__), "custom_components"))

from movie_tracker.api import search_movies, get_details, CSFDScraper

async def test():
    print("Searching for 'Stranger Things'...")
    # Using the new API directly
    results = await search_movies("Stranger Things", tmdb_api_key="")
    for r in results:
        print(f"- {r['title']} ({r['year']}): {r['id']}")
    
    if results:
        print("\nFetching details for the first result...")
        details = await get_details(results[0]['title'], tmdb_api_key="")
        print(f"Title: {details['title']}")
        print(f"Rating: {details['rating']}")
        print(f"Genres: {details['genres']}")
        
    print("\nTesting compatibility class CSFDScraper...")
    compat_results = await CSFDScraper.search("Inception")
    if compat_results:
        print(f"Found: {compat_results[0]['title']}")

if __name__ == "__main__":
    asyncio.run(test())
