#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="APK落地分发系统"
PROJECT_NAME="${APK_PROJECT_NAME:-apk-landing}"
INSTALL_DIR="${APK_INSTALL_DIR:-/opt/apk-landing}"
APK_REPO="${APK_REPO:-longxingze0925/AB}"
APK_REF="${APK_REF:-main}"
APK_RAW_BASE="${APK_RAW_BASE:-https://raw.githubusercontent.com/${APK_REPO}/${APK_REF}}"
APK_ARCHIVE_URL="${APK_ARCHIVE_URL:-https://github.com/${APK_REPO}/archive/refs/heads/${APK_REF}.tar.gz}"
IMAGE="${APK_IMAGE:-ghcr.io/longxingze0925/ab:latest}"

ENV_FILE=".env"
STATE_FILE=".install-state"
BACKUP_DIR="backups"

LOCAL_SOURCE_ROOT=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  _sd="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P || true)"
  if [[ -n "$_sd" && -f "$_sd/../docker-compose.yml" ]]; then
    LOCAL_SOURCE_ROOT="$(cd "$_sd/.." && pwd -P)"
  fi
fi

log()   { printf '\n==> %s\n' "$*"; }
warn()  { printf '警告：%s\n' "$*" >&2; }
die()   { printf '错误：%s\n' "$*" >&2; exit 1; }
pause() { printf '\n按 Enter 继续...'; read -r _ || true; }

ask() {
  local prompt="$1" default="${2:-}" value
  if [[ -n "$default" ]]; then
    printf '%s [%s]: ' "$prompt" "$default" >&2
  else
    printf '%s: ' "$prompt" >&2
  fi
  read -r value
  printf '%s' "${value:-$default}"
}

ask_secret() {
  local prompt="$1" value
  printf '%s: ' "$prompt" >&2
  read -r -s value
  printf '\n' >&2
  printf '%s' "$value"
}

confirm() {
  local prompt="$1" answer
  printf '%s [y/N]: ' "$prompt"
  read -r answer
  [[ "$answer" == [yY] || "$answer" == "yes" || "$answer" == "是" ]]
}

random_secret() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '='; }

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "需要 root 权限，请用 sudo bash $0 重新运行。"
  assert_safe_dir
}

assert_safe_dir() {
  [[ -n "$INSTALL_DIR" && "$INSTALL_DIR" != "/" && "$INSTALL_DIR" != "/opt" ]] \
    || die "安装目录不安全：$INSTALL_DIR"
}

require_command() { command -v "$1" >/dev/null 2>&1 || die "缺少必需命令：$1"; }
is_installed()    { [[ -f "$INSTALL_DIR/docker-compose.yml" && -f "$INSTALL_DIR/$ENV_FILE" ]]; }
in_install_dir()  { cd "$INSTALL_DIR"; }
compose_cmd()     { docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" -f docker-compose.yml "$@"; }

get_env() {
  local key="$1" file="${2:-$INSTALL_DIR/$ENV_FILE}"
  [[ -f "$file" ]] || return 1
  awk -F= -v k="$key" '$1==k{sub(/^[^=]*=/,"");print;exit}' "$file"
}

set_env() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN{done=0}
    index($0,k"=")==1{print k"="v;done=1;next}
    {print}
    END{if(!done)print k"="v}
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"; rm -f "$tmp"
}

detect_ip() {
  local ip=""
  ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  [[ -z "$ip" ]] && ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  printf '%s' "$ip"
}

wait_http() {
  local url="$1" name="$2" attempts="${3:-40}" i
  for ((i=1;i<=attempts;i++)); do
    curl -fsS --max-time 5 "$url" >/dev/null 2>&1 && { printf '%s 已就绪。\n' "$name"; return 0; }
    sleep 3
  done
  return 1
}

