# Use the Python prototype scripts

These utilities belong to the original Python prototype. Run them from the
repository root with Python and uv installed. They do not operate on the new
browser proof's local storage.

Install the Python project with `uv sync` if its environment is not set up.

## Inspect a Lichess response

Set `LICHESS_USER_NAME` in the local `.env`. `LICHESS_TOKEN` is optional.
Then run:

```sh
uv run scripts/lichess_api.py
```

The script requests a recent game and prints its raw data. It does not run the
achievement pipeline. See [the script](../../scripts/lichess_api.py) for the
requested fields and time-control filters.

## Reset the prototype database

Set `DATABASE_URL` to the intended local development database. This operation
**drops the prototype's game, user, achievement, progress, and ledger tables**.
It does not merely clear a view or reset browser analysis.

```sh
uv run scripts/reset_db.py
```

The script asks for confirmation. Add `--force` only when deliberately bypassing
that prompt. Review [the reset statements](../../scripts/reset_db.py) before
running it against a database you want to preserve.
