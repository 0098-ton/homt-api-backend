import express from "express"
import User from "../models/User.js"
import Server from "../models/Server.js"
import XrayClient from "../services/xrayClient.js"

const router = express.Router()

// Get user traffic stats
router.get("/user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("servers")
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const allStats = {
      uplink: 0,
      downlink: 0,
      total: 0,
      servers: [],
    }

    // Get stats from each server
    for (const server of user.servers) {
      try {
        const xrayClient = new XrayClient(server.host, server.grpcPort)
        const stats = await xrayClient.queryUserStats(user.email)

        allStats.uplink += stats.uplink
        allStats.downlink += stats.downlink
        allStats.total += stats.total

        allStats.servers.push({
          server: server.name,
          stats,
        })
      } catch (error) {
        console.error(`Failed to get stats from ${server.name}:`, error.message)
      }
    }

    // Update user traffic in database
    user.trafficUsed = allStats.total
    await user.save({ validateBeforeSave: false })

    res.json({
      user: {
        email: user.email,
        trafficLimit: user.trafficLimit,
        trafficUsed: user.trafficUsed,
      },
      stats: allStats,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get server stats
router.get("/server/:id", async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }

    const xrayClient = new XrayClient(server.host, server.grpcPort)
    const systemStats = await xrayClient.getSystemStats()
    const usersStats = await xrayClient.getAllUsersStats()

    res.json({
      server: {
        name: server.name,
        location: server.location,
        currentUsers: server.currentUsers,
        maxUsers: server.maxUsers,
      },
      systemStats,
      usersStats,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get all servers stats
router.get("/servers", async (req, res) => {
  try {
    const servers = await Server.find({ status: "active" })
    const allStats = []

    for (const server of servers) {
      try {
        const xrayClient = new XrayClient(server.host, server.grpcPort)
        const usersStats = await xrayClient.getAllUsersStats()

        const totalTraffic = Object.values(usersStats).reduce((acc, stats) => acc + stats.total, 0)

        allStats.push({
          server: {
            id: server._id,
            name: server.name,
            location: server.location,
            currentUsers: server.currentUsers,
          },
          totalTraffic,
          userCount: Object.keys(usersStats).length,
        })
      } catch (error) {
        console.error(`Failed to get stats from ${server.name}:`, error.message)
      }
    }

    res.json(allStats)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/dashboard", async (req, res) => {
  try {
    const totalServers = await Server.countDocuments()
    const activeServers = await Server.countDocuments({ status: "active" })
    const totalUsers = await User.countDocuments()
    const activeUsers = await User.countDocuments({ status: "active" })

    let totalTraffic = 0
    const serverStats = []

    const servers = await Server.find({ status: "active" })

    for (const server of servers) {
      try {
        const xrayClient = new XrayClient(server.host, server.grpcPort)
        const usersStats = await xrayClient.getAllUsersStats()

        const serverTraffic = Object.values(usersStats).reduce((acc, stats) => acc + stats.total, 0)

        totalTraffic += serverTraffic

        serverStats.push({
          name: server.name,
          location: server.location,
          users: server.currentUsers,
          traffic: serverTraffic,
        })
      } catch (error) {
        console.error(`Failed to get stats from ${server.name}:`, error.message)
      }
    }

    res.json({
      overview: {
        totalServers,
        activeServers,
        totalUsers,
        activeUsers,
        totalTraffic,
      },
      serverStats,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/traffic-history", async (req, res) => {
  try {
    const { startDate, endDate, serverId } = req.query

    const query = {}
    if (serverId) {
      query.servers = serverId
    }

    const users = await User.find(query).populate("servers")

    const trafficData = {
      totalUplink: 0,
      totalDownlink: 0,
      totalTraffic: 0,
      users: [],
    }

    for (const user of users) {
      let userUplink = 0
      let userDownlink = 0

      for (const server of user.servers) {
        if (serverId && server._id.toString() !== serverId) continue

        try {
          const xrayClient = new XrayClient(server.host, server.grpcPort)
          const stats = await xrayClient.queryUserStats(user.email)

          userUplink += stats.uplink
          userDownlink += stats.downlink
        } catch (error) {
          console.error(`Failed to get stats for ${user.email} from ${server.name}`)
        }
      }

      trafficData.totalUplink += userUplink
      trafficData.totalDownlink += userDownlink

      trafficData.users.push({
        email: user.email,
        uplink: userUplink,
        downlink: userDownlink,
        total: userUplink + userDownlink,
      })
    }

    trafficData.totalTraffic = trafficData.totalUplink + trafficData.totalDownlink

    res.json(trafficData)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/realtime/:serverId", async (req, res) => {
  try {
    const server = await Server.findById(req.params.serverId)
    if (!server) {
      return res.status(404).json({ error: "Server not found" })
    }

    const xrayClient = new XrayClient(server.host, server.grpcPort)
    const usersStats = await xrayClient.getAllUsersStats()
    const systemStats = await xrayClient.getSystemStats()

    const topUsers = Object.entries(usersStats)
      .map(([email, stats]) => ({ email, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    res.json({
      server: {
        name: server.name,
        location: server.location,
        currentUsers: server.currentUsers,
        maxUsers: server.maxUsers,
      },
      systemStats,
      topUsers,
      totalTraffic: Object.values(usersStats).reduce((acc, stats) => acc + stats.total, 0),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