fetch_source() {
  local dest="$1"
  rm -rf "$dest"; mkdir -p "$dest"
  if [[ -n "$LOCAL_SOURCE_ROOT" && "$LOCAL_SOURCE_ROOT" != "$INSTALL_DIR" ]]; then
    log "复制本地项目文件"
    (cd "$LOCAL_SOURCE_ROOT"
     tar --exclude='./.next' --exclude='./node_modules' \
         --exclude='./data' --exclude='./backups' \
         --exclude='./.git' -cf - .
    ) | (cd "$dest"; tar -xf -)
    return
  fi
  log "下载最新部署文件"
  curl -fsSL "$APK_ARCHIVE_URL" | tar -xz --strip-components=1 -C "$dest"
}

safe_refresh_source() {
  assert_safe_dir
  local tmp; tmp="$(mktemp -d)"
  fetch_source "$tmp"
  mkdir -p "$INSTALL_DIR"
  for f in "$ENV_FILE" "$STATE_FILE" "Caddyfile"; do
    [[ -f "$INSTALL_DIR/$f" ]] && cp "$INSTALL_DIR/$f" "$tmp/$f"
  done
  [[ -d "$INSTALL_DIR/$BACKUP_DIR" ]] && { mkdir -p "$tmp/$BACKUP_DIR"; cp -a "$INSTALL_DIR/$BACKUP_DIR/." "$tmp/$BACKUP_DIR/"; }
  [[ -d "$INSTALL_DIR/geodata" ]] && { mkdir -p "$tmp/geodata"; cp -a "$INSTALL_DIR/geodata/." "$tmp/geodata/"; }
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name "$BACKUP_DIR" ! -name "$ENV_FILE" ! -name "$STATE_FILE" \
    ! -name 'Caddyfile' ! -name 'geodata' \
    -exec rm -rf {} +
  cp -a "$tmp/." "$INSTALL_DIR/"
  rm -rf "$tmp"
}

write_state() {
  cat > "$INSTALL_DIR/$STATE_FILE" <<STATE
INSTALLED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SOURCE_REF=$APK_REF
IMAGE=$IMAGE
MAIN_DOMAIN=$(get_env MAIN_DOMAIN "$INSTALL_DIR/$ENV_FILE" 2>/dev/null || true)
STATE
  chmod 600 "$INSTALL_DIR/$STATE_FILE"
}

install_docker_prompt() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then return; fi
  warn "未检测到 Docker 或 Docker Compose 插件。"
  confirm "是否现在用 Docker 官方脚本安装？" || die "请先安装 Docker，然后重新运行。"
  require_command curl
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker >/dev/null 2>&1 || true
}

preflight() {
  require_command curl
  require_command openssl
  install_docker_prompt
  docker version >/dev/null
  docker compose version >/dev/null
}

check_geodata() {
  local dir="$INSTALL_DIR/geodata"
  mkdir -p "$dir"
  local has_tsv has_mmdb
  has_tsv="$(find "$dir" -name 'ip2asn-v4.tsv' 2>/dev/null | head -1)"
  has_mmdb="$(find "$dir" -name '*.mmdb' 2>/dev/null | head -1)"
  if [[ -z "$has_tsv" ]]; then
    warn "未找到 ip2asn-v4.tsv，运营商/分流识别将不可用。"
    printf '下载命令：curl -L https://iptoasn.com/data/ip2asn-v4.tsv.gz | gunzip > %s/ip2asn-v4.tsv\n' "$dir"
  fi
  if [[ -z "$has_mmdb" ]]; then
    warn "未找到 .mmdb 城市库，省市识别将不可用。"
    printf '下载地址：https://db-ip.com/db/download/ip-to-city-lite  解压后放入 %s/\n' "$dir"
  fi
}

