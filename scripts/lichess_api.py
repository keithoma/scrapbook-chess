"""A quick script to manually read and verify the responce from Lichess API.

Example:
    $ uv run scripts/lichess_api.py
"""

import json
import logging
import os
import sys

import requests
from dotenv import load_dotenv
from rich import print as rprint

# we need `LICHESS_TOKEN` (optional) and `LICHESS_USER_NAME` (mandatory) from the .env
# file
load_dotenv()

# set up logging
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

def fetch_latest_games(username: str, limit: int = 1) -> None:
    """Fetches the most recent games for a user to verify API structure.

    API call to Lichess games database of the user passed in the argument. The response
    will be in NDJSON format.

    Args:
        username (str): Username form which we fetch the games.
        limit (int): Number of games to fetch. Default is 1.

    Raises:
        requests.exceptions.RequestException: If the request fails, times out, or
            Lichess doesn't want to connect.
    """
    token = os.getenv("LICHESS_TOKEN")

    if not username:
        logger.error("LICHESS_USER_NAME not set in .env")
        return

    # Lichess personal API token is not mandatory, but good to have
    headers = {
        "Accept": "application/x-ndjson",
        "Authorization": f"Bearer {token}" if token else ""
    }

    url = f"https://lichess.org/api/games/user/{username}"

    params = {
        "max": limit,
        "perfType": "ultraBullet,bullet,blitz,rapid,classical",
        "moves": "true",
        "opening": "true",
        "clocks": "true",
        "evals": "false",
    }
    
    try:
        with requests.get(
            url,
            params=params,
            headers=headers,
            stream=True,
            timeout=30
        ) as response:
            response.raise_for_status()

            count = 0 
            for line in response.iter_lines():
                if line:
                    raw_game = json.loads(line)
                    rprint(raw_game)
                    
                    # just a failsafe to cut the connection from our side
                    count += 1
                    if count >= limit:
                        break

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch data: {e}")

if __name__ == "__main__":
    user = os.getenv("LICHESS_USER_NAME")
    if not user:
        logger.error("LICHESS_USER_NAME not set in .env")
        sys.exit(1)
        
    fetch_latest_games(username=user, limit=1)
