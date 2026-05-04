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
    this.toast = "";
    this.filterGenre = "";
    this.sortBy = "newest";
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetch();
    this.hass?.connection?.subscribeEvents(() => this._fetch(), "movie_tracker_updated");
  }

  async _fetch() {
    if (!this.hass) return;
    try {
      const r = await this.hass.fetchWithAuth("/api/movie_tracker/data");
      if (r.ok) this.data = await r.json();
    } catch (e) {
      console.error("Failed to fetch data", e);
    }
  }

  _t(m) {
    this.toast = m;
    setTimeout(() => { this.toast = "" }, 3000);
  }

  _svc(s, d) {
    this.hass.callService("movie_tracker", s, d);
  }

  async _doSearch() {
    if (!this.search) return;
    this.searching = true;
    try {
      const r = await this.hass.fetchWithAuth(`/api/movie_tracker/search?q=${encodeURIComponent(this.search)}`);
      if (r.ok) this.searchResults = await r.json();
    } catch (e) {
      this._t("Chyba vyhledávání");
    } finally {
      this.searching = false;
    }
  }

  async _viewDetail(movie) {
    try {
      const r = await this.hass.fetchWithAuth(`/api/movie_tracker/detail?url=${encodeURIComponent(movie.url)}`);
      if (r.ok) this.selectedMovie = await r.json();
    } catch (e) {
      this._t("Chyba načítání detailů");
    }
  }

  _action(action, movie, extra = {}) {
    this._svc("movie_action", { action, movie, ...extra });
    this._t(action === 'watch' ? "Označeno jako shlédnuté" : "Přidáno do wishlistu");
    if (action === 'watch' || action === 'wishlist') {
        this.selectedMovie = null;
        this.searchResults = [];
        this.search = "";
    }
    setTimeout(() => this._fetch(), 1000);
  }

  static get styles() {
    return css`
      :host {
        --a: #6366f1;
        --g: #22c55e;
        --r: #ef4444;
        --bg: #0f172a;
        --card: #1e293b;
        --border: rgba(255,255,255,.08);
        --txt: #e2e8f0;
        --dim: #94a3b8;
        display: block;
        min-height: 100vh;
        background: var(--primary-background-color, var(--bg));
        color: var(--primary-text-color, var(--txt));
        font-family: system-ui, -apple-system, sans-serif;
      }
      .p { padding: 20px; max-width: 1400px; margin: 0 auto; }
      .hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
      .hdr h1 { font-size: 1.8rem; margin: 0; display: flex; align-items: center; gap: 10px; }
      .tabs { display: flex; gap: 8px; margin-bottom: 24px; background: var(--card); padding: 4px; border-radius: 12px; width: fit-content; }
      .tb { padding: 8px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; color: var(--dim); transition: .2s; }
      .tb.on { background: var(--a); color: #fff; box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
      .gr { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
      .c { background: var(--card); border-radius: 16px; overflow: hidden; border: 1px solid var(--border); transition: .3s; display: flex; flex-direction: column; position: relative; }
      .c:hover { transform: translateY(-5px); box-shadow: 0 12px 24px rgba(0,0,0,0.4); }
      .ci { width: 100%; height: 280px; object-fit: cover; background: #334155; }
      .cb { padding: 15px; flex: 1; display: flex; flex-direction: column; gap: 8px; }
      .ct { font-size: 1rem; font-weight: 700; margin: 0; line-height: 1.2; }
      .cm { font-size: 0.8rem; color: var(--dim); }
      .rtg { position: absolute; top: 10px; right: 10px; color: #fff; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 0.8rem; backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.1); }
      .rtg.red { background: rgba(239, 68, 68, 0.8); }
      .rtg.yellow { background: rgba(234, 179, 8, 0.8); }
      .rtg.green { background: rgba(34, 197, 94, 0.8); }
      .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; transition: .2s; font-size: 0.9rem; text-decoration: none; }
      .bp { background: var(--a); color: #fff; }
      .bo { background: transparent; border: 1px solid var(--border); color: var(--txt); }
      .bw { width: 100%; }
      .tbar { background: var(--card); padding: 15px; border-radius: 16px; border: 1px solid var(--border); display: flex; gap: 10px; margin-bottom: 24px; }
      .tbar input { flex: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 15px; color: inherit; font-size: 1rem; }
      .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(8px); }
      .mc { background: var(--card); border-radius: 20px; max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: row; border: 1px solid var(--border); }
      @media (max-width: 600px) { .mc { flex-direction: column; } .mi { width: 100% !important; height: 300px !important; } }
      .mi { width: 300px; height: auto; object-fit: cover; }
      .md { padding: 30px; flex: 1; }
      .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--card); padding: 12px 24px; border-radius: 12px; border: 1px solid var(--border); z-index: 2000; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
      .badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); }
      .ep-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; max-height: 200px; overflow-y: auto; }
      .ep { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px; }
      .checked { color: var(--g); }
      .controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 15px; }
      .filters { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; flex: 1; scrollbar-width: none; }
      .filters::-webkit-scrollbar { display: none; }
      .chip { padding: 6px 14px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; font-size: 0.85rem; cursor: pointer; white-space: nowrap; transition: .2s; }
      .chip.on { background: var(--a); border-color: var(--a); color: #fff; }
      select.btn { appearance: none; padding-right: 30px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; background-size: 16px; }
    `;
  }

  render() {
    const watched = Object.values(this.data.watched || {});
    const wishlist = Object.values(this.data.wishlist || {});
    
    let movies = this.tab === 'library' ? watched : wishlist;
    
    // Apply filters
    if (this.filterGenre) {
        movies = movies.filter(m => m.genres?.includes(this.filterGenre));
    }
    
    // Apply sorting
    movies = [...movies].sort((a, b) => {
        if (this.sortBy === 'alphabet') return a.title.localeCompare(b.title);
        if (this.sortBy === 'rating') return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
        if (this.sortBy === 'year') return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
        return new Date(b.added_at || 0) - new Date(a.added_at || 0);
    });

    const allGenres = [...new Set((this.tab === 'library' ? watched : wishlist).flatMap(m => m.genres || []))].sort();

    return html`
      <div class="p">
        <div class="hdr">
          <h1><ha-icon icon="mdi:movie-roll"></ha-icon> Filmotéka</h1>
          <div style="display:flex;gap:12px;align-items:center">
            <ha-icon icon="mdi:refresh" style="cursor:pointer;color:var(--dim)" @click=${this._fetch}></ha-icon>
            <div class="lang-toggle">
              <button class="btn bo ${this.data.settings?.language==='CZ'?'on':''}" @click=${()=>this._action('update_settings', {}, {settings:{language:'CZ'}})}>CZ</button>
              <button class="btn bo ${this.data.settings?.language==='EN'?'on':''}" @click=${()=>this._action('update_settings', {}, {settings:{language:'EN'}})}>EN</button>
            </div>
          </div>
        </div>

        <div class="tbar main-search">
          <ha-icon icon="mdi:magnify"></ha-icon>
          <input type="text" placeholder="Hledat film, seriál nebo rande…" 
            .value=${this.search} 
            @input=${e => this.search = e.target.value}
            @keyup=${e => e.key === 'Enter' && this._doSearch()}>
          <button class="btn bp" @click=${this._doSearch} ?disabled=${this.searching}>
            ${this.searching ? '…' : 'Hledat'}
          </button>
        </div>

        <div class="tabs">
          <div class="tb ${this.tab === 'dashboard' ? 'on' : ''}" @click=${() => {this.tab = 'dashboard'; this.filterGenre = ''}}>Přehled</div>
          <div class="tb ${this.tab === 'library' ? 'on' : ''}" @click=${() => {this.tab = 'library'; this.filterGenre = ''}}>Shlédnuto (${watched.length})</div>
          <div class="tb ${this.tab === 'wishlist' ? 'on' : ''}" @click=${() => {this.tab = 'wishlist'; this.filterGenre = ''}}>Wishlist (${wishlist.length})</div>
          ${this.searchResults.length > 0 ? html`<div class="tb on" @click=${() => this.searchResults = []}>Výsledky (${this.searchResults.length}) ×</div>` : ''}
        </div>

        ${this.searchResults.length > 0 ? this._renderSearchResults() : html`
          ${this.tab !== 'dashboard' ? html`
            <div class="controls">
              <div class="filters">
                <span class="chip ${!this.filterGenre ? 'on' : ''}" @click=${() => this.filterGenre = ""}>Vše</span>
                ${allGenres.map(g => html`
                  <span class="chip ${this.filterGenre === g ? 'on' : ''}" @click=${() => this.filterGenre = g}>${g}</span>
                `)}
              </div>
              <select class="btn bo" @change=${e => this.sortBy = e.target.value}>
                <option value="newest" ?selected=${this.sortBy==='newest'}>Nejnovější</option>
                <option value="alphabet" ?selected=${this.sortBy==='alphabet'}>Abecedně</option>
                <option value="rating" ?selected=${this.sortBy==='rating'}>Podle hodnocení</option>
                <option value="year" ?selected=${this.sortBy==='year'}>Podle roku</option>
              </select>
            </div>
          ` : ''}
          
          ${this.tab === 'dashboard' ? this._renderDashboard(watched) : ''}
          ${this.tab === 'library' ? this._renderGrid(movies, 'watched') : ''}
          ${this.tab === 'wishlist' ? this._renderGrid(movies, 'wishlist') : ''}
        `}

        ${this.selectedMovie ? this._renderDetail() : ''}
        ${this.toast ? html`<div class="toast">${this.toast}</div>` : ''}
      </div>
    `;
  }

  _renderSearchResults() {
    return html`
        <div class="gr">
          ${this.searchResults.map(m => html`
            <div class="c" @click=${() => this._viewDetail(m)}>
              <img class="ci" src="${m.image || 'https://via.placeholder.com/300x450?text=Bez+plakatu'}">
              <div class="cb">
                <h3 class="ct">${m.title}</h3>
                <div class="cm">${m.year} • ${m.type === 'series' ? 'Seriál' : 'Film'}</div>
              </div>
            </div>
          `)}
        </div>
        <div style="margin-top:20px;text-align:center">
            <button class="btn bo" @click=${() => this.searchResults = []}>Zavřít výsledky</button>
        </div>
    `;
  }

  _renderDashboard(watched) {
    const recs = this.data.recommendations || [];
    return html`
      <section>
        ${recs.length > 0 ? html`
          <h3 style="display:flex;align-items:center;gap:10px">✨ Doporučeno pro vás <span class="badge" style="background:var(--a)">Na základě žánrů</span></h3>
          <div class="gr" style="margin-bottom:40px">
            ${recs.map(m => this._renderMovieCard(m, 'wishlist'))}
          </div>
        ` : ''}
        
        <h3>🍿 Poslední shlédnuté</h3>
        <div class="gr">
          ${watched.slice(-5).reverse().map(m => this._renderMovieCard(m, 'watched'))}
        </div>
      </section>
    `;
  }

  _renderGrid(movies, type) {
    return html`
      <div class="gr">
        ${movies.map(m => this._renderMovieCard(m, type))}
      </div>
    `;
  }

  _renderDiscover() {
    return html`
      <section>
        <div class="tbar">
          <input type="text" placeholder="Hledat film nebo seriál na ČSFD…" 
            .value=${this.search} 
            @input=${e => this.search = e.target.value}
            @keyup=${e => e.key === 'Enter' && this._doSearch()}>
          <button class="btn bp" @click=${this._doSearch} ?disabled=${this.searching}>
            ${this.searching ? 'Hledám…' : 'Hledat'}
          </button>
        </div>
        
        <div class="gr">
          ${this.searchResults.map(m => html`
            <div class="c" @click=${() => this._viewDetail(m)}>
              <img class="ci" src="${m.image || 'https://via.placeholder.com/300x450?text=Bez+plakatu'}">
              <div class="cb">
                <h3 class="ct">${m.title}</h3>
                <div class="cm">${m.year} • ${m.type === 'series' ? 'Seriál' : 'Film'}</div>
              </div>
            </div>
          `)}
        </div>
      </section>
    `;
  }

  _renderMovieCard(m, type) {
    const val = parseInt(m.rating) || 0;
    const rtgCls = val >= 75 ? 'green' : (val >= 50 ? 'yellow' : 'red');
    return html`
      <div class="c" @click=${() => this._viewDetail(m)}>
        ${m.rating ? html`<div class="rtg ${rtgCls}">${m.rating}</div>` : ''}
        <img class="ci" src="${m.poster || m.image || 'https://via.placeholder.com/300x450?text=Bez+plakatu'}">
        <div class="cb">
          <h3 class="ct">${m.title}</h3>
          <div class="cm">${m.genres?.slice(0, 2).join(', ')}</div>
          <div style="margin-top:auto;display:flex;gap:5px">
            <button class="btn bo bs bw" @click=${e => { e.stopPropagation(); this._action(type === 'watched' ? 'delete_watched' : 'delete_wishlist', m); }}>Smazat</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderDetail() {
    const m = this.selectedMovie;
    const isWatched = !!this.data.watched[m.id];
    const isWishlist = !!this.data.wishlist[m.id];

    return html`
      <div class="modal" @click=${() => this.selectedMovie = null}>
        <div class="mc" @click=${e => e.stopPropagation()}>
          <img class="mi" src="${m.poster || m.image}">
          <div class="md">
            <h2 style="margin:0 0 10px 0">${m.title}</h2>
            <div class="cm" style="margin-bottom:15px">${m.origin}</div>
            
            <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
              ${m.genres?.map(g => html`<span class="badge">${g}</span>`)}
              <span class="badge" style="background:var(--a)">${m.rating}</span>
            </div>

            <p style="font-size:0.9rem;line-height:1.5;color:var(--dim)">
              ${m.type === 'series' ? 'Tento seriál obsahuje seznam epizod, které si můžete odškrtávat.' : 'Film byl úspěšně načten z ČSFD.'}
            </p>

            ${m.episodes?.length ? html`
              <h4>Epizody</h4>
              <div class="ep-list">
                ${m.episodes.map(ep => {
                  const watched = (this.data.watched[m.id]?.watched_episodes || []).includes(ep.url);
                  return html`
                    <div class="ep">
                      <ha-icon icon="${watched ? 'mdi:check-circle' : 'mdi:circle-outline'}" class="${watched ? 'checked' : ''}" @click=${() => this._action('mark_episode', m, { episode_url: ep.url })}></ha-icon>
                      <span style="flex:1">${ep.title}</span>
                      <a href="https://hellspy.to/?query=${encodeURIComponent(m.title + ' ' + ep.title)}" target="_blank" class="badge" style="text-decoration:none;color:var(--a)">Sledovat</a>
                    </div>
                  `;
                })}
              </div>
            ` : ''}

            <div style="display:flex;gap:10px;margin-top:30px;flex-wrap:wrap">
              <a href="${m.hellspy_url}" target="_blank" class="btn bp" style="flex:1">Sledovat</a>
              ${!isWatched ? html`<button class="btn bo" @click=${() => this._action('watch', m)}>Viděl jsem</button>` : ''}
              ${!isWatched && !isWishlist ? html`<button class="btn bo" @click=${() => this._action('wishlist', m)}>Do wishlistu</button>` : ''}
              <button class="btn bo" @click=${() => this.selectedMovie = null}>Zavřít</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("movie-tracker-panel", MovieTrackerPanel);
