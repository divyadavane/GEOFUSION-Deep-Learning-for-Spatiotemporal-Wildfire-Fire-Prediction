import os
import pandas as pd
import httpx
import asyncio
import logging
from pathlib import Path
from tqdm.asyncio import tqdm

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("download_cache")

CACHE_DIR = Path("data/imagery")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

async def download_image(client, url, save_path):
    if save_path.exists():
        return True # Already cached
        
    try:
        # Increase timeout because Earth Search S3 can sometimes be slow for COGs
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
        
        with open(save_path, "wb") as f:
            f.write(response.content)
        return True
    except Exception as e:
        logger.error(f"Failed to download {url}: {e}")
        return False

async def main():
    logger.info("Loading features_with_splits_v1.parquet to extract imagery URLs...")
    df = pd.read_parquet("exports/features_with_splits_v1.parquet")
    
    # Filter rows that have a valid imagery URL
    df_with_images = df[df["latest_imagery_path"].notna()].copy()
    urls = df_with_images["latest_imagery_path"].unique()
    
    if len(urls) == 0:
        logger.warning("No imagery URLs found in the dataset! Did you refresh the materialized view and re-export?")
        return
        
    logger.info(f"Found {len(urls)} unique STAC imagery URLs to download.")
    
    # Use httpx with concurrency limits to avoid overwhelming the server
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=50)
    
    tasks = []
    async with httpx.AsyncClient(limits=limits, follow_redirects=True) as client:
        for url in urls:
            # We'll hash the URL or use a simple naming scheme. 
            # The URL typically looks like: https://.../S2B_10SDH_20170826_0_L2A/TCI.tif
            # A good safe filename is the unique part of the S3 path.
            # e.g., "S2B_10SDH_20170826_0_L2A_TCI.tif"
            parts = url.split("/")
            if len(parts) >= 2:
                safe_name = f"{parts[-2]}_{parts[-1]}"
            else:
                safe_name = url.replace("https://", "").replace("/", "_")
                
            save_path = CACHE_DIR / safe_name
            tasks.append(download_image(client, url, save_path))
            
        logger.info(f"Downloading images to {CACHE_DIR.absolute()}...")
        # Run downloads concurrently with a progress bar
        results = await tqdm.gather(*tasks, desc="Downloading TCI.tif")
        
    successes = sum(results)
    logger.info(f"Successfully cached {successes}/{len(urls)} images.")
    
    # Update the dataframe to point to the local cache paths instead of raw URLs
    # This will make the dataloader's job trivial
    def get_local_path(url):
        if pd.isna(url): return None
        parts = url.split("/")
        safe_name = f"{parts[-2]}_{parts[-1]}"
        return str(CACHE_DIR / safe_name)
        
    logger.info("Updating dataframe with local cache paths...")
    df["local_imagery_path"] = df["latest_imagery_path"].apply(get_local_path)
    
    out_path = "exports/features_with_splits_v1.parquet"
    df.to_parquet(out_path, index=False)
    logger.info(f"Saved updated dataset with local paths to {out_path}")

if __name__ == "__main__":
    asyncio.run(main())
