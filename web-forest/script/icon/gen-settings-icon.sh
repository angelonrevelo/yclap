#!/usr/bin/env bash
# Generate the Settings-tab icon set through codex's image_gen tool.
#
# Same contract as the 26-icon game set already in src/asset/icon/game: rendered
# on a FLAT MAGENTA ground, keyed out afterwards by keyer.py, restricted to the
# chess.com-ish palette in icon-spec.json. Magenta is the key colour and must
# therefore never appear in the art itself — that is the one rule that, broken,
# eats a hole in the icon.
set -u
OUT="$(cd "$(dirname "$0")" && pwd)/settings-out"
mkdir -p "$OUT"

STYLE='Flat vector game icon, chess.com illustration style: chunky rounded friendly forms, bold saturated colour, soft two-tone cel shading with exactly one lit plane and one shadow plane per surface, a small white specular highlight, no outline stroke, no text, no letters, no numerals, no drop shadow on the ground, centred, filling about 86% of the frame. Palette limited to warm greens (#81B64C #5D9948 #45753C #B2E068), warm golds (#F7C631 #E3AA24 #CF8D1B), warm neutrals (#E3C29C #CA9350 #9D6C3E), off-white (#FFFFFF #DAD8D6) and dark bark (#262421 #4B4847). RENDER ON A COMPLETELY FLAT PURE MAGENTA #FF00FF BACKGROUND that fills every pixel not covered by the subject. Magenta is a chroma key: it must appear NOWHERE in the subject itself. 512x512.'

gen () {
  local name="$1"; shift
  local subject="$1"; shift
  echo "=== $name ==="
  codex exec --skip-git-repo-check -s workspace-write \
    "Use your image_gen tool to create one 512x512 PNG and save it to $OUT/$name.png. Subject: $subject. Style: $STYLE" \
    2>&1 | tail -3
}

gen account   'a friendly rounded ID card with a small leaf emblem where a photo would be, slightly tilted, three short abstract text bars (bars only, no readable letters)'
gen pref      'a chunky rounded slider panel with two toggle switches and one round knob, friendly and tactile'
gen roadmap   'a rolled open trail map with a dotted winding path and three round milestone markers along it, one flag at the end'
gen stage     'a seedling in a small terracotta pot with a single unfurling leaf and a soft glow, clearly an early stage'
gen partner   'three friendly rounded campus buildings of different heights standing together, one with a small green dome'
gen about     'an open book with a small tree growing out of its pages, warm and inviting'
echo "ALL DONE"
