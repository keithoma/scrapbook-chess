# Dev Scripts

## 1. Lichess API Verification

Tests connectivity and prints the raw NDJSON response structure. Requires `.env` setup.

```Bash
# From project root
uv run scripts/lichess_api.py
```

## 2. Database Reset

Utility script to purge the local development database.

```Bash
# From project root
python scripts/reset_db.py          # Prompts for verification
python scripts/reset_db.py --force  # Bypasses confirmation
```