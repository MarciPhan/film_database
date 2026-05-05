import logging
import aiohttp
import urllib.parse
import re
from bs4 import BeautifulSoup

_LOGGER = logging.getLogger(__name__)

# CZDB API configuration
CZDB_BASE_URL = "https://api.czdb.cz"

class SerialZoneScraper:
    """Helper to scrape episodes from SerialZone.cz."""
    BASE_URL = "https://www.serialzone.cz"

    @staticmethod
    async def get_episodes(title: str) -> list:
        """Search for a series and return its episodes."""
        search_url = f"{SerialZoneScraper.BASE_URL}/hledani/?co={urllib.parse.quote(title)}"
        headers = {"User-Agent": "Mozilla/5.0"}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(search_url, headers=headers, allow_redirects=True, timeout=10) as response:
                    final_url = str(response.url)
                    
                    if "/serial/" not in final_url:
                        html = await response.text()
                        soup = BeautifulSoup(html, "html.parser")
                        link = soup.find("a", href=re.compile(r"^/serial/"))
                        if link:
                            final_url = SerialZoneScraper.BASE_URL + link["href"]
                        else:
                            return []

                    if not final_url.endswith("/epizody/"):
                        if final_url.endswith("/"):
                            final_url += "epizody/"
                        else:
                            final_url += "/epizody/"

                    async with session.get(final_url, headers=headers, timeout=10) as ep_resp:
                        if ep_resp.status != 200:
                            return []
                        
                        html = await ep_resp.text()
                        soup = BeautifulSoup(html, "html.parser")
                        episodes = []
                        
                        for container in soup.select("div.subs"):
                            link = container.select_one("a.suname")
                            if link:
                                ep_title = link.text.strip()
                                ep_url = link.get("href")
                                if not ep_url.startswith("http"):
                                    ep_url = SerialZoneScraper.BASE_URL + ep_url
                                
                                episodes.append({
                                    "title": ep_title,
                                    "url": ep_url
                                })
                        return episodes
        except Exception as e:
            _LOGGER.warning("SerialZone scrape failed: %s", e)
            return []

