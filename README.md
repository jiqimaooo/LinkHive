# LinkHive

LinkHive 是一个运行在 Debian/Ubuntu 设备上的蜂窝模组管理与短信转发控制台，面向工控机、软路由、4G/5G 网关和带 Quectel 等蜂窝模组的边缘设备。

它支持普通 SIM 与 eSIM 两种使用方式，并通过同一套 Web 控制台管理设备状态、短信、通知渠道、定时任务、安全配置和运行日志。当前后端默认使用 LinkHive 自研的 `direct` 基带访问层，优先通过 QMI/AT 直接读取 Quectel 模组，ModemManager 不再是主路径。

## 功能特性

- 仪表盘：展示设备概览、服务状态、网络状态、信号、流量和关键告警。
- 设备管理：查看多设备状态、IMEI/ICCID/IMSI/EID、运营商、注册状态、信号、网络制式和 APN。
- 直接基带访问：`MODEM_BACKEND=direct`，优先走 QMI DMS/UIM/NAS 读取基础状态，AT 作为短信和部分能力的后备通道。
- 短信管理：按号码聚合会话，读取 SIM/模组短信，支持发送、删除和刷新。
- 通知转发：以卡片方式管理 Bark、Telegram、Gotify、ntfy、Discord 和自定义 Apprise URL，每种渠道保留一份配置。
- 定时任务：通过列表管理自动短信任务，支持当前 SIM 与 eSIM Profile 发送方式。
- eSIM 管理：读取 Profile、切换 Profile、下载写入 Profile，并支持为 Profile 关联短信中心。
- 网络配置：支持 APN、网络制式、自动/手动选网、VoLTE/VoWiFi 等常见配置项。
- 安全中心：默认启用账号密码登录，支持会话管理、修改账号密码、TOTP、防暴力破解、IP 封禁与危险操作确认。
- 实时日志：顶部导航右侧打开日志弹窗，默认展示操作日志；系统日志可手动开启、清空并设置保留时长。
- 统一部署：一套安装文件同时部署 Web 管理服务、短信转发服务、lpac 包装脚本和前端静态资源。

## 系统要求

推荐环境：

- Debian 11/12 或 Ubuntu 22.04/24.04
- systemd
- Python 3
- libqmi / `qmicli`
- NetworkManager / `nmcli`（用于部分连接/APN 信息）
- 可用的 AT 端口，例如 `/dev/ttyUSB2`
- 可用的 QMI 设备，例如 `/dev/cdc-wdm0`
- 支持 Linux 的 4G/5G 模组

eSIM 功能额外需要：

- 可被 `lpac` 访问的 eUICC
- 可用的 `/opt/lpac/bin/lpac`
- LinkHive 安装的 `/usr/local/bin/lpac-switch`

普通实体 SIM 场景不要求 eUICC。

## 部署

Docker 适合先预览 UI 或快速验证；一键脚本适合 Debian/Ubuntu 工控机、软路由或网关设备，会安装系统依赖并注册 systemd 服务。如果要直接管理真实蜂窝模组，systemd 方式通常比 Docker 更少权限问题。

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

注意：如果容器要直接管理真实蜂窝模组，通常需要额外配置 `privileged`、设备映射、host network，以及宿主机上的 QMI/AT 设备和 NetworkManager 权限。具体配置取决于工控机系统和模组接入方式。

## 一键脚本部署

