import logging
import aiohttp
import urllib.parse
import re

_LOGGER = logging.getLogger(__name__)

# CZDB API configuration
CZDB_BASE_URL = "http://api.czdb.cz"

class CSFDScraper:
    """Helper to get movie data using CZDB API (as a fallback/primary for CSFD)."""

    @staticmethod
    async def search(query: str) -> list:
        """Search for movies/series using CZDB API."""
        url = f"{CZDB_BASE_URL}/search?q={urllib.parse.quote(query)}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=10) as response:
                    if response.status != 200:
                        return []
                    data = await response.json()
                    if not data or data.get("response") != "True":
                        return []
                    
                    results = []
                    for item in data.get("results", []):
                        results.append({
                            "id": str(item.get("id")),
                            "csfd_id": str(item.get("csfd_id")),
                            "title": item.get("nazev"),
                            "year": str(item.get("rok")),
                            "url": item.get("csfd_url"),
                            "image": item.get("obrazek_url") or f"https://via.placeholder.com/300x450?text={urllib.parse.quote(item.get('nazev'))}",
                            "type": "series" if "seriál" in item.get("nazev", "").lower() or item.get("typ") == "tvSeries" else "movie"
                        })
                    return results[:15]
        except Exception as e:
            _LOGGER.error("CZDB search failed: %s", e)
            return []

    @staticmethod
    async def get_details(movie_url_or_id: str) -> dict:
        """Fetch details for a specific movie using CZDB API."""
        # Check if it's a numeric ID or a URL
        if movie_url_or_id.startswith("http"):
            query_param = f"url={urllib.parse.quote(movie_url_or_id)}"
        else:
            query_param = f"id={movie_url_or_id}"
            
        url = f"{CZDB_BASE_URL}/search?{query_param}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=10) as response:
                    if response.status != 200:
                        return {}
                    data = await response.json()
                    if not data or data.get("response") != "True" or not data.get("results"):
                        return {}
                    
                    item = data["results"][0]
                    return {
                        "id": str(item.get("id")),
                        "title": item.get("nazev"),
                        "year": str(item.get("rok")),
                        "rating": item.get("hodnoceni", "0%"),
                        "poster": item.get("obrazek_url"),
                        "genres": [g.strip() for g in item.get("zanr", "").split(",")] if item.get("zanr") else [],
                        "origin": f"{item.get('zeme', '')} ({item.get('rok', '')})",
                        "description": item.get("plot", ""),
                        "url": item.get("csfd_url"),
                        "type": "series" if item.get("typ") == "tvSeries" else "movie",
                        "episodes": [] # CZDB might not have full episode list in this format, but we can handle it
                    }
        except Exception as e:
            _LOGGER.error("CZDB detail fetch failed: %s", e)
            return {}

async def get_hellspy_video_url(title: str, language: str = "CZ") -> str:
    """Return direct search URL for Hellspy."""
    query = title
    if language == "CZ":
        query += " cz dabing"
    
    # We return the search URL directly for now as it's more reliable than scraping results
    return f"https://hellspy.to/?query={urllib.parse.quote(query)}"

def get_recommendations(watched_data: dict, all_movies: dict) -> list:
    """Simple recommendation engine based on genres."""
    genre_scores = {}
    for movie in watched_data.values():
        for genre in movie.get('genres', []):
            genre_scores[genre] = genre_scores.get(genre, 0) + 1
            
    if not genre_scores:
        return []
        
    top_genres = sorted(genre_scores.items(), key=lambda x: x[1], reverse=True)[:3]
    return [g[0] for g in top_genres]
