const FALLBACK_COUNTRIES = [
  "US","GB","CA","DE","FR","IT","ES","NL","SE","NO","DK","FI","IE","CH","AT","BE","PT","GR","PL","CZ","SK","HU",
  "RO","BG","HR","SI","LT","LV","EE","LU","MT","CY","IS","LI",
  "AU","NZ","JP","KR","CN","HK","TW","SG","MY","TH","VN","PH","ID","IN","PK","BD","LK","NP",
  "AE","SA","QA","KW","OM","BH","JO","LB","IL","TR","EG","MA","DZ","TN","ZA","NG","KE","GH",
  "RU","UA","BY","KZ","UZ","AZ","AM","GE",
  "BR","MX","AR","CL","CO","PE","UY","PY","BO","EC","VE","CR","PA","DO","GT","HN","NI","SV","PR"
];

const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";
const RSS_URL_CC = "https://itunes.apple.com/rss/customerreviews/id={id}/sortBy=mostRecent/page=1/json?cc={country}";
const RSS_URL_PATH = "https://itunes.apple.com/{country}/rss/customerreviews/id={id}/sortBy=mostRecent/page=1/json";

const appInput = document.getElementById("app-input");
const maxReviewsInput = document.getElementById("max-reviews");
const concurrencyInput = document.getElementById("concurrency");
const concurrencyValue = document.getElementById("concurrency-value");
const statusEl = document.getElementById("status");
const progressWrapper = document.getElementById("progress-wrapper");
const progressEl = document.getElementById("progress");
const progressText = document.getElementById("progress-text");
const resultsSection = document.getElementById("results");
const tableBody = document.getElementById("results-table-body");
const reviewsContainer = document.getElementById("reviews-container");
const reviewsSection = document.getElementById("reviews-section");
const downloadCsvBtn = document.getElementById("download-csv");
const downloadJsonBtn = document.getElementById("download-json");
const scanButton = document.getElementById("scan-button");
const filtersPanel = document.getElementById("filters");
const minRatingInput = document.getElementById("min-rating");
const minRatingDisplay = document.getElementById("min-rating-display");
const minCountInput = document.getElementById("min-count");
const onlyReviewsInput = document.getElementById("only-reviews");
const searchCountryInput = document.getElementById("search-country");
const resultsSummary = document.getElementById("results-summary");
const sortButtons = document.querySelectorAll(".sortable");
const sortIndicators = document.querySelectorAll("[data-sort-indicator]");
const mapContainer = document.getElementById("map");

let allResults = [];
let filteredResults = [];
let lastAppId = null;
let lastGeneratedAt = null;

const filtersState = {
  minRating: 0,
  minCount: 0,
  onlyReviews: false,
  searchQuery: ""
};

let currentSort = { column: "country", direction: "asc" };

let mapInstance = null;
let mapPolygons = null;
let mapLayer = null;
let mapLegendControl = null;

concurrencyInput.addEventListener("input", () => {
  concurrencyValue.textContent = concurrencyInput.value;
});
concurrencyValue.textContent = concurrencyInput.value;

const parseAppId = (text) => {
  if (!text) return null;
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/id(\d+)/i);
  return match ? match[1] : null;
};

const flagEmoji = (countryCode) => {
  const cc = (countryCode || "").trim().toUpperCase();
  if (cc.length !== 2) return "";
  const base = 127397;
  return String.fromCodePoint(base + cc.charCodeAt(0), base + cc.charCodeAt(1));
};

const regionDisplay = typeof Intl.DisplayNames !== "undefined"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

const getCountryName = (countryCode) => {
  const code = (countryCode || "").toUpperCase();
  if (!code) return "";
  try {
    return regionDisplay?.of(code) || code;
  } catch (err) {
    return code;
  }
};

