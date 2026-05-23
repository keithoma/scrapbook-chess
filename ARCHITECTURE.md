# Scrapbook; Chess - Architecture & Project Structure

## Overview

Scrapbook; Chess is currently a Python-based CLI application (planning to deploy it as
web application soon) that fetches chess games from Lichess (and later from chess.com),
analyzes them with Stockfish engine, and tracks player achievements through a gamified
trophy system.

## Project Structure

```
scrapbook-chess/
├── .git/                          # Git version control
├── .gitignore                     # Git ignore rules
├── .python-version                # Python version specification (3.12)
├── uv.lock                        # UV package manager lock file
├── pyproject.toml                 # Project dependencies and metadata
│
├── main.py                        # CLI entry point - parses arguments and orchestrates pipeline
├── reset_data.py                  # Utility script to reset database data
│
├── data/                          # Static data and configuration files
│   ├── achievements/              # Achievement rule definitions
│   │   ├── badges_evaluation.yml  # Badge rules for evaluation metrics
│   │   ├── badges_hybrid.yml      # Badge rules for hybrid achievements
│   │   ├── badges_meta.yml        # Badge rules for meta achievements
│   │   ├── badges_position.yml    # Badge rules for position-based achievements
│   │   ├── feats.json             # Feat achievement definitions (one-time accomplishments)
│   │   ├── mastery.json           # Mastery/EXP system for opening expertise
│   │   └── story.json             # Story/narrative achievement definitions
│   │
│   ├── schema.sql                 # Database schema definition (legacy/reference)
│   └── opening_books/             # Opening book databases (not present in repo, referenced in config)
│
├── design/                        # Design documentation and ideas
│   ├── achievement_ideas.md       # Brainstorming and ideas for achievements
│   └── engines.md                 # Documentation about chess engines
│
├── scripts/                       # Utility scripts
│   ├── __init__.py
│   └── reset_data.py              # Script to reset/clear database data
│
└── src/                           # Main application source code
    ├── __init__.py
    ├── config.py                  # Configuration management (paths, engine location, database URL)
    ├── orchestrator.py            # Main pipeline orchestrator - coordinates all workflow steps
    ├── display.py                 # UI display functions (profile, history views)
    │
    ├── achievements/              # Achievement scanning and evaluation logic
    │   ├── __init__.py
    │   ├── scanner.py             # AchievementScanner - evaluates games against achievement rules
    │   ├── metrics.py             # GameMetrics - calculates game statistics and metrics
    │   └── engine.py              # Achievement engine logic
    │
    ├── analysis/                  # Chess engine analysis
    │   ├── __init__.py
    │   ├── engine_runner.py       # Batch processing of games for Stockfish analysis
    │   └── stockfish_analyzer.py  # AchievementAnalyzer - Stockfish wrapper for game evaluation
    │
    └── database/                  # Database operations and models
        ├── __init__.py
        ├── connection.py          # PostgreSQL connection management
        ├── achievements_db.py     # Achievement database schema setup (Single Table Inheritance)
        ├── ingest_games.py        # Lichess API game fetching and storage
        ├── ledger.py              # AchievementLedger - tracks progress and unlocks
        └── seed_achievements.py   # Seeds achievement definitions from JSON files
```

## Architecture Flow

### 1. Entry Point (`main.py`)
- Parses CLI arguments (user, limit, skip flags, debug mode, etc.)
- Handles display-only modes (`--profile`, `--history`)
- Configures logging
- Delegates to `orchestrator.run_pipeline()`

### 2. Pipeline Orchestration (`src/orchestrator.py`)
The main pipeline consists of three stages:

#### Stage 0: Infrastructure
- `setup_achievements_db()` - Initializes database schema using Single Table Inheritance pattern

#### Stage 1: Ingestion
- `fetch_and_store_games()` - Pulls recent games from Lichess API
- Stores games in PostgreSQL `games` table with JSONB game_data

#### Stage 2: Engine Analysis
- `analyze_pending_games()` - Runs Stockfish deep analysis on unanalyzed games
- Uses `AchievementAnalyzer` for low-depth (8) and high-depth (16) evaluation
- Annotates PGNs with NAG symbols and stores move evaluations

#### Stage 3: Achievement Scanning
- `process_achievements()` - Scans analyzed games for achievements
- Uses `AchievementScanner` to evaluate against JSON rule definitions
- Records progress in `user_progress` and unlocks in `user_unlocks`
- Optionally exports annotated PGNs to `debug/pgn_files/`

## Database Schema

The database uses PostgreSQL with JSONB for flexible data storage:

### Core Tables
- **`users`** - User accounts and metadata
- **`achievement_definitions`** - All achievement types (badges, mastery, feats, story) using Single Table Inheritance
- **`user_progress`** - Accumulating values (EXP, win counts, etc.)
- **`user_unlocks`** - Permanent unlocks with tier information
- **`games`** - Game data from Lichess with analysis results
- **`game_grants_ledger`** - History of what was earned per game (for UI display)

### Key Design Pattern
- **Single Table Inheritance**: All achievement types share one table with a `type` field and flexible `config` JSONB column
- **JSONB Storage**: Game data and achievement configs stored as JSON for schema flexibility

## Achievement Types

### Badges
- Tiered achievements (Bronze, Silver, Gold)
- Track cumulative counts (wins, games played, etc.)
- Examples: Total wins, Blitz wins, Rapid wins

### Mastery
- EXP-based system for opening expertise
- Awards EXP based on ECO code matches and game quality
- Graded system (S-, A, B+, etc.)

### Feats
- One-time accomplishments
- Situational achievements (marathons, comebacks, etc.)

### Story
- Narrative progression
- Sequential achievement chains

## Configuration

### Environment Variables (via `.env`)
- `STOCKFISH_PATH` - Path to Stockfish executable (default: `/usr/games/stockfish`)
- `DATABASE_URL` - PostgreSQL connection string

### Key Paths (in `src/config.py`)
- `ROOT_DIR` - Project root directory
- `BOOK_PATH` - Opening book database path (40H-PGN)

## Dependencies

Key Python packages (from `pyproject.toml`):
- `psycopg[binary]` - PostgreSQL adapter
- `python-chess` - Chess game logic and PGN handling
- `python-dotenv` - Environment variable management
- `requests` - HTTP client for Lichess API
- `tqdm` - Progress bars

## CLI Usage

```bash
# Basic usage
uv run main.py

# Specify user and game limit
uv run main.py -u username -l 100

# Skip fetching (use local DB only)
uv run main.py --skip-fetch

# Skip heavy analysis
uv run main.py --skip-analysis

# View profile
uv run main.py --profile

# View history
uv run main.py --history

# Export annotated PGNs
uv run main.py --export-pgn

# Debug mode
uv run main.py --debug
```

## Data Flow Summary

1. **Lichess API** → `ingest_games.py` → PostgreSQL `games` table
2. **PostgreSQL** → `engine_runner.py` → Stockfish analysis → Annotated PGNs
3. **PostgreSQL + JSON rules** → `scanner.py` → `metrics.py` → Achievement evaluation
4. **Achievement results** → `ledger.py` → `user_progress` / `user_unlocks` / `game_grants_ledger`
5. **Display** → `display.py` → Profile/History UI

## External Resources

- **Stockfish**: GPL-3.0 chess engine (https://stockfishchess.org/)
- **Lichess**: Game data and API (CC BY-SA 4.0)
- **python-chess**: GPL-3.0 Python chess library
- **40H-PGN**: Opening databases (Freeware)
