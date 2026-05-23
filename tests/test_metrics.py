from datetime import UTC, datetime

from scrapbook_chess.achievements.metrics import GameMetrics


def test_game_metrics():
    """Test that basic win/loss logic works correctly."""
    row_data = {
        "game_id": "test_1",
        "time_control": "blitz",
        "score": "1-0",
        "white_username": "player1",
        "black_username": "opp",
        "white_rating": 1500,
        "black_rating": 1400,
        "played_at": datetime.fromtimestamp(1767446400, tz=UTC),  # A known date

        "raw_moves": "e4 e5",
        "ply_classifications": [],
        "move_evals": []
    }
    
    metrics = GameMetrics(row_data=row_data, username="player1")
    
    assert metrics.is_win is True
    assert metrics.is_white is True
    assert metrics.my_color_name == "white"

def test_acpl_calculation():
    evals = [
        {"high_depth_eval": {"type": "cp", "value": 100}, "high_top_moves": [{"eval": {"type": "cp", "value": 150}}]},
        {"high_depth_eval": {"type": "cp", "value": 200}, "high_top_moves": [{"eval": {"type": "cp", "value": 200}}]}
    ]
    
    annotated_plies = [
        {"classification": "blunder", "is_book": False},
        {"classification": "blunder", "is_book": False}
    ]
    
    row_data = {
        "game_id": "1",
        "time_control": "blitz",
        "score": "1-0",
        "white_username": "p1",
        "black_username": "p2",
        "white_rating": 1500,
        "black_rating": 1500,
        "played_at": datetime.fromtimestamp(1767446400, tz=UTC),
        "raw_moves": "e4 e5",
        "ply_classifications": annotated_plies,
        "move_evals": evals
    }
    
    metrics = GameMetrics(row_data=row_data, username="p1")
    
    assert metrics.fast_columns["acpl"] == 50.0