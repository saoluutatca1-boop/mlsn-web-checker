#!/bin/bash
PORT=${PORT:-8000}
exec gunicorn --bind 0.0.0.0:$PORT --workers 4 --threads 2 app:app
