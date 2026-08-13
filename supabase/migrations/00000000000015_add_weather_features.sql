-- 00000000000015_add_weather_features.sql
ALTER TABLE public.weather_series
ADD COLUMN wind_gusts_ms numeric,
ADD COLUMN soil_moisture numeric;
