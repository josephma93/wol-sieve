#!/bin/bash
#
# Centralized Development Workflow Script for wol-sieve
#
# This script provides a clean, documented, and consistent interface for all
# common development tasks, from building and running to debugging.

# --- Configuration ---
APP_ENTRY="dist/index.js"

# --- Helper Functions ---

# Displays a clean, readable help message.
show_help() {
  echo "Usage: ./run.sh [command]"
  echo ""
  echo "Commands:"
  echo "  start         Start in dev mode with file watching and auto-reload."
  echo "  inspect       Start in dev mode with the Node.js inspector attached."
  echo "  debug         Start in dev mode, pausing on the first line for the debugger."
  echo "  build         Build the TypeScript project without running."
  echo "  serve         Run the pre-built application once (no-watch)."
  echo "  help          Show this help message."
  echo ""
}

# Formats and builds the project, exiting on failure.
build_project() {
  echo "📦 Building project..."
  # Run format quietly, we only care if the build succeeds.
  npm run format > /dev/null
  if ! npm run build; then
    echo "❌ Build failed. Please check the errors above."
    exit 1
  fi
  echo "✅ Build successful."
}

# Runs the final Node.js application, passing through any debug flags.
run_app() {
  local node_opts="$1"
  echo "🚀 Starting application with Node options: ${node_opts:-none}"
  # 'exec' replaces the shell process, ensuring signals like Ctrl+C are handled correctly.
  exec node $node_opts --env-file=.env $APP_ENTRY
}

# --- Main Logic ---

COMMAND=$1

# Default to 'help' if no command is provided.
if [ -z "$COMMAND" ]; then
  show_help
  exit 0
fi

# This is the core command router.
case $COMMAND in
  start)
    # Use nodemon purely as a file watcher. On change, it re-runs this script
    # with the internal '_internal_start' command.
    exec nodemon --watch src --ext ts,json --exec "$0 _internal_start"
    ;;

  _internal_start)
    # This command is called by nodemon. It's not meant for direct use.
    build_project
    run_app
    ;;

  inspect)
    exec nodemon --watch src --ext ts,json --exec "$0 _internal_inspect"
    ;;

  _internal_inspect)
    build_project
    run_app "--inspect"
    ;;

  debug)
    exec nodemon --watch src --ext ts,json --exec "$0 _internal_debug"
    ;;

  _internal_debug)
    build_project
    run_app "--inspect-brk"
    ;;

  build)
    build_project
    ;;

  serve)
    run_app
    ;;

  help)
    show_help
    ;;

  *)
    echo "❌ Unknown command: $COMMAND"
    show_help
    exit 1
    ;;
esac