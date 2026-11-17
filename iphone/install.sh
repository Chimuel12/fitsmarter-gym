#!/bin/bash
# FitSmarter on your own iPhone, with your own free Apple ID.
#
# What it does: checks the tools, downloads FitSmarter, builds it, signs it with YOUR Apple ID
# (Xcode's free "Personal Team") and installs it on the iPhone connected by cable.
# Apple's rule for free Apple IDs: the app opens for 7 days, then run this script again
# (your data stays on the phone).
#
# Needs: a Mac, Xcode (free, Mac App Store) with your Apple ID added in Xcode → Settings →
# Accounts, and the iPhone connected by cable with Developer Mode on.
# Usage:  bash install.sh            (or TEAM_ID=XXXXXXXXXX bash install.sh)
set -euo pipefail
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
REPO=https://github.com/Chimuel12/fitsmarter-gym.git
DIR="${FITSMARTER_DIR:-$HOME/FitSmarter-iPhone}"
say()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
stop() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

say "1/7 Checking the Mac"
[ "$(uname)" = Darwin ] || stop "This needs a Mac."
if ! xcodebuild -version >/dev/null 2>&1; then
  if [ -d /Applications/Xcode.app ]; then
    stop "Xcode is installed but not selected. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer && sudo xcodebuild -license accept   then run this script again."
  fi
  stop "Install Xcode from the Mac App Store (free), open it once, then run this script again."
fi
command -v brew >/dev/null || stop "Install Homebrew first: https://brew.sh"
command -v git  >/dev/null || brew install git
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then brew install node@22 && brew link --overwrite --force node@22; fi
command -v pod  >/dev/null || brew install cocoapods
xcrun devicectl --version >/dev/null 2>&1 || stop "Your Xcode is too old: update Xcode (15 or newer)."

say "2/7 Finding your Apple ID team in Xcode"
TEAM="${TEAM_ID:-}"
if [ -z "$TEAM" ]; then
  TEAM=$(defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier 2>/dev/null | grep -o 'teamID = [A-Z0-9]*' | head -1 | awk '{print $3}' || true)
fi
[ -n "$TEAM" ] || stop "Add your Apple ID in Xcode → Settings → Accounts (the + button), close Xcode, then run this again. Or run: TEAM_ID=<your team id> bash install.sh"
echo "Team: $TEAM"

say "3/7 Finding your iPhone (connected by cable, unlocked, 'Trust this computer' accepted)"
J=$(mktemp)
xcrun devicectl list devices --json-output "$J" >/dev/null 2>&1 || true
UDID=$(python3 - "$J" <<'PY'
import json, sys
try: d = json.load(open(sys.argv[1]))
except Exception: sys.exit(0)
for x in d.get("result", {}).get("devices", []):
    hp = x.get("hardwareProperties", {}); cp = x.get("connectionProperties", {})
    if hp.get("platform") == "iOS" and hp.get("deviceType") == "iPhone" and cp.get("pairingState") == "paired":
        print(hp.get("udid") or x.get("identifier")); break
PY
)
rm -f "$J"
[ -n "$UDID" ] || stop "No iPhone found. Connect it by cable, unlock it, tap 'Trust', turn on Settings → Privacy & Security → Developer Mode, then run this again."
echo "iPhone: $UDID"

say "4/7 Downloading FitSmarter"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch --depth 1 origin main && git -C "$DIR" reset --hard origin/main
else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR/frontend"

say "5/7 Building the app (a few minutes the first time)"
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
LOG="$DIR/build-ios.log"
if ! build > "$LOG" 2>&1; then
  echo "First try failed, trying again without Apple Health (some free accounts can't use it)…"
  build CODE_SIGN_ENTITLEMENTS="" > "$LOG" 2>&1 || { tail -40 "$LOG"; stop "The build failed. The full log is in $LOG"; }
fi
APP="$DIR/build-ios/Build/Products/Release-iphoneos/App.app"
[ -d "$APP" ] || stop "Built, but the app was not found at $APP"

say "7/7 Installing on your iPhone"
xcrun devicectl device install app --device "$UDID" "$APP"

printf '\n\033[1;32m✔ FitSmarter is on your iPhone.\033[0m\n'
cat <<'TXT'
The first time only, on the iPhone:
  Settings → General → VPN & Device Management → your Apple ID → Trust.
Then open FitSmarter.

Apple's rule for free Apple IDs: after 7 days the app stops opening.
Connect the iPhone and run this script again (your data stays).
TXT
