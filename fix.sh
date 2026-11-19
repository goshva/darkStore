#!/usr/bin/env bash
# fix-layout.sh — правит вёрстку index.html (4 известных бага).
# Использование:  ./fix-layout.sh [index.html]
set -euo pipefail

FILE="${1:-index.html}"
if [ ! -f "$FILE" ]; then
  printf 'Файл не найден: %s\n' "$FILE" >&2
  exit 1
fi

BACKUP="${FILE}.bak.$(date +%Y%m%d-%H%M%S)"
cp -- "$FILE" "$BACKUP"
printf 'Резервная копия: %s\n\n' "$BACKUP"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

apply_block() {
  local name="$1" oldfile="$2" newfile="$3"
  NAME="$name" OLD_FILE="$oldfile" NEW_FILE="$newfile" \
  perl -0777 -i -pe '
    my $old = do { open(my $fh, "<", $ENV{OLD_FILE}) or die "open old: $!"; <$fh> };
    my $new = do { open(my $fh, "<", $ENV{NEW_FILE}) or die "open new: $!"; <$fh> };
    my $n = s/\Q$old\E/$new/g;
    if ($n == 0) {
      if (index($_, $new) >= 0) {
        print STDERR "SKIP: $ENV{NAME} (уже применено)\n";
      } else {
        die "Не найден шаблон: $ENV{NAME}\n";
      }
    } else {
      print STDERR "OK: $ENV{NAME} ($n)\n";
    }
  ' -- "$FILE"
}

# ── 1. CSS вложенных карточек: уведомление о миграции больше не теряет рамку/фон,
#       у #benchmarkCard убрана двойная рамка и тень.
cat > "$WORK/old1" <<'EOF'
  /* Вложенные карточки бенчмарков и миграции — без двойной рамки */
  #migrationNotice.card { border:0; box-shadow:none; padding:0; margin:0 0 10px; background:transparent; }
  .app-notice { border-left:4px solid var(--amber); background:var(--amber-soft); border-radius:12px; padding:12px 14px; box-shadow:none; }
  .app-notice .card-title { color:#8a6416; }
  #benchmarkCard { border:1px solid var(--line); border-radius:12px; padding:12px; background:var(--surface-soft); }
EOF

cat > "$WORK/new1" <<'EOF'
  /* Вложенные карточки: без двойной рамки; уведомление о миграции сохраняет акцентную полосу */
  #migrationNotice { margin:0 0 12px; }
  .app-notice { border-left:4px solid var(--amber); background:var(--amber-soft); border-radius:12px; padding:12px 14px; box-shadow:none; }
  .app-notice .card-title { color:#8a6416; }
  #benchmarkCard { border:0; box-shadow:none; border-radius:12px; padding:12px; background:var(--surface-soft); }
EOF

apply_block "1/4 CSS вложенных карточек" "$WORK/old1" "$WORK/new1"

# ── 2. Заголовок «Бенчмарки рынка» выводился дважды; бейдж-счётчик переносится
#       в шапку секции, чтобы renderBenchmarkCard() продолжил его находить.
cat > "$WORK/old2" <<'EOF'
        <article class="card" id="benchmarks">
          <div class="card-head"><h2 class="card-title">Бенчмарки рынка</h2></div>
          <div class="card" id="benchmarkCard" style="display:none">
            <div class="card-head"><h2 class="card-title">Бенчмарки рынка <span class="badge" id="benchmarkBadge"></span></h2></div>
EOF

cat > "$WORK/new2" <<'EOF'
        <article class="card" id="benchmarks">
          <div class="card-head"><h2 class="card-title">Бенчмарки рынка <span class="badge" id="benchmarkBadge"></span></h2></div>
          <div class="card" id="benchmarkCard" style="display:none">
EOF

apply_block "2/4 Заголовок бенчмарков" "$WORK/old2" "$WORK/new2"

# ── 3. Пустой .badge больше не рисует серую «пилюлю» до первого renderBenchmarkCard().
cat > "$WORK/old3" <<'EOF'
  .badge.pos { background:var(--green-soft); color:var(--green-dark); }
EOF

cat > "$WORK/new3" <<'EOF'
  .badge.pos { background:var(--green-soft); color:var(--green-dark); }
  .badge:empty { display:none; }
EOF

apply_block "3/4 .badge:empty" "$WORK/old3" "$WORK/new3"

# ── 4. Сайдбар получил вертикальную прокрутку и защиту от сжатия пунктов на низких экранах.
cat > "$WORK/old4" <<'EOF'
  .sidebar { position:fixed; inset:0 auto 0 0; width:var(--sidebar); background:linear-gradient(180deg,var(--nav),#151e1b); color:var(--nav-text); padding:22px 14px 16px; display:flex; flex-direction:column; z-index:20; }
EOF

cat > "$WORK/new4" <<'EOF'
  .sidebar { position:fixed; inset:0 auto 0 0; width:var(--sidebar); background:linear-gradient(180deg,var(--nav),#151e1b); color:var(--nav-text); padding:22px 14px 16px; display:flex; flex-direction:column; z-index:20; overflow-y:auto; }
  .sidebar > * { flex:none; }
EOF

apply_block "4/4 Прокрутка сайдбара" "$WORK/old4" "$WORK/new4"

echo
echo "Готово. Проверьте изменения:"
echo "  diff -u \"$BACKUP\" \"$FILE\""