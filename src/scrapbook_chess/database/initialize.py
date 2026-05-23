"""Initializes all the databases."""

import logging

from .connection import get_connection

logger = logging.getLogger(__name__)


def initialize_database() -> None:
    """Executes core DDL statements to construct the chess achievement database.

    Tables are ordered strictly by relational dependencies.
    """
    # Safeguard: Drop the view before altering underlying tables
    drop_view = "DROP VIEW IF EXISTS master_game_history CASCADE;"

    # 1. Independent Core Tables (Now using the High-Speed Flat Schema)
    core_tables = """
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS games (
        -- Baseline Metadata
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        played_at TIMESTAMPTZ NOT NULL,
        time_control TEXT NOT NULL,
        is_rated BOOLEAN NOT NULL,
        score TEXT NOT NULL,
        termination_status TEXT NOT NULL,
        opening_name TEXT,
        opening_eco TEXT,
        
        -- Player Objective Data
        white_username TEXT NOT NULL,
        white_rating INT NOT NULL,
        white_rating_diff INT,
        black_username TEXT NOT NULL,
        black_rating INT NOT NULL,
        black_rating_diff INT,
        
        -- Move & Time Data
        raw_moves TEXT NOT NULL,
        clocks INT[],

        -- Pipeline Status
        pipeline_status TEXT DEFAULT 'INGESTED',

        -- Stage 1 & 2: Engine and Annotator Data
        move_evals JSONB,
        annotated_pgn TEXT,
        ply_classifications JSONB,

        -- Fast Search Aggregates (Calculated by Metrics)
        blunders_count INT DEFAULT 0,
        mistakes_count INT DEFAULT 0,
        inaccuracies_count INT DEFAULT 0,
        book_moves_count INT DEFAULT 0,
        acpl REAL DEFAULT 0.0,

        -- The Property Bag for Custom YAML Achievements
        metrics JSONB DEFAULT '{}'::jsonb
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

    # 2. Dependent Relational Tables
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

    # 3. The Master View (Combines static game data with earned achievements)
    master_view = """
    CREATE OR REPLACE VIEW master_game_history AS
    SELECT 
        g.id AS game_id,
        g.platform,
        g.played_at,
        g.time_control,
        g.is_rated,
        g.score,
        g.termination_status,
        g.opening_name,
        g.opening_eco,
        g.white_username,
        g.white_rating,
        g.white_rating_diff,
        g.black_username,
        g.black_rating,
        g.black_rating_diff,
        g.raw_moves,
        g.clocks,
        g.pipeline_status,
        g.move_evals,
        g.annotated_pgn,
        g.ply_classifications,
        g.blunders_count,
        g.mistakes_count,
        g.inaccuracies_count,
        g.book_moves_count,
        g.acpl,
        g.metrics,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'achievement_id', l.def_id,
                    'tier_unlocked', l.tier_unlocked,
                    'progress_gained', l.change_amount
                )
            ) FILTER (WHERE l.def_id IS NOT NULL), '[]'::jsonb
        ) AS achievements_earned
    FROM games g
    LEFT JOIN game_grants_ledger l ON g.id = l.game_id
    GROUP BY 
        g.id, g.platform, g.played_at, g.time_control, g.is_rated, g.score, 
        g.termination_status, g.opening_name, g.opening_eco, 
        g.white_username, g.white_rating, g.white_rating_diff, 
        g.black_username, g.black_rating, g.black_rating_diff, 
        g.raw_moves, g.clocks, g.pipeline_status, g.move_evals, 
        g.annotated_pgn, g.ply_classifications, g.blunders_count, 
        g.mistakes_count, g.inaccuracies_count, g.book_moves_count, 
        g.acpl, g.metrics;
    """

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                logger.debug("Dropping stale views...")
                cur.execute(drop_view)

                logger.debug("Creating core flat tables...")
                cur.execute(core_tables)

                logger.debug("Creating dependent progress and ledger tables...")
                cur.execute(dependent_tables)
                
                logger.debug("Creating master history view...")
                cur.execute(master_view)

            conn.commit()
        logger.info("⚡ Database schema initialization successful.")

    except Exception as e:
        logger.error(f"❌ Critical database initialization failure: {e}")
        raise e