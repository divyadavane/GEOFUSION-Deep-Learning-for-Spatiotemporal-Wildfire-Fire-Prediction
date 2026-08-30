# 🌲 GeoFusion: Multimodal Deep Learning for Spatiotemporal Wildfire Prediction

[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Deck.gl](https://img.shields.io/badge/Deck.gl-9.0-green?style=flat-square)](https://deck.gl/)
[![Supabase](https://img.shields.io/badge/Supabase-PostGIS-emerald?style=flat-square&logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![WCAG 2.1 AA](https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA-purple?style=flat-square)](https://www.w3.org/WAI/WCAG21/quickref/)

**GeoFusion** is an open-source spatiotemporal deep learning platform for predicting wildfire ignition vulnerability and spread susceptibility across California. By fusing 14-day meteorological reanalysis time-series, USGS 3DEP high-resolution terrain topography, and multispectral satellite imagery, GeoFusion delivers continuous, real-time spatial risk awareness through an interactive WebGL-accelerated map interface.

---

## 📸 Key Features & Architecture

```
                                  GEOFUSION ARCHITECTURE
  ┌─────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
  │   14-Day Weather TS     │  │    USGS 3DEP Topo      │  │  Sentinel-2 Satellite  │
  │  (ERA5 / Open-Meteo)    │  │ (Elevation, Slope, Asp)│  │   (Surface Reflect)    │
  └────────────┬────────────┘  └───────────┬────────────┘  └───────────┬────────────┘
               │                           │                           │
               └───────────────────► ┌─────┴─────┐ ◄───────────────────┘
                                     │ FUSION ML │ (Cross-Attention Transformer)
                                     └─────┬─────┘
                                           │
                                           ▼
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                       SUPABASE POSTGRESQL + POSTGIS CORE                        │
  │  • Spatiotemporal Grid (grid_cells)      • Active Predictions (predictions)     │
  │  • Static Topography (static_features)   • Saved Regions (saved_regions)        │
  │  • Realtime Replication (pg_changes)     • Row Level Security (RLS)             │
  └────────────────────────────────────────┬────────────────────────────────────────┘
                                           │
                                           ▼
  ┌─────────────────────────────────────────────────────────────────────────────────┐
  │                            NEXT.JS 16 REACT FRONTEND                            │
  │  • Deck.gl WebGL Raster Layer            • MapLibre GL Basemaps                 │
  │  • 7-Day Forecast Horizon Slider         • Continuous Live Telemetry Streaming  │
  │  • Dynamic Geographic Place Locator      • Saved Region AOI Manager (/regions)  │
  │  • 14-Day Cell Drill-Down (/cell/:id)    • Active Model Provenance Card (/about)│
  └─────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Interactive WebGL Map Engine
- **Deck.gl & MapLibre GL**: Smooth, hardware-accelerated rendering of thousands of spatial grid polygons with dynamic camera `flyTo` transitions.
- **Continuous Realtime Streaming**: Subscribes to Supabase `postgres_changes` WebSocket events with glowing pulse cell highlights.
- **7-Day Forecast Horizon**: Instant slider and tabbed navigation across 7-day predictive horizons.
- **Dynamic Place Locator & Custom AOIs**: Instantly navigate between Northern California Pilot, Sierra Nevada, SoCal Coastal, or custom user-defined bounding boxes.

### 2. Deep Cell Inspection (`/cell/[cellId]`)
- **14-Day Meteorological Time-Series**: Dual-axis historical charts tracking temperature, relative humidity, wind gust velocities, and precipitation.
- **Topography Diagnostics**: Real-time slope gradient severity, solar aspect azimuth (insolation drying), and USFS Landfire fuel models.
- **Satellite Imagery Tile Viewer**: High-resolution multispectral reflectance with deterministic fallback when tiles are pending.

### 3. Saved Regions & Custom AOIs (`/regions`)
- **Auth-Gated Persistence**: Save named geographic bounding boxes to the `saved_regions` table secured by Row-Level Security (`auth.uid() = user_id`).
- **Interactive SVG Thumbnails**: Mini spatial previews showing region bounds relative to the California pilot domain.
- **In-Place Management**: Instant inline rename and delete with confirmation modals without full-page reloads.

## Live Production Deployment

- **Primary Web App:** **[https://geofusion-ai.vercel.app](https://geofusion-ai.vercel.app)**
- **Alternative Mirror:** **[https://geofusion-app.vercel.app](https://geofusion-app.vercel.app)**
- **Wildfire Portal:** **[https://geofusion-wildfire.vercel.app](https://geofusion-wildfire.vercel.app)**

### 4. Active Model Provenance Card (`/about`)
- **Database RPC Verification**: Directly queries `get_active_model()` RPC.
- **Headline Validation Metrics**: Displays **AUPRC**, **AUROC**, and **Brier Score** with **95% Confidence Intervals** and exact evaluation sample sizes ($n=20,020\text{ test cell-days}$).
- **Audit & Retraction Trail**: Transparent documentation of model versions and data provenance.

### 5. Colorblind & Accessibility Safety (WCAG 2.1 AA)
- **CVD-Safe Color Scale**: Quantitative verification across Protanopia, Deuteranopia, and Tritanopia using the Brettel/Machado matrix.
- **Full Keyboard Navigation**: Complete `Tab`, `Arrow`, `Space`, `Enter`, and `Escape` support with high-contrast `:focus-visible` rings.
- **Screen Reader Support**: Complete ARIA attributes (`role="radiogroup"`, `role="status"`, `aria-live="polite"`).

---

## 🚀 Quickstart Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ or v20+)
- [Python](https://www.python.org/) (3.10+ for data pipelines)
- [Supabase Account](https://supabase.com/) or local Supabase CLI

### 1. Repository Setup
```bash
git clone https://github.com/divyadavane/GEOFUSION-Deep-Learning-for-Spatiotemporal-Wildfire-Fire-Prediction.git
cd GEOFUSION-Deep-Learning-for-Spatiotemporal-Wildfire-Fire-Prediction
```

### 2. Configure Environment Variables
Create `frontend/.env.local` with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Start the Next.js Frontend
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🗄️ Database & Backend Architecture

The backend is built on **PostgreSQL with PostGIS** and managed via Supabase migrations in [`supabase/migrations`](./supabase/migrations):

| Migration | Purpose |
| :--- | :--- |
| `00000000000002_create_grid_cells.sql` | PostGIS 10km grid polygon cell definitions with spatial indexing. |
| `00000000000004_create_weather_series.sql` | 14-day hourly/daily meteorological time-series records. |
| `00000000000005_create_static_features.sql` | USGS 3DEP elevation, slope, aspect, and fuel model classifications. |
| `00000000000007_create_models_and_predictions.sql` | MLflow model registry and daily risk prediction scores. |
| `00000000000008_roles_and_rls_policies.sql` | Strict Row-Level Security policies for `authenticated_viewer`, `researcher`, and `admin`. |
| `00000000000012_rpc_functions.sql` | PostgreSQL RPC endpoints (`get_risk_heatmap`, `get_cell_timeseries`). |
| `00000000000021_create_saved_regions.sql` | User-monitored spatial AOI bounding boxes with RLS user scoping. |
| `00000000000022_create_get_active_model_rpc.sql` | Model registry RPC returning production metrics and 95% CIs. |

---

## 🔬 Model Performance & Validation

| Metric | Point Estimate | 95% Confidence Interval | Sample Size ($N$) | Evaluation Context |
| :--- | :--- | :--- | :--- | :--- |
| **AUPRC** | **0.0039** | `[0.0021, 0.0104]` | $n=20,020$ test cell-days | 37 authentic FIRMS fires (~2.2× over 0.0018 baseline) |
| **AUROC** | **0.6290** | `[0.5294, 0.7127]` | $n=20,020$ test cell-days | Pairwise temporal ranking discrimination |
| **Brier Score** | **0.1738** | `[0.1520, 0.1950]` | $n=20,020$ test cell-days | Probability calibration against NASA FIRMS ground truth |
| **Val Sensitivity** | `0.0052` | `[0.0020, 0.0121]` | $n=1,785$ val cell-days | Reserved strictly for early stopping (4 positives) |

*All headline metrics are computed using 1,000-iteration non-parametric bootstrap resampling on held-out temporal test splits.*

---

## 📱 Responsive & Accessibility Standards

- **Tablet-First Support**: Polished layouts for both portrait ($768 \times 1024$) and landscape ($1024 \times 768$) viewports.
- **Touch Target Sizes**: All interactive elements satisfy the WCAG 2.5.5 requirement ($\ge 44 \times 44\text{px}$).
- **Accessibility**: Validated against screen readers (NVDA / VoiceOver) and colorblind simulations (Protanopia / Deuteranopia).

---

## 📄 License & Citations

This project is licensed under the MIT License.

```bibtex
@software{geofusion2026,
  author = {Divyanshu Davane},
  title = {GeoFusion: Multimodal Deep Learning for Spatiotemporal Wildfire Prediction},
  year = {2026},
  url = {https://github.com/divyadavane/GEOFUSION-Deep-Learning-for-Spatiotemporal-Wildfire-Fire-Prediction}
}
```