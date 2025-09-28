#!/bin/sh
#

docker compose exec informs ./manage.py collectstatic --noinput
