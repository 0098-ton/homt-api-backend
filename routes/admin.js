import express from "express"
import User from "../models/User.js"
import Server from "../models/Server.js"
import Subscription from "../models/Subscription.js"
import XrayClient from "../services/xrayClient.js"
import syncService from "../services/syncService.js"

const router = express.Router()

router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 })

    // Populate each user with their active subscription
    const usersWithSubscriptions = await Promise.all(
      users.map(async (user) => {
        const subscription = await Subscription.findOne({
          user: user._id,
          status: "active",
        }).sort({ createdAt: -1 })

        return {
          _id: user._id,
          email: user.email,
          name: user.name,
          uuid: user.uuid,
          status: user.status,
          currentServer: user.currentServer,
          trafficUsed: user.trafficUsed,
          trafficLimit: user.trafficLimit,
          subscription: subscription
            ? {
                status: subscription.status,
                trafficUsed: subscription.trafficUsedAtPurchase + user.trafficUsed,
                trafficLimit: subscription.trafficLimit,
                expiresAt: subscription.expiresAt,
              }
            : null,
        }
      }),
    )

    res.json({ users: usersWithSubscriptions })
  } catch (error) {
    console.error("Error fetching users:", error)
    res.status(500).json({ error: error.message })
  }
})

router.get("/stats", async (req, res) => {
  try {
    // Get server statistics
    const totalServers = await Server.countDocuments()
    const activeServers = await Server.countDocuments({ status: "active" })
    const offlineServers = await Server.countDocuments({ status: "offline" })

    // Get user statistics
    const totalUsers = await User.countDocuments()
    const activeUsers = await User.countDocuments({ status: "active" })

    // Get subscription statistics
    const totalSubscriptions = await Subscription.countDocuments()
    const activeSubscriptions = await Subscription.countDocuments({
      status: "active",
      expiresAt: { $gt: new Date() },
    })
    const expiredSubscriptions = await Subscription.countDocuments({
      $or: [{ status: "expired" }, { status: "active", expiresAt: { $lte: new Date() } }],
    })

    // Calculate revenue
    const revenueData = await Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ])
    const totalRevenue = revenueData[0]?.total || 0

    // Calculate monthly revenue (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const monthlyRevenueData = await Subscription.aggregate([
      {
        $match: {
          purchaseDate: { $gte: thirtyDaysAgo },
          status: "active",
        },
      },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ])
    const monthlyRevenue = monthlyRevenueData[0]?.total || 0

    // Calculate traffic statistics
    const trafficData = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsed: { $sum: "$trafficUsed" },
          totalLimit: { $sum: "$trafficLimit" },
        },
      },
    ])
    const totalTrafficUsed = trafficData[0]?.totalUsed || 0
    const totalTrafficSold = trafficData[0]?.totalLimit || 0
    const avgTrafficPerUser = totalUsers > 0 ? totalTrafficUsed / totalUsers : 0

    // Calculate package statistics (from subscriptions)
    const totalPackages = await Subscription.distinct("packageName").then((names) => names.length)
    const activePackages = await Subscription.countDocuments({
      status: "active",
      expiresAt: { $gt: new Date() },
    })

    // Calculate average revenue per user
    const avgRevenuePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0

    res.json({
      totalServers,
      activeServers,
      offlineServers,
      totalUsers,
      activeUsers,
      totalSubscriptions,
      activeSubscriptions,
      expiredSubscriptions,
      totalPackages,
      activePackages,
      totalRevenue,
      monthlyRevenue,
      avgRevenuePerUser,
      totalTrafficUsed,
      totalTrafficSold,
      avgTrafficPerUser,
    })
  } catch (error) {
    console.error("Error fetching admin stats:", error)
    res.status(500).json({ error: error.message })
  }
})