# ── 安装流程 ──────────────────────────────────────────────────────────────
install_flow() {
  require_root
  preflight

  if is_installed; then
    warn "$APP_NAME 已安装在 $INSTALL_DIR。"
    confirm "是否继续刷新部署文件并保留现有配置？" || return
  fi

  log "准备部署文件"
  safe_refresh_source

  if [[ ! -f "$INSTALL_DIR/$ENV_FILE" ]]; then
    log "配置环境变量"
    local main_domain admin_user admin_pass session_secret

    printf '\n请填写以下配置（直接回车使用括号内默认值）：\n\n'
    main_domain="$(ask "后台主域名（如 admin.yourdomain.com）" "admin.example.com")"
    admin_user="$(ask "管理员账号" "admin")"
    admin_pass="$(ask_secret "管理员密码（留空自动生成）")"
    [[ -z "$admin_pass" ]] && admin_pass="$(random_secret | cut -c1-16)"
    session_secret="$(random_secret)"

    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/$ENV_FILE"
    chmod 600 "$INSTALL_DIR/$ENV_FILE"
    set_env "$INSTALL_DIR/$ENV_FILE" MAIN_DOMAIN    "$main_domain"
    set_env "$INSTALL_DIR/$ENV_FILE" ADMIN_USER     "$admin_user"
    set_env "$INSTALL_DIR/$ENV_FILE" ADMIN_PASSWORD "$admin_pass"
    set_env "$INSTALL_DIR/$ENV_FILE" SESSION_SECRET "$session_secret"
    set_env "$INSTALL_DIR/$ENV_FILE" APP_IMAGE      "$IMAGE"

    umask 077
    printf '%s 初始登录信息\n后台地址: https://%s\n账号: %s\n密码: %s\n' \
      "$APP_NAME" "$main_domain" "$admin_user" "$admin_pass" \
      > "$INSTALL_DIR/credentials.txt"
    printf '\n初始登录信息已保存到 %s/credentials.txt\n' "$INSTALL_DIR"
  else
    warn "已保留现有 $ENV_FILE，未覆盖配置。"
  fi

  check_geodata
  write_state

  log "拉取镜像"
  in_install_dir
  compose_cmd pull

  log "启动服务"
  compose_cmd up -d

  log "等待服务就绪"
  wait_http "http://127.0.0.1:3000/api/tls-check" "应用" 40 \
    || warn "健康检查超时，请运行「查看日志」排查。"

  install_local_command

  printf '\n安装完成！\n'
  printf '后台地址：https://%s\n' "$(get_env MAIN_DOMAIN "$INSTALL_DIR/$ENV_FILE" || echo '你配置的主域名')"
  printf '登录信息：%s/credentials.txt\n' "$INSTALL_DIR"
  printf '\n注意：请确保所有域名 DNS A 记录已指向本机 IP（%s）\n' "$(detect_ip)"
}

install_local_command() {
  [[ -w /usr/local/bin || "${EUID:-$(id -u)}" -eq 0 ]] || return 0
  mkdir -p /usr/local/bin
  printf '#!/usr/bin/env bash\nset -Eeuo pipefail\nexport APK_INSTALL_DIR="%s"\nexport APK_PROJECT_NAME="%s"\nexport APK_REPO="%s"\nexport APK_REF="%s"\nexport APK_RAW_BASE="%s"\nbash <(curl -fsSL "$APK_RAW_BASE/ops/install.sh")\n' \
    "$INSTALL_DIR" "$PROJECT_NAME" "$APK_REPO" "$APK_REF" "$APK_RAW_BASE" \
    > /usr/local/bin/apk-landing
  chmod +x /usr/local/bin/apk-landing
  printf '已注册全局命令：apk-landing\n'
}

# ── 更新流程 ──────────────────────────────────────────────────────────────
update_flow() {
  require_root
  preflight
  is_installed || die "$APP_NAME 尚未安装。"

  printf '\n确认更新到最新镜像（%s）？\n' "$IMAGE"
  confirm "继续？" || return

  backup_flow

  log "刷新部署文件"
  safe_refresh_source

  log "拉取最新镜像"
  in_install_dir
  compose_cmd pull

  log "重启服务"
  compose_cmd up -d

  wait_http "http://127.0.0.1:3000/api/tls-check" "应用" 40 \
    || warn "健康检查超时，请查看日志。"

  printf '\n更新完成。\n'
}