class CSFDScraper:
    """Helper to get movie data using CZDB API."""

    @staticmethod
    async def search(query: str, tmdb_api_key: str = None) -> list:
        """Search for movies/series using CZDB API and optional TMDb posters."""
        url = f"{CZDB_BASE_URL}/search?q={urllib.parse.quote(query)}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=10) as response:
                    if response.status != 200:
                        _LOGGER.warning("CZDB search returned status %s", response.status)
                        return []
                    data = await response.json()
                    if not data or data.get("response") != "True":
                        return []
                    
                    results = []
                    for item in data.get("results", []):
                        title = item.get("nazev", "Neznámý název")
                        alt = item.get("alt_nazev", "")
                        
                        # Enhanced series detection
                        is_series = (
                            item.get("typ") in ["tvSeries", "series", "seriál"] or
                            item.get("cas") == "N/A" or
                            "seriál" in title.lower() or
                            "seriál" in alt.lower()
                        )
                        
                        poster = item.get("obrazek_url") or item.get("imgo") or ""
                        
                        # Enhancement: Fetch better poster from TMDb if key is available
                        if tmdb_api_key:
                            try:
                                t_type = "tv" if is_series else "movie"
                                t_url = f"https://api.themoviedb.org/3/search/{t_type}?api_key={tmdb_api_key}&query={urllib.parse.quote(title)}&language=cs-CZ"
                                async with session.get(t_url, timeout=2) as t_resp:
                                    if t_resp.status == 200:
                                        t_data = await t_resp.json()
                                        if t_data.get("results") and t_data["results"][0].get("poster_path"):
                                            poster = f"https://image.tmdb.org/t/p/w342{t_data['results'][0]['poster_path']}"
                            except: pass

                        results.append({
                            "id": str(item.get("id")),
                            "csfd_id": str(item.get("csfd_id")),
                            "title": title,
                            "year": str(item.get("rok", "N/A")),
                            "url": item.get("csfd_url"),
                            "poster": poster,
                            "type": "series" if is_series else "movie"
                        })
                    return results[:20]
        except Exception as e:
            _LOGGER.error("CZDB search failed: %s", e)
            return []

    @staticmethod
    async def get_details(movie_id: str, title: str = None, tmdb_api_key: str = None) -> dict:
        """Fetch details for a specific movie using CZDB API and optional TMDb."""
        if (not movie_id or "-" in movie_id or not movie_id.isdigit()) and title:
            _LOGGER.debug("ID missing or invalid for %s, searching by title", title)
            search_results = await CSFDScraper.search(title)
            if search_results:
                movie_id = search_results[0]["id"]
            else:
                return {}

        url = f"{CZDB_BASE_URL}/search?id={movie_id}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=10) as response:
                    if response.status != 200:
                        return {}
                    data = await response.json()
                    if not data or data.get("response") != "True" or not data.get("results"):
                        return {}
                    
                    item = data["results"][0]
                    title = item.get("nazev", "Neznámý název")
                    plot = item.get("plot", "")
                    
                    # Better series detection
                    is_series = (
                        item.get("typ") in ["series", "tvSeries", "seriál"] or 
                        "seriál" in plot.lower() or 
                        "seriálu" in plot.lower() or
                        item.get("cas") == "N/A"
                    )
                    
                    details = {
                        "id": str(item.get("id")),
                        "title": title,
                        "year": str(item.get("rok", "N/A")),
                        "rating": item.get("hodnoceni", "0%"),
                        "poster": item.get("obrazek_url"),
                        "genres": [g.strip() for g in item.get("zanr", "").split(",")] if item.get("zanr") else [],
                        "origin": f"{item.get('zeme', 'Neznámý původ')} ({item.get('rok', '')})",
                        "description": plot,
                        "url": item.get("csfd_url"),
                        "type": "series" if is_series else "movie",
                        "episodes": []
                    }

                    # --- EPISODES FETCHING ---
                    if is_series:
                        # Priority 1: TMDb (if key provided)
                        if tmdb_api_key:
                            try:
                                _LOGGER.debug("Fetching episodes from TMDb for: %s", title)
                                tmdb_search = f"https://api.themoviedb.org/3/search/tv?api_key={tmdb_api_key}&query={urllib.parse.quote(title)}&language=cs-CZ"
                                async with session.get(tmdb_search, timeout=5) as tmdb_resp:
                                    if tmdb_resp.status == 200:
                                        tmdb_data = await tmdb_resp.json()
                                        if tmdb_data.get("results"):
                                            tmdb_item = tmdb_data["results"][0]
                                            tmdb_id = tmdb_item["id"]
                                            if tmdb_item.get("poster_path"):
                                                details["poster"] = f"https://image.tmdb.org/t/p/w600_and_h900_bestv2{tmdb_item['poster_path']}"
                                            
                                            details_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}?api_key={tmdb_api_key}&language=cs-CZ"
                                            async with session.get(details_url, timeout=5) as det_resp:
                                                if det_resp.status == 200:
                                                    full_data = await det_resp.json()
                                                    for season in full_data.get("seasons", []):
                                                        s_num = season.get("season_number")
                                                        if s_num == 0: continue
                                                        
                                                        s_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{s_num}?api_key={tmdb_api_key}&language=cs-CZ"
                                                        async with session.get(s_url, timeout=5) as s_resp:
                                                            if s_resp.status == 200:
                                                                s_data = await s_resp.json()
                                                                for ep in s_data.get("episodes", []):
                                                                    details["episodes"].append({
                                                                        "title": f"S{s_num}E{ep.get('episode_number')} - {ep.get('name')}",
                                                                        "url": f"https://www.themoviedb.org/tv/{tmdb_id}/season/{s_num}/episode/{ep.get('episode_number')}"
                                                                    })
                            except Exception as e:
                                _LOGGER.warning("TMDb enhancement failed: %s", e)

                        # Priority 2: SerialZone (if TMDb failed or no key)
                        if not details["episodes"]:
                            _LOGGER.debug("Fetching episodes from SerialZone for: %s", title)
                            details["episodes"] = await SerialZoneScraper.get_episodes(title)

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
