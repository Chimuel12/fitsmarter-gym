#!/bin/bash
# FitSmarter on your own iPhone, with your own free Apple ID.
#
# What it does: checks the tools, downloads FitSmarter, builds it, signs it with YOUR Apple ID
# (Xcode's free "Personal Team") and installs it on your iPhone. Then it sets up the Mac to do it
# again on its own every few days: Apple makes apps signed with a free Apple ID stop opening after
# 7 days, so the Mac rebuilds and reinstalls it before that (with the newest FitSmarter too).
# Your data stays on the phone.
#
# Needs: a Mac, Xcode (free, Mac App Store) with your Apple ID added in Xcode → Settings →
# Accounts, and the iPhone connected by cable the first time, with Developer Mode on.
#
#   bash install.sh               install now, and renew on its own from then on
#   bash install.sh --renew       what the Mac runs on its own (does nothing if not due yet)
#   bash install.sh --stop-renew  stop renewing on its own
#   TEAM_ID=XXXXXXXXXX bash install.sh   if your Apple ID team is not found by itself
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
REPO=https://github.com/Chimuel12/fitsmarter-gym.git
DIR="${FITSMARTER_DIR:-$HOME/FitSmarter-iPhone}"
STATE="$HOME/Library/Application Support/FitSmarter-iPhone"
AGENT_ID=com.fitsmarter.iphone-renew
AGENT="$HOME/Library/LaunchAgents/$AGENT_ID.plist"
RENEW_AFTER_DAYS=5        # Apple's limit is 7: renew from day 5, so a day or two without the iPhone is fine
MODE="${1:-install}"
mkdir -p "$STATE"

