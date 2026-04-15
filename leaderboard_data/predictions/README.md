# Prediction cache

This directory is intentionally not used for committed permanent prediction files.
At runtime, the service downloads predictions and mapping from:

- https://github.com/alexeyshmelev/genatator-ab-initio-leaderboard-predictions.git

Downloaded files are cached under `leaderboard_data/.remote_predictions_cache/`.