const hexToRgba = (hex, alpha = 1) => {
  if (!hex) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  let normalized = hex.replace('#', '').trim();
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (normalized.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const ratingColorScale = [
  { min: 4.7, hex: '#166534' },
  { min: 4.3, hex: '#22c55e' },
  { min: 3.8, hex: '#84cc16' },
  { min: 3.3, hex: '#f59e0b' },
  { min: 2.8, hex: '#f97316' },
  { min: 0, hex: '#dc2626' },
];

const ratingToColor = (rating, alpha = 1) => {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return hexToRgba('#94a3b8', alpha);
  }
  for (const step of ratingColorScale) {
    if (rating >= step.min) {
      return hexToRgba(step.hex, alpha);
    }
  }
  return hexToRgba(ratingColorScale[ratingColorScale.length - 1].hex, alpha);
};

const setStatus = (message, type = "info") => {
  statusEl.textContent = message || "";
  statusEl.classList.toggle("error", type === "error");
};

const resetProgress = () => {
  progressWrapper.hidden = true;
  progressEl.value = 0;
  progressEl.max = 1;
  progressText.textContent = "";
};

const updateProgress = (current, total) => {
  progressWrapper.hidden = false;
  progressEl.max = total;
  progressEl.value = current;
  const pct = total ? Math.round((current / total) * 100) : 0;
  progressText.textContent = `${current}/${total} (${pct}%)`;
};

const jsonpRequest = (url, params = {}, timeoutMs = 15000) => {
  return new Promise((resolve, reject) => {
    const callbackName = `__jsonp_cb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    params.callback = callbackName;
    const query = new URLSearchParams(params);
    const script = document.createElement("script");
    script.src = `${url}?${query.toString()}`;
    script.async = true;

    const cleanup = () => {
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Request timed out"));
    }, timeoutMs);

    window[callbackName] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error("Network error"));
    };

    document.body.appendChild(script);
  });
};

const discoverCountries = async () => {
  const endpoints = [
    "https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/availableCountries",
    "https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/availableStorefronts"
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await jsonpRequest(endpoint, {}, 8000);
      if (Array.isArray(data) && data.length > 0) {
        const codes = Array.from(new Set(
          data
            .filter((item) => typeof item === "string" && item.length === 2)
            .map((item) => item.toUpperCase())
        ));
        if (codes.length) {
          return codes.sort();
        }
      }
      if (Array.isArray(data)) {
        const codes = [];
        for (const item of data) {
          if (item && typeof item === "object") {
            const cc = item.countryCode || item.country;
            if (typeof cc === "string" && cc.length === 2) {
              codes.push(cc.toUpperCase());
            }
          }
        }
        if (codes.length) {
          return Array.from(new Set(codes)).sort();
        }
      }
    } catch (err) {
      // ignore and fall back
    }
  }

  return [...FALLBACK_COUNTRIES];
};

const lookupCountry = async (appId, country) => {
  const params = {
    id: appId,
    country: country
  };
  try {
    const data = await jsonpRequest(ITUNES_LOOKUP_URL, params, 15000);
    if (!data || typeof data !== "object" || data.resultCount === 0) {
      return { avg: null, count: null, url: `https://apps.apple.com/${country.toLowerCase()}/app/id${appId}` };
    }
    const results = Array.isArray(data.results) ? data.results : [];
    const entry = results.find((item) => {
      const kind = item?.kind || item?.wrapperType;
      return kind === "software" || item?.trackId;
    });
    if (!entry) {
      return { avg: null, count: null, url: `https://apps.apple.com/${country.toLowerCase()}/app/id${appId}` };
    }
    const avgRaw = entry.averageUserRating ?? entry.averageUserRatingForCurrentVersion;
    const countRaw = entry.userRatingCount ?? entry.userRatingCountForCurrentVersion;

    const avgNumber = avgRaw === null || avgRaw === undefined ? null : Number.parseFloat(String(avgRaw));
    const countNumber = countRaw === null || countRaw === undefined ? null : Number.parseInt(String(countRaw), 10);

    const normalizedCount = Number.isFinite(countNumber) && countNumber > 0 ? countNumber : null;
    const normalizedAvg = Number.isFinite(avgNumber) && normalizedCount !== null && avgNumber > 0
      ? Number(avgNumber.toFixed(2))
      : null;
    const url = entry.trackViewUrl || `https://apps.apple.com/${country.toLowerCase()}/app/id${appId}`;
    return { avg: normalizedAvg, count: normalizedCount, url };
  } catch (err) {
    return { avg: null, count: null, url: `https://apps.apple.com/${country.toLowerCase()}/app/id${appId}` };
  }
};

const parseRssReviews = (feed) => {
  if (!feed || typeof feed !== "object") return [];
  const entries = feed?.feed?.entry;
  if (!Array.isArray(entries)) return [];
  const reviews = [];
  for (const entry of entries) {
    const rating = entry?.["im:rating"]?.label;
    if (!rating) continue;
    reviews.push({
      title: entry?.title?.label ?? "",
      rating: Number(entry?.["im:rating"]?.label ?? 0) || 0,
      author: entry?.author?.name?.label ?? "",
      version: entry?.["im:version"]?.label ?? "",
      updated: entry?.updated?.label ?? "",
      content: entry?.content?.label ?? "",
      voteCount: entry?.["im:voteCount"]?.label ?? "",
      voteSum: entry?.["im:voteSum"]?.label ?? "",
      link: entry?.link?.attributes?.href ?? ""
    });
  }
  return reviews;
};

const fetchReviews = async (appId, country, maxReviews) => {
  const urls = [
    RSS_URL_PATH.replace("{id}", appId).replace("{country}", country.toLowerCase()),
    RSS_URL_CC.replace("{id}", appId).replace("{country}", country.toUpperCase())
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json"
        }
      });
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      const reviews = parseRssReviews(data);
      if (reviews.length) {
        return maxReviews > 0 ? reviews.slice(0, maxReviews) : reviews;
      }
    } catch (err) {
      // ignore and try next
    }
  }
  return [];
};

