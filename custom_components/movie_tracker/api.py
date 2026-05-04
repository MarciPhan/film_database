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
                        is_series = "seriál" in title.lower() or "seriál" in alt.lower() or item.get("typ") == "tvSeries"
                        
                        results.append({
                            "id": str(item.get("id")),
                            "csfd_id": str(item.get("csfd_id")),
                            "title": title,
                            "year": str(item.get("rok")),
                            "url": item.get("csfd_url"),
                            "image": item.get("obrazek_url") or item.get("imgo") or f"https://via.placeholder.com/300x450?text={urllib.parse.quote(title)}",
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

                    # If it's a series, try to fetch episodes from SerialZone (much more reliable for bots)
                    if is_series:
                        try:
                            # Search SerialZone by title
                            search_url = f"https://www.serialzone.cz/hledani/?q={urllib.parse.quote(title)}"
                            async with session.get(search_url, timeout=5) as sz_resp:
                                if sz_resp.status == 200:
                                    sz_html = await sz_resp.text()
                                    if "/serial/" in sz_html:
                                        # Find the first serial link
                                        match = re.search(r'href="(/serial/[^/]+/)', sz_html)
                                        if match:
                                            ep_page_url = f"https://www.serialzone.cz{match.group(1)}epizody/"
                                            async with session.get(ep_page_url, timeout=5) as ep_resp:
                                                if ep_resp.status == 200:
                                                    ep_html = await ep_resp.text()
                                                    # Parse episodes (simple regex for speed and reliability)
                                                    ep_matches = re.findall(r'href="(/epizoda/[^"]+)">(.*?)</a>', ep_html)
                                                    for href, ep_title in ep_matches:
                                                        if ep_title and "<" not in ep_title:
                                                            details["episodes"].append({
                                                                "title": ep_title.strip(),
                                                                "url": f"https://www.serialzone.cz{href}"
                                                            })
                        except Exception as e:
                            _LOGGER.debug("SerialZone fallback failed: %s", e)

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
