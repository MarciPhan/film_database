# Filmotéka (Movie Tracker) for Home Assistant

Moderní integrace pro Home Assistant, která vám umožní sledovat shlédnuté filmy a seriály, spravovat wishlist a objevovat nové tituly díky napojení na ČSFD.

## ✨ Funkce
- **Sledování shlédnutých titulů**: Jednoduché zaškrtávání filmů.
- **Epizody u seriálů**: Sledujte svůj pokrok v seriálech odškrtáváním jednotlivých dílů.
- **Wishlist**: Seznam filmů, které si chcete pustit později.
- **Napojení na ČSFD**: Automatické stahování metadat (plakáty, hodnocení, žánry).
- **Rychlý přístup na Hellspy**: Tlačítko "Sledovat" vás rovnou přesměruje na vyhledávání na Hellspy.
- **Doporučení**: Navrhuje žánry na základě vašich preferencí.

## 🚀 Instalace
1. Zkopírujte složku `custom_components/movie_tracker` do vašeho adresáře `config/custom_components`.
2. Restartujte Home Assistant.
3. V nastavení přidejte integraci **Filmotéka**.
4. V bočním panelu se objeví nová položka **Filmotéka**.

## 🛠 Vývoj
Projekt je postaven na:
- **Backend**: Python (Home Assistant integration framework) + BeautifulSoup4 pro scraping ČSFD.
- **Frontend**: JavaScript (LitElement) s moderním dark mode designem.

---
Vytvořeno jako součást projektu pro domácí automatizaci.
