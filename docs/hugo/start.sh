#!/bin/bash

# :source .env

hugo server --logLevel info --bind 0.0.0.0 --baseURL http://127.0.0.1 -D --minify=false
