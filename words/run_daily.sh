#!/bin/bash

set -Eeuo pipefail

BASE_DIR="/home/mc/repos/freqwords"

# ------------------------------------------------------------
# Language
# ------------------------------------------------------------

LANGUAGE="${1:-en}"

case "$LANGUAGE" in
    en)
        ENTRIES_FILE="$BASE_DIR/words/google-10000-english.txt"
        STATE_FILE="$BASE_DIR/words/entry_index.txt"
        API_URL="http://localhost:3006/api/en/sentences"
        LANGUAGE_NAME="English"
        ;;
        
    fr)
        ENTRIES_FILE="$BASE_DIR/words/french-words.txt"
        STATE_FILE="$BASE_DIR/words/entry_index_fr.txt"
        API_URL="http://localhost:3006/api/fr/sentences"
        LANGUAGE_NAME="French"
        ;;
        
    *)
        echo "Usage: $0 {en|fr}"
        exit 1
        ;;
esac

LOG_FILE="$BASE_DIR/words/entry_log_${LANGUAGE}.txt"
LOCK_FILE="$BASE_DIR/words/run_daily_${LANGUAGE}.lock"

# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S'): [$LANGUAGE] $*" | tee -a "$LOG_FILE"
}

# ------------------------------------------------------------
# Load environment
# ------------------------------------------------------------

if [ ! -f "$BASE_DIR/.env" ]; then
    log "ERROR: .env not found: $BASE_DIR/.env"
    exit 1
fi

set -a
source "$BASE_DIR/.env"
set +a

if [ -z "${GEMINI_API_KEY:-}" ]; then
    log "ERROR: GEMINI_API_KEY is not set"
    exit 1
fi

# ------------------------------------------------------------
# Check required commands
# ------------------------------------------------------------

for command in curl jq flock sed; do
    if ! command -v "$command" >/dev/null 2>&1; then
        log "ERROR: Required command not found: $command"
        exit 1
    fi
done

# ------------------------------------------------------------
# Prevent concurrent executions
# ------------------------------------------------------------

exec 9>"$LOCK_FILE"

if ! flock -n 9; then
    log "Another $LANGUAGE run is already in progress. Exiting."
    exit 1
fi

# ------------------------------------------------------------
# Check required files
# ------------------------------------------------------------

if [ ! -f "$ENTRIES_FILE" ]; then
    log "ERROR: Entries file not found: $ENTRIES_FILE"
    exit 1
fi

if [ ! -f "$STATE_FILE" ]; then
    echo "0" > "$STATE_FILE"
fi

# ------------------------------------------------------------
# Read current index
# ------------------------------------------------------------

INDEX=$(tr -d '[:space:]' < "$STATE_FILE")

if ! [[ "$INDEX" =~ ^[0-9]+$ ]]; then
    log "ERROR: Invalid entry index: '$INDEX'"
    exit 1
fi

ENTRY=$(sed -n "$((INDEX + 1))p" "$ENTRIES_FILE")

if [ -z "$ENTRY" ]; then
    log "No more entries to process."
    exit 0
fi

log "Processing '$ENTRY' (index $INDEX)"

# ------------------------------------------------------------
# Generate sentences with Gemini
# ------------------------------------------------------------

if [ "$LANGUAGE" = "en" ]; then

    PROMPT=$(
        jq -n \
            --arg word "$ENTRY" \
            '(
                "Create exactly 3 natural example sentences for the English word \""
                + $word
                + "\". The sentences should demonstrate realistic usage of the word. "
                + "Respond with a JSON object only, using this exact format: "
                + "{\"sentences\":[\"sentence 1\",\"sentence 2\",\"sentence 3\"]}"
            )'
    )