# ── 备份流程 ──────────────────────────────────────────────────────────────
backup_flow() {
  require_root
  is_installed || die "$APP_NAME 尚未安装。"
  in_install_dir

  mkdir -p "$BACKUP_DIR"
  local ts target cid
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  target="$BACKUP_DIR/app_${ts}.db"
  cid="$(compose_cmd ps -q app 2>/dev/null | head -1)"
  [[ -n "$cid" ]] || die "app 容器未运行，无法备份。"

  log "备份 SQLite 到 $INSTALL_DIR/$target"
  docker exec "$cid" sh -c "cp /data/app.db /data/_backup_tmp.db"
  docker cp "${cid}:/data/_backup_tmp.db" "$INSTALL_DIR/$target"
  docker exec "$cid" sh -c "rm -f /data/_backup_tmp.db"
  sha256sum "$INSTALL_DIR/$target" > "$INSTALL_DIR/${target}.sha256" 2>/dev/null || true

  printf '备份完成：%s\n' "$INSTALL_DIR/$target"
}

# ── 恢复流程 ──────────────────────────────────────────────────────────────
restore_flow() {
  require_root
  is_installed || die "$APP_NAME 尚未安装。"

  local file
  file="$(ask "备份文件路径（.db 文件）")"
  [[ -f "$file" ]] || die "文件不存在：$file"

  if [[ -f "${file}.sha256" ]]; then
    (cd "$(dirname "$file")" && sha256sum -c "$(basename "${file}.sha256")") \
      || die "SHA256 校验失败，备份文件可能已损坏。"
  fi

  confirm "恢复会覆盖当前数据，确认继续？" || return

  in_install_dir
  local cid
  cid="$(compose_cmd ps -q app 2>/dev/null | head -1)"
  [[ -n "$cid" ]] || die "app 容器未运行。"
  docker cp "$file" "${cid}:/data/app.db"
  compose_cmd restart app
  printf '恢复完成。\n'
}

# ── 状态 ──────────────────────────────────────────────────────────────────
status_flow() {
  is_installed || die "$APP_NAME 尚未安装。"
  in_install_dir
  printf '\n安装目录：%s\n' "$INSTALL_DIR"
  [[ -f "$STATE_FILE" ]] && awk -F= '{print $1"："$2}' "$STATE_FILE"
  printf '\n'
  compose_cmd ps
}

# ── 日志 ──────────────────────────────────────────────────────────────────
logs_flow() {
  is_installed || die "$APP_NAME 尚未安装。"
  in_install_dir
  printf '服务名（app/caddy），留空查看全部：'
  local svc; read -r svc
  if [[ -n "$svc" ]]; then
    compose_cmd logs --tail=200 -f "$svc"
  else
    compose_cmd logs --tail=200 -f
  fi
}

# ── 重启 ──────────────────────────────────────────────────────────────────
restart_flow() {
  require_root
  is_installed || die "$APP_NAME 尚未安装。"
  in_install_dir
  compose_cmd restart
  wait_http "http://127.0.0.1:3000/api/tls-check" "应用" 30 \
    || warn "重启后健康检查超时。"
}

