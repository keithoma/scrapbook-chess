"""
Quick and Dirty Terminal UI.
Queries the database to display a user's profile and recent game history.
"""

import logging
import json
import math
from datetime import datetime
from src.database.connection import get_connection

logger = logging.getLogger(__name__)


def _format_date(date_obj):
    if not date_obj:
        return "Unknown Date"
    if isinstance(date_obj, str):
        return date_obj[:10]
    return date_obj.strftime("%Y-%m-%d")


def _render_bar(current, total, width=15):
    """Renders a simple ASCII progress bar."""
    fraction = min(current / total, 1.0)
    filled = int(fraction * width)
    return f"[{'#' * filled}{'-' * (width - filled)}] {int(fraction * 100)}%"


def _get_mastery_info(exp):
    """
    Calculates Level and Next Level progress.
    Level 1: 0-100 | Level 2: 100-300 | Level 3: 300-600 | Level 4: 600-1000
    """
    if exp < 100:
        return 1, exp, 100
    if exp < 300:
        return 2, exp - 100, 200
    if exp < 600:
        return 3, exp - 300, 300
    if exp < 1000:
        return 4, exp - 600, 400
    return 5, exp, 1000  # Max Level cap for now


def show_profile(username: str):
    """Displays unlocked trophies, badge progress, and mastery."""
    print(f"\n{'='*65}")
    print(f"👤 CHESS PROFILE: {username.upper()}")
    print(f"{'='*65}")

    unlocks_query = """
        SELECT ad.type, ad.category, ad.name, uu.tier, uu.unlocked_at
        FROM user_unlocks uu
        JOIN achievement_definitions ad ON uu.def_id = ad.id
        WHERE uu.username = %s
        ORDER BY ad.type, ad.category, uu.unlocked_at DESC;
    """

    progress_query = """
        SELECT ad.type, ad.name, up.current_value
        FROM user_progress up
        JOIN achievement_definitions ad ON up.def_id = ad.id
        WHERE up.username = %s
        ORDER BY ad.type, up.current_value DESC;
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(unlocks_query, (username,))
            unlocks = cur.fetchall()

            cur.execute(progress_query, (username,))
            progress = cur.fetchall()

    if not unlocks and not progress:
        print("\n 🦗 *crickets* ... No data found. Play some games!")
        return

    # --- 1. TROPHY CABINET ---
    print("\n🏆 TROPHY CABINET (Unlocks)")
    print("-" * 65)
    if not unlocks:
        print("  (No trophies earned yet. Keep grinding!)")
    else:
        current_type = ""
        for ach_type, category, name, tier, unlocked_at in unlocks:
            if ach_type != current_type:
                print(f"\n  [{ach_type.upper()}]")
                current_type = ach_type
            date_str = _format_date(unlocked_at)
            tier_str = f"({tier.upper()})" if tier != "base" else ""
            print(f"  ✨ {name:<25} {tier_str:<10} | {date_str}")

    # --- 2. ACTIVE PROGRESS ---
    print("\n\n📈 ACTIVE GRIND (Progress)")
    print("-" * 65)

    badges = [p for p in progress if p[0] == "badge"]
    mastery = [p for p in progress if p[0] == "mastery"]

    if badges:
        print("\n  [BADGES]")
        for _, name, val in badges:
            print(f"  📊 {name:<25} | {int(val):>3}/10 to Bronze")

    if mastery:
        print("\n  [OPENING MASTERY]")
        for _, name, val in mastery:
            lvl, cur_exp, next_req = _get_mastery_info(val)
            bar = _render_bar(cur_exp, next_req)
            print(f"  📚 {name:<25} | Lvl {lvl} {bar} ({int(val)} Total EXP)")

    print(f"\n{'='*65}\n")


def show_history(username: str, limit: int = 10):
    """Displays the ledger of what was earned in recent games."""
    print(f"\n{'='*90}")
    print(f"📜 RECENT GAME HISTORY: {username.upper()}")
    print(f"{'='*90}")

    # JOIN with the 'games' table to extract JSONB data
    games_query = """
        SELECT ggl.game_id, MAX(ggl.granted_at) as recent_grant, g.game_data
        FROM game_grants_ledger ggl
        JOIN games g ON ggl.game_id = g.id
        WHERE ggl.username = %s
        GROUP BY ggl.game_id, g.game_data
        ORDER BY recent_grant DESC
        LIMIT %s;
    """

    ledger_query = """
        SELECT ad.name, ad.description, ad.type, ggl.change_amount, ggl.tier_unlocked
        FROM game_grants_ledger ggl
        JOIN achievement_definitions ad ON ggl.def_id = ad.id
        WHERE ggl.game_id = %s AND ggl.username = %s;
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(games_query, (username, limit))
            recent_games = cur.fetchall()

            if not recent_games:
                print("\n 🦗 No history found. Run the scanner first!")
                return

            for game_id, recent_grant, game_data_raw in recent_games:
                game_data = (
                    game_data_raw
                    if isinstance(game_data_raw, dict)
                    else json.loads(game_data_raw)
                )

                # --- HELPER: Aggressive Player Name Extraction (Already working) ---
                def get_player_name(color):
                    p = game_data.get("players", {}).get(color, {})
                    return (
                        p.get("user", {}).get("name")
                        or p.get("name")
                        or p.get("id")
                        or "Unknown"
                    )

                white = get_player_name("white")
                black = get_player_name("black")

                # --- FIXED: Aggressive Opening Extraction ---
                # Check top level first, then fall back to raw_api_response
                opening_obj = game_data.get("opening")
                if not opening_obj:
                    opening_obj = game_data.get("raw_api_response", {}).get(
                        "opening", {}
                    )

                opening = "Unknown Opening"
                if isinstance(opening_obj, dict):
                    opening = opening_obj.get("name", "Unknown Opening")
                elif isinstance(opening_obj, str):
                    opening = opening_obj

                date_str = _format_date(recent_grant)

                print(f"\n⚔️  {white} vs {black}")
                print(f"   Opening: {opening}")
                print(f"   [ID: {game_id} | Scanned: {date_str}]")
                print("-" * 90)

                # --- The Ledger Loop ---
                cur.execute(ledger_query, (game_id, username))
                grants = cur.fetchall()
                for g_name, g_desc, g_type, g_amount, g_tier in grants:
                    if g_type == "badge":
                        tier_msg = (
                            f" 🏅 UNLOCKED {g_tier.upper()}!" if g_tier else ""
                        )
                        print(
                            f"   📊 {g_name:<25} | +{g_amount} Prog | ({g_desc}){tier_msg}"
                        )
                    elif g_type == "mastery":
                        print(
                            f"   📈 {g_name:<25} | +{g_amount} EXP  | ({g_desc})"
                        )
                    else:
                        print(f"   ✨ {g_name:<25} | {g_desc}")

    print(f"\n{'='*90}\n")
