#!/bin/sh
# ----------------------------------------------------------------------------
# Maven Wrapper startup script
# ----------------------------------------------------------------------------

set -e

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
WRAPPER_JAR="$BASE_DIR/.mvn/wrapper/maven-wrapper.jar"
WRAPPER_PROPS="$BASE_DIR/.mvn/wrapper/maven-wrapper.properties"

# Auto-detect JAVA_HOME if not set
if [ -z "$JAVA_HOME" ]; then
    if [ -x /usr/libexec/java_home ]; then
        JAVA_HOME=$(/usr/libexec/java_home 2>/dev/null)
    elif [ -d /usr/lib/jvm/java-21-openjdk ]; then
        JAVA_HOME=/usr/lib/jvm/java-21-openjdk
    elif [ -d /usr/lib/jvm/java-17-openjdk ]; then
        JAVA_HOME=/usr/lib/jvm/java-17-openjdk
    elif [ -d /usr/lib/jvm/default-java ]; then
        JAVA_HOME=/usr/lib/jvm/default-java
    fi
    export JAVA_HOME
fi

# Download wrapper jar if missing
if [ ! -f "$WRAPPER_JAR" ]; then
    mkdir -p "$(dirname "$WRAPPER_JAR")"
    wrapperUrl=$(grep '^wrapperUrl=' "$WRAPPER_PROPS" | sed 's/^wrapperUrl=//')
    echo "Downloading Maven Wrapper..."
    curl -sL "$wrapperUrl" -o "$WRAPPER_JAR"
fi

# Read distribution URL
distributionUrl=$(grep '^distributionUrl=' "$WRAPPER_PROPS" | sed 's/^distributionUrl=//')
distributionName=$(basename "$distributionUrl")
distributionNameNoExt=$(echo "$distributionName" | sed 's/-bin\.zip$//')
MAVEN_USER_HOME="${MAVEN_USER_HOME:-$HOME/.m2}"
DIST_DIR="$MAVEN_USER_HOME/wrapper/dists/apache-maven-3.9.9"

# Download Maven distribution if missing
if [ ! -d "$DIST_DIR" ]; then
    echo "Downloading Maven 3.9.9..."
    mkdir -p "$DIST_DIR"
    tmpFile=$(mktemp)
    curl -sL "$distributionUrl" -o "$tmpFile"
    unzip -q "$tmpFile" -d "$DIST_DIR"
    rm -f "$tmpFile"
    if [ -d "$DIST_DIR/$distributionNameNoExt" ]; then
        mv "$DIST_DIR/$distributionNameNoExt"/* "$DIST_DIR/"
        rmdir "$DIST_DIR/$distributionNameNoExt"
    fi
    echo "Maven installed to $DIST_DIR"
fi

# Run Maven
exec "$DIST_DIR/bin/mvn" -f "$BASE_DIR/pom.xml" "$@"