const scanCountry = async (appId, country, maxReviews) => {
  const fallbackUrl = `https://apps.apple.com/${country.toLowerCase()}/app/id${appId}`;
  const { avg, count, url } = await lookupCountry(appId, country);
  let reviews = [];
  if (maxReviews > 0) {
    reviews = await fetchReviews(appId, country, maxReviews);
  }
  return {
    country: country.toUpperCase(),
    flag: flagEmoji(country),
    countryName: getCountryName(country),
    avgRating: avg,
    ratingCount: count,
    storeUrl: url || fallbackUrl,
    reviews
  };
};

const runScan = async (appId, countries, maxReviews, concurrency, onProgress) => {
  const results = new Array(countries.length);
  let completed = 0;
  let index = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= countries.length) {
        break;
      }
      const cc = countries[currentIndex];
      try {
        const result = await scanCountry(appId, cc, maxReviews);
        results[currentIndex] = result;
      } catch (err) {
        results[currentIndex] = {
          country: cc.toUpperCase(),
          flag: flagEmoji(cc),
          countryName: getCountryName(cc),
          avgRating: null,
          ratingCount: null,
          storeUrl: `https://apps.apple.com/${cc.toLowerCase()}/app/id${appId}`,
          reviews: []
        };
      }
      completed += 1;
      onProgress(completed, countries.length);
    }
  };

  const workers = [];
  const workerCount = Math.min(concurrency, countries.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results.sort((a, b) => a.country.localeCompare(b.country));
};

const formatNumber = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const renderTable = (results) => {
  tableBody.innerHTML = "";
  for (const result of results) {
    const row = document.createElement("tr");

    const countryCell = document.createElement("td");
    const wrapper = document.createElement("div");
    wrapper.className = "table-country";
    const flagSpan = document.createElement("span");
    flagSpan.className = "flag";
    flagSpan.textContent = result.flag || "";
    const codeSpan = document.createElement("span");
    const countryLabel = result.countryName && result.countryName !== result.country
      ? `${result.countryName} (${result.country})`
      : result.country;
    codeSpan.textContent = countryLabel;
    wrapper.appendChild(flagSpan);
    wrapper.appendChild(codeSpan);
    countryCell.appendChild(wrapper);

    const avgCell = document.createElement("td");
    avgCell.textContent = typeof result.avgRating === "number" && Number.isFinite(result.avgRating)
      ? result.avgRating.toFixed(2)
      : "—";

    const countCell = document.createElement("td");
    countCell.textContent = typeof result.ratingCount === "number" ? formatNumber(result.ratingCount) : "—";

    const linkCell = document.createElement("td");
    linkCell.className = "table-link";
    if (result.storeUrl) {
      const link = document.createElement("a");
      link.href = result.storeUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open";
      linkCell.appendChild(link);
    } else {
      linkCell.textContent = "—";
    }

    row.appendChild(countryCell);
    row.appendChild(avgCell);
    row.appendChild(countCell);
    row.appendChild(linkCell);
    tableBody.appendChild(row);
  }
};

