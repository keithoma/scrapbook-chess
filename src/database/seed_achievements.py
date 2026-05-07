"""
Achievement Dictionary Seeder.

Run this script to populate or update the 'achievement_definitions' table 
with the master list of all available trophies, badges, and feats loaded 
from the JSON files in the /data/achievements/ directory.
"""

import logging
import json
import glob
from pathlib import Path
from src.database.connection import get_connection

logger = logging.getLogger(__name__)

def load_json_files() -> list:
    """Loads all achievement JSON files from the data directory."""
    achievements = []
    # Traverse up from src/database/seed_achievements.py to the root, then into data/
    root_dir = Path(__file__).resolve().parent.parent.parent
    data_dir = root_dir / "data" / "achievements"
    
    # Find all JSON files in the directory
    pattern = str(data_dir / "*.json")
    for filepath in glob.glob(pattern):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                achievements.extend(data)
                logger.debug("Loaded %d achievements from %s", len(data), Path(filepath).name)
        except Exception as e:
            logger.error("Error loading %s: %s", filepath, e)
            
    return achievements

def seed_database():
    """Upserts the achievement dictionary into the PostgreSQL database."""
    query = """
        INSERT INTO achievement_definitions 
            (id, type, category, subcategory, name, description, flavor_text, is_hidden, config)
        VALUES 
            (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            category = EXCLUDED.category,
            subcategory = EXCLUDED.subcategory,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            flavor_text = EXCLUDED.flavor_text,
            is_hidden = EXCLUDED.is_hidden,
            config = EXCLUDED.config;
    """
    
    logger.info("🌱 Loading Achievement Definitions from JSON...")
    achievements = load_json_files()
    
    if not achievements:
        logger.error("❌ No achievements found to seed. Check your /data/achievements folder.")
        return

    logger.info("💾 Seeding %d achievements into the database...", len(achievements))
    
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                for ach in achievements:
                    # Using .get() ensures we insert NULL if a specific JSON doesn't have that key
                    cur.execute(query, (
                        ach.get('id'),
                        ach.get('type'),
                        ach.get('category'),
                        ach.get('subcategory'), 
                        ach.get('name'),
                        ach.get('description'),
                        ach.get('flavor_text'),
                        ach.get('is_hidden', False),
                        json.dumps(ach.get('config', {}))
                    ))
            conn.commit()
        logger.info("✅ Successfully seeded the database.")
    except Exception as e:
        logger.error("❌ Failed to seed database: %s", e)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    seed_database()