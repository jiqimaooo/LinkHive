# LinkHive

LinkHive 是一个运行在 Debian/Ubuntu 设备上的 4G 模组管理与短信转发控制台，面向工控机、软路由、4G 网关和带蜂窝模组的边缘设备。

它支持普通 SIM 与 eSIM 两种模式，并通过同一套 Web 控制台进行互斥切换：左侧菜单始终显示 `普通 SIM` 与 `eSIM`，但系统运行时只会启用其中一种。

## 功能特性

- 普通 SIM 模式：查看基带状态、运营商、信号、网络制式、短信列表和短信转发服务状态。
- eSIM 模式：读取 Profile、切换 Profile、关联短信中心、执行保活任务。
- 模式互斥：普通 SIM 与 eSIM 不能同时启用，后端只接受 `physical` 或 `esim`。
- 短信转发：通过 ModemManager 读取短信，并通过 Apprise 转发到多种渠道。
- 通知渠道：支持 Bark、Telegram、Gotify、ntfy、Discord 和自定义 Apprise URL。
- 网络配置：支持 APN、网络制式、手动选网等常见蜂窝网络操作。
- 任务日志：控制台实时显示操作执行步骤。
- 登录鉴权：默认启用账号密码登录，支持会话 Cookie、防暴力破解和二次认证接口。
- 统一部署：一套安装文件同时支持普通 SIM 和 eSIM，运行时切换。

## 系统要求

推荐环境：

- Debian 11/12 或 Ubuntu 22.04/24.04
- systemd
- Python 3
- ModemManager / `mmcli`
- NetworkManager / `nmcli`
- libqmi / `qmicli`
- 支持 Linux 的 4G/5G 模组

eSIM 功能额外需要：

- 可被 `lpac` 访问的 eUICC
- 可用的 `/opt/lpac/lpac`
- LinkHive 安装的 `/usr/local/bin/lpac-switch`

普通实体 SIM 场景不要求 eUICC。

## 部署

Docker 适合先预览 UI 或快速验证；一键脚本适合 Debian/Ubuntu 工控机、软路由或网关设备，会安装系统依赖并注册 systemd 服务。如果要直接管理真实 4G 模组，systemd 方式通常比 Docker 更少权限问题。

## Docker 部署（推荐优先尝试）

仓库包含 `Dockerfile` 与 `docker-compose.yml`，会在镜像构建阶段自动构建前端，不依赖仓库提交 `frontend_dist`。

启动：

```bash
docker compose up -d --build
```

访问：

```text
http://127.0.0.1:7575
```

查看日志：

```bash
docker compose logs -f
```

停止：

```bash
docker compose down
```

注意：如果容器要直接管理真实蜂窝模组，通常需要额外配置 `privileged`、设备映射、host network，以及宿主机上的 ModemManager/NetworkManager 权限。具体配置取决于工控机系统和模组接入方式。

## 一键脚本部署

直接运行一键安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/jiqimaooo/LinkHive/main/scripts/install_latest.sh | sudo sh
```

默认初始模式为 eSIM。如果要以普通 SIM 模式启动：

```bash
curl -fsSL https://raw.githubusercontent.com/jiqimaooo/LinkHive/main/scripts/install_latest.sh | sudo sh -s -- --sim-type physical
```

安装完成后访问：

```text
http://设备IP:8080
```

默认登录信息：

```text
账号：admin
密码：admin
```

生产环境建议首次登录后立即修改密码，并尽量放在可信内网或 HTTPS 反向代理后面。

## lpac 预编译资产

源码仓库默认不提交 `lpac-linux-*.zip` 这类预编译二进制压缩包。eSIM 部署时，安装脚本会依次查找匹配当前设备架构、系统版本和 glibc 的 lpac 资产：

- 本地 `deploy/esim/lpac-linux-*.zip`。
- 最新 Release 附件中的 `lpac-assets.json` 及对应 zip。
- 固定 `lpac-assets` Release 附件中的 `lpac-assets.json` 及对应 zip。

推荐把 lpac 二进制作为 GitHub Release 附件发布，不放进源码仓库。命名示例：

```text
lpac-linux-aarch64-glibc2.31.zip
lpac-linux-aarch64-debian12-glibc2.36.zip
lpac-linux-x86_64-ubuntu22.04-glibc2.35.zip
```

构建 lpac bundle 的辅助脚本：

```bash
sh ./scripts/build_lpac_bundle.sh \
  --source-dir /path/to/lpac-source \
  --output dist/lpac-linux-aarch64-glibc2.31.zip
