"""
Quick and Dirty Terminal UI.

Queries the database to display a user's profile (achievements) 
and their recent game history ledger.
"""

import logging
from datetime import datetime
from src.database.connection import get_connection

logger = logging.getLogger(__name__)

def _format_date(date_obj):
    if not date_obj:
        return "Unknown Date"
    if isinstance(date_obj, str):
        return date_obj[:10]
    return date_obj.strftime("%Y-%m-%d")

def show_profile(username: str):
    """Displays unlocked trophies, badge progress, and mastery."""
    print(f"\n{'='*50}")
    print(f"👤 CHESS PROFILE: {username.upper()}")
    print(f"{'='*50}")

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
    print("-" * 50)
    if not unlocks:
        print("  (No trophies earned yet. Keep grinding!)")
    else:
        current_type = ""
        for ach_type, category, name, tier, unlocked_at in unlocks:
            if ach_type != current_type:
                print(f"\n  [{ach_type.upper()}]")
                current_type = ach_type
            date_str = _format_date(unlocked_at)
            tier_str = f"({tier.upper()})" if tier != 'base' else ""
            print(f"  ✨ {name:<25} {tier_str:<10} | {date_str}")

    # --- 2. ACTIVE PROGRESS ---
    print("\n\n📈 ACTIVE GRIND (Progress)")
    print("-" * 50)
    
    badges = [p for p in progress if p[0] == 'badge']
    mastery = [p for p in progress if p[0] == 'mastery']
    
    if badges:
        print("\n  [BADGES]")
        for _, name, val in badges:
            print(f"  📊 {name:<25} | {int(val)}/10 to Bronze")
            
    if mastery:
        print("\n  [MASTERY]")
        for _, name, val in mastery:
            print(f"  📚 {name:<25} | EXP: {val:.1f}")
            
    print(f"\n{'='*50}\n")


def show_history(username: str, limit: int = 5):
    """Displays the ledger of what was earned in recent games."""
    print(f"\n{'='*60}")
    print(f"📜 RECENT GAME HISTORY: {username.upper()}")
    print(f"{'='*60}")

    # FIX: Group by game_id and grab the max timestamp to avoid duplicate blocks
    games_query = """
        SELECT game_id, MAX(granted_at) as recent_grant
        FROM game_grants_ledger
        WHERE username = %s
        GROUP BY game_id
        ORDER BY recent_grant DESC
        LIMIT %s;
    """

    ledger_query = """
        SELECT ad.name, ad.type, ggl.change_amount, ggl.tier_unlocked
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

            for game_id, recent_grant in recent_games:
                date_str = _format_date(recent_grant)
                print(f"\n⚔️  GAME ID: {game_id} | Scanned on: {date_str}")
                print("-" * 60)
                
                cur.execute(ledger_query, (game_id, username))
                grants = cur.fetchall()
                
                for name, ach_type, amount, tier in grants:
                    if ach_type == 'feat' or ach_type == 'story':
                        print(f"   🎉 UNLOCKED: {name}")
                    elif ach_type == 'mastery':
                        print(f"   📈 {name:<25} | +{amount} EXP")
                    elif ach_type == 'badge':
                        print(f"   📊 {name:<25} | +{amount} Progress")
                        
    print(f"\n{'='*60}\n")