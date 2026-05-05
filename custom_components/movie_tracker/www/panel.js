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
      sortBy: { type: String }
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
    this.sortBy = "newest";
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
      const r = await this.hass.fetchWithAuth("/api/movie_tracker/data");
      if (r.ok) {
        this.data = await r.json();
      }
    } catch (e) {
      console.error("Failed to fetch movie data", e);
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
    try {
      const id = movie.id || movie.csfd_id || "";
      const title = movie.title || "";
      const r = await this.hass.fetchWithAuth(`/api/movie_tracker/detail?id=${id}&title=${encodeURIComponent(title)}`);
      if (r.ok) {
        this.selectedMovie = await r.json();
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
      await this._svc("movie_action", { action, movie, ...extra });
      
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
        --secondary: #10b981;
        --danger: #ef4444;
        --bg-dark: #0f172a;
        --card-bg: rgba(30, 41, 59, 0.7);
        --border-color: rgba(255, 255, 255, 0.1);
        --text-main: #f8fafc;
        --text-dim: #94a3b8;
        
        display: block;
        min-height: 100vh;
        background: radial-gradient(circle at top right, #1e1b4b, #0f172a);
        color: var(--text-main);
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        padding-bottom: 50px;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px;
      }

      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 32px;
      }

      .logo {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.5px;
        background: linear-gradient(to right, #fff, #94a3b8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .logo ha-icon {
        color: var(--primary);
        --mdc-icon-size: 32px;
      }

      /* Search Bar */
      .search-box {
        position: relative;
        background: var(--card-bg);
        backdrop-filter: blur(12px);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 8px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 32px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
      }

      .search-box:focus-within {
        border-color: var(--primary);
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.3);
      }

      .search-box input {
        flex: 1;
        background: transparent;
        border: none;
        color: white;
        font-size: 16px;
        padding: 10px 0;
        outline: none;
      }

      .search-box button {
        background: var(--primary);
        color: white;
        border: none;
        border-radius: 10px;
        padding: 8px 20px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      }

      .search-box button:hover {
        background: var(--primary-hover);
      }

      /* Tabs */
      .tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 24px;
        padding: 4px;
        background: rgba(0,0,0,0.2);
        border-radius: 12px;
        width: fit-content;
      }

      .tab {
        padding: 8px 20px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
        color: var(--text-dim);
        transition: 0.3s;
      }

      .tab.active {
        background: var(--card-bg);
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }

      /* Grid */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 24px;
      }

      .movie-card {
        background: var(--card-bg);
        backdrop-filter: blur(8px);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        overflow: hidden;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        cursor: pointer;
        display: flex;
        flex-direction: column;
        position: relative;
      }

      .movie-card:hover {
        transform: translateY(-8px) scale(1.02);
        border-color: rgba(255,255,255,0.2);
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
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
      }

      .rating-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.7);
        backdrop-filter: blur(4px);
        padding: 4px 8px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        border: 1px solid rgba(255,255,255,0.1);
      }

      .rating-high { color: #4ade80; }
      .rating-mid { color: #facc15; }
      .rating-low { color: #f87171; }

      .movie-info {
        padding: 16px;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
      }

      .movie-title {
        font-size: 15px;
        font-weight: 700;
        margin: 0 0 4px 0;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .movie-meta {
        font-size: 12px;
        color: var(--text-dim);
      }

      /* Modal */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
        animation: fadeIn 0.3s ease;
      }

      .modal-content {
        background: #1e293b;
        border-radius: 24px;
        max-width: 900px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        display: grid;
        grid-template-columns: 350px 1fr;
        border: 1px solid var(--border-color);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      }

      @media (max-width: 768px) {
        .modal-content { grid-template-columns: 1fr; }
        .modal-poster { height: 300px; }
      }

      .modal-poster {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .modal-details {
        padding: 40px;
      }

      .modal-details h2 {
        font-size: 32px;
        margin: 0 0 8px 0;
        font-weight: 800;
      }

      .genres {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 24px;
      }

      .genre-tag {
        padding: 4px 12px;
        background: rgba(139, 92, 246, 0.15);
        color: #c4b5fd;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
      }

      .plot {
        line-height: 1.6;
        color: var(--text-dim);
        margin-bottom: 32px;
      }

      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .btn {
        padding: 12px 24px;
        border-radius: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .btn-primary { background: var(--primary); color: white; }
      .btn-secondary { background: rgba(255,255,255,0.1); color: white; }
      .btn-secondary:hover { background: rgba(255,255,255,0.2); }
      
      .toast {
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--primary);
        color: white;
        padding: 12px 32px;
        border-radius: 50px;
        font-weight: 600;
        box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        z-index: 2000;
        animation: slideUp 0.3s ease;
      }

      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slideUp { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }

      /* Empty states */
      .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: var(--text-dim);
      }

      .empty-state ha-icon {
        --mdc-icon-size: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
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
            <ha-icon icon="mdi:movie-roll"></ha-icon>
            Filmotéka
          </div>
          <div class="settings-nav">
             <ha-icon 
                icon="mdi:refresh" 
                style="cursor:pointer; opacity:0.7" 
                @click=${this._fetch}
             ></ha-icon>
          </div>
        </header>

        <div class="search-box">
          <ha-icon icon="mdi:magnify"></ha-icon>
          <input 
            type="text" 
            placeholder="Hledat film nebo seriál..." 
            .value=${this.search}
            @input=${e => this.search = e.target.value}
            @keyup=${e => e.key === 'Enter' && this._doSearch()}
          >
          <button @click=${this._doSearch} ?disabled=${this.searching}>
            ${this.searching ? 'Načítám...' : 'Hledat'}
          </button>
        </div>

        <div class="tabs">
          <div class="tab ${this.tab === 'dashboard' ? 'active' : ''}" @click=${() => this.tab = 'dashboard'}>Přehled</div>
          <div class="tab ${this.tab === 'library' ? 'active' : ''}" @click=${() => this.tab = 'library'}>Moje Knihovna</div>
          <div class="tab ${this.tab === 'wishlist' ? 'active' : ''}" @click=${() => this.tab = 'wishlist'}>Wishlist</div>
        </div>

        ${this.searchResults.length > 0 ? html`
          <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3>Výsledky hledání</h3>
            <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 12px;" @click=${() => this.searchResults = []}>Zavřít výsledky</button>
          </div>
          <div class="grid">
            ${this.searchResults.map(m => this._renderMovieCard(m))}
          </div>
          <hr style="margin: 40px 0; opacity: 0.1;">
        ` : ''}

        ${this._renderContent(watched, wishlist)}

        ${this.selectedMovie ? this._renderModal() : ''}
        ${this.toast ? html`<div class="toast">${this.toast}</div>` : ''}
      </div>
    `;
  }

  _renderContent(watched, wishlist) {
    if (this.tab === 'dashboard') {
      return html`
        <section>
          ${this.data.recommendations?.length ? html`
             <h3 style="margin-bottom: 20px;">✨ Doporučeno pro vás</h3>
             <div class="grid" style="margin-bottom: 48px;">
               ${this.data.recommendations.map(m => this._renderMovieCard(m))}
             </div>
          ` : ''}
          
          <h3 style="margin-bottom: 20px;">🍿 Nedávno shlédnuté</h3>
          ${watched.length === 0 ? html`
            <div class="empty-state">
              <ha-icon icon="mdi:movie-open-play"></ha-icon>
              <p>Zatím jste nic nesledovali. Zkuste něco najít!</p>
            </div>
          ` : html`
            <div class="grid">
              ${watched.slice(-6).reverse().map(m => this._renderMovieCard(m))}
            </div>
          `}
        </section>
      `;
    }

    const list = this.tab === 'library' ? watched : wishlist;
    
    return html`
      <section>
        ${list.length === 0 ? html`
          <div class="empty-state">
            <ha-icon icon="mdi:layers-off"></ha-icon>
            <p>Seznam je zatím prázdný.</p>
          </div>
        ` : html`
          <div class="grid">
            ${list.reverse().map(m => this._renderMovieCard(m))}
          </div>
        `}
      </section>
    `;
  }

  _renderMovieCard(m) {
    const ratingVal = parseInt(m.rating) || 0;
    const ratingClass = ratingVal >= 75 ? 'rating-high' : (ratingVal >= 50 ? 'rating-mid' : 'rating-low');
    
    return html`
      <div class="movie-card" @click=${() => this._viewDetail(m)}>
        <div class="poster-wrapper">
          <img src="${m.poster || m.image || 'https://via.placeholder.com/300x450?text=Bez+plakátu'}" loading="lazy">
          ${m.rating ? html`<div class="rating-badge ${ratingClass}">${m.rating}</div>` : ''}
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
          <img class="modal-poster" src="${m.poster || m.image || 'https://via.placeholder.com/300x450?text=Bez+plakátu'}">
          <div class="modal-details">
            <div style="display:flex; justify-content: space-between; align-items: flex-start;">
              <h2>${m.title}</h2>
              <button style="background:none; border:none; color:white; cursor:pointer" @click=${() => this.selectedMovie = null}>
                <ha-icon icon="mdi:close"></ha-icon>
              </button>
            </div>
            
            <div style="color:var(--text-dim); margin-bottom: 16px;">${m.origin}</div>
            
            <div class="genres">
              ${m.genres?.map(g => html`<span class="genre-tag">${g}</span>`)}
              ${m.rating ? html`<span class="genre-tag" style="background:rgba(255,255,255,0.1); color:white">⭐ ${m.rating}</span>` : ''}
            </div>

            <p class="plot">${m.description || 'K tomuto titulu zatím není k dispozici žádný popis.'}</p>

            <div class="actions">
              <a href="${m.hellspy_url}" target="_blank" class="btn btn-primary" style="text-decoration:none">
                <ha-icon icon="mdi:play"></ha-icon> Najít ke stažení
              </a>
              
              ${!isWatched ? html`
                <button class="btn btn-secondary" @click=${() => this._action('watch', m)}>
                  <ha-icon icon="mdi:check"></ha-icon> Shlédnuto
                </button>
              ` : html`
                 <button class="btn btn-secondary" style="color:var(--danger)" @click=${() => this._action('delete_watched', m)}>
                  <ha-icon icon="mdi:delete"></ha-icon> Smazat z knihovny
                </button>
              `}

              ${!isWatched && !isWishlist ? html`
                <button class="btn btn-secondary" @click=${() => this._action('wishlist', m)}>
                  <ha-icon icon="mdi:heart-outline"></ha-icon> Do wishlistu
                </button>
              ` : (isWishlist ? html`
                 <button class="btn btn-secondary" style="color:var(--danger)" @click=${() => this._action('delete_wishlist', m)}>
                  <ha-icon icon="mdi:delete"></ha-icon> Smazat z wishlistu
                </button>
              ` : '')}
              
              <a href="${m.url}" target="_blank" class="btn btn-secondary">
                <ha-icon icon="mdi:open-in-new"></ha-icon> ČSFD
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("movie-tracker-panel", MovieTrackerPanel);
