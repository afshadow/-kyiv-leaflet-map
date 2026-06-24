# Agent Instructions: Hybrid Map & Routing Project

0. маршрут самолета



## 1. Project Context & Concept
- **Core Idea:** A map application using OpenStreetMap (OSM) for the visual map tile layer (to save budget) and Google Maps Routing/Directions API for calculating and fetching path coordinates.
- **Tech Stack:** JavaScript/TypeScript, Leaflet.js (or OpenLayers) for OSM rendering, Axios/Fetch for Google API requests.

## 2. Architectural Rules (Strict)
- **Map Rendering:** ALWAYS use Leaflet.js with OpenStreetMap tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`). NEVER load the heavy Google Maps JavaScript API for map rendering.
- **Routing Engine:** Use Google Directions API (or Google Maps Routes API) solely as a backend/fetch service to get polyline/geometry data.
- **Data Pipeline:** Fetch the route polyline from Google, decode it, and render it as a vector layer (`L.polyline`) on top of the OSM map.

## 3. Directory Structure
- `/src/components/Map` - Core map components and Leaflet initialization.
- `/src/services/routing` - Google Maps API integration and polyline decoding logic.
- `/src/utils` - Polyline decoding algorithms (e.g., Google's encoded polyline algorithm).

## 4. Code Quality & Constraints
- Keep Google API keys secured via environment variables (`process.env`). NEVER hardcode keys in frontend files.
- Use efficient polyline decoding to prevent UI lagging when rendering long routes.
- Implement proper error handling for cases when Google API limits are reached or a route cannot be found.

## 5. Automation Commands
- **Install dependencies:** `npm install leaflet @types/leaflet axios`
- **Run dev server:** `npm run dev`
- **Build project:** `npm run build`