"""Movie Tracker integration for Home Assistant."""
import logging
import os
import time
import uuid
import asyncio
from datetime import datetime

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.storage import Store
from homeassistant.components.http import HomeAssistantView
import homeassistant.util.dt as dt_util

from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION, EVENT_MOVIES_UPDATED
from .api import CSFDScraper, get_hellspy_video_url, get_recommendations

_LOGGER = logging.getLogger(__name__)

async def async_setup(hass: HomeAssistant, config: dict):
    """Set up the component from configuration.yaml."""
    return True

async def async_setup_entry(hass: HomeAssistant, entry):
    """Set up Movie Tracker from a config entry."""
    
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load() or {}
    
    # Ensure structure
    data.setdefault("watched", {})  # id -> movie_details
    data.setdefault("wishlist", {}) # id -> movie_details
    data.setdefault("history", [])  # list of watch events
    data.setdefault("settings", {"language": "CZ"}) # User settings
    
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = data

    async def _save():
        await store.async_save(data)
        hass.bus.async_fire(EVENT_MOVIES_UPDATED)

    # --- HTTP Views ---
    
    class PanelJsView(HomeAssistantView):
        url = "/movie_tracker_static/panel.js"
        name = "api:movie_tracker:panel"
        requires_auth = False
        async def get(self, request):
            from aiohttp import web
            path = os.path.join(os.path.dirname(__file__), "www", "panel.js")
            if not os.path.isfile(path):
                return web.Response(status=404, text="panel.js not found")
            return web.FileResponse(path, headers={"Cache-Control": "no-cache"})

    class DataView(HomeAssistantView):
        url = "/api/movie_tracker/data"
        name = "api:movie_tracker:data"
        requires_auth = True
        async def get(self, request):
            from aiohttp import web
            # Add Hellspy links and recommendations dynamically if needed, 
            # or just serve raw data
            res = dict(data)
            res["recommendations"] = get_recommendations(data["watched"], {})
            return web.json_response(res)

    class SearchView(HomeAssistantView):
        url = "/api/movie_tracker/search"
        name = "api:movie_tracker:search"
        requires_auth = True
        async def get(self, request):
            from aiohttp import web
            query = request.query.get("q", "")
            if not query:
                return web.json_response([])
            results = await CSFDScraper.search(query)
            return web.json_response(results)

    class DetailView(HomeAssistantView):
        url = "/api/movie_tracker/detail"
        name = "api:movie_tracker:detail"
        requires_auth = True
        async def get(self, request):
            from aiohttp import web
            url = request.query.get("url", "")
            if not url:
                return web.json_response({})
            details = await CSFDScraper.get_details(url)
            if details:
                lang = data.get("settings", {}).get("language", "CZ")
                details["hellspy_url"] = await get_hellspy_video_url(details["title"], language=lang)
            return web.json_response(details)

    hass.http.register_view(PanelJsView())
    hass.http.register_view(DataView())
    hass.http.register_view(SearchView())
    hass.http.register_view(DetailView())

    # --- Services ---

    async def handle_movie_action(call: ServiceCall):
        action = call.data.get("action")
        movie = call.data.get("movie") # dict with details
        if not action or not movie:
            return

        movie_id = movie.get("id") or str(uuid.uuid4())
        
        if action == "watch":
            # If it's a series, we might handle episode marking differently 
            # but for now let's just mark the movie/series as watched
            data["watched"][movie_id] = movie
            data["watched"][movie_id]["watched_at"] = dt_util.now().isoformat()
            # Remove from wishlist if present
            data["wishlist"].pop(movie_id, None)
            
        elif action == "wishlist":
            data["wishlist"][movie_id] = movie
            data["wishlist"][movie_id]["added_at"] = dt_util.now().isoformat()
            
        elif action == "delete_watched":
            data["watched"].pop(movie_id, None)
            
        elif action == "delete_wishlist":
            data["wishlist"].pop(movie_id, None)
            
        elif action == "mark_episode":
            # For series: mark specific episode
            ep_url = call.data.get("episode_url")
            if movie_id in data["watched"]:
                target = data["watched"][movie_id]
            elif movie_id in data["wishlist"]:
                target = data["wishlist"][movie_id]
            else:
                target = movie
                data["watched"][movie_id] = target
            
            target.setdefault("watched_episodes", [])
            if ep_url not in target["watched_episodes"]:
                target["watched_episodes"].append(ep_url)
        
        elif action == "update_settings":
            data["settings"].update(call.data.get("settings", {}))
        
        await _save()

    hass.services.async_register(DOMAIN, "movie_action", handle_movie_action)

    # --- Register Panel ---
    try:
        from homeassistant.components.frontend import async_register_built_in_panel
        async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title="Filmotéka",
            sidebar_icon="mdi:movie-roll",
            frontend_url_path="movie-tracker",
            config={
                "_panel_custom": {
                    "name": "movie-tracker-panel",
                    "module_url": f"/movie_tracker_static/panel.js?v={int(time.time())}",
                }
            },
            require_admin=False,
        )
    except Exception as exc:
        _LOGGER.error("Failed to register movie tracker panel: %s", exc)

    return True

async def async_unload_entry(hass: HomeAssistant, entry):
    """Unload a config entry."""
    hass.services.async_remove(DOMAIN, "movie_action")
    hass.data[DOMAIN].pop(entry.entry_id)
    return True
