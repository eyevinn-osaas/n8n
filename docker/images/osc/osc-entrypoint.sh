#!/bin/bash

if [ ! -z "$DATABASE_URL" ]; then
    # Parse DATABASE_URL: postgresql://user:password@host:port/database?schema=schema_name
    # or postgres://user:password@host:port/database?schema=schema_name
    
    # Remove protocol prefix (support both postgres:// and postgresql://)
    if [[ "$DATABASE_URL" == postgresql://* ]]; then
        DB_URL_NO_PROTOCOL=${DATABASE_URL#postgresql://}
    elif [[ "$DATABASE_URL" == postgres://* ]]; then
        DB_URL_NO_PROTOCOL=${DATABASE_URL#postgres://}
    else
        echo "Error: Unsupported database URL scheme. Only postgres:// and postgresql:// are supported."
        exit 1
    fi
    
    # Extract user:password part
    USER_PASS_HOST_PORT_DB=${DB_URL_NO_PROTOCOL}
    USER_PASS=${USER_PASS_HOST_PORT_DB%%@*}
    HOST_PORT_DB=${USER_PASS_HOST_PORT_DB#*@}
    
    # Extract user and password
    export DB_POSTGRESDB_USER=${USER_PASS%%:*}
    export DB_POSTGRESDB_PASSWORD=${USER_PASS#*:}
    
    # Extract host:port/database?schema part
    HOST_PORT=${HOST_PORT_DB%%/*}
    DB_SCHEMA=${HOST_PORT_DB#*/}
    
    # Extract host and port
    export DB_POSTGRESDB_HOST=${HOST_PORT%%:*}
    export DB_POSTGRESDB_PORT=${HOST_PORT#*:}
    
    # Extract database and schema
    if [[ "$DB_SCHEMA" == *"?"* ]]; then
        export DB_POSTGRESDB_DATABASE=${DB_SCHEMA%%\?*}
        SCHEMA_PART=${DB_SCHEMA#*schema=}
        export DB_POSTGRESDB_SCHEMA=${SCHEMA_PART%%&*}
    else
        export DB_POSTGRESDB_DATABASE=$DB_SCHEMA
        export DB_POSTGRESDB_SCHEMA="public"
    fi
    
    # Set database type
    export DB_TYPE="postgresdb"
fi

exec "/docker-entrypoint.sh" "$@"