const renderSummary = (visible) => {
  if (!resultsSummary) {
    return;
  }
  if (!allResults.length) {
    resultsSummary.textContent = "";
    return;
  }
  if (!visible.length) {
    resultsSummary.textContent = "No storefronts match the current filters.";
    return;
  }
  const total = allResults.length;
  const ratingValues = visible
    .map((item) => (typeof item.avgRating === "number" ? item.avgRating : null))
    .filter((value) => value !== null);
  const averageOfVisible = ratingValues.length
    ? (ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length)
    : null;
  const averageLabel = averageOfVisible !== null
    ? `${averageOfVisible.toFixed(2)}★`
    : "—";
  resultsSummary.textContent = `Showing ${visible.length} of ${total} storefronts · Avg rating across visible countries: ${averageLabel}`;
};

const filterResults = (data) => {
  return data.filter((result) => {
    if (filtersState.minRating > 0) {
      const avg = typeof result.avgRating === "number" ? result.avgRating : null;
      if (avg === null || avg < filtersState.minRating) {
        return false;
      }
    }
    if (filtersState.minCount > 0) {
      const count = typeof result.ratingCount === "number" ? result.ratingCount : null;
      if (count === null || count < filtersState.minCount) {
        return false;
      }
    }
    if (filtersState.onlyReviews && (!result.reviews || result.reviews.length === 0)) {
      return false;
    }
    if (filtersState.searchQuery) {
      const query = filtersState.searchQuery.trim().toLowerCase();
      const name = (result.countryName || "").toLowerCase();
      const code = (result.country || "").toLowerCase();
      if (!name.includes(query) && !code.includes(query)) {
        return false;
      }
    }
    return true;
  });
};

const getSortValue = (result, column) => {
  switch (column) {
    case "avg":
      return typeof result.avgRating === "number" ? result.avgRating : Number.NEGATIVE_INFINITY;
    case "count":
      return typeof result.ratingCount === "number" ? result.ratingCount : Number.NEGATIVE_INFINITY;
    case "country":
    default:
      return (result.countryName || result.country || "").toString();
  }
};

const sortResults = (data) => {
  const sorted = [...data];
  const { column, direction } = currentSort;
  sorted.sort((a, b) => {
    const valueA = getSortValue(a, column);
    const valueB = getSortValue(b, column);
    if (typeof valueA === "string" || typeof valueB === "string") {
      return valueA.toString().localeCompare(valueB.toString(), undefined, { sensitivity: "base" });
    }
    return valueA - valueB;
  });
  if (direction === "desc") {
    sorted.reverse();
  }
  return sorted;
};

const updateSortIndicators = () => {
  sortIndicators.forEach((indicator) => {
    const key = indicator.dataset.sortIndicator;
    indicator.classList.remove("asc", "desc", "default");
    if (currentSort.column === key) {
      indicator.classList.add(currentSort.direction);
    } else {
      indicator.classList.add("default");
    }
  });
  sortButtons.forEach((button) => {
    const key = button.dataset.sort;
    const isActive = currentSort.column === key;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.setAttribute("data-sort-direction", isActive ? currentSort.direction : "none");
  });
};

const setSort = (column) => {
  if (!column) {
    return;
  }
  if (currentSort.column === column) {
    currentSort = {
      column,
      direction: currentSort.direction === "asc" ? "desc" : "asc"
    };
  } else {
    currentSort = {
      column,
      direction: column === "country" ? "asc" : "desc"
    };
  }
  updateSortIndicators();
  void applyFiltersAndRender();
};

const applyFiltersAndRender = async () => {
  if (!allResults.length) {
    return;
  }
  const filtered = sortResults(filterResults(allResults));
  filteredResults = filtered;
  renderTable(filtered);
  renderReviews(filtered);
  renderSummary(filtered);
  await renderMap(allResults, filtered);
  updateDownloads();
};

const getActiveResults = () => (filteredResults.length ? filteredResults : allResults);

const updateDownloads = () => {
  const active = getActiveResults();
  const hasData = active.length > 0 && lastAppId;
  downloadCsvBtn.disabled = !hasData;
  downloadJsonBtn.disabled = !hasData;
};

