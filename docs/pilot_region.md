# Pilot Region: northern_california_pilot

- **Bounding Box**: [-124.0, 38.0] to [-120.0, 42.0]
- **Resolution**: ~10km (0.1 degrees)
- **Total Grid Cells**: 1600

## Justification
Northern California provides an excellent pilot region due to its varied topography and high historical fire activity (e.g., the 2018 Camp Fire and 2020 August Complex). A 10km spatial resolution was selected to balance fine-grained spatial features against the volume of API requests necessary to backfill historical weather (ERA5) and imagery (Sentinel-2) data within the free tier rate limits of public APIs like Open-Meteo.
