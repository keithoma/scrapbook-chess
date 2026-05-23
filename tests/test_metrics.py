import pytest
from scrapbook_chess.achievements.metrics import GameMetrics

@pytest.fixture
def mock_game_data():
    return {
        "speed": "blitz",
        "score": "1-0",
        "players": {"white": {"id": "player1", "rating": 1500}, "black": {"id": "opp", "rating": 1400}},
        "timestamp": 1767446400,  # A known date for predictable lunar/weekend tests
        "moves": "e4 e5"
    }

def test_game_metrics_win_conditions(mock_game_data):
    """Test that basic win/loss logic works correctly."""
    metrics = GameMetrics(
        game_id="test_1",
        game_data=mock_game_data,
        annotated_plies=[],
        move_evals=[],
        username="player1"
    )
    
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
    
    # Update this to match "p1" as the white player
    mock_game_data = {
        "moves": "e4 e5",
        "players": {"white": {"id": "p1"}}
    }
    
    metrics = GameMetrics(
        game_id="1", 
        game_data=mock_game_data, 
        annotated_plies=annotated_plies, 
        move_evals=evals, 
        username="p1"
    )
    
    assert metrics.acpl == 50.0