let mapHasFitBounds = false;

const ensureMap = () => {
  if (!mapContainer || mapInstance) {
    return;
  }
  mapContainer.innerHTML = "";
  mapInstance = L.map(mapContainer, {
    zoomSnap: 0.5,
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 6,
    zoomControl: true
  }).setView([20, 0], 2.2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
    opacity: 0.65
  }).addTo(mapInstance);

  mapLegendControl = L.control({ position: "bottomright" });
  mapLegendControl.onAdd = () => {
    const div = L.DomUtil.create("div", "map-legend");
    const legendStops = [
      { label: "4.7+", value: 4.85 },
      { label: "4.3 – 4.69", value: 4.4 },
      { label: "3.8 – 4.29", value: 3.9 },
      { label: "3.3 – 3.79", value: 3.4 },
      { label: "< 3.3", value: 3.0 },
      { label: "No data", value: Number.NaN }
    ];
    div.innerHTML = legendStops
      .map(({ label, value }) => {
        const swatch = ratingToColor(value, 0.95);
        return `<span><span style="width:12px;height:12px;border-radius:50%;display:inline-block;background:${swatch};"></span>${label}</span>`;
      })
      .join("");
    return div;
  };
  mapLegendControl.addTo(mapInstance);
};

const mapGeoJsonUrl = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

const normalizeCountryCode = (feature) => {
  if (!feature) {
    return null;
  }
  const props = feature.properties || {};
  const candidates = [
    props["ISO3166-1-Alpha-2"],
    props["ISO_A2"],
    props["iso_a2"],
    props["iso2"],
    feature.id
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const code = candidate.trim().toUpperCase();
      if (code.length === 2 && code !== "-99") {
        return code;
      }
    }
  }
  return null;
};

const loadMapPolygons = async () => {
  if (mapPolygons) {
    return mapPolygons;
  }
  try {
    const response = await fetch(mapGeoJsonUrl);
    if (!response.ok) {
      throw new Error(`Failed to load GeoJSON (${response.status})`);
    }
    const geojson = await response.json();
    mapPolygons = Array.isArray(geojson?.features)
      ? geojson.features.filter((feature) => normalizeCountryCode(feature))
      : [];
  } catch (error) {
    console.error("Unable to load map data", error);
    if (mapContainer) {
      mapContainer.innerHTML = '<div class="muted">Unable to load map data right now.</div>';
    }
    mapPolygons = [];
  }
  return mapPolygons;
};

const renderMap = async (all, visible) => {
  if (!mapContainer) {
    return;
  }

  ensureMap();
  const polygons = await loadMapPolygons();
  if (!polygons.length || !mapInstance) {
    return;
  }

  const ratingByCountry = new Map();
  const detailsByCountry = new Map();
  all.forEach((result) => {
    if (typeof result.avgRating === "number" && Number.isFinite(result.avgRating)) {
      ratingByCountry.set(result.country, result.avgRating);
    }
    detailsByCountry.set(result.country, result);
  });

  const visibleCodes = new Set(visible.map((item) => item.country));
  const hasFilter = visible.length > 0 && visible.length < all.length;

  const styleFor = (feature) => {
    const code = normalizeCountryCode(feature);
    const rating = ratingByCountry.get(code);
    const isVisible = !hasFilter || visibleCodes.has(code);
    const fillColor = ratingToColor(rating, isVisible ? 0.95 : 0.35);
    const strokeColor = ratingToColor(rating, isVisible ? 1 : 0.45);
    return {
      color: strokeColor,
      weight: isVisible ? 1.4 : 0.8,
      fillColor,
      fillOpacity: 1,
      opacity: 1
    };
  };

  if (mapLayer) {
    mapLayer.remove();
    mapLayer = null;
  }

  mapLayer = L.geoJSON(polygons, {
    style: styleFor,
    onEachFeature: (feature, layer) => {
      const code = normalizeCountryCode(feature);
      const details = detailsByCountry.get(code);
      const name = details?.countryName || feature?.properties?.name || code;
      const avg = typeof details?.avgRating === "number" && Number.isFinite(details.avgRating)
        ? `${details.avgRating.toFixed(2)}★`
        : "No rating";
      const count = typeof details?.ratingCount === "number" && Number.isFinite(details.ratingCount)
        ? `${formatNumber(details.ratingCount)} ratings`
        : "No rating count";
      const reviewsLabel = details?.reviews?.length
        ? `${details.reviews.length} review${details.reviews.length === 1 ? "" : "s"}`
        : "No reviews fetched";
      layer.bindTooltip(`<strong>${name}</strong><br>${avg}<br>${count}<br>${reviewsLabel}`, { sticky: true });

      layer.on("mouseover", () => {
        layer.setStyle({
          weight: 2.6,
          fillOpacity: 1
        });
      });
      layer.on("mouseout", () => {
        mapLayer.resetStyle(layer);
      });
    }
  }).addTo(mapInstance);

  if (!mapHasFitBounds) {
    const bounds = mapLayer.getBounds();
    if (bounds && bounds.isValid()) {
      mapInstance.fitBounds(bounds, { padding: [20, 20] });
      mapHasFitBounds = true;
    }
  }
};

