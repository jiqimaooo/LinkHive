# LinkHive

LinkHive 是一个面向 4G 模组的短信转发与 SIM 管理控制台。项目参考 `cyDione/eSIM-SMS-Forwarder` 的核心能力，但部署方式调整为同一套系统同时支持普通 SIM 与 eSIM，通过控制台左侧菜单二选一启用。

## 功能

- 普通 SIM：保留基带状态、APN、网络制式、短信列表、短信转发与测试短信能力。
- eSIM：在普通 SIM 能力基础上启用 Profile 列表、切卡、短信中心关联和保活任务。
- 模式互斥：`普通 SIM` 与 `eSIM` 不能同时启用，前端两个菜单始终可见，点击任意一个会写入系统配置并自动关闭另一个模式。
- 鉴权：Web API 默认启用登录鉴权，首次安装自动生成 `admin` 初始密码。
- 通知渠道：通过 Apprise 支持 Bark、Telegram、Gotify、ntfy、Discord 和自定义 Apprise URL。

## 可行性说明

参考项目原本通过安装参数区分：

```bash
--sim-type esim
--sim-type physical
```

这个限制不是架构上必须分开部署，而是安装脚本在普通 SIM 模式下跳过 `lpac` 并禁用 eSIM 管理。LinkHive 已改成统一部署：

- 安装时始终部署 `lpac-switch` 包装脚本。
- 安装时尽量安装 `/opt/lpac/bin/lpac`。
- 运行期通过 `/etc/linkhive.conf` 中的 `SIM_TYPE` 和 `ESIM_MANAGEMENT_ENABLED` 控制当前模式。
- 前端通过 `/api/settings/sim-mode` 切换模式，后端只接受 `physical` 或 `esim`，保证互斥。

注意：如果设备上没有可用的 `lpac`，仍可切换到 eSIM 模式，但 Profile 读取和切卡会不可用，控制台会给出告警。

## 部署

```bash
sudo sh ./deploy/install.sh
```

默认初始进入 eSIM 模式。也可以指定普通 SIM 作为初始模式：

```bash
sudo sh ./deploy/install.sh --sim-type physical
```

安装脚本会输出默认登录信息：

```text
[install] LinkHive 初始账号: admin
[install] LinkHive 初始密码: admin
```

访问：

```text
http://设备IP:8080
```

## 配置文件

主配置：

```text
/etc/linkhive.conf
```

常用字段：

```env
SIM_TYPE=esim
ESIM_MANAGEMENT_ENABLED=1
LINKHIVE_AUTH_ENABLED=1
LINKHIVE_ADMIN_USER=admin
LINKHIVE_PASSWORD_HASH=pbkdf2_sha256$...
LINKHIVE_SESSION_SECRET=...
```

短信通知配置：

```text
/etc/sms-forwarder.conf
```

## 服务

```bash
systemctl status linkhive-admin.service
systemctl status sms-forwarder.service
```

查看日志：

```bash
journalctl -u linkhive-admin.service -f
journalctl -u sms-forwarder.service -f
```

## 本地验证

后端语法检查：

```bash
python3 -X pycache_prefix=/private/tmp/linkhive-pycache -m py_compile \
  deploy/web_admin/linkhive_admin.py \
  deploy/sms_forwarder/sms_forwarder.py \
  deploy/shared/notification_utils.py
```

前端构建：

```bash
cd frontend
pnpm install
pnpm run build
```