```

生成资产清单：

```bash
python3 scripts/build_lpac_manifest.py \
  --assets-dir dist \
  --output dist/lpac-assets.json
```

建议创建一个固定 tag 的 Release，专门存放 lpac 资产：

```bash
gh release create lpac-assets \
  dist/lpac-assets.json \
  dist/lpac-linux-aarch64-glibc2.31.zip \
  --title "lpac assets" \
  --notes "LinkHive lpac 预编译资产"
```

这样每次 `main` 自动生成新的 LinkHive Release 时，不需要重复上传 lpac。安装脚本会先查最新 Release，找不到时自动回退到 `lpac-assets` Release。

## 配置文件

主配置文件：

```text
/etc/linkhive.conf
```

常见字段：

```env
SIM_TYPE=esim
ESIM_MANAGEMENT_ENABLED=1
LINKHIVE_AUTH_ENABLED=1
LINKHIVE_ADMIN_USER=admin
LINKHIVE_PASSWORD_HASH=pbkdf2_sha256$...
LINKHIVE_SESSION_SECRET=...
LINKHIVE_BRUTE_FORCE_ENABLED=1
LINKHIVE_BRUTE_FORCE_MAX_ATTEMPTS=5
LINKHIVE_BRUTE_FORCE_LAN_ENABLED=1
LINKHIVE_TRUST_PROXY_HEADERS=0
LINKHIVE_COOKIE_SECURE=0
```

通知配置文件：

```text
/etc/sms-forwarder.conf
```

通知渠道通过 Apprise URL 配置，示例可参考：

```text
deploy/sms_forwarder/sms-forwarder.conf.example
```

## 反向代理与安全建议

如果 LinkHive 放在 HTTPS 反向代理后面，并且代理会正确覆盖 `X-Forwarded-*` 请求头，可以开启：

```env
LINKHIVE_TRUST_PROXY_HEADERS=1
LINKHIVE_COOKIE_SECURE=1
```

安全建议：

- 不要直接暴露到公网。
- 首次部署后修改默认密码。
- 使用 HTTPS 反向代理时开启 `LINKHIVE_COOKIE_SECURE=1`。
- 只有在可信反向代理后面才开启 `LINKHIVE_TRUST_PROXY_HEADERS=1`。
- 不要把 `/etc/linkhive.conf`、`/etc/sms-forwarder.conf` 或任何包含 token/password 的文件提交到 Git。
  
## 已知限制

- 本项目依赖 Linux 蜂窝网络工具链，macOS/Windows 只能做 UI 或接口预览。
- eSIM 能力取决于硬件、eUICC、驱动、`lpac` 与模组 USB 模式。
- 不同运营商的 APN、SMSC 和注册行为可能不同，需要按实际卡片调整。

## 来源声明

本项目基于并参考了 [cyDione/eSIM-SMS-Forwarder](https://github.com/cyDione/eSIM-SMS-Forwarder) 的思路和部分实现进行修改与扩展。原项目使用 MIT License，版权声明已保留在 [LICENSE](./LICENSE) 中。

LinkHive 在原项目基础上的主要变更：

- 项目名称与部署路径改为 LinkHive。
- 普通 SIM 与 eSIM 从安装期分离改为同一系统内运行期互斥切换。
- 重新设计 Web 控制台 UI。
- 增加登录鉴权、安全配置、二次认证接口与防暴力破解逻辑。
- 增加 Docker 相关部署文件。

如需了解原始项目，请访问：[cyDione/eSIM-SMS-Forwarder](https://github.com/cyDione/eSIM-SMS-Forwarder)。

## License

本项目使用 MIT License，详见 [LICENSE](./LICENSE)。

## 免责声明

本项目仅用于合法的设备管理、短信转发和网络运维场景。使用者需要自行确认当地法律法规、运营商条款和设备授权要求。作者不对错误配置、违规使用、运营商限制、资费损失或设备损坏承担责任。
