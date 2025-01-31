#!/bin/bash
docker compose exec informs ./manage.py collectstatic --noinput