# ── 诊断 ──────────────────────────────────────────────────────────────────
doctor_flow() {
  printf '\n环境诊断：\n'
  command -v docker >/dev/null 2>&1 \
    && printf 'docker      : 正常（%s）\n' "$(docker --version)" \
    || printf 'docker      : 缺失\n'
  docker compose version >/dev/null 2>&1 \
    && printf 'compose     : 正常\n' \
    || printf 'compose     : 缺失\n'
  command -v curl    >/dev/null 2>&1 && printf 'curl        : 正常\n' || printf 'curl        : 缺失\n'
  command -v openssl >/dev/null 2>&1 && printf 'openssl     : 正常\n' || printf 'openssl     : 缺失\n'

  local gdir="$INSTALL_DIR/geodata"
  [[ -f "$gdir/ip2asn-v4.tsv" ]] \
    && printf 'ip2asn      : 正常\n' \
    || printf 'ip2asn      : 缺失（运营商/分流识别不可用）\n'
  find "$gdir" -name "*.mmdb" 2>/dev/null | grep -q . \
    && printf '城市库(.mmdb): 正常\n' \
    || printf '城市库(.mmdb): 缺失（省市识别不可用）\n'

  printf '\n磁盘空间：\n'; df -h "$INSTALL_DIR" 2>/dev/null || df -h /

  if is_installed; then
    printf '\n服务状态：\n'; in_install_dir; compose_cmd ps
    printf '\n健康检查：\n'
    wait_http "http://127.0.0.1:3000/api/tls-check" "应用" 5 \
      || printf '应用未响应。\n'
  fi
}

# ── 卸载 ──────────────────────────────────────────────────────────────────
uninstall_flow() {
  require_root
  is_installed || die "$APP_NAME 尚未安装。"

  printf '\n卸载选项：\n'
  printf '1) 安全卸载，保留数据卷和备份文件\n'
  printf '2) 彻底清除，包括 Docker 数据卷（数据不可恢复）\n'
  printf '3) 取消\n'
  printf '请选择：'
  local choice; read -r choice

  in_install_dir
  case "$choice" in
    1)
      compose_cmd down
      rm -f /usr/local/bin/apk-landing
      printf '服务已停止，数据和 %s 已保留。\n' "$INSTALL_DIR"
      ;;
    2)
      printf '请输入 DELETE APK DATA 确认彻底清除：'
      local phrase; read -r phrase
      [[ "$phrase" == "DELETE APK DATA" ]] || die "确认短语不匹配，已取消。"
      compose_cmd down -v --rmi local
      rm -f /usr/local/bin/apk-landing
      rm -rf "$INSTALL_DIR"
      printf '已彻底清除。\n'
      ;;
    *) warn "已取消。" ;;
  esac
}

# ── 主菜单 ────────────────────────────────────────────────────────────────
print_header() {
  clear 2>/dev/null || true
  printf '========================================\n'
  printf '  %s\n' "$APP_NAME"
  printf '========================================\n'
  if is_installed; then
    printf '状态：已安装\n'
    printf '目录：%s\n' "$INSTALL_DIR"
    [[ -f "$INSTALL_DIR/$STATE_FILE" ]] && \
      awk -F= '$1=="MAIN_DOMAIN"{print "域名："$2} $1=="IMAGE"{print "镜像："$2}' \
        "$INSTALL_DIR/$STATE_FILE"
  else
    printf '状态：未安装\n'
  fi
  printf '\n'
}

main_menu() {
  while true; do
    print_header
    if is_installed; then
      printf '1) 更新到最新版\n2) 查看状态\n3) 查看日志\n4) 备份数据\n'
      printf '5) 恢复备份\n6) 重启服务\n7) 运行诊断\n8) 卸载\n9) 退出\n'
      printf '请选择：'
      local choice; read -r choice
      case "$choice" in
        1) update_flow;    pause ;;
        2) status_flow;    pause ;;
        3) logs_flow ;;
        4) backup_flow;    pause ;;
        5) restore_flow;   pause ;;
        6) restart_flow;   pause ;;
        7) doctor_flow;    pause ;;
        8) uninstall_flow; pause ;;
        9) exit 0 ;;
        *) warn "无效选择。"; pause ;;
      esac
    else
      printf '1) 安装\n2) 运行诊断\n3) 退出\n'
      printf '请选择：'
      local choice; read -r choice
      case "$choice" in
        1) install_flow; pause ;;
        2) doctor_flow;  pause ;;
        3) exit 0 ;;
        *) warn "无效选择。"; pause ;;
      esac
    fi
  done
}

main_menu
