#!/bin/bash

# docs as code using Structurizr
docker run --name docs -it --rm -p 8080:8080 \
    -v ${PWD}:/usr/local/structurizr \
    structurizr/lite