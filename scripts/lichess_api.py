import json
import logging
from datetime import UTC, datetime
from typing import Any

from pprint import pprint

import requests
from tqdm import tqdm

logger = logging.getLogger(__name__)

def lichess_api():
    with requests.get(
        "https://lichess.org/api/games/user/noctu2nality",
        {
            "max": 1,
            "perfType": "ultraBullet,bullet,blitz,rapid,classical",
            "moves": "true",
            "opening": "true",
            "clocks": "true",
            "evals": "false",
        },
        headers = {"Accept": "application/x-ndjson"},
        stream=True,
        timeout=30
    ) as response:
        response.raise_for_status()

        for line in response.iter_lines():
            # print(line)
            raw_game = json.loads(line)
        
        logger.info(raw_game)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    lichess_api()

if __name__ == "__main__":
    main()
