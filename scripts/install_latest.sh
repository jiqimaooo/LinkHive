#!/bin/sh
set -eu

REPO_OWNER="${REPO_OWNER:-}"
REPO_NAME="${REPO_NAME:-LinkHive}"
ASSET_NAME="${ASSET_NAME:-LinkHive-deploy.zip}"

TMP_DIR=""
INSTALL_ARGS=""

log() {
    printf '%s\n' "[bootstrap] $*"
}

warn() {
    printf '%s\n' "[bootstrap] $*" >&2
}

die() {
    printf '%s\n' "[bootstrap] $*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage:
  curl -fsSL <url> | sudo REPO_OWNER=<owner> REPO_NAME=LinkHive sh -s -- [--sim-type esim|physical]

Options:
  --sim-type esim      默认模式，启用 eSIM 管理与短信转发
  --sim-type physical  普通 SIM 模式，只启用短信相关功能
EOF
}

cleanup() {
    if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
        rm -rf "${TMP_DIR}"
    fi
}

require_root() {
    if [ "$(id -u)" != "0" ]; then
        die "请使用 root 运行，例如：curl -fsSL <url> | sudo sh"
    fi
}

require_repo_config() {
    [ -n "${REPO_OWNER}" ] || die "请设置 REPO_OWNER，例如：sudo REPO_OWNER=<owner> REPO_NAME=LinkHive sh"
    [ -n "${REPO_NAME}" ] || die "请设置 REPO_NAME"
    export REPO_OWNER REPO_NAME
}

download_file() {
    url=$1
    output=$2
    if command -v curl >/dev/null 2>&1; then
        if curl \
            --http1.1 \
            -fL \
            --retry 1 \
            --connect-timeout 10 \
            --max-time 90 \
            --speed-time 20 \
            --speed-limit 1024 \
            -o "${output}" \
            "${url}"; then
            return 0
        fi
    fi
    if command -v wget >/dev/null 2>&1; then
        if wget --tries=1 --timeout=20 --max-redirect=20 -O "${output}" "${url}"; then
            return 0
        fi
    fi
    return 1
}

extract_zip() {
    archive=$1
    target_dir=$2
    if command -v unzip >/dev/null 2>&1; then
        unzip -q "${archive}" -d "${target_dir}"
        return 0
    fi
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$archive" "$target_dir" <<'PY'
import sys
from zipfile import ZipFile

archive, target = sys.argv[1], sys.argv[2]
ZipFile(archive).extractall(target)
PY
        return 0
    fi
    die "缺少 unzip，且没有 python3，无法解压安装包"
}

ensure_extract_dependencies() {
    if command -v unzip >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
        return
    fi

    if command -v apt-get >/dev/null 2>&1; then
        log "安装解压所需依赖 python3"
        export DEBIAN_FRONTEND=noninteractive
        apt-get update
        apt-get install -y python3
        return
    fi

    die "缺少 unzip 和 python3，且无法自动安装"
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --sim-type)
                [ $# -ge 2 ] || die "--sim-type 缺少参数"
                INSTALL_ARGS="${INSTALL_ARGS} --sim-type $2"
                shift 2
                ;;
            --sim-type=*)
                INSTALL_ARGS="${INSTALL_ARGS} $1"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                die "不支持的参数: $1"
                ;;
        esac
    done
}

main() {
    parse_args "$@"
    require_root
    require_repo_config
    trap cleanup EXIT INT TERM

    TMP_DIR=$(mktemp -d /tmp/linkhive.XXXXXX)
    archive_path="${TMP_DIR}/${ASSET_NAME}"
    extract_dir="${TMP_DIR}/package"
    mkdir -p "${extract_dir}"

    release_url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${ASSET_NAME}"

    log "下载最新 Release 部署包"
    download_file "${release_url}" "${archive_path}" || die "Release 部署包下载失败，请确认已发布 ${ASSET_NAME}"

    ensure_extract_dependencies

    log "解压安装包"
    extract_zip "${archive_path}" "${extract_dir}"

    if [ -f "${extract_dir}/deploy/install.sh" ]; then
        package_root="${extract_dir}"
    else
        package_root=$(find "${extract_dir}" -mindepth 1 -maxdepth 1 -type d | head -n 1 || true)
    fi

    [ -n "${package_root}" ] || die "未找到解压后的项目目录"
    [ -f "${package_root}/deploy/install.sh" ] || die "安装包中缺少 deploy/install.sh"

    log "开始执行部署脚本"
    cd "${package_root}"
    # shellcheck disable=SC2086
    sh ./deploy/install.sh ${INSTALL_ARGS}
    log "安装完成"
}

main "$@"
