import express from "express"
import Server from "../models/Server.js"
import syncService from "../services/syncService.js"

const router = express.Router()

router.post("/register", async (req, res) => {
  try {
    const { serverName, host, grpcPort } = req.body

    if (!serverName || !host || !grpcPort) {
      return res.status(400).json({ error: "serverName, host, and grpcPort are required" })
    }

    // Find or update server in database
    const server = await Server.findOne({ name: serverName })

    if (!server) {
      return res.status(404).json({
        error: `Server ${serverName} not found in database. Please add it via admin panel first.`,
      })
    }

    // Update server status and last check time
    server.status = "active"
    server.lastChecked = new Date()
    await server.save()

    console.log(`[v0] Server ${serverName} registered, syncing subscriptions...`)

    const syncResult = await syncService.syncServer(serverName)

    res.json({
      success: true,
      server: {
        id: server._id,
        name: server.name,
        location: server.location,
      },
      syncResult,
      message: `Synced ${syncResult.synced} subscriptions successfully`,
    })
  } catch (error) {
    console.error("[v0] Error in server registration:", error)
    res.status(500).json({ error: error.message })
  }
})

router.post("/heartbeat", async (req, res) => {
  try {
    const { serverName } = req.body

    if (!serverName) {
      return res.status(400).json({ error: "serverName is required" })
    }

    const server = await Server.findOne({ name: serverName })

    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }

    server.status = "active"
    server.lastChecked = new Date()
    await server.save()

    res.json({ success: true, timestamp: new Date() })
  } catch (error) {
    console.error("[v0] Error in heartbeat:", error)
    res.status(500).json({ error: error.message })
  }
})

export default router
