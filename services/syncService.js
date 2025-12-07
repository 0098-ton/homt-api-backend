import Server from "../models/Server.js"
import Subscription from "../models/Subscription.js"
import XrayClient from "./xrayClient.js"

class SyncService {
  async syncAllUsers() {
    try {
      console.log("[v0] Starting subscription synchronization via gRPC...")

      const subscriptions = await Subscription.find({
        status: "active",
        currentServer: { $ne: null },
      })
        .populate("currentServer")
        .populate("user")

      if (subscriptions.length === 0) {
        console.log("[v0] No active subscriptions to sync")
        return { synced: 0, failed: 0 }
      }

      console.log(`[v0] Found ${subscriptions.length} active subscriptions to sync`)

      const serverSubscriptionsMap = {}
      subscriptions.forEach((subscription) => {
        if (!subscription.currentServer) {
          console.log(`[v0] Subscription ${subscription._id} has invalid server data, skipping`)
          return
        }
        const serverId = subscription.currentServer._id.toString()
        if (!serverSubscriptionsMap[serverId]) {
          serverSubscriptionsMap[serverId] = []
        }
        serverSubscriptionsMap[serverId].push(subscription)
      })

      let synced = 0
      let failed = 0

      for (const [serverId, serverSubscriptions] of Object.entries(serverSubscriptionsMap)) {
        const server = serverSubscriptions[0].currentServer
        const inboundTag = "vless-in"

        try {
          console.log(`[v0] Syncing ${serverSubscriptions.length} subscriptions to server: ${server.name}`)

          const xrayClient = new XrayClient(server.host, server.grpcPort)

          const existingUsers = (await xrayClient.getInboundUsers(inboundTag)) || []
          const existingUUIDs = new Set(existingUsers.length > 0 ? existingUsers.map((u) => u.uuid || u.id) : [])

          for (const subscription of serverSubscriptions) {
            try {
              if (existingUUIDs.has(subscription.uuid)) {
                console.log(`[v0] Subscription ${subscription._id} already exists on ${server.name}`)
                synced++
              } else {
                await xrayClient.addVlessUser(inboundTag, {
                  email: subscription.getXrayEmail(),
                  uuid: subscription.uuid,
                  flow: "",
                })

                console.log(
                  `[v0] Added subscription ${subscription._id} (${subscription.getXrayEmail()}) to ${server.name}`,
                )
                synced++
              }
            } catch (error) {
              console.error(`[v0] Failed to sync subscription ${subscription._id}:`, error.message)
              failed++
            }
          }
        } catch (error) {
          console.error(`[v0] Failed to connect to server ${server.name}:`, error.message)
          failed += serverSubscriptions.length
        }
      }

      console.log(`[v0] Synchronization complete: ${synced} synced, ${failed} failed`)
      return { synced, failed }
    } catch (error) {
      console.error("[v0] Error during synchronization:", error)
      throw error
    }
  }

  async syncSubscription(subscriptionId) {
    try {
      const subscription = await Subscription.findById(subscriptionId).populate("currentServer").populate("user")

      if (!subscription) {
        throw new Error("Subscription not found")
      }

      if (subscription.status !== "active") {
        console.log(`[v0] Subscription ${subscription._id} is not active, skipping sync`)
        return false
      }

      if (!subscription.currentServer) {
        console.log(`[v0] Subscription ${subscription._id} has no server assigned, skipping sync`)
        return false
      }

      const server = subscription.currentServer
      const xrayClient = new XrayClient(server.host, server.grpcPort)

      const inboundTag = "vless-in"

      const existingUsers = (await xrayClient.getInboundUsers(inboundTag)) || []
      const existingUUIDs = new Set(existingUsers.length > 0 ? existingUsers.map((u) => u.uuid || u.id) : [])

      if (existingUUIDs.has(subscription.uuid)) {
        console.log(`[v0] Subscription ${subscription._id} already exists on ${server.name}`)
        return true
      }

      await xrayClient.addVlessUser(inboundTag, {
        email: subscription.getXrayEmail(),
        uuid: subscription.uuid,
        flow: "",
      })

      console.log(`[v0] Synced subscription ${subscription._id} to ${server.name}`)
      return true
    } catch (error) {
      console.error(`[v0] Error syncing subscription ${subscriptionId}:`, error)
      throw error
    }
  }

  async cleanupServer(serverId) {
    try {
      const server = await Server.findById(serverId)
      if (!server) {
        throw new Error("Server not found")
      }

      const xrayClient = new XrayClient(server.host, server.grpcPort)

      const inboundTag = "vless-in"

      const xrayUsers = await xrayClient.getInboundUsers(inboundTag)
      const xrayUUIDs = (xrayUsers || []).map((u) => u.uuid || u.id)

      const dbSubscriptions = await Subscription.find({
        currentServer: serverId,
        status: "active",
      }).populate("user")
      const dbUUIDs = new Set(dbSubscriptions.map((s) => s.uuid))

      const uuidToEmailMap = new Map(dbSubscriptions.map((s) => [s.uuid, s.getXrayEmail()]))

      let removed = 0
      for (const uuid of xrayUUIDs) {
        if (!dbUUIDs.has(uuid)) {
          try {
            const email = uuidToEmailMap.get(uuid) || uuid
            await xrayClient.removeInboundUser(inboundTag, email)

            console.log(`[v0] Removed orphaned subscription ${uuid} (${email}) from ${server.name}`)
            removed++
          } catch (error) {
            console.error(`[v0] Failed to remove ${uuid}:`, error.message)
          }
        }
      }

      console.log(`[v0] Cleanup complete for ${server.name}: ${removed} subscriptions removed`)
      return { removed }
    } catch (error) {
      console.error(`[v0] Error cleaning up server ${serverId}:`, error)
      throw error
    }
  }

  async syncServer(serverName) {
    try {
      console.log(`[v0] Starting server sync for: ${serverName}`)

      const server = await Server.findOne({ name: serverName })
      if (!server) {
        throw new Error(`Server ${serverName} not found`)
      }

      const xrayClient = new XrayClient(server.host, server.grpcPort)
      const inboundTag = "vless-in"

      // Get active subscriptions for this server
      const subscriptions = await Subscription.find({
        status: "active",
        currentServer: server._id,
      }).populate("user")

      console.log(`[v0] Found ${subscriptions.length} active subscriptions for ${serverName}`)

      // Get existing users on the server
      const existingUsers = (await xrayClient.getInboundUsers(inboundTag)) || []
      const existingUUIDs = new Set(existingUsers.length > 0 ? existingUsers.map((u) => u.uuid || u.id) : [])

      let synced = 0
      let failed = 0

      for (const subscription of subscriptions) {
        try {
          if (existingUUIDs.has(subscription.uuid)) {
            console.log(`[v0] Subscription ${subscription._id} already exists on ${serverName}`)
            synced++
          } else {
            await xrayClient.addVlessUser(inboundTag, {
              email: subscription.getXrayEmail(),
              uuid: subscription.uuid,
              flow: "",
            })

            console.log(`[v0] Added subscription ${subscription._id} (${subscription.getXrayEmail()}) to ${serverName}`)
            synced++
          }
        } catch (error) {
          console.error(`[v0] Failed to sync subscription ${subscription._id}:`, error.message)
          failed++
        }
      }

      console.log(`[v0] Server ${serverName} sync complete: ${synced} synced, ${failed} failed`)
      return { synced, failed, total: subscriptions.length }
    } catch (error) {
      console.error(`[v0] Error syncing server ${serverName}:`, error)
      throw error
    }
  }
}

export default new SyncService()