else

    PROMPT=$(
        jq -n \
            --arg word "$ENTRY" \
            '(
                "Create exactly 3 natural French example sentences using the French word \""
                + $word
                + "\". The sentences should demonstrate realistic everyday usage of the word. "
                + "Respond with a JSON object only, using this exact format: "
                + "{\"sentences\":[\"phrase 1\",\"phrase 2\",\"phrase 3\"]}"
            )'
    )

fi

REQUEST_BODY=$(
    jq -n \
        --arg prompt "$(echo "$PROMPT" | jq -r '.')" \
        '{
            contents: [{
                parts: [{
                    text: $prompt
                }]
            }]
        }'
)

RESPONSE=$(
    curl \
        --fail-with-body \
        --silent \
        --show-error \
        --connect-timeout 15 \
        --max-time 180 \
        -X POST \
        "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${GEMINI_API_KEY}" \
        -H 'Content-Type: application/json' \
        -d "$REQUEST_BODY"
) || {
    log "ERROR: Gemini API request failed for '$ENTRY'"
    exit 1
}

# ------------------------------------------------------------
# Extract model response
# ------------------------------------------------------------

MODEL_TEXT=$(
    echo "$RESPONSE" |
    jq -r '
        [
            .candidates[0].content.parts[]
            | select(.thought != true)
            | .text
        ]
        | join("\n")
    '
)

if [ -z "$MODEL_TEXT" ] || [ "$MODEL_TEXT" = "null" ]; then
    log "ERROR: Gemini returned no usable text for '$ENTRY'"
    log "Gemini response: $RESPONSE"
    exit 1
fi

# ------------------------------------------------------------
# Remove optional Markdown JSON fences
# ------------------------------------------------------------

JSON_RESPONSE=$(
    echo "$MODEL_TEXT" |
    sed '/^[[:space:]]*```json[[:space:]]*$/d' |
    sed '/^[[:space:]]*```[[:space:]]*$/d' |
    tr -d '\r'
)

# ------------------------------------------------------------
# Validate and extract exactly 3 sentences
# ------------------------------------------------------------

SENTENCES_JSON=$(
    echo "$JSON_RESPONSE" |
    jq -e '
        if (.sentences | type) != "array" then
            error("sentences is not an array")
        elif (.sentences | length) != 3 then
            error("expected exactly 3 sentences")
        elif any(.sentences[]; type != "string" or (. | length) == 0) then
            error("invalid sentence")
        else
            .sentences
        end
    '
) || {
    log "ERROR: Invalid Gemini JSON response for '$ENTRY'"
    log "Model response: $MODEL_TEXT"
    exit 1
}

log "Generated 3 sentences for '$ENTRY'"

# ------------------------------------------------------------
# Send sentences to Express API
# ------------------------------------------------------------

PAYLOAD=$(
    jq -n \
        --arg word "$ENTRY" \
        --argjson sentences "$SENTENCES_JSON" \
        '{
            word: $word,
            sentences: $sentences
        }'
)

API_RESPONSE=$(
    curl \
        --fail-with-body \
        --silent \
        --show-error \
        --connect-timeout 10 \
        --max-time 30 \
        -X POST \
        "$API_URL" \
        -H 'Content-Type: application/json' \
        -d "$PAYLOAD"
) || {
    log "ERROR: Failed to save '$ENTRY' through API"
    exit 1
}

# ------------------------------------------------------------
# Validate API response
# ------------------------------------------------------------

API_COUNT=$(echo "$API_RESPONSE" | jq -r '.count // empty')

if [ "$API_COUNT" != "3" ]; then
    log "ERROR: API did not confirm 3 inserted sentences"
    log "API response: $API_RESPONSE"
    exit 1
fi

# ------------------------------------------------------------
# Only advance index after everything succeeded
# ------------------------------------------------------------

NEW_INDEX=$((INDEX + 1))

echo "$NEW_INDEX" > "$STATE_FILE"

log "Successfully processed '$ENTRY'"
log "Inserted $API_COUNT sentences"
log "Advanced index from $INDEX to $NEW_INDEX"
log "------------------------"
