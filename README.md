# Petron — App Store storefront explorer

**Live demo:** [https://johannes-ece.github.io/Petron/frontend/](https://johannes-ece.github.io/Petron/frontend/) (GitHub Pages)

Petron scans Apple’s App Store storefronts for any given app ID, collecting rating stats and recent reviews. Everything runs client-side—no backend, API keys, or build tools required.

## Features
- Pulls storefront averages, rating counts, and review excerpts in one pass.
- Leaflet map colours storefronts by rating to surface strong or weak markets.
- Filterable table view with CSV and JSON export.
- Adjustable concurrency and a fallback storefront list to stay within Apple’s limits.

## Quick start
```bash
git clone https://github.com/Johannes-ece/Petron.git
cd Petron
python3 -m http.server 8000
```
Visit [http://localhost:8000](http://localhost:8000) and paste an App Store URL or numeric ID.

## Deployment
- GitHub Pages: publish the `main` branch from the repository root (already wired up for this repo).
- Any static host: serve the repo root; `index.html` references `frontend/app.js` and `frontend/styles.css` directly.

## Layout
```
Petron/
├── index.html          # Entry point served by GitHub Pages
├── frontend/
│   ├── app.js          # UI logic and Apple API requests
│   └── styles.css      # Layout and styling
└── README.md
```

## Apple data sources
- Ratings & metadata: JSONP requests to `https://itunes.apple.com/lookup` per storefront.
- Reviews: Apple’s legacy RSS feeds (`/rss/customerreviews/.../json`), usually capped at the newest ~1,000 entries.
- Storefront discovery: Uses Apple’s `availableCountries` / `availableStorefronts` endpoints, with a static fallback list in `frontend/app.js` when discovery is blocked.

## Notes
- If discovery fails, switch the UI toggle to “fallback list only”.
- Empty review sections usually mean Apple doesn’t expose that storefront’s feed.
- Reduce the concurrency slider or review count if requests time out.
- Reload if map tiles fail to load; OpenStreetMap occasionally throttles bursts of requests.