say()    { [ "$MODE" = --renew ] && echo "[$(date '+%F %T')] $*" || printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
notify() { osascript -e "display notification \"$1\" with title \"FitSmarter\"" >/dev/null 2>&1 || true; }
stop()   { if [ "$MODE" = --renew ]; then echo "[$(date '+%F %T')] $*"; exit 0; fi; printf '\n\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }
days_since() { [ -f "$STATE/last-install" ] || { echo 999; return; }; echo $(( ( $(date +%s) - $(cat "$STATE/last-install") ) / 86400 )); }

# ---------- stop renewing ----------
if [ "$MODE" = --stop-renew ]; then
  launchctl bootout "gui/$(id -u)/$AGENT_ID" 2>/dev/null || true
  rm -f "$AGENT"
  echo "FitSmarter will no longer renew on its own. Run 'bash install.sh' to install it again by hand."
  exit 0
fi

# ---------- the Mac's own run: only when due ----------
if [ "$MODE" = --renew ]; then
  [ -f "$STATE/env" ] || stop "Not installed yet: run install.sh once by hand."
  # shellcheck disable=SC1091
  . "$STATE/env"
  D=$(days_since)
  [ "$D" -ge "$RENEW_AFTER_DAYS" ] || stop "Installed $D day(s) ago, nothing to do yet."
fi

say "1/7 Checking the Mac"
[ "$(uname)" = Darwin ] || stop "This needs a Mac."
if ! xcodebuild -version >/dev/null 2>&1; then
  if [ -d /Applications/Xcode.app ]; then
    stop "Xcode is installed but not selected. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer && sudo xcodebuild -license accept   then run this script again."
  fi
  stop "Install Xcode from the Mac App Store (free), open it once, then run this script again."
fi
if [ "$MODE" != --renew ]; then
  command -v brew >/dev/null || stop "Install Homebrew first: https://brew.sh"
  command -v git  >/dev/null || brew install git
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then brew install node@22 && brew link --overwrite --force node@22; fi
  command -v pod  >/dev/null || brew install cocoapods
fi
xcrun devicectl --version >/dev/null 2>&1 || stop "Your Xcode is too old: update Xcode (15 or newer)."

say "2/7 Finding your Apple ID team in Xcode"
TEAM="${TEAM_ID:-${TEAM:-}}"
if [ -z "$TEAM" ]; then
  TEAM=$(defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier 2>/dev/null | grep -o 'teamID = [A-Z0-9]*' | head -1 | awk '{print $3}' || true)
fi
[ -n "$TEAM" ] || stop "Add your Apple ID in Xcode → Settings → Accounts (the + button), close Xcode, then run this again. Or run: TEAM_ID=<your team id> bash install.sh"
echo "Team: $TEAM"

say "3/7 Finding your iPhone"
J=$(mktemp)
xcrun devicectl list devices --json-output "$J" >/dev/null 2>&1 || true
FOUND=$(python3 - "$J" "${UDID:-}" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: sys.exit(0)
want = sys.argv[2]
for x in d.get("result", {}).get("devices", []):
    hp = x.get("hardwareProperties", {}); cp = x.get("connectionProperties", {})
    udid = hp.get("udid") or x.get("identifier")
    if hp.get("platform") != "iOS" or cp.get("pairingState") != "paired": continue
    if want and udid != want: continue
    if not want and hp.get("deviceType") != "iPhone": continue
    print(udid); break
PY
)
rm -f "$J"
if [ -z "$FOUND" ]; then
  if [ "$MODE" = --renew ]; then
    D=$(days_since)
    # Remind once a day, from the day the app is close to stopping.
    if [ "$D" -ge 6 ] && [ "$(cat "$STATE/last-reminder" 2>/dev/null)" != "$(date +%F)" ]; then
      notify "Connect your iPhone to this Mac (or put both on the same Wi-Fi) so FitSmarter keeps opening."
      date +%F > "$STATE/last-reminder"
    fi
    stop "iPhone not reachable, will try again later."
  fi
  stop "No iPhone found. Connect it by cable, unlock it, tap 'Trust', turn on Settings → Privacy & Security → Developer Mode, then run this again."
fi
UDID="$FOUND"
echo "iPhone: $UDID"

say "4/7 Downloading FitSmarter (newest version)"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch --depth 1 origin main && git -C "$DIR" reset --hard origin/main
else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR/frontend"

say "5/7 Building the app (a few minutes)"
npm ci --no-audit --no-fund
VITE_MOBILE=1 VITE_STANDALONE=1 npx vite build
node ../scripts/catalogue/stage-media.mjs dist
npx cap sync ios

say "6/7 Signing with your Apple ID and compiling for iPhone"
# A bundle id of your own: on a free Apple ID every person needs a different one.
BID="com.fitsmarter.app.$(echo "$TEAM" | tr 'A-Z' 'a-z')"
build() {
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
    -destination "id=$UDID" -derivedDataPath "$DIR/build-ios" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
    DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic PRODUCT_BUNDLE_IDENTIFIER="$BID" "$@" build
}
LOG="$STATE/build.log"
if [ "${NO_HEALTH:-0}" = 1 ] || ! build > "$LOG" 2>&1; then
  [ "${NO_HEALTH:-0}" = 1 ] || echo "First try failed, trying again without Apple Health (some free accounts can't use it)…"
  if build CODE_SIGN_ENTITLEMENTS="" > "$LOG" 2>&1; then NO_HEALTH=1
  else
    [ "$MODE" = --renew ] && notify "Couldn't renew FitSmarter on its own. Open Claude or run install.sh to see why."
    tail -40 "$LOG"; stop "The build failed. The full log is in $LOG"
  fi
fi
APP="$DIR/build-ios/Build/Products/Release-iphoneos/App.app"
[ -d "$APP" ] || stop "Built, but the app was not found at $APP"

say "7/7 Installing on your iPhone"
if ! xcrun devicectl device install app --device "$UDID" "$APP"; then
  [ "$MODE" = --renew ] && stop "The iPhone went away during the install, will try again later."
  stop "Installing failed: keep the iPhone unlocked and connected, then run this again."
fi
date +%s > "$STATE/last-install"
cat > "$STATE/env" <<ENV
TEAM=$TEAM
UDID=$UDID
NO_HEALTH=${NO_HEALTH:-0}
DIR="$DIR"
ENV

# ---------- renew on its own from now on ----------
# The Mac checks every 4 hours; it rebuilds only from day $RENEW_AFTER_DAYS, and only when the iPhone
# is reachable (cable, or the same Wi-Fi once Xcode can see it over the network).
cp "$DIR/iphone/install.sh" "$STATE/install.sh"
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyLists-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$AGENT_ID</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$STATE/install.sh</string><string>--renew</string></array>
  <key>EnvironmentVariables</key><dict><key>FITSMARTER_DIR</key><string>$DIR</string></dict>
  <key>StartInterval</key><integer>14400</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$STATE/renew.log</string>
  <key>StandardErrorPath</key><string>$STATE/renew.log</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/$AGENT_ID" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT" 2>/dev/null || launchctl load "$AGENT" 2>/dev/null || true

if [ "$MODE" = --renew ]; then
  notify "FitSmarter renewed on your iPhone for 7 more days."
  say "Renewed."
  exit 0
fi

printf '\n\033[1;32m✔ FitSmarter is on your iPhone.\033[0m\n'
cat <<'TXT'
The first time only, on the iPhone:
  Settings → General → VPN & Device Management → your Apple ID → Trust.
Then open FitSmarter.

From now on this Mac renews it on its own before the 7 days are up (and brings the newest
version), whenever the iPhone is connected or on the same Wi-Fi and the Mac is on.
To use Wi-Fi: in Xcode → Window → Devices and Simulators → your iPhone → "Connect via network".
To stop it:  bash ~/FitSmarter-iPhone/iphone/install.sh --stop-renew
TXT