直接运行一键安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/jiqimaooo/LinkHive/main/scripts/install_latest.sh | sudo sh
```

安装脚本不再区分普通 SIM / eSIM 启动方式；它会统一部署短信、控制台、lpac 包装脚本和可用的 eSIM 依赖。系统会按每个设备探测到的 EID、eUICC 能力、Profile 列表和硬件特征自动识别普通 SIM 或 eSIM，不需要选择全局模式。

安装完成后访问：

```text
http://设备IP:8080
```

首次安装时，脚本会在终端输出初始登录信息：

```text
[install] LinkHive 初始账号: admin
[install] LinkHive 初始密码: <随机生成>
```

随机初始密码只会在首次安装时显示一次，后续 `/etc/linkhive.conf` 只保存密码哈希，不能反查明文。如果忘记初始密码，请重新设置密码哈希或重新初始化鉴权配置。生产环境建议首次登录后立即修改密码，并尽量放在可信内网或 HTTPS 反向代理后面。

安装后会注册两个 systemd 服务：

```text
linkhive-admin.service    Web 控制台与 HTTP API
sms-forwarder.service     后台短信监听与通知转发
```

常用运维命令：

```bash
systemctl status linkhive-admin.service
systemctl status sms-forwarder.service
journalctl -u linkhive-admin.service -f
journalctl -u sms-forwarder.service -f
```

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

## 安全建议

- 为了您的数据安全，推荐将 LinkHive 私有化部署在可信设备或内网环境中，仅通过内网、VPN 或受控反向代理访问。
- LinkHive 不提供、也不会接入任何官方在线云服务；短信内容、SIM/eSIM 信息、通知渠道密钥、登录凭据和运行日志均由部署者自行保存和管理。
- 项目的开源代码不负责托管、备份、同步或保护您的业务数据。数据安全、网络访问控制、系统加固、密钥保管、备份恢复和合规使用均由部署和使用者自行负责。
- 不要直接暴露到公网；如确需公网访问，请配置可信反向代理或 VPN 入口，并开启 TOTP 等二次验证措施。
- 首次部署后修改安装脚本生成的随机初始密码。
- 需要二次认证时，在安全中心启用 TOTP；如果丢失验证器，可在 `/etc/linkhive.conf` 中设置 `LINKHIVE_TOTP_ENABLED=false` 后重启服务。
- 不要把 `/etc/linkhive.conf`、`/etc/sms-forwarder.conf` 或任何包含 token/password 的文件提交到 Git。
  
## 已知限制

- 本项目依赖 Linux 蜂窝网络工具链，macOS/Windows 只能做 UI 或接口预览。
- eSIM 能力取决于硬件、eUICC、驱动、`lpac` 与模组 USB 模式。
- 当前 QMI 直连栈已覆盖 DMS/UIM/NAS 的主要读取能力；短信发送/读取、部分网络操作和恢复流程仍会使用 AT 后备。
- WMS RawRead/RawSend、WDS StartNetwork、NAS SetSystemSelectionPreference 等更完整的 QMI 写入能力仍在逐步补齐。
- 不同运营商的 APN、SMSC 和注册行为可能不同，需要按实际卡片调整。

## License

本项目使用 MIT License，详见 [LICENSE](./LICENSE)。

## 免责声明

本项目仅用于合法的设备管理、短信转发和网络运维场景。使用者需要自行确认当地法律法规、运营商条款和设备授权要求。作者不对错误配置、违规使用、运营商限制、资费损失或设备损坏承担责任。

## 来源与重构说明

LinkHive 基于并参考了 [cyDione/eSIM-SMS-Forwarder](https://github.com/cyDione/eSIM-SMS-Forwarder) 的思路和部分实现进行二次开发。原项目使用 MIT License，版权声明已保留在 [LICENSE](./LICENSE) 中。

经过持续重构后，LinkHive 已作为独立维护项目发展，重点变化包括：

- 项目名称、安装路径、服务名称和部署链路改为 LinkHive。
- Web 控制台已从原有单页管理界面重构为多页面 SaaS 风格后台。
- 增加登录鉴权、安全中心、二次认证接口、防暴力破解、会话管理和操作日志能力。
- 重构设备管理、短信管理、通知转发、定时任务、系统设置和移动端适配。
- 普通 SIM 与 eSIM 从安装期分离改为设备级自动识别，并支持多设备、多 Profile 的展示和配置。
- 增加直连 Quectel 模组的 QMI/AT 混合基带访问能力，逐步减少对 ModemManager 的依赖。
- 增加 Docker、Release、远端部署和前端构建发布相关脚本。

因此，LinkHive 可以视为在 MIT 许可基础上二次开发并大幅重构后的独立项目；但它并不是与原项目完全无关的从零实现，仍保留上游项目的版权声明和来源说明。

如需了解原始项目，请访问：[cyDione/eSIM-SMS-Forwarder](https://github.com/cyDione/eSIM-SMS-Forwarder)。
