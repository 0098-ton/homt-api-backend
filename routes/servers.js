import express from "express"
import Server from "../models/Server.js"
import XrayClient from "../services/xrayClient.js"

const router = express.Router()

// Get all servers
router.get("/", async (req, res) => {
  try {
    const servers = await Server.find()
    res.json(servers)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get server by ID
router.get("/:id", async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }
    res.json(server)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create new server
router.post("/", async (req, res) => {
  try {
    const server = new Server(req.body)
    await server.save({ validateBeforeSave: false })
    res.status(201).json(server)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Update server
router.put("/:id", async (req, res) => {
  try {
    const server = await Server.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    })
    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }
    res.json(server)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Delete server
router.delete("/:id", async (req, res) => {
  try {
    const server = await Server.findByIdAndDelete(req.params.id)
    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }
    res.json({ message: "Server deleted successfully" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/:id/health", async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }

    const xrayClient = new XrayClient(server.host, server.grpcPort)

    try {
      const stats = await xrayClient.getSystemStats()
      server.status = "active"
      server.lastChecked = new Date()
      await server.save({ validateBeforeSave: false })

      res.json({
        status: "healthy",
        server: server,
        stats: stats,
      })
    } catch (error) {
      server.status = "offline"
      server.lastChecked = new Date()
      await server.save({ validateBeforeSave: false })

      res.status(503).json({
        status: "unhealthy",
        error: error.message,
      })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/:id/users", async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }

    const User = (await import("../models/User.js")).default
    const users = await User.find({ servers: server._id })

    res.json({
      server: server.name,
      totalUsers: users.length,
      users: users,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/:id/stats", async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }

    const xrayClient = new XrayClient(server.host, server.grpcPort)
    const allUsersStats = await xrayClient.getAllUsersStats()

    res.json({
      server: server.name,
      stats: allUsersStats,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
