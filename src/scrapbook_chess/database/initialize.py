"""
Initializes all the databases.
"""

import logging

from .connection import get_connection

logger = logging.getLogger(__name__)


def initialize_database() -> None:
    """
    Executes core DDL statements to construct the chess achievement database.
    Tables are ordered strictly by relational dependencies.
    """

    # 1. Independent Core Tables
    core_tables = """
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        played_at TIMESTAMPTZ NOT NULL,
        rated BOOLEAN NOT NULL,
        speed TEXT NOT NULL,
        score TEXT NOT NULL,
        game_data JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS achievement_definitions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT,
        subcategory TEXT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        flavor_text TEXT,
        is_hidden BOOLEAN DEFAULT FALSE,
        config JSONB DEFAULT '{}'::jsonb
    );
    """

    # 2. Dependent Relational Tables (Foreign Keys)
    dependent_tables = """
    CREATE TABLE IF NOT EXISTS user_progress (
        username TEXT REFERENCES users(username) ON DELETE CASCADE,
        def_id TEXT REFERENCES achievement_definitions(id) ON DELETE CASCADE,
        current_value REAL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (username, def_id)
    );

    CREATE TABLE IF NOT EXISTS user_unlocks (
        username TEXT REFERENCES users(username) ON DELETE CASCADE,
        def_id TEXT REFERENCES achievement_definitions(id) ON DELETE CASCADE,
        tier TEXT DEFAULT 'base',
        unlocked_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (username, def_id, tier)
    );

    CREATE TABLE IF NOT EXISTS game_grants_ledger (
        id SERIAL PRIMARY KEY,
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        username TEXT REFERENCES users(username) ON DELETE CASCADE,
        def_id TEXT REFERENCES achievement_definitions(id) ON DELETE CASCADE,
        change_amount REAL,
        tier_unlocked TEXT,
        performance_grade TEXT,
        granted_at TIMESTAMPTZ DEFAULT NOW()
    );
    """

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Execute core tables first
                logger.debug("Creating core tables (users, games, definitions)...")
                cur.execute(core_tables)

                # Execute dependent tables second
                logger.debug("Creating dependent progress and ledger tables...")
                cur.execute(dependent_tables)

            # Commit everything atomically in a single transaction
            conn.commit()
        logger.info("⚡ Database schema initialization successful.")

    except Exception as e:
        logger.error(f"❌ Critical database initialization failure: {e}")
        raise e