router.post("/sync-all-users", async (req, res) => {
  try {
    const result = await syncService.syncAllUsers()
    res.json({
      message: "User synchronization completed",
      synced: result.synced,
      failed: result.failed,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post("/sync-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params
    const result = await syncService.syncUser(userId)

    if (result) {
      res.json({ message: "User synchronized successfully" })
    } else {
      res.json({ message: "User not synced (inactive or no server assigned)" })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post("/cleanup-server/:serverId", async (req, res) => {
  try {
    const { serverId } = req.params
    const result = await syncService.cleanupServer(serverId)
    res.json({
      message: "Server cleanup completed",
      removed: result.removed,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post("/check-expired-users", async (req, res) => {
  try {
    const expiredUsers = await User.find({
      status: "active",
      expiresAt: { $lte: new Date() },
    }).populate("currentServer")

    const results = []

    for (const user of expiredUsers) {
      if (user.currentServer) {
        try {
          const xrayClient = new XrayClient(user.currentServer.host, user.currentServer.grpcPort)
          await xrayClient.removeInboundUser("vless-in", user.email)

          user.currentServer.currentUsers = Math.max(0, user.currentServer.currentUsers - 1)
          await user.currentServer.save({ validateBeforeSave: false })
        } catch (error) {
          console.error(`Failed to remove user from ${user.currentServer.name}:`, error.message)
        }
      }

      user.status = "expired"
      user.currentServer = null
      await user.save({ validateBeforeSave: false })

      results.push({
        email: user.email,
        uuid: user.uuid,
        expiredAt: user.expiresAt,
      })
    }

    res.json({
      message: `Processed ${results.length} expired users`,
      users: results,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post("/check-traffic-limits", async (req, res) => {
  try {
    const users = await User.find({ status: "active" }).populate("currentServer")
    const results = []

    for (const user of users) {
      if (!user.currentServer) continue

      try {
        const xrayClient = new XrayClient(user.currentServer.host, user.currentServer.grpcPort)
        const stats = await xrayClient.queryUserStats(user.email)

        user.trafficUsed = stats.total

        if (stats.total >= user.trafficLimit) {
          // Suspend user
          await xrayClient.removeInboundUser("vless-in", user.email)

          user.currentServer.currentUsers = Math.max(0, user.currentServer.currentUsers - 1)
          await user.currentServer.save({ validateBeforeSave: false })

          user.status = "suspended"
          user.currentServer = null

          results.push({
            email: user.email,
            trafficUsed: stats.total,
            trafficLimit: user.trafficLimit,
          })

          await user.save({ validateBeforeSave: false })
        } else {
          await user.save({ validateBeforeSave: false })
        }
      } catch (error) {
        console.error(`Failed to check traffic for ${user.email}:`, error.message)
      }
    }

    res.json({
      message: `Suspended ${results.length} users for exceeding traffic limit`,
      users: results,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post("/health-check-all", async (req, res) => {
  try {
    const servers = await Server.find()
    const results = []

    for (const server of servers) {
      try {
        const xrayClient = new XrayClient(server.host, server.port)
        await xrayClient.getSystemStats()

        server.status = "active"
        server.lastChecked = new Date()
        await server.save({ validateBeforeSave: false })

        results.push({
          name: server.name,
          status: "healthy",
        })
      } catch (error) {
        server.status = "offline"
        server.lastChecked = new Date()
        await server.save({ validateBeforeSave: false })

        results.push({
          name: server.name,
          status: "unhealthy",
          error: error.message,
        })
      }
    }

    res.json({
      message: "Health check completed",
      results,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/report/usage", async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const totalUsers = await User.countDocuments()
    const activeUsers = await User.countDocuments({ status: "active" })
    const suspendedUsers = await User.countDocuments({ status: "suspended" })
    const expiredUsers = await User.countDocuments({ status: "expired" })

    const totalServers = await Server.countDocuments()
    const activeServers = await Server.countDocuments({ status: "active" })

    const totalSubscriptions = await Subscription.countDocuments()
    const activeSubscriptions = await Subscription.countDocuments({ status: "active" })

    const revenue = await Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ])

    let totalTraffic = 0
    const servers = await Server.find({ status: "active" })

    for (const server of servers) {
      try {
        const xrayClient = new XrayClient(server.host, server.port)
        const usersStats = await xrayClient.getAllUsersStats()

        const serverTraffic = Object.values(usersStats).reduce((acc, stats) => acc + stats.total, 0)
        totalTraffic += serverTraffic
      } catch (error) {
        console.error(`Failed to get stats from ${server.name}`)
      }
    }

    res.json({
      generatedAt: new Date(),
      period: { startDate, endDate },
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        expired: expiredUsers,
      },
      servers: {
        total: totalServers,
        active: activeServers,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
      },
      revenue: revenue[0]?.total || 0,
      totalTraffic,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
