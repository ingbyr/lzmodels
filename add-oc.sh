#!/usr/bin/bash

git remote add oc https://gh-proxy.org/https://github.com/anomalyco/models.dev.git
git fetch oc
git merge oc/dev
