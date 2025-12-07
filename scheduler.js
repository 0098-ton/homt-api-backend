import cron from "node-cron"
import mongoose from "mongoose"
import dotenv from "dotenv"
import User from "./models/User.js"
import Server from "./models/Server.js"
import Subscription from "./models/Subscription.js"
import XrayClient from "./services/xrayClient.js"
import syncService from "./services/syncService.js"
import { logger } from "./middleware/logger.js"

dotenv.config()

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/vpn-management")
  .then(() => logger.info("Scheduler connected to MongoDB"))
  .catch((err) => logger.error("MongoDB connection error:", err))

const lastStatsCache = new Map()

cron.schedule("0 */2 * * *", async () => {
  logger.info("Running user synchronization...")

  try {
    const result = await syncService.syncAllUsers()
    logger.info(`User sync complete: ${result.synced} synced, ${result.failed} failed`)
  } catch (error) {
    logger.error("Error during user synchronization:", error)
  }
})

cron.schedule("0 * * * *", async () => {
  logger.info("Running expired subscriptions check...")

  try {
    const expiredSubscriptions = await Subscription.find({
      status: "active",
      expiresAt: { $lte: new Date() },
    })
      .populate("currentServer")
      .populate("user")

    for (const subscription of expiredSubscriptions) {
      if (subscription.currentServer) {
        try {
          const xrayClient = new XrayClient(subscription.currentServer.host, subscription.currentServer.grpcPort)
          await xrayClient.removeInboundUser("vless-in", subscription.getXrayEmail())

          subscription.currentServer.currentUsers = Math.max(0, subscription.currentServer.currentUsers - 1)
          await subscription.currentServer.save()
        } catch (error) {
          logger.error(
            `Failed to remove expired subscription ${subscription._id} (${subscription.user.email}) from ${subscription.currentServer.name}`,
          )
        }
      }

      subscription.status = "expired"
      subscription.currentServer = null
      await subscription.save()

      logger.info(`Expired subscription: ${subscription._id} (${subscription.user.email})`)
    }

    logger.info(`Processed ${expiredSubscriptions.length} expired subscriptions`)
  } catch (error) {
    logger.error("Error checking expired subscriptions:", error)
  }
})

cron.schedule("*/30 * * * *", async () => {
  logger.info("Running traffic limits check...")

  try {
    const subscriptions = await Subscription.find({ status: "active" }).populate("currentServer").lean()

    let suspendedCount = 0

    for (const subscription of subscriptions) {
      if (!subscription.currentServer) continue

      try {
        const xrayClient = new XrayClient(subscription.currentServer.host, subscription.currentServer.grpcPort)

        const subscriptionDoc = await Subscription.findById(subscription._id).populate("user")
        if (!subscriptionDoc || !subscriptionDoc.user) {
          logger.error(`No user found for subscription ${subscription._id}`)
          continue
        }

        const stats = await xrayClient.queryUserStats(subscriptionDoc.getXrayEmail())

        const currentServerTraffic = stats.total
        const trafficArray = subscriptionDoc.trafficUsed
        const lastPeriodTraffic = trafficArray.length > 0 ? trafficArray[trafficArray.length - 1] : 0

        if (trafficArray.length === 0) {
          // New subscription, first usage period
          subscriptionDoc.trafficUsed = [currentServerTraffic]
          logger.info(`[Traffic] New subscription ${subscription._id}: First period ${currentServerTraffic} bytes`)
        } else if (currentServerTraffic < lastPeriodTraffic) {
          // Server restart or server change detected - add new period
          subscriptionDoc.trafficUsed.push(currentServerTraffic)
          logger.info(
            `[Traffic] Server restart detected for ${subscription._id}: Previous ${lastPeriodTraffic}, New period ${currentServerTraffic}`,
          )
        } else {
          // Normal usage increase - update last period
          subscriptionDoc.trafficUsed[subscriptionDoc.trafficUsed.length - 1] = currentServerTraffic
        }

        const totalTrafficUsed = subscriptionDoc.trafficUsed.reduce((sum, val) => sum + val, 0)

        if (totalTrafficUsed >= subscriptionDoc.trafficLimit) {
          await xrayClient.removeInboundUser("vless-in", subscriptionDoc.getXrayEmail())

          subscription.currentServer.currentUsers = Math.max(0, subscription.currentServer.currentUsers - 1)
          await Server.findByIdAndUpdate(subscription.currentServer._id, {
            currentUsers: subscription.currentServer.currentUsers,
          })

          subscriptionDoc.status = "suspended"
          subscriptionDoc.currentServer = null
          suspendedCount++

          logger.info(
            `Suspended subscription ${subscription._id} (${subscriptionDoc.user.email}) for exceeding traffic limit. Total: ${totalTrafficUsed} bytes`,
          )
        }

        await subscriptionDoc.save({ validateBeforeSave: false })
      } catch (error) {
        logger.error(`Failed to check traffic for subscription ${subscription._id}:`, error.message)
      }
    }

    logger.info(`Suspended ${suspendedCount} subscriptions for exceeding traffic limits`)
  } catch (error) {
    logger.error("Error checking traffic limits:", error)
  }
})