const renderReviews = (results) => {
  reviewsContainer.innerHTML = "";
  let rendered = 0;
  for (const result of results) {
    if (!Array.isArray(result.reviews) || !result.reviews.length) continue;

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const avgLabel = typeof result.avgRating === "number" && Number.isFinite(result.avgRating)
      ? `${result.avgRating.toFixed(2)}★ avg`
      : "Avg unavailable";
    const countLabel = typeof result.ratingCount === "number" && Number.isFinite(result.ratingCount)
      ? `${formatNumber(result.ratingCount)} ratings`
      : "Ratings unavailable";
    const summaryCountry = result.countryName && result.countryName !== result.country
      ? `${result.countryName} (${result.country})`
      : result.country;
    summary.textContent = `${result.flag ? `${result.flag} ` : ""}${summaryCountry} — ${result.reviews.length} review${result.reviews.length === 1 ? "" : "s"} · ${avgLabel} · ${countLabel}`;
    details.appendChild(summary);

    for (const review of result.reviews) {
      const item = document.createElement("div");
      item.className = "review-item";

      const header = document.createElement("div");
      header.className = "review-header";
      header.textContent = review.title || "(no title)";
      item.appendChild(header);

      const ratingLine = document.createElement("div");
      ratingLine.className = "review-rating-label";
      const ratingValue = Number(review.rating) || 0;
      if (ratingValue > 0) {
        const stars = "⭐".repeat(ratingValue);
        ratingLine.textContent = `Review rating: ${stars} (${ratingValue}/5)`;
      } else {
        ratingLine.textContent = "Review rating: not available";
      }
      item.appendChild(ratingLine);

      const meta = document.createElement("div");
      meta.className = "review-meta";
      const bits = [];
      if (review.author) bits.push(review.author);
      if (review.version) bits.push(`v${review.version}`);
      if (review.updated) bits.push(review.updated.split("T")[0]);
      meta.textContent = bits.join(" · ");
      item.appendChild(meta);

      if (review.content) {
        const body = document.createElement("div");
        body.className = "review-body";
        body.textContent = review.content;
        item.appendChild(body);
      }

      if (review.link) {
        const linkWrapper = document.createElement("div");
        linkWrapper.className = "review-link";
        const anchor = document.createElement("a");
        anchor.href = review.link;
        anchor.target = "_blank";
        anchor.rel = "noopener";
        anchor.textContent = "Permalink";
        linkWrapper.appendChild(anchor);
        item.appendChild(linkWrapper);
      }

      details.appendChild(item);
    }

    reviewsContainer.appendChild(details);
    rendered += 1;
  }
  reviewsSection.hidden = rendered === 0;
};

