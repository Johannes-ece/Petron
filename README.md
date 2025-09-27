# Petron — The Arbiter

Petron is a zero-backend explorer for Apple App Store ratings and reviews, organised by storefront. Paste any public App Store URL or numeric track ID and Petron reports global ratings, volumes, and review sentiment across Apple’s catalog for you.

## Highlights
- **App-wide & review-level insight:** See storefront average ratings, rating count, and dive into the text of individual reviews without leaving the page.
- **Smart country selection:** Attempts to auto-discover supported storefronts, with a comprehensive fallback list if discovery fails in the browser.
- **Rich analysis tools:** Interactive table with sorting, filtering, search, CSV/JSON export, and a color-coded map to understand global coverage at a glance.
- **Pure front-end:** Uses JSONP for Apple’s iTunes Lookup API and direct fetches for the legacy RSS feed, so it runs entirely on GitHub Pages or any static host.

## Quick Start
1. **Install dependencies:** None. Everything is plain HTML/CSS/JS.
2. **Run locally:**
   ```bash
   python3 -m http.server 8000
   ```
   Then open [http://localhost:8000](http://localhost:8000).
3. **Deploy to GitHub Pages:**
   - Serve the repository root via GitHub Pages (main branch, /(root)) or push the built files to a dedicated `gh-pages` branch.
   - GitHub Pages will deliver the static assets; no build step required.

## How It Works
- **Lookup:** Calls the iTunes Search API via JSONP (`https://itunes.apple.com/lookup`) per storefront to gather average rating, rating count, and the track view URL.
- **Reviews:** Requests Apple’s legacy RSS feed (`/rss/customerreviews/.../json`) to fetch up to 1,000 of the latest reviews per country (subject to Apple’s own truncation).
- **Concurrency:** Requests are throttled in-browser to respect Apple’s rate limiting guidance.
- **Mapping:** Leaflet + OpenStreetMap render a responsive choropleth—grey storefronts have no data, green-to-red conveys rating quality.

## Customisation
- Edit `frontend/styles.css` to rebrand or tweak the glassmorphism UI.
- Adjust defaults (max reviews, concurrency, fallback countries) directly in `frontend/app.js`.
- Swap the basemap or legend logic inside `ensureMap` and `renderMap` if you prefer a different cartographic style.

## Limitations & Notes
- Apple’s endpoints sometimes block storefront discovery in the browser; Petron automatically falls back to the curated list in `frontend/app.js`.
- The legacy RSS feed is not available for every storefront; missing feeds simply result in empty review sections.
- High-volume scans may still trigger throttling—dial back the concurrency slider when necessary.

Enjoy roaming the App Store’s global sentiment. Petron arbiters the signal; you decide the verdict.