cron.schedule("*/5 * * * *", async () => {
  logger.info("Running servers health check...")

  try {
    const servers = await Server.find()
    let healthyCount = 0
    let unhealthyCount = 0

    for (const server of servers) {
      try {
        const xrayClient = new XrayClient(server.host, server.grpcPort)
        await xrayClient.getInboundUsers("vless-in")

        if (server.status !== "active") {
          server.status = "active"
          logger.info(`Server ${server.name} is back online`)
        }

        server.lastChecked = new Date()
        await server.save({ validateBeforeSave: false })
        healthyCount++
      } catch (error) {
        if (server.status !== "offline") {
          server.status = "offline"
          logger.warn(`Server ${server.name} is offline: ${error.message}`)
        }

        server.lastChecked = new Date()
        await server.save({ validateBeforeSave: false })
        unhealthyCount++
      }
    }

    logger.info(`Health check complete: ${healthyCount} healthy, ${unhealthyCount} unhealthy`)
  } catch (error) {
    logger.error("Error during health check:", error)
  }
})

cron.schedule("0 0 * * *", async () => {
  logger.info("Running subscription status update...")

  try {
    const expiredSubscriptions = await Subscription.find({
      status: "active",
      expiresAt: { $lte: new Date() },
    })

    for (const subscription of expiredSubscriptions) {
      subscription.status = "expired"
      await subscription.save({ validateBeforeSave: false })

      logger.info(`Expired subscription: ${subscription._id}`)
    }

    logger.info(`Updated ${expiredSubscriptions.length} expired subscriptions`)
  } catch (error) {
    logger.error("Error updating subscriptions:", error)
  }
})

cron.schedule("0 */6 * * *", async () => {
  logger.info("Syncing subscription statistics...")

  try {
    const subscriptions = await Subscription.find({ status: "active" }).populate("currentServer").lean()

    for (const subscription of subscriptions) {
      if (!subscription.currentServer) continue

      try {
        const xrayClient = new XrayClient(subscription.currentServer.host, subscription.currentServer.grpcPort)

        const subscriptionDoc = await Subscription.findById(subscription._id).populate("user")
        if (!subscriptionDoc || !subscriptionDoc.user) continue

        const stats = await xrayClient.queryUserStats(subscriptionDoc.getXrayEmail())

        const currentServerTraffic = stats.total
        const trafficArray = subscriptionDoc.trafficUsed
        const lastPeriodTraffic = trafficArray.length > 0 ? trafficArray[trafficArray.length - 1] : 0

        if (trafficArray.length === 0) {
          subscriptionDoc.trafficUsed = [currentServerTraffic]
        } else if (currentServerTraffic < lastPeriodTraffic) {
          subscriptionDoc.trafficUsed.push(currentServerTraffic)
          logger.info(
            `[Stats Sync] Server restart detected for ${subscription._id}: New period ${currentServerTraffic}`,
          )
        } else {
          subscriptionDoc.trafficUsed[subscriptionDoc.trafficUsed.length - 1] = currentServerTraffic
        }

        await subscriptionDoc.save({ validateBeforeSave: false })
      } catch (error) {
        logger.error(`Failed to sync stats for subscription ${subscription._id}`)
      }
    }

    logger.info(`Synced statistics for ${subscriptions.length} subscriptions`)
  } catch (error) {
    logger.error("Error syncing subscription stats:", error)
  }
})

logger.info("Scheduler started successfully")
logger.info("Scheduled tasks:")
logger.info("- User synchronization: Every 2 hours")
logger.info("- Expired subscriptions check: Every hour")
logger.info("- Traffic limits check: Every 30 minutes")
logger.info("- Server health check: Every 5 minutes")
logger.info("- Subscription status update: Daily at midnight")
logger.info("- Subscription stats sync: Every 6 hours")
