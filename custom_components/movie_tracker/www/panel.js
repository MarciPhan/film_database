import { LitElement, html, css } from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

class MovieTrackerPanel extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      data: { type: Object },
      tab: { type: String },
      search: { type: String },
      searchResults: { type: Array },
      searching: { type: Boolean },
      selectedMovie: { type: Object },
      loadingDetail: { type: Boolean },
      toast: { type: String },
      filterGenre: { type: String },
      filterType: { type: String },
      sortBy: { type: String },
      selectedSeason: { type: Number },
      discoverResults: { type: Array },
      discoverLoading: { type: Boolean },
      discoverFilters: { type: Object },
      _recommendationCooldowns: { type: Object }
    };
  }

  constructor() {
    super();
    this.data = { watched: {}, wishlist: {}, recommendations: [] };
    this.tab = "dashboard";
    this.search = "";
    this.searchResults = [];
    this.searching = false;
    this.selectedMovie = null;
    this.loadingDetail = false;
    this.toast = "";
    this.filterGenre = "";
    this.filterType = "";
    this.sortBy = "date";
    this.selectedSeason = 0;
    this.discoverResults = [];
    this.discoverLoading = false;
    this.discoverFilters = { type: 'movie', genre: '', year: '', rating: 0 };
    this._dismissedIds = new Set();
    this._recommendationCooldowns = {}; // { movieId: count }
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetch();
    // Listen for updates from other instances
    window.addEventListener("movie_tracker_updated", () => this._fetch());
  }

  async _fetch() {
    if (!this.hass) return;
    try {
      // Manage cooldowns before fetching new recommendations
      const currentRecs = this.data.recommendations || [];
      const newCooldowns = {};
      
      // Decrease existing cooldowns
      for (const id in this._recommendationCooldowns) {
        if (this._recommendationCooldowns[id] > 1) {
          newCooldowns[id] = this._recommendationCooldowns[id] - 1;
        }
      }
      
      // Add current movies to cooldown (if they weren't already in cooldown)
      currentRecs.forEach(m => {
        newCooldowns[m.id] = 5;
      });
      
      this._recommendationCooldowns = newCooldowns;

      const r = await this.hass.fetchWithAuth("/api/movie_tracker/data");
      if (r.ok) {
        this.data = await r.json();
      }
    } catch (e) {
      console.error("Failed to fetch movie data", e);
    }
  }

  async _fetchDiscover() {
    this.discoverLoading = true;
    try {
      const { type, genre, year, rating } = this.discoverFilters;
      let url = `/api/movie_tracker/discover?type=${type}&rating=${rating}`;
      if (genre) url += `&genre=${genre}`;
      if (year) url += `&year=${year}`;
      
      const response = await this.hass.fetchWithAuth(url);
      this.discoverResults = await response.json();
    } catch (e) {
      this._t("Chyba při objevování");
    } finally {
      this.discoverLoading = false;
    }
  }

  _t(m) {
    this.toast = m;
    if (this._toastTimeout) clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => { this.toast = "" }, 3000);
  }

  _svc(s, d) {
    return this.hass.callService("movie_tracker", s, d);
  }

  async _doSearch() {
    if (!this.search.trim()) return;
    this.searching = true;
    this.searchResults = [];
    try {
      const r = await this.hass.fetchWithAuth(`/api/movie_tracker/search?q=${encodeURIComponent(this.search)}`);
      if (r.ok) {
        this.searchResults = await r.json();
        if (this.searchResults.length === 0) {
          this._t("Žádné výsledky nenalezeny");
        }
      }
    } catch (e) {
      this._t("Chyba při vyhledávání");
    } finally {
      this.searching = false;
    }
  }

  async _viewDetail(movie) {
    this.loadingDetail = true;
    this.selectedSeason = 0;
    // Set initial data from search results to avoid blank screen/missing poster
    this.selectedMovie = Object.assign({}, movie);
    
    try {
      const id = movie.id || movie.csfd_id || "";
      const title = movie.title || "";
      const r = await this.hass.fetchWithAuth(`/api/movie_tracker/detail?id=${id}&title=${encodeURIComponent(title)}`);
      if (r.ok) {
        const details = await r.json();
        const localData = this.data.watched[id] || this.data.wishlist[id] || {};
        // Merge order: Search Result < API Details < Local Saved Data
        this.selectedMovie = Object.assign({}, movie, details, localData);
      } else {
        this._t("Nepodařilo se načíst detaily");
      }
    } catch (e) {
      this._t("Chyba načítání detailů");
    } finally {
      this.loadingDetail = false;
    }
  }

  async _action(action, movie, extra = {}) {
    try {
      if (action === 'not_interested') {
        this._dismissedIds.add(movie.id);
        this.requestUpdate();
      }

      await this._svc("movie_action", Object.assign({ action: action, movie: movie }, extra));
      
      const messages = {
        'watch': "Přidáno do shlédnutých",
        'wishlist': "Přidáno do wishlistu",
        'delete_watched': "Odstraněno z knihovny",
        'delete_wishlist': "Odstraněno z wishlistu",
        'update_settings': "Nastavení uloženo"
      };
      
      this._t(messages[action] || "Akce provedena");
      
      if (['watch', 'wishlist'].includes(action)) {
        this.selectedMovie = null;
      }
      
      // Immediate fetch to update UI
      await this._fetch();
    } catch (e) {
      this._t("Akce se nezdařila");
    }
  }

  static get styles() {
    return css`
      :host {
        --primary: #8b5cf6;
        --primary-hover: #7c3aed;
        --primary-gradient: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        --secondary: #10b981;
        --danger: #ef4444;
        --bg-dark: #0f172a;
        --card-bg: rgba(30, 41, 59, 0.6);
        --card-bg-hover: rgba(51, 65, 85, 0.8);
        --border-color: rgba(255, 255, 255, 0.1);
        --text-main: #f8fafc;
        --text-dim: #94a3b8;
        --glass-bg: rgba(15, 23, 42, 0.8);
        --radius: 20px;
        
        display: block;
        min-height: 100vh;
        background: radial-gradient(circle at 0% 0%, #1e1b4b 0%, #0f172a 50%),
                    radial-gradient(circle at 100% 100%, #312e81 0%, #0f172a 50%);
        background-attachment: fixed;
        color: var(--text-main);
        font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
        padding-bottom: 80px;
        -webkit-tap-highlight-color: transparent;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        transition: padding 0.3s ease;
      }

      @media (max-width: 600px) {
        .container {
          padding: 16px 12px;
        }
      }

      .episode-item {
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 16px;
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: all 0.3s ease;
      }
      .episode-item.watched {
        background: rgba(139, 92, 246, 0.08);
        border-color: var(--primary);
      }
      .episode-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .logo {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 28px;
        font-weight: 900;
        letter-spacing: -1px;
        background: linear-gradient(to right, #fff, var(--text-dim));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .logo ha-icon {
        color: var(--primary);
        --mdc-icon-size: 36px;
        filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.5));
      }

      /* Search Bar */
      .search-box {
        position: relative;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid var(--border-color);
        border-radius: 24px;
        padding: 4px 4px 4px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 32px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
        transition: all 0.3s ease;
      }

      .search-box:focus-within {
        border-color: var(--primary);
        background: rgba(255, 255, 255, 0.08);
        box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.15);
      }

      .search-box input {
        flex: 1;
        background: transparent;
        border: none;
        color: white;
        font-size: 16px;
        padding: 12px 0;
        outline: none;
        font-family: inherit;
      }

      .search-box button {
        background: var(--primary-gradient);
        color: white;
        border: none;
        border-radius: 20px;
        padding: 10px 24px;
        font-weight: 800;
        cursor: pointer;
        transition: all 0.3s;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.5px;
      }

      @media (max-width: 600px) {
        .search-box {
          margin-bottom: 24px;
        }
        .search-box button {
          padding: 10px 16px;
        }
      }

      .search-box button:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(139, 92, 246, 0.4);
      }

      @media (max-width: 600px) {
        .search-box {
          padding: 4px 4px 4px 12px;
        }
        .search-box button {
          padding: 8px 16px;
          font-size: 14px;
        }
      }

      /* Tabs */
      .tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 24px;
        padding: 4px;
        background: rgba(0,0,0,0.3);
        border-radius: 16px;
        width: fit-content;
        overflow-x: auto;
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      .tabs::-webkit-scrollbar { display: none; }

      .tab {
        padding: 10px 20px;
        border-radius: 12px;
        cursor: pointer;
        font-weight: 700;
        color: var(--text-dim);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        white-space: nowrap;
        font-size: 14px;
        user-select: none;
      }

      .tab.active {
        background: var(--primary-gradient);
        color: white;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
      }

      @media (max-width: 600px) {
        .tabs {
          display: none;
        }
        .tab {
          padding: 8px 12px;
          flex: 1;
          text-align: center;
          font-size: 13px;
        }
      }

      /* Toolbar */
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 12px;
      }

      .filter-group {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      select {
        background: var(--card-bg);
        color: white;
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 10px 16px;
        font-family: inherit;
        outline: none;
        cursor: pointer;
        transition: all 0.3s;
        font-size: 14px;
        font-weight: 600;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        background-size: 16px;
        padding-right: 36px;
      }

      select:focus {
        border-color: var(--primary);
        background-color: var(--card-bg-hover);
      }

      @media (max-width: 600px) {
        .filter-group {
          width: 100%;
        }
        select {
          flex: 1;
          padding: 8px 12px;
          padding-right: 32px;
        }
      }

      /* Grid */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 20px;
      }

      @media (max-width: 600px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
      }

      /* Carousel */
      .carousel {
        display: flex;
        gap: 16px;
        overflow-x: auto;
        padding-bottom: 20px;
        margin: 0 -20px;
        padding-left: 20px;
        padding-right: 20px;
        scrollbar-width: none;
        -ms-overflow-style: none;
        scroll-snap-type: x proximity;
      }
      .carousel::-webkit-scrollbar { display: none; }
      
      .carousel .movie-card {
        flex: 0 0 160px;
        scroll-snap-align: start;
      }

      @media (max-width: 600px) {
        .carousel {
          gap: 12px;
          margin: 0 -12px;
          padding-left: 12px;
          padding-right: 12px;
        }
        .carousel .movie-card {
          flex: 0 0 140px;
        }
      }

      .movie-card {
        background: var(--card-bg);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        overflow: hidden;
        transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
        cursor: pointer;
        display: flex;
        flex-direction: column;
        position: relative;
        transform-origin: center;
      }

      @media (hover: hover) {
        .movie-card:hover {
          transform: translateY(-8px) scale(1.02);
          border-color: rgba(255,255,255,0.2);
          background: var(--card-bg-hover);
          box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6);
          z-index: 5;
        }
      }

      .poster-wrapper {
        position: relative;
        aspect-ratio: 2/3;
        overflow: hidden;
        background: #1e293b;
      }

      .poster-wrapper img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
      }

      .movie-card:hover .poster-wrapper img {
        transform: scale(1.1);
      }

      .rating-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        padding: 4px 10px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 800;
        border: 1px solid rgba(255,255,255,0.1);
        z-index: 2;
      }

      .btn-dismiss {
        position: absolute;
        top: 10px;
        left: 10px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(239, 68, 68, 0.8);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        z-index: 10;
        border: none;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        opacity: 0;
        transform: scale(0.8);
      }
      
      .movie-card:hover .btn-dismiss {
        opacity: 1;
        transform: scale(1);
      }

      @media (max-width: 600px) {
        .btn-dismiss {
          opacity: 0.8;
          transform: scale(1);
        }
      }

      .rating-high { color: #4ade80; border-color: rgba(74, 222, 128, 0.3); }
      .rating-mid { color: #facc15; border-color: rgba(250, 204, 21, 0.3); }
      .rating-low { color: #f87171; border-color: rgba(248, 113, 113, 0.3); }

      .movie-info {
        padding: 12px;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        background: linear-gradient(to top, rgba(15, 23, 42, 0.4), transparent);
      }

      .movie-title {
        font-size: 14px;
        font-weight: 700;
        margin: 0 0 4px 0;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        color: #fff;
      }

      .movie-meta {
        font-size: 11px;
        color: var(--text-dim);
        font-weight: 600;
      }

      /* Modal */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(2, 6, 23, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
        animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .modal-content {
        background: var(--bg-dark);
        width: 100%;
        max-width: 1000px;
        height: 85vh;
        border-radius: 32px;
        display: grid;
        grid-template-columns: 350px 1fr;
        overflow: hidden;
        position: relative;
        box-shadow: 0 40px 80px -20px rgba(0,0,0,0.8);
        border: 1px solid var(--border-color);
        animation: scaleUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes scaleUp {
        from { transform: scale(0.9) translateY(20px); opacity: 0; }
        to { transform: scale(1) translateY(0); opacity: 1; }
      }

      .modal-close-mobile {
        display: none;
      }

      @media (max-width: 900px) {
        .modal-overlay {
          padding: 0;
        }
        .modal-content {
          grid-template-columns: 1fr;
          height: 100vh;
          border-radius: 0;
          display: flex;
          flex-direction: column;
          background: var(--bg-dark);
        }
        .modal-poster-container {
          display: none;
        }
        .modal-details {
          flex: 1;
          padding: 24px;
          background: var(--bg-dark);
          position: relative;
          z-index: 2;
        }
        .modal-close-mobile {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 100;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.2);
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
      }
      
      .mobile-thumbnail {
        display: none;
        width: 100px;
        height: 150px;
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4);
        border: 1px solid var(--border-color);
        flex-shrink: 0;
      }
      
      @media (max-width: 900px) {
        .mobile-thumbnail {
          display: block;
        }
      }

      .modal-poster-container {
        position: relative;
        width: 100%;
        background: #020617;
      }

      .modal-poster-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(to bottom, transparent 50%, var(--bg-dark));
        display: none;
      }

      @media (max-width: 900px) {
        .modal-poster-overlay {
          display: block;
        }
      }

      .desktop-only { display: flex; }
      @media (max-width: 900px) { .desktop-only { display: none !important; } }

      .modal-poster {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #020617;
        border-right: 1px solid var(--border-color);
      }

      .modal-details {
        padding: 32px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 20px;
        background: linear-gradient(180deg, rgba(30, 41, 59, 0.3) 0%, transparent 100%);
        height: 100%;
        box-sizing: border-box;
        scrollbar-width: thin;
        scrollbar-color: var(--primary) transparent;
      }
      .modal-details::-webkit-scrollbar { width: 6px; }
      .modal-details::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 10px; }

      .modal-details h2 {
        font-size: 32px;
        margin: 0;
        font-weight: 900;
        letter-spacing: -1px;
        line-height: 1.1;
      }

      @media (max-width: 600px) {
        .modal-details {
          padding: 24px;
        }
        .modal-details h2 {
          font-size: 26px;
        }
      }

      .genres {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .genre-tag {
        padding: 6px 14px;
        background: rgba(139, 92, 246, 0.1);
        color: #ddd6fe;
        border: 1px solid rgba(139, 92, 246, 0.2);
        border-radius: 12px;
        font-size: 13px;
        font-weight: 700;
      }

      .plot {
        font-size: 15px;
        line-height: 1.7;
        color: #cbd5e1;
        margin: 0;
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: auto;
        padding-top: 24px;
        border-top: 1px solid var(--border-color);
      }

      .actions-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .btn-hero {
        background: var(--primary-gradient);
        color: white;
        border: none;
        padding: 16px;
        border-radius: 16px;
        font-size: 18px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        cursor: pointer;
        transition: all 0.3s;
        text-decoration: none;
        box-shadow: 0 10px 25px -5px rgba(139, 92, 246, 0.5);
        width: 100%;
        box-sizing: border-box;
      }

      .btn-hero:active {
        transform: scale(0.98);
      }

      .btn-secondary {
        background: rgba(255,255,255,0.05);
        color: white;
        border: 1px solid var(--border-color);
        padding: 12px;
        border-radius: 14px;
        font-weight: 700;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-secondary:hover {
        background: rgba(255,255,255,0.1);
        border-color: rgba(255,255,255,0.2);
      }

      .rating-box {
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--border-color);
        border-radius: 20px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Floating Toast */
      .toast {
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--primary);
        color: white;
        padding: 12px 24px;
        border-radius: 20px;
        font-weight: 700;
        font-size: 14px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        z-index: 2000;
        animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        white-space: nowrap;
      }

      @media (max-width: 600px) {
        .toast {
          bottom: 90px;
          width: 90%;
          text-align: center;
        }
      }

      /* Mobile Nav */
      .mobile-nav {
        display: none;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-top: 1px solid var(--border-color);
        padding: 12px 0;
        z-index: 100;
        justify-content: space-around;
        align-items: center;
        padding-bottom: env(safe-area-inset-bottom, 12px);
      }

      @media (max-width: 600px) {
        .mobile-nav {
          display: flex;
        }
        :host {
          padding-bottom: 100px;
        }
      }

      .nav-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        color: var(--text-dim);
        cursor: pointer;
        transition: all 0.3s;
        font-size: 11px;
        font-weight: 700;
        flex: 1;
      }

      .nav-item.active {
        color: var(--primary);
      }

      .nav-item ha-icon {
        --mdc-icon-size: 24px;
      }

      .nav-item.active ha-icon {
        transform: translateY(-2px);
        filter: drop-shadow(0 0 5px rgba(139, 92, 246, 0.5));
      }

      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slideUp { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      
      .spin {
        animation: spin 1s linear infinite;
        display: inline-block;
      }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      .empty-state {
        text-align: center;
        padding: 80px 20px;
        color: var(--text-dim);
      }
      .empty-state ha-icon {
        --mdc-icon-size: 80px;
        margin-bottom: 24px;
        opacity: 0.2;
      }

    `;
  }

  render() {
    const watched = Object.values(this.data.watched || {});
    const wishlist = Object.values(this.data.wishlist || {});

    return html`
      <div class="container">
        <header>
          <div class="logo">
            <ha-icon icon="mdi:movie-open-play"></ha-icon>
            Filmotéka
          </div>
          <div class="settings-nav" @click=${this._fetch}>
             <ha-icon 
                icon="mdi:refresh" 
                class="${this.loadingDetail ? 'spin' : ''}"
                style="cursor:pointer; opacity:0.7" 
             ></ha-icon>
          </div>
        </header>

        <div class="search-box">
          <ha-icon icon="mdi:magnify" style="opacity: 0.5"></ha-icon>
          <input 
            type="text" 
            placeholder="Hledat film nebo seriál..." 
            .value=${this.search}
            @input=${e => this.search = e.target.value}
            @keyup=${e => e.key === 'Enter' && this._doSearch()}
          >
          <button @click=${this._doSearch} ?disabled=${this.searching}>
            ${this.searching ? html`<ha-circular-progress active size="small"></ha-circular-progress>` : 'Hledat'}
          </button>
        </div>

        <div class="tabs">
          <div class="tab ${this.tab === 'dashboard' ? 'active' : ''}" @click=${() => this.tab = 'dashboard'}>Domů</div>
          <div class="tab ${this.tab === 'discover' ? 'active' : ''}" @click=${() => { this.tab = 'discover'; if (this.discoverResults.length === 0) this._fetchDiscover(); }}>Objevovat</div>
          <div class="tab ${this.tab === 'library' ? 'active' : ''}" @click=${() => this.tab = 'library'}>Filmotéka</div>
          <div class="tab ${this.tab === 'wishlist' ? 'active' : ''}" @click=${() => this.tab = 'wishlist'}>Chci vidět</div>
        </div>

        ${this.searchResults.length > 0 ? html`
          <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin:0">Výsledky hledání</h3>
            <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; border-radius: 10px;" @click=${() => this.searchResults = []}>Zavřít</button>
          </div>
          <div class="grid">
            ${this.searchResults.map(m => this._renderMovieCard(m))}
          </div>
          <div style="height: 40px; border-bottom: 1px solid var(--border-color); margin-bottom: 32px;"></div>
        ` : ''}

        <div class="content-area">
          ${this._renderContent(watched, wishlist)}
        </div>

        ${this.selectedMovie ? this._renderModal() : ''}
        ${this.toast ? html`<div class="toast">${this.toast}</div>` : ''}
      </div>

      <div class="mobile-nav">
        <div class="nav-item ${this.tab === 'dashboard' ? 'active' : ''}" @click=${() => this.tab = 'dashboard'}>
          <ha-icon icon="mdi:home-variant"></ha-icon>
          <span>Domů</span>
        </div>
        <div class="nav-item ${this.tab === 'discover' ? 'active' : ''}" @click=${() => { this.tab = 'discover'; if (this.discoverResults.length === 0) this._fetchDiscover(); }}>
          <ha-icon icon="mdi:compass-outline"></ha-icon>
          <span>Objevovat</span>
        </div>
        <div class="nav-item ${this.tab === 'library' ? 'active' : ''}" @click=${() => this.tab = 'library'}>
          <ha-icon icon="mdi:movie-roll"></ha-icon>
          <span>Knihovna</span>
        </div>
        <div class="nav-item ${this.tab === 'wishlist' ? 'active' : ''}" @click=${() => this.tab = 'wishlist'}>
          <ha-icon icon="mdi:bookmark-outline"></ha-icon>
          <span>Wishlist</span>
        </div>
      </div>
    `;
  }

  _renderContent(watched, wishlist) {
    if (this.tab === 'discover') return this._renderDiscover();
    if (this.tab === 'dashboard') return this._renderHome();
    return this._renderList(watched, wishlist);
  }

  _renderHome() {
    const watchedList = Object.values(this.data.watched || {});
    return html`
      <section>
        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin:0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">✨ Doporučeno pro vás</h3>
          <button class="btn-secondary" style="padding: 6px 12px; font-size: 12px; border-radius: 12px;" 
                  @click=${this._fetch} ?disabled=${this.loadingDetail}>
            <ha-icon icon="mdi:refresh" class="${this.loadingDetail ? 'spin' : ''}" style="--mdc-icon-size: 16px; margin-right: 4px;"></ha-icon> Obnovit
          </button>
        </div>
        
        <div class="carousel" style="margin-bottom: 48px;">
          ${(() => {
            const serverDismissed = Object.keys(this.data.not_interested || {});
            const filtered = (this.data.recommendations || []).filter(m => 
              !this._dismissedIds.has(m.id) && 
              !serverDismissed.includes(m.id) &&
              !this._recommendationCooldowns[m.id]
            );
            if (!filtered.length) return html`<div class="empty-state" style="padding: 40px 0;"><p>Žádná doporučení. Zkuste něco přidat do knihovny!</p></div>`;
            return filtered.map(m => this._renderMovieCard(m, true));
          })()}
        </div>
        
        <h3 style="margin-bottom: 24px; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">🍿 Nedávno shlédnuto</h3>
        ${watchedList.length === 0 ? html`
          <div class="empty-state">
            <ha-icon icon="mdi:movie-open-outline"></ha-icon>
            <p>Zatím jste nic nesledovali. Zkuste něco najít!</p>
          </div>
        ` : html`
          <div class="grid">
            ${watchedList.slice(-6).reverse().map(m => this._renderMovieCard(m))}
          </div>
        `}
      </section>
    `;
  }

  _renderList(watched, wishlist) {
    const list = this.tab === 'library' ? watched : wishlist;
    
    // Filtering and Sorting
    let filtered = list.slice();
    if (this.filterGenre) {
      filtered = filtered.filter(m => m.genres?.includes(this.filterGenre));
    }
    if (this.filterType) {
      filtered = filtered.filter(m => m.type === this.filterType);
    }

    const sorted = filtered.sort((a, b) => {
      if (this.sortBy === 'rating') return (parseInt(b.rating) || 0) - (parseInt(a.rating) || 0);
      if (this.sortBy === 'user_rating') return (b.user_rating || 0) - (a.user_rating || 0);
      if (this.sortBy === 'year') return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
      // Default: date (newest first)
      const dateA = a.watched_at || a.added_at || '';
      const dateB = b.watched_at || b.added_at || '';
      return dateB.localeCompare(dateA);
    });

    let allGenresSet = new Set();
    watched.concat(wishlist).forEach(function(m) {
      if (m.genres) {
        m.genres.forEach(function(g) { allGenresSet.add(g); });
      }
    });
    const allGenres = Array.from(allGenresSet).sort();

    return html`
      <section>
        <div class="toolbar" style="margin-bottom: 24px;">
          <div class="filter-group">
            <select @change=${e => { this.sortBy = e.target.value; this.requestUpdate(); }}>
              <option value="date" ?selected=${this.sortBy === 'date'}>Nejnovější</option>
              <option value="rating" ?selected=${this.sortBy === 'rating'}>Dle ČSFD</option>
              <option value="user_rating" ?selected=${this.sortBy === 'user_rating'}>Moje hodnocení</option>
              <option value="year" ?selected=${this.sortBy === 'year'}>Rok vydání</option>
            </select>
            <select @change=${e => { this.filterGenre = e.target.value; this.requestUpdate(); }}>
              <option value="">Všechny žánry</option>
              ${allGenres.map(g => html`<option value="${g}" ?selected=${this.filterGenre === g}>${g}</option>`)}
            </select>
            <select @change=${e => { this.filterType = e.target.value; this.requestUpdate(); }}>
              <option value="" ?selected=${this.filterType === ''}>Vše</option>
              <option value="movie" ?selected=${this.filterType === 'movie'}>Filmy</option>
              <option value="series" ?selected=${this.filterType === 'series'}>Seriály</option>
            </select>
          </div>
          <div style="font-size: 13px; color: var(--text-dim); font-weight: 700;">
            ${sorted.length} položek
          </div>
        </div>

        ${sorted.length === 0 ? html`
          <div class="empty-state">
            <ha-icon icon="mdi:movie-off-outline"></ha-icon>
            <p>Seznam je zatím prázdný nebo žádný film neodpovídá filtru.</p>
          </div>
        ` : html`
          <div class="grid">
            ${sorted.map(m => this._renderMovieCard(m))}
          </div>
        `}
      </section>
    `;
  }

  _renderMovieCard(m, isRecommendation = false) {
    const ratingVal = parseInt(m.rating) || 0;
    const ratingClass = ratingVal >= 75 ? 'rating-high' : (ratingVal >= 50 ? 'rating-mid' : 'rating-low');
    
    return html`
      <div class="movie-card" @click=${() => this._viewDetail(m)}>
        <div class="poster-wrapper">
          <img src="${m.poster || 'https://dummyimage.com/300x450/1e293b/f8fafc&text=Bez+plakátu'}" loading="lazy"
               @error=${e => e.target.src = 'https://dummyimage.com/300x450/1e293b/f8fafc&text=Bez+plakátu'}>
          ${m.rating ? html`<div class="rating-badge ${ratingClass}">${m.rating.toString().replace('%', '')}%</div>` : ''}
          ${isRecommendation ? html`
            <div class="btn-dismiss" title="Nezajímá mě" @click=${(e) => { e.stopPropagation(); this._action('not_interested', m); }}>
              <ha-icon icon="mdi:close" style="--mdc-icon-size: 18px;"></ha-icon>
            </div>
          ` : ''}
          ${m.user_rating ? html`<div class="rating-badge" style="top: auto; bottom: 8px; right: 8px; background: var(--primary); font-size: 10px; color: white;">${'⭐'.repeat(m.user_rating)}</div>` : ''}
        </div>
        <div class="movie-info">
          <h4 class="movie-title">${m.title}</h4>
          <div class="movie-meta">${m.year} • ${m.type === 'series' ? 'Seriál' : 'Film'}</div>
        </div>
      </div>
    `;
  }

  _renderModal() {
    const m = this.selectedMovie;
    const isWatched = !!this.data.watched[m.id];
    const isWishlist = !!this.data.wishlist[m.id];

    return html`
      <div class="modal-overlay" @click=${() => this.selectedMovie = null}>
        <div class="modal-content" @click=${e => e.stopPropagation()}>
          <div class="modal-poster-container">
            <img class="modal-poster" 
                 src="${m.poster || 'https://dummyimage.com/300x450/1e293b/f8fafc&text=Bez+plakátu'}"
                 @error=${e => e.target.src = 'https://dummyimage.com/300x450/1e293b/f8fafc&text=Plakát+nenalezen'}>
            <div class="modal-poster-overlay"></div>
          </div>
          <div class="modal-details">
            <div class="modal-close-mobile" @click=${() => this.selectedMovie = null}>
              <ha-icon icon="mdi:close" style="color: white; --mdc-icon-size: 24px;"></ha-icon>
            </div>
            <div style="display:flex; align-items: flex-start; gap: 20px; margin-bottom: 24px;">
              <img class="mobile-thumbnail" src="${m.poster || ''}">
              <div style="flex: 1">
                <div style="display:flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                  <div style="flex: 1">
                    <h2 style="font-size: clamp(20px, 5vw, 32px);">${m.title}</h2>
                    <div style="color:var(--text-dim); font-size: 13px; font-weight: 600; margin-top: 4px;">${m.origin}</div>
                  </div>
                  <button class="desktop-only" style="background:rgba(255,255,255,0.05); border:none; color:white; cursor:pointer; width: 40px; height: 40px; border-radius: 50%; display:flex; align-items:center; justify-content:center; flex-shrink: 0;" @click=${() => this.selectedMovie = null}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
                
                <div class="genres" style="margin-top: 12px;">
                  ${m.genres?.map(g => html`<span class="genre-tag">${g}</span>`)}
                  ${m.rating ? html`<span class="genre-tag" style="background:rgba(255,255,255,0.08); color:white; border-color: rgba(255,255,255,0.1)">⭐ ${m.rating.toString().replace('%', '')}%</span>` : ''}
                </div>
              </div>
            </div>

            <p class="plot">${m.description || 'K tomuto titulu zatím není k dispozici žádný popis.'}</p>

            ${m.seasons?.length ? html`
              <div class="seasons-container" style="margin-top: 24px; border-top: 1px solid var(--border-color); padding-top: 24px;">
                <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 800;">Sezóny a epizody</h3>
                <div style="display:flex; gap: 10px; overflow-x: auto; padding: 4px; margin-bottom: 16px; scrollbar-width: thin; scrollbar-color: var(--primary) transparent;">
                  ${m.seasons.map((s, idx) => html`
                    <button 
                      class="btn-secondary ${this.selectedSeason === idx ? 'active' : ''}"
                      style="padding: 10px 20px; font-size: 14px; border-radius: 12px; white-space: nowrap; ${this.selectedSeason === idx ? 'background: var(--primary); color: white; border-color: var(--primary); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);' : 'background: rgba(255,255,255,0.05); color: var(--text-dim);'}"
                      @click=${() => { this.selectedSeason = idx; this.requestUpdate(); }}
                    >${s.name}</button>
                  `)}
                </div>
                
                <div style="display:flex; justify-content: flex-end; margin-bottom: 16px;">
                  <button class="btn-secondary" style="font-size: 11px; padding: 6px 12px; border-radius: 10px;" @click=${() => {
                    const s = m.seasons[this.selectedSeason];
                    this._action('watch_season', m, { 
                      season_num: this.selectedSeason + 1, 
                      episodes: s.episodes.map(e => e.id) 
                    });
                  }}>
                    <ha-icon icon="mdi:check-all" style="--mdc-icon-size: 16px; margin-right: 4px;"></ha-icon> Označit celou řadu
                  </button>
                </div>
                
                <div class="episodes-list" style="display: flex; flex-direction: column; gap: 8px;">
                  ${m.seasons[this.selectedSeason || 0]?.episodes.map(ep => {
                    const epData = (this.data.watched[m.id] || this.data.wishlist[m.id])?.watched_episodes?.[ep.id] || {};
                    const isEpWatched = epData.watched;
                    const epRating = epData.rating || 0;
                    
                    return html`
                    <div class="episode-item ${isEpWatched ? 'watched' : ''}">
                      <div class="episode-header">
                        <div style="flex: 1">
                          <div style="font-weight: 700; font-size: 14px; display:flex; align-items:center; gap:8px">
                            ${isEpWatched ? html`<ha-icon icon="mdi:check-circle" style="color:var(--primary); --mdc-icon-size: 18px;"></ha-icon>` : ''}
                            ${ep.number ? `${ep.number}. ` : ''}${ep.title}
                          </div>
                          ${ep.overview ? html`<div style="font-size: 12px; color: var(--text-dim); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${ep.overview}</div>` : ''}
                        </div>
                        <div style="display:flex; gap:8px">
                           <a href="${ep.url}" target="_blank" class="btn-secondary" style="width: 36px; height: 36px; padding: 0; border-radius: 10px;">
                            <ha-icon icon="mdi:play" style="--mdc-icon-size: 20px;"></ha-icon>
                          </a>
                           <button class="btn-secondary" style="width: 36px; height: 36px; padding: 0; border-radius: 10px; ${isEpWatched ? 'background: var(--primary); border-color: var(--primary);' : ''}" @click=${() => this._action('watch_episode', m, { episode_id: ep.id })}>
                            <ha-icon icon="${isEpWatched ? 'mdi:eye-off' : 'mdi:eye'}" style="--mdc-icon-size: 20px;"></ha-icon>
                          </button>
                        </div>
                      </div>
                      
                      <div style="display:flex; align-items:center; gap:12px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05)">
                        <span style="font-size: 10px; font-weight:800; color:var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">Hodnocení</span>
                        <div style="display:flex; gap:4px">
                          ${[1,2,3,4,5].map(star => html`
                            <ha-icon 
                              icon="${epRating >= star ? 'mdi:star' : 'mdi:star-outline'}" 
                              style="cursor:pointer; color: ${epRating >= star ? 'var(--primary)' : 'rgba(255,255,255,0.2)'}; --mdc-icon-size: 18px;"
                              @click=${() => this._action('rate_episode', m, { episode_id: ep.id, rating: star })}
                            ></ha-icon>
                          `)}
                        </div>
                      </div>
                    </div>
                  `})}
                </div>
              </div>
            ` : ''}

            <div class="actions">
              <a href="${m.hellspy_url}" target="_blank" class="btn-hero">
                <ha-icon icon="mdi:play-circle" style="--mdc-icon-size: 28px;"></ha-icon> Sledovat
              </a>
              
              <div class="rating-box">
                <div style="display:flex; justify-content: space-between; width: 100%; align-items: center;">
                  <span style="font-weight: 800; color: var(--text-dim); font-size: 13px; text-transform: uppercase;">Vaše hodnocení</span>
                  <span style="color:var(--primary); font-weight: 800; font-size: 13px;">${m.user_rating ? '⭐'.repeat(m.user_rating) : 'Zatím nehodnoceno'}</span>
                </div>
                <div style="display:flex; justify-content: center; gap: 12px; padding: 4px 0;">
                  ${[1,2,3,4,5].map(num => html`
                    <ha-icon 
                      icon="${m.user_rating >= num ? 'mdi:star' : 'mdi:star-outline'}"
                      style="cursor:pointer; color: ${m.user_rating >= num ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}; --mdc-icon-size: 36px; transition: all 0.2s"
                      @click=${() => this._action('rate', m, { rating: num })}
                    ></ha-icon>
                  `)}
                </div>
              </div>

              <div class="actions-row">
                ${!isWatched ? html`
                  <button class="btn-secondary" @click=${() => this._action('watch', m)}>
                    <ha-icon icon="mdi:check-circle-outline"></ha-icon> Shlédnuto
                  </button>
                ` : html`
                   <button class="btn-secondary" style="color:var(--danger); border-color: rgba(239, 68, 68, 0.2)" @click=${() => this._action('delete_watched', m)}>
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon> Odebrat
                  </button>
                `}

                ${!isWatched && !isWishlist ? html`
                  <button class="btn-secondary" @click=${() => this._action('wishlist', m)}>
                    <ha-icon icon="mdi:heart-outline"></ha-icon> Wishlist
                  </button>
                ` : (isWishlist ? html`
                   <button class="btn-secondary" style="color:var(--danger); border-color: rgba(239, 68, 68, 0.2)" @click=${() => this._action('delete_wishlist', m)}>
                    <ha-icon icon="mdi:heart-off-outline"></ha-icon> Z wishlistu
                  </button>
                ` : '')}
              </div>
            </div>

            <a href="${m.url}" target="_blank" class="btn-secondary" style="height: 52px; text-decoration:none; border-radius: 16px;">
              <ha-icon icon="mdi:open-in-new" style="--mdc-icon-size: 20px;"></ha-icon> Otevřít ČSFD (${m.rating.toString().replace('%', '')}%)
            </a>
          </div>
        </div>
      </div>
    `;
  }
  _renderDiscover() {
    const genres = [
      {id: 28, name: "Akční"}, {id: 12, name: "Dobrodružný"}, {id: 16, name: "Animovaný"},
      {id: 35, name: "Komedie"}, {id: 80, name: "Krimi"}, {id: 99, name: "Dokumentární"},
      {id: 18, name: "Drama"}, {id: 10751, name: "Rodinný"}, {id: 14, name: "Fantasy"},
      {id: 27, name: "Horor"}, {id: 10749, name: "Romantický"}, {id: 878, name: "Sci-Fi"},
      {id: 53, name: "Thriller"}
    ];
    
    return html`
      <section>
        <div class="toolbar" style="background: rgba(255,255,255,0.03); padding: 16px; border-radius: 20px; margin-bottom: 32px; gap: 12px;">
          <div class="filter-group">
            <select @change=${e => { this.discoverFilters.type = e.target.value; this._fetchDiscover(); }}>
              <option value="movie" ?selected=${this.discoverFilters.type === 'movie'}>Filmy</option>
              <option value="tv" ?selected=${this.discoverFilters.type === 'tv'}>Seriály</option>
            </select>
            <select @change=${e => { this.discoverFilters.genre = e.target.value; this._fetchDiscover(); }}>
              <option value="">Všechny žánry</option>
              ${genres.map(g => html`<option value="${g.id}" ?selected=${this.discoverFilters.genre == g.id}>${g.name}</option>`)}
            </select>
            <input type="number" placeholder="Rok" style="width: 80px; background: var(--card-bg); color: white; border: 1px solid var(--border-color); border-radius: 12px; padding: 10px 16px; outline: none;" 
                   .value=${this.discoverFilters.year}
                   @change=${e => { this.discoverFilters.year = e.target.value; this._fetchDiscover(); }}>
            <select @change=${e => { this.discoverFilters.rating = e.target.value; this._fetchDiscover(); }}>
              <option value="0" ?selected=${this.discoverFilters.rating == 0}>Jakékoliv %</option>
              <option value="5" ?selected=${this.discoverFilters.rating == 5}>Nad 50%</option>
              <option value="7" ?selected=${this.discoverFilters.rating == 7}>Nad 70%</option>
              <option value="8" ?selected=${this.discoverFilters.rating == 8}>Nad 80%</option>
            </select>
          </div>
          <button class="btn-secondary" @click=${this._fetchDiscover} ?disabled=${this.discoverLoading} style="min-width: 120px; border-radius: 12px;">
             ${this.discoverLoading ? html`<ha-circular-progress active size="small" style="--mdc-circular-progress-size: 20px;"></ha-circular-progress>` : html`<ha-icon icon="mdi:refresh" style="--mdc-icon-size: 18px; margin-right: 6px;"></ha-icon> Obnovit`}
          </button>
        </div>

        ${this.discoverLoading && this.discoverResults.length === 0 ? html`
          <div style="display:flex; justify-content:center; padding: 100px;">
            <ha-circular-progress active></ha-circular-progress>
          </div>
        ` : html`
          <div class="grid">
            ${this.discoverResults.map(m => this._renderMovieCard(m))}
          </div>
        `}
      </section>
    `;
  }
}

customElements.define("movie-tracker-panel", MovieTrackerPanel);
