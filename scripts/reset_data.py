# reset_data.py
from src.database.connection import get_connection


def total_reset():
    print("🧹 Wiping EVERYTHING (Games, Users, and Progress)...")
    with get_connection() as conn:
        with conn.cursor() as cur:
            # CASCADE ensures all dependent rows in other tables are also deleted
            cur.execute(
                "TRUNCATE games, users, game_grants_ledger, user_progress, user_unlocks CASCADE;"
            )
        conn.commit()
    print("✨ Database is empty. You are now a ghost in the machine.")


if __name__ == "__main__":
    total_reset()
