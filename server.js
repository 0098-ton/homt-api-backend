import express from "express"
import mongoose from "mongoose"
import cors from "cors"
import dotenv from "dotenv"
import syncService from "./services/syncService.js"
import authRoutes from "./routes/auth.js"
import serverRoutes from "./routes/servers.js"
import userRoutes from "./routes/users.js"
import statsRoutes from "./routes/stats.js"
import subscriptionRoutes from "./routes/subscriptions.js"
import adminRoutes from "./routes/admin.js"
import xraySyncRoutes from "./routes/xray-sync.js"
import { httpLogger, errorLogger } from "./middleware/logger.js"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js"
import { apiLimiter } from "./middleware/rateLimiter.js"

dotenv.config()

const app = express()

app.use(httpLogger)

// Middleware
app.use(cors())
app.use(express.json())

app.use("/api/", apiLimiter)

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/vpn-management")
  .then(() => console.log("Connected to MongoDB"))
  .then(async () => {
    console.log("Synchronizing users to Xray servers...")
    try {
      const result = await syncService.syncAllUsers()
      console.log(`User sync completed: ${result.synced} synced, ${result.failed} failed`)
    } catch (error) {
      console.error("Failed to sync users on startup:", error)
    }
  })
  .catch((err) => console.error("MongoDB connection error:", err))

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/servers", serverRoutes)
app.use("/api/users", userRoutes)
app.use("/api/stats", statsRoutes)
app.use("/api/subscriptions", subscriptionRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/xray-sync", xraySyncRoutes)

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() })
})

// API documentation endpoint
app.get("/api/docs", (req, res) => {
  res.json({
    version: "1.0.0",
    endpoints: {
      auth: {
        "POST /api/auth/login": "User login",
        "POST /api/auth/logout": "User logout",
        "POST /api/auth/register": "User registration",
        "POST /api/auth/reset-password": "Reset user password",
      },
      servers: {
        "GET /api/servers": "Get all servers",
        "POST /api/servers": "Create new server",
        "GET /api/servers/:id": "Get server by ID",
        "PUT /api/servers/:id": "Update server",
        "DELETE /api/servers/:id": "Delete server",
        "GET /api/servers/:id/health": "Check server health",
        "GET /api/servers/:id/users": "Get all users on server",
        "GET /api/servers/:id/stats": "Get server statistics",
      },
      users: {
        "GET /api/users": "Get all users",
        "POST /api/users": "Create new user",
        "POST /api/users/bulk": "Create multiple users",
        "GET /api/users/:id": "Get user by ID",
        "DELETE /api/users/:id": "Delete user",
        "GET /api/users/:id/stats": "Get user traffic stats",
        "POST /api/users/:id/reset-stats": "Reset user traffic stats",
        "GET /api/users/:id/config": "Get user config",
        "GET /api/users/:id/subscription": "Get user subscription link",
        "POST /api/users/:id/servers/:serverId": "Add user to server",
        "DELETE /api/users/:id/servers/:serverId": "Remove user from server",
      },
      stats: {
        "GET /api/stats/user/:id": "Get user statistics",
        "GET /api/stats/server/:id": "Get server statistics",
        "GET /api/stats/servers": "Get all servers statistics",
        "GET /api/stats/dashboard": "Get dashboard overview",
        "GET /api/stats/traffic-history": "Get traffic history",
        "GET /api/stats/realtime/:serverId": "Get real-time server stats",
      },
      subscriptions: {
        "GET /api/subscriptions": "Get all subscriptions",
        "POST /api/subscriptions": "Create new subscription",
        "GET /api/subscriptions/:id": "Get subscription by ID",
        "GET /api/subscriptions/user/:userId": "Get user subscription",
        "POST /api/subscriptions/:id/cancel": "Cancel subscription",
        "POST /api/subscriptions/:id/renew": "Renew subscription",
        "GET /api/subscriptions/expiring/:days": "Get expiring subscriptions",
        "POST /api/subscriptions/:id/auto-renew": "Toggle auto-renew",
        "GET /api/subscriptions/stats/overview": "Get subscription statistics",
      },
      admin: {
        "POST /api/admin/check-expired-users": "Check and suspend expired users",
        "POST /api/admin/check-traffic-limits": "Check and suspend users over traffic limit",
        "POST /api/admin/health-check-all": "Health check all servers",
        "GET /api/admin/report/usage": "Generate usage report",
      },
      xraySync: {
        // Define Xray sync endpoints here
      },
    },
  })
})

app.use(errorLogger)

app.use(notFoundHandler)

app.use(errorHandler)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`API Backend running on port ${PORT}`)
  console.log(`API Documentation: http://localhost:${PORT}/api/docs`)
})
