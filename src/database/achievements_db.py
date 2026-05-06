import logging
from .connection import get_connection

logger = logging.getLogger(__name__)

def setup_achievements_db():
    """Creates the tracking table for achievements."""
    query = """
    CREATE TABLE IF NOT EXISTS game_achievements (
        game_id TEXT,
        username TEXT,
        achievement_slug TEXT,
        granted_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (game_id, achievement_slug)
    );
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query)
        conn.commit()
    logger.debug("Database table 'game_achievements' verified.")