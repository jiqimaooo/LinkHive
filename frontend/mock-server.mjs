import http from "node:http"

const PORT = 8080
const HOSTNAME = "localhost"

const STATUS = {
  profiles: [
    {
      iccid: "8944500102234567890",
      display_name: "giffgaff UK",
      provider_name: "giffgaff",
      is_active: true,
      state: "enabled",
      smsc_address: "+447802002606",
      smsc_type: "145",
    },
    {
      iccid: "8944500102234567891",
      display_name: "EE UK",
      provider_name: "EE",
      is_active: false,
      state: "enabled",
      smsc_address: "",
      smsc_type: "145",
    },
    {
      iccid: "8944500102234567892",
      display_name: "T-Mobile US",
      provider_name: "T-Mobile",
      is_active: false,
      state: "enabled",
      smsc_address: "",
      smsc_type: "145",
    },
  ],
  capabilities: {
    sim_type: "physical",
    esim_management_enabled: false,
    lpac_installed: true,
  },
  modem_available: true,
  status_message: "基带在线，网络已注册",
  errors: [],
  modem: {
    number: "+447700123456",
    operator_code: "23410",
    operator_name: "O2 UK",
    registration: "home",
    state: "registered",
    signal: "78",
    access_tech: "lte",
    current_modes: "allowed: 4g|3g; preferred: 4g",
    apn: "fast.t-mobile.com",
    ip_type: "ipv4v6",
  },
  connection: {
    apn: "fast.t-mobile.com",
    username: "",
    password: "",
    ip_type: "ipv4v6",
    network_id: "",
  },
  services: {
    modemmanager: "active",
    sms_forwarder: "active",
    web_admin: "active",
  },
  notifications: {
    configured_count: 2,
    configured_labels: ["Bark", "Telegram"],
    targets: [
      {
        id: "n1",
        label: "My Bark",
        url: "barks://api.day.app/devicekey123",
        enabled: true,
        type: "bark",
      },
      {
        id: "n2",
        label: "Bot Telegram",
        url: "tgram://123456:ABC/789012",
        enabled: true,
        type: "telegram",
      },
    ],
  },
  keepalive: {
    settings: { queue_gap_seconds: 180 },
    tasks: [
      {
        id: "k1",
        label: "giffgaff 保活",
        enabled: true,
        profile_iccid: "8944500102234567890",
        profile_name: "giffgaff UK",
        target_number: "+447000000000",
        message: "KEEPALIVE",
        cron_expression: "0 9 * * *",
        schedule_label: "每天 09:00",
        next_run: "2026-06-22T09:00:00",
        next_run_label: "明天 09:00",
      },
    ],
    active_run: null,
    queued_runs: [],
    recent_runs: [
      {
        id: "r1",
        task_id: "k1",
        label: "giffgaff 保活",
        trigger: "schedule",
        scheduled_for: "2026-06-21T09:00:00",
        scheduled_for_label: "今天 09:00",
        profile_iccid: "8944500102234567890",
        profile_name: "giffgaff UK",
        target_number: "+447000000000",
        state: "done",
        error: "",
        last_message: "短信已发送，状态：成功",
        created_at: "2026-06-21T09:00:00",
        updated_at: "2026-06-21T09:02:30",
      },
    ],
    next_allowed_at: "当前可执行",
  },
  sms: [
    {
      id: "sms1",
      number: "+447900000001",
      text: "Your O2 data balance: 5.2GB remaining. Next refresh: 2026-07-01.",
      timestamp: "2026-06-21 14:32:10",
      state: "received",
      state_label: "已接收",
    },
    {
      id: "sms2",
      number: "Giffgaff",
      text: "You've used 3.5GB of your 20GB plan. Goodybag renews in 12 days.",
      timestamp: "2026-06-21 12:15:45",
      state: "received",
      state_label: "已接收",
    },
    {
      id: "sms3",
      number: "+447900000003",
      text: "银行验证码：847291，有效期5分钟。请勿泄露给他人。",
      timestamp: "2026-06-21 10:08:22",
      state: "received",
      state_label: "已接收",
    },
  ],
  timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  })
  res.end(JSON.stringify(data))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  // CORS preflight
  if (req.method === "OPTIONS") {
    jsonResponse(res, {})
    return
  }

  console.log(`${req.method} ${path}`)

  switch (path) {
    case "/api/auth/status":
      jsonResponse(res, {
        auth_enabled: false,
        authenticated: true,
        username: "admin",
      })
      break

    case "/api/auth/login":
      jsonResponse(res, {
        auth_enabled: false,
        authenticated: true,
        username: "admin",
        ok: true,
      })
      break

    case "/api/auth/logout":
      jsonResponse(res, { ok: true })
      break

    case "/api/status": {
      const data = { ...STATUS, timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }) }
      jsonResponse(res, data)
      break
    }

    case "/api/settings/sim-mode": {
      let body = ""
      req.on("data", (chunk) => { body += chunk })
      req.on("end", () => {
        try {
          const { sim_type } = JSON.parse(body)
          if (sim_type === "physical") {
            STATUS.capabilities.sim_type = "physical"
            STATUS.capabilities.esim_management_enabled = false
          } else {
            STATUS.capabilities.sim_type = "esim"
            STATUS.capabilities.esim_management_enabled = true
          }
          jsonResponse(res, { ok: true, status: STATUS })
        } catch {
          jsonResponse(res, { error: "invalid request" }, 400)
        }
      })
      return // 异步处理，不继续执行后续代码
    }

    case "/api/notifications": {
      jsonResponse(res, { ok: true, status: STATUS })
      break
    }

    case "/api/keepalive": {
      jsonResponse(res, { ok: true, status: STATUS })
      break
    }

    case "/api/action/start": {
      const id = `action-${Date.now()}`
      // Simulate async action completion after a short delay
      setTimeout(() => {
        // Nothing to do, just acknowledge
      }, 1000)
      jsonResponse(res, { ok: true, id })
      break
    }

    default: {
      // Handle /api/action/{id} polling
      const actionMatch = path.match(/^\/api\/action\/(.+)$/)
      if (actionMatch) {
        jsonResponse(res, {
          ok: true,
          id: actionMatch[1],
          action: "switch_profile",
          state: "done",
          events: [
            {
              time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
              level: "info",
              message: "操作已完成",
            },
          ],
          cursor: 1,
          message: "操作成功",
          error: "",
          status: STATUS,
        })
        break
      }
      jsonResponse(res, { error: "not found" }, 404)
    }
  }
})

server.listen(PORT, HOSTNAME, () => {
  console.log(`Mock API server running at http://${HOSTNAME}:${PORT}/`)
  console.log("Endpoints:")
  console.log("  GET  /api/auth/status")
  console.log("  GET  /api/status")
  console.log("  POST /api/settings/sim-mode")
  console.log("  POST /api/action/start")
  console.log("  GET  /api/action/:id")
})
