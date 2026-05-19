import logging
from .connection import get_connection

logger = logging.getLogger(__name__)


def setup_achievements_db() -> None:
    query = """
    -- ==========================================
    -- 1. ENTITIES & DEFINITIONS
    -- ==========================================

    -- Future-proofing: We need a users table for auth and settings later.
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- The Dictionary: Every achievement exists here, regardless of type.
    CREATE TABLE IF NOT EXISTS achievement_definitions (
        id TEXT PRIMARY KEY,          -- e.g., 'feat_castling_mate', 'badge_wins'
        type TEXT NOT NULL,           -- 'story', 'badge', 'mastery', 'feat'
        category TEXT,                -- 'Combat', 'Openings', 'Milestones'
        subcategory TEXT,             -- 'Ruy Lopez', 'Endgames'
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        flavor_text TEXT,
        is_hidden BOOLEAN DEFAULT FALSE, -- For negative/secret feats
        
        -- JSONB handles the varying logic!
        -- Badges store { "bronze": 1, "silver": 5, "gold": 25 }
        -- Story stores { "requires": ["play_first_game"] }
        config JSONB DEFAULT '{}'::jsonb 
    );

    -- ==========================================
    -- 2. USER STATE (THE PROGRESS)
    -- ==========================================

    -- Tracks accumulating numbers (Mastery EXP, Badge win counts)
    CREATE TABLE IF NOT EXISTS user_progress (
        username TEXT REFERENCES users(username),
        def_id TEXT REFERENCES achievement_definitions(id),
        current_value REAL DEFAULT 0, -- EXP or Count
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (username, def_id)
    );

    -- Tracks permanent unlocks (Feats earned, Story nodes passed, Badge Tiers reached)
    CREATE TABLE IF NOT EXISTS user_unlocks (
        username TEXT REFERENCES users(username),
        def_id TEXT REFERENCES achievement_definitions(id),
        tier TEXT DEFAULT 'base',     -- 'base' for Feats, 'gold' for Badges, 'S-' for Mastery grades
        unlocked_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (username, def_id, tier)
    );

    -- ==========================================
    -- 3. THE LEDGER (GAME HISTORY UI)
    -- ==========================================

    -- When a user views a specific game, this tells the UI exactly what was earned.
    CREATE TABLE IF NOT EXISTS game_grants_ledger (
        id SERIAL PRIMARY KEY,
        game_id TEXT, -- References your existing games table
        username TEXT REFERENCES users(username),
        def_id TEXT REFERENCES achievement_definitions(id),
        
        change_amount REAL,           -- e.g., "+15 EXP" or "+1 Win"
        tier_unlocked TEXT,           -- Did this game push them over the edge to 'Gold'?
        performance_grade TEXT,       -- e.g., 'S-', 'A', 'B+' (Mainly for Mastery)
        granted_at TIMESTAMPTZ DEFAULT NOW()
    );
    """

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
            conn.commit()
        logger.debug(
            "Database schemas verified (Single Table Inheritance applied)."
        )
    except Exception as e:
        logger.error(f"Failed to initialize database schemas: {e}")
