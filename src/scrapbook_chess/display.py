"""
Quick and Dirty Terminal UI.
Queries the database to display a user's profile and recent game history.
"""

import json
import logging
from datetime import datetime

from scrapbook_chess.database.connection import get_connection

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
    """Displays highest unlocked trophies with custom flavor text, badge
    progress, and mastery."""
    print(f"\n{'=' * 65}")
    print(f"👤 CHESS PROFILE: {username.upper()}")
    print(f"{'=' * 65}")

    unlocks_query = """
        SELECT ad.id, ad.type, ad.category, ad.name, uu.tier, uu.unlocked_at, ad.config
        FROM user_unlocks uu
        JOIN achievement_definitions ad ON uu.def_id = ad.id
        WHERE uu.username = %s
        ORDER BY ad.type, ad.category, uu.unlocked_at DESC;
    """

    progress_query = """
        SELECT ad.type, ad.name, up.current_value, ad.config
        FROM user_progress up
        JOIN achievement_definitions ad ON up.def_id = ad.id
        WHERE up.username = %s
        ORDER BY ad.type, up.current_value DESC;
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(unlocks_query, (username,))
            unlocks_raw = cur.fetchall()

            cur.execute(progress_query, (username,))
            progress_raw = cur.fetchall()

    if not unlocks_raw and not progress_raw:
        print("\n 🦗 *crickets* ... No data found. Play some games!")
        return

    # --- 1. DYNAMICALLY FILTER HIGHEST TIERS & EXTRACT FLAVOR TEXT ---
    highest_unlocks = {}
    for (
        def_id,
        ach_type,
        category,
        name,
        tier,
        unlocked_at,
        config_raw,
    ) in unlocks_raw:
        config = (
            config_raw
            if isinstance(config_raw, dict)
            else json.loads(config_raw or "{}")
        )
        tiers_cfg = config.get("tiers", [])

        weight = 0
        flavor_text = ""

        # Parse sequential list format
        if isinstance(tiers_cfg, list):
            for idx, t in enumerate(tiers_cfg):
                if isinstance(t, dict) and t.get("name") == tier:
                    weight = idx
                    flavor_text = t.get("flavor_text", "")
                    break
        # Fallback dict format parsing
        elif isinstance(tiers_cfg, dict):
            t_val = tiers_cfg.get(tier, {})
            if isinstance(t_val, dict):
                weight = t_val.get("amount", 0)
                flavor_text = t_val.get("flavor_text", "")
            else:
                weight = t_val

        # Dedup to keep only the absolute highest tier unlocked for this badge
        # id
        if def_id not in highest_unlocks or weight > highest_unlocks[def_id]["weight"]:
            highest_unlocks[def_id] = {
                "type": ach_type or "",
                "category": category or "",
                "name": name or "",
                "tier": tier or "",
                "unlocked_at": unlocked_at,
                "weight": weight,
                "flavor_text": flavor_text or "",
            }

    # --- 2. DISPLAY TROPHY CABINET ---
    print("\n🏆 TROPHY CABINET (Highest Achieved Tiers)")
    print("-" * 65)
    if not highest_unlocks:
        print("  (No trophies earned yet. Keep grinding!)")
    else:
        current_type = ""
        # Coerce sorting keys to strings to ensure NoneType comparisons never
        # trip up the engine
        sorted_items = sorted(
            highest_unlocks.values(),
            key=lambda x: (
                str(x["type"]),
                str(x["category"]),
                x["unlocked_at"] if x["unlocked_at"] else datetime.min,
            ),
        )

        for item in sorted_items:
            if item["type"] != current_type:
                print(f"\n  [{item['type'].upper()}]")
                current_type = item["type"]

            date_str = _format_date(item["unlocked_at"])
            tier_str = f"({item['tier'].upper()})" if item["tier"] != "base" else ""
            print(f"  ✨ {item['name']:<25} {tier_str:<10} | {date_str}")
            if item["flavor_text"] and item["flavor_text"] != "**":
                print(f"     {item['flavor_text']}")

    # --- 3. ACTIVE PROGRESS ---
    print("\n\n📈 ACTIVE GRIND (Progress)")
    print("-" * 65)

    badges = [p for p in progress_raw if p[0] == "badge"]
    mastery = [p for p in progress_raw if p[0] == "mastery"]

    if badges:
        print("\n  [BADGES]")
        for _, name, val, config_raw in badges:
            config = (
                config_raw
                if isinstance(config_raw, dict)
                else json.loads(config_raw or "{}")
            )
            tiers_cfg = config.get("tiers", [])

            # Find next target tier amount dynamically based on layout
            next_target = None
            if isinstance(tiers_cfg, list):
                for t in tiers_cfg:
                    amt = t.get("amount", 0)
                    if amt > val:
                        next_target = amt
                        break
            elif isinstance(tiers_cfg, dict):
                sorted_amts = sorted(
                    [
                        v.get("amount", 0) if isinstance(v, dict) else v
                        for v in tiers_cfg.values()
                    ]
                )
                for amt in sorted_amts:
                    if amt > val:
                        next_target = amt
                        break

            target_str = (
                f"/{int(next_target)} to next tier" if next_target else " (MAXED)"
            )
            print(f"  📊 {name:<25} | {int(val):>5}{target_str}")

    if mastery:
        print("\n  [OPENING MASTERY]")
        for _, name, val, _ in mastery:
            lvl, cur_exp, next_req = _get_mastery_info(val)
            bar = _render_bar(cur_exp, next_req)
            print(f"  📚 {name:<25} | Lvl {lvl} {bar} ({int(val)} Total EXP)")

    print(f"\n{'=' * 65}\n")


def show_history(username: str, limit: int = 10):
    """Displays the ledger of what was earned in recent games."""
    print(f"\n{'=' * 90}")
    print(f"📜 RECENT GAME HISTORY: {username.upper()}")
    print(f"{'=' * 90}")

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

                cur.execute(ledger_query, (game_id, username))
                grants = cur.fetchall()
                for g_name, g_desc, g_type, g_amount, g_tier in grants:
                    if g_type == "badge":
                        tier_msg = f" 🏅 UNLOCKED {g_tier.upper()}!" if g_tier else ""
                        print(
                            f"   📊 {g_name:<25} | +{g_amount} Prog | ({g_desc}){tier_msg}"
                        )
                    elif g_type == "mastery":
                        print(f"   📈 {g_name:<25} | +{g_amount} EXP  | ({g_desc})")
                    else:
                        print(f"   ✨ {g_name:<25} | {g_desc}")

    print(f"\n{'=' * 90}\n")