const buildCsv = (results) => {
  const lines = ["Country,Avg Rating,Rating Count,Store Link"];
  for (const result of results) {
    const labelParts = [result.flag || "", result.country];
    if (result.countryName && result.countryName !== result.country) {
      labelParts.push(result.countryName);
    }
    const countryLabel = labelParts.filter(Boolean).join(" ").replace(/"/g, '""');
    const avg = typeof result.avgRating === "number" ? result.avgRating.toFixed(2) : "";
    const count = typeof result.ratingCount === "number" ? result.ratingCount.toString() : "";
    const link = (result.storeUrl || "").replace(/"/g, '""');
    lines.push(`"${countryLabel}","${avg}","${count}","${link}"`);
  }
  return lines.join("\n");
};

const buildJson = (results, appId, generatedAt) => {
  return JSON.stringify({
    app_id: appId,
    generated_at: generatedAt,
    countries: results
  }, null, 2);
};

const triggerDownload = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

downloadCsvBtn.addEventListener("click", () => {
  const active = getActiveResults();
  if (!active.length || !lastAppId) return;
  const csv = buildCsv(active);
  triggerDownload(csv, `ratings_${lastAppId}.csv`, "text/csv;charset=utf-8");
});

downloadJsonBtn.addEventListener("click", () => {
  const active = getActiveResults();
  if (!active.length || !lastAppId || !lastGeneratedAt) return;
  const json = buildJson(active, lastAppId, lastGeneratedAt);
  triggerDownload(json, `ratings_reviews_${lastAppId}.json`, "application/json;charset=utf-8");
});

if (minRatingInput && minRatingDisplay) {
  minRatingDisplay.textContent = `${Number(minRatingInput.value || 0).toFixed(1)}+`;
  minRatingInput.addEventListener("input", () => {
    filtersState.minRating = Number(minRatingInput.value) || 0;
    minRatingDisplay.textContent = `${filtersState.minRating.toFixed(1)}+`;
    void applyFiltersAndRender();
  });
}

if (minCountInput) {
  minCountInput.addEventListener("input", () => {
    const rawValue = Number(minCountInput.value) || 0;
    filtersState.minCount = Math.max(0, Math.floor(rawValue));
    minCountInput.value = filtersState.minCount.toString();
    void applyFiltersAndRender();
  });
}

if (onlyReviewsInput) {
  onlyReviewsInput.addEventListener("change", () => {
    filtersState.onlyReviews = Boolean(onlyReviewsInput.checked);
    void applyFiltersAndRender();
  });
}

if (searchCountryInput) {
  searchCountryInput.addEventListener("input", () => {
    filtersState.searchQuery = searchCountryInput.value || "";
    void applyFiltersAndRender();
  });
}

if (sortButtons?.length) {
  sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSort(button.dataset.sort);
    });
  });
  updateSortIndicators();
}

const handleScan = async (event) => {
  event.preventDefault();
  const rawInput = appInput.value;
  const appId = parseAppId(rawInput);
  if (!appId) {
    setStatus("Please enter a valid App Store URL or numeric app ID.", "error");
    return;
  }

  const maxReviews = Math.max(0, Math.min(1000, Number(maxReviewsInput.value) || 0));
  maxReviewsInput.value = String(maxReviews);
  const concurrency = Math.max(1, Math.min(24, Number(concurrencyInput.value) || 12));
  const countryMode = document.querySelector('input[name="country-mode"]:checked')?.value || "auto";

  setStatus("Discovering available country storefronts…");
  resetProgress();
  resultsSection.hidden = true;
  scanButton.disabled = true;

  let countries = [];
  if (countryMode === "auto") {
    countries = await discoverCountries();
    if (!countries?.length) {
      countries = [...FALLBACK_COUNTRIES];
    }
  } else {
    countries = [...FALLBACK_COUNTRIES];
  }

  setStatus(`Scanning ${countries.length} countries… this can take a bit.`);
  updateProgress(0, countries.length);

  let results = [];
  try {
    results = await runScan(appId, countries, maxReviews, concurrency, updateProgress);
  } catch (err) {
    console.error(err);
    setStatus("Unable to complete the scan. Please try again later.", "error");
    resetProgress();
    scanButton.disabled = false;
    return;
  }

  resetProgress();
  setStatus(`Scan complete. ${results.length} storefronts checked.`);

  allResults = results;
  filteredResults = [];
  lastAppId = appId;
  lastGeneratedAt = new Date().toISOString();

  if (filtersPanel) {
    filtersPanel.hidden = false;
  }
  resultsSection.hidden = false;

  updateSortIndicators();
  await applyFiltersAndRender();

  scanButton.disabled = false;
};

document.getElementById("scan-form").addEventListener("submit", handleScan);

resetProgress();
setStatus("Ready when you are.");
updateSortIndicators();
updateDownloads();
