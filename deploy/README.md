# LinkHive 部署资产

这个目录存放会被安装到 Debian/Ubuntu 设备上的文件。

- `install.sh`：一键安装脚本，负责复制文件、安装依赖、配置 systemd 服务并启动后台。
- `esim/lpac-switch.sh`：`lpac` 包装脚本，用于读取 Profile 和切换 eSIM。
- `esim/lpac`：指向 `/opt/lpac/bin/lpac` 的兼容包装脚本。
- `sms_forwarder/sms_forwarder.py`：轮询 ModemManager 短信并通过 Apprise 转发。
- `sms_forwarder/sms-forwarder.service`：短信转发 systemd 服务。
- `shared/notification_utils.py`：通知渠道解析与发送的共享工具。
- `sms_forwarder/sms-forwarder.conf.example`：Apprise 通知渠道配置模板。
- `web_admin/linkhive_admin.py`：Web API 与前端静态资源服务。
- `web_admin/linkhive-admin.service`：LinkHive 控制台 systemd 服务。

## 普通 SIM 与 eSIM

LinkHive 使用同一套部署文件支持普通 SIM 与 eSIM。安装脚本会始终部署 eSIM 相关包装脚本，并尽量安装可用的 `lpac`。当前运行模式由 `/etc/linkhive.conf` 控制：

```env
SIM_TYPE=esim
ESIM_MANAGEMENT_ENABLED=1
```

控制台左侧的 `普通 SIM` 和 `eSIM` 菜单会调用后端接口写入这个配置，两个模式不能同时启用。

## lpac 资产选择

`deploy/install.sh` 支持自动选择 `lpac` 资产。

优先级：

- 优先使用本地匹配的 `deploy/esim/lpac-linux-*.zip`，这个文件适合放在私有打包环境或 Release 构建环境，不建议提交到源码仓库。
- 如果本地没有，下载最新 release 中的 `lpac-assets.json`。
- 如果最新 release 没有，回退到固定 tag `lpac-assets` 对应 release 中的 `lpac-assets.json`。
- 按 `arch`、可选 `os/os_version` 和 `glibc` 选择最匹配的资产。

推荐命名：

- `lpac-linux-aarch64-glibc2.31.zip`
- `lpac-linux-aarch64-debian12-glibc2.36.zip`
- `lpac-linux-x86_64-ubuntu22.04-glibc2.35.zip`

发布工作流会扫描构建环境中的 `lpac-linux-*.zip`，生成 `lpac-assets.json` 并随 Release 一起发布。更推荐把长期可用的 lpac 资产放到固定 tag `lpac-assets` 的 Release 中，源码仓库默认只保留 `lpac` 包装脚本和 `lpac-switch.sh`，不提交预编译二进制包。
