#!/usr/bin/env bash
export NODE_INSTALLATION_VERSION=$(sed 's/^v//' "$(dirname "${BASH_SOURCE[0]}")/../.nvmrc")
export REPOSITORY_RID="ri.stemma.main.repository.b1ec0662-c536-46f9-a616-a2d2bac0182e"
export REQUESTS_CA_BUNDLE=${SSL_CERT_FILE} # Used by the Python requests module
