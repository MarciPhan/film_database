import logging
import aiohttp
from bs4 import BeautifulSoup
import urllib.parse
import re

_LOGGER = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "cs,en-US;q=0.7,en;q=0.3",
    "Referer": "https://www.google.com/"
}

class CSFDScraper:
    """Helper to scrape CSFD.cz."""

    @staticmethod
    async def search(query: str) -> list:
        """Search for movies on CSFD."""
        url = f"https://www.csfd.cz/hledat/?q={urllib.parse.quote(query)}"
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    _LOGGER.error("CSFD search failed: %s", response.status)
                    return []
                html = await response.text()
                
                # If we are redirected to a movie page directly
                if "/film/" in str(response.url):
                    details = await CSFDScraper.parse_movie_page(html, str(response.url))
                    return [details] if details else []

                soup = BeautifulSoup(html, "html.parser")
                results = []
                
                # Parse search results
                # CSFD changed its structure recently, usually it's in .main-column .article
                for item in soup.select("article.article"):
                    title_el = item.select_one("h3.article-title a")
                    if not title_el:
                        continue
                    
                    link = title_el["href"]
                    if not link.startswith("http"):
                        link = f"https://www.csfd.cz{link}"
                    
                    img_el = item.select_one("img")
                    image = img_el["src"] if img_el else ""
                    
                    year_el = item.select_one(".article-info")
                    year = year_el.get_text(strip=True) if year_el else ""
                    
                    results.append({
                        "title": title_el.get_text(strip=True),
                        "url": link,
                        "image": image,
                        "year": year,
                        "type": "series" if "serial" in link.lower() else "movie"
                    })
                    
                return results[:10]

    @staticmethod
    async def parse_movie_page(html: str, url: str) -> dict:
        """Parse movie details from a CSFD page."""
        soup = BeautifulSoup(html, "html.parser")
        
        title_el = soup.select_one("h1")
        title = title_el.get_text(strip=True) if title_el else "Unknown"
        
        # Rating
        rating_el = soup.select_one(".box-rating .rating-average")
        rating = rating_el.get_text(strip=True) if rating_el else "0%"
        
        # Poster
        poster_el = soup.select_one(".box-image img")
        poster = poster_el["src"] if poster_el else ""
        if poster.startswith("//"):
            poster = f"https:{poster}"
            
        # Genres
        genres_el = soup.select_one(".genres")
        genres = [g.strip() for g in genres_el.get_text().split("/")] if genres_el else []
        
        # Origin (Year, Country, Runtime)
        origin_el = soup.select_one(".origin")
        origin_text = origin_el.get_text(strip=True) if origin_el else ""
        
        # Episodes (for series)
        episodes = []
        episode_list = soup.select(".box-series-episodes li")
        for ep in episode_list:
            ep_link = ep.select_one("a")
            if ep_link:
                episodes.append({
                    "title": ep_link.get_text(strip=True),
                    "url": f"https://www.csfd.cz{ep_link['href']}" if ep_link['href'].startswith("/") else ep_link['href']
                })

        return {
            "title": title,
            "url": url,
            "rating": rating,
            "poster": poster,
            "genres": genres,
            "origin": origin_text,
            "episodes": episodes,
            "type": "series" if episodes else "movie",
            "id": url.split("/")[-2] if "/film/" in url else ""
        }

    @staticmethod
    async def get_details(url: str) -> dict:
        """Fetch details for a specific CSFD URL."""
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    return {}
                html = await response.text()
                return await CSFDScraper.parse_movie_page(html, url)

async def get_hellspy_video_url(title: str, episode_title: str = None, language: str = "CZ") -> str:
    """Search Hellspy and return the first result URL."""
    query = title
    if episode_title:
        query = f"{title} {episode_title}"
    
    if language == "CZ":
        query += " cz dabing"
    
    search_url = f"https://hellspy.to/?query={urllib.parse.quote(query)}"
    try:
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            async with session.get(search_url, timeout=10) as resp:
                if resp.status != 200:
                    return search_url
                html = await resp.text()
                soup = BeautifulSoup(html, "html.parser")
                # First video link usually follows this pattern in their HTML
                first_result = soup.select_one("a[href*='/video/']")
                if first_result:
                    link = first_result["href"]
                    return f"https://hellspy.to{link}" if link.startswith("/") else link
    except Exception as e:
        _LOGGER.debug("Hellspy direct search failed: %s", e)
    
    return search_url

def get_recommendations(watched_data: dict, all_movies: dict) -> list:
    """Simple recommendation engine based on genres."""
    # Count genre occurrences in watched movies
    genre_scores = {}
    for movie in watched_data.values():
        weight = 1
        # If rating was high, give more weight (placeholder for rating feature)
        # weight = 2 if movie.get('rating_stars', 0) >= 4 else 1
        for genre in movie.get('genres', []):
            genre_scores[genre] = genre_scores.get(genre, 0) + weight
            
    if not genre_scores:
        return []
        
    # Sort genres by score
    top_genres = sorted(genre_scores.items(), key=lambda x: x[1], reverse=True)[:3]
    top_genre_names = [g[0] for g in top_genres]
    
    # Recommendation logic (placeholder: in real app we might search CSFD for top movies in these genres)
    # For now, we just return the genres as "Recommended Genres"
    return top_genre_names
