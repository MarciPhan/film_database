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
                        title = item.get("nazev", "")
                        alt = item.get("alt_nazev", "")
                        # Smart series detection via API data
                        is_series = (
                            item.get("typ") in ["tvSeries", "series"] or
                            item.get("cas") == "N/A" or
                            "seriál" in title.lower() or
                            "seriál" in alt.lower()
                        )
                        
                        image = item.get("obrazek_url") or item.get("imgo")
                        if not image or "pmgstatic" in image or "via.placeholder" in image:
                            image = ""
                        
                        results.append({
                            "id": str(item.get("id")),
                            "csfd_id": str(item.get("csfd_id")),
                            "title": title,
                            "year": str(item.get("rok")),
                            "url": item.get("csfd_url"),
                            "image": image,
                            "type": "series" if is_series else "movie"
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
                    title = item.get("nazev", "")
                    plot = item.get("plot", "")
                    
                    # Better series detection
                    is_series = (
                        item.get("typ") in ["series", "tvSeries"] or 
                        "seriál" in plot.lower() or 
                        "seriálu" in plot.lower() or
                        item.get("cas") == "N/A"
                    )
                    
                    details = {
                        "id": str(item.get("id")),
                        "title": title,
                        "year": str(item.get("rok")),
                        "rating": item.get("hodnoceni", "0%"),
                        "poster": item.get("obrazek_url"),
                        "genres": [g.strip() for g in item.get("zanr", "").split(",")] if item.get("zanr") else [],
                        "origin": f"{item.get('zeme', '')} ({item.get('rok', '')})",
                        "description": plot,
                        "url": item.get("csfd_url"),
                        "type": "series" if is_series else "movie",
                        "episodes": []
                    }

                    # --- EPISODES FETCHING (TMDb is priority) ---
                    if is_series:
                        _LOGGER.debug("Fetching episodes for series: %s", title)
                        try:
                            # Use TMDb - it's the most reliable
                            tmdb_search = f"https://api.themoviedb.org/3/search/tv?api_key=fba01042790176412f7161b9a953e5e0&query={urllib.parse.quote(title)}&language=cs-CZ"
                            async with session.get(tmdb_search, timeout=5) as tmdb_resp:
                                if tmdb_resp.status == 200:
                                    tmdb_data = await tmdb_resp.json()
                                    if tmdb_data.get("results"):
                                        tmdb_id = tmdb_data["results"][0]["id"]
                                        # Now get ALL seasons and episodes
                                        details_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}?api_key=fba01042790176412f7161b9a953e5e0&language=cs-CZ"
                                        async with session.get(details_url, timeout=5) as det_resp:
                                            if det_resp.status == 200:
                                                full_data = await det_resp.json()
                                                for season in full_data.get("seasons", []):
                                                    s_num = season.get("season_number")
                                                    if s_num == 0: continue # Skip specials
                                                    # Get episodes for this season
                                                    s_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{s_num}?api_key=fba01042790176412f7161b9a953e5e0&language=cs-CZ"
                                                    async with session.get(s_url, timeout=5) as s_resp:
                                                        if s_resp.status == 200:
                                                            s_data = await s_resp.json()
                                                            for ep in s_data.get("episodes", []):
                                                                details["episodes"].append({
                                                                    "title": f"S{s_num}E{ep.get('episode_number')} - {ep.get('name')}",
                                                                    "url": f"https://www.themoviedb.org/tv/{tmdb_id}/season/{s_num}/episode/{ep.get('episode_number')}"
                                                                })
                                        
                                        # Update poster from TMDb too
                                        if tmdb_data["results"][0].get("poster_path"):
                                            details["poster"] = f"https://image.tmdb.org/t/p/w500{tmdb_data['results'][0]['poster_path']}"
                        except Exception as e:
                            _LOGGER.debug("TMDb episodes failed: %s", e)

                    return details
        except Exception as e:
            _LOGGER.error("CZDB detail fetch failed: %s", e)
            return {}

async def get_hellspy_video_url(title: str, language: str = "CZ") -> str:
    """Search Hellspy and return the first result URL directly."""
    query = title
    if language == "CZ":
        query += " cz dabing"
    
    search_url = f"https://hellspy.to/?query={urllib.parse.quote(query)}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(search_url, timeout=10) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(html, "html.parser")
                    # Find the first link that contains '/video/'
                    first_video = soup.select_one("a[href*='/video/']")
                    if first_video:
                        href = first_video.get("href")
                        return f"https://hellspy.to{href}" if href.startswith("/") else href
    except Exception as e:
        _LOGGER.debug("Failed to scrape Hellspy: %s", e)
    
    return search_url

def get_recommendations(watched_data: dict, wishlist_data: dict) -> list:
    """Recommend movies from wishlist based on watched genres."""
    genre_scores = {}
    for movie in watched_data.values():
        for genre in movie.get('genres', []):
            genre_scores[genre] = genre_scores.get(genre, 0) + 1
            
    if not genre_scores:
        return []
        
    top_genres = sorted(genre_scores.items(), key=lambda x: x[1], reverse=True)[:3]
    top_genre_names = [g[0] for g in top_genres]
    
    recommendations = []
    # Find movies in wishlist that match top genres
    for movie in wishlist_data.values():
        movie_genres = movie.get('genres', [])
        # If any of the movie's genres match our top genres
        if any(g in top_genre_names for g in movie_genres):
            recommendations.append(movie)
            if len(recommendations) >= 6:
                break
                
    return recommendations
