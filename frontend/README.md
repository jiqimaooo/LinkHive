# LinkHive Frontend

这是 LinkHive Web 控制台的前端项目，基于 React、TypeScript、Vite 和 Tailwind CSS。

前端只负责界面、路由和交互状态；登录认证、设备识别、短信、eSIM Profile、通知转发、定时任务等业务逻辑由后端 API 提供。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm exec tsc -b
```

生产构建产物输出到 `frontend/dist`。一键部署包会把构建后的静态资源安装到后端服务使用的 `frontend_dist` 目录。

## SIM / eSIM 展示逻辑

前端不提供普通 SIM / eSIM 的全局选择入口。

设备列表、仪表盘和定时任务页面会使用后端 `/api/status` 返回的设备能力字段展示当前设备类型：

- `device.active_sim_kind`
- `device.capabilities.esim_supported`
- `device.capabilities.lpac_supported`
- `profiles`

普通 SIM 与 eSIM 可以同时存在于同一套系统中，具体能力按设备自动识别。
