import { NodeSSH } from "node-ssh"

class ConfigPersistenceService {
  constructor() {
    // SSH connection will be per-server
    this.ssh = new NodeSSH()
  }

  async connectToServer(server) {
    try {
      await this.ssh.connect({
        host: server.sshHost || server.host,
        port: server.sshPort || 22,
        username: server.sshUsername || process.env.SSH_USERNAME,
        password: server.sshPassword,
        privateKey: server.sshPrivateKey || process.env.SSH_PRIVATE_KEY,
      })
      console.log(`[v0] Connected to server ${server.name} via SSH`)
      return true
    } catch (error) {
      console.error(`[v0] SSH connection failed for ${server.name}:`, error.message)
      throw error
    }
  }

  async readConfig(server) {
    try {
      await this.connectToServer(server)

      const configPath = server.configPath || "/homt/xray/xray-server/config.json"
      const result = await this.ssh.execCommand(`cat ${configPath}`)

      if (result.code !== 0) {
        throw new Error(`Failed to read config: ${result.stderr}`)
      }

      await this.ssh.dispose()
      return JSON.parse(result.stdout)
    } catch (error) {
      await this.ssh.dispose()
      console.error("[v0] Error reading Xray config:", error.message)
      throw error
    }
  }

  async writeConfig(server, config) {
    try {
      await this.connectToServer(server)

      const configPath = server.configPath || "/etc/xray/config.json"
      const configJson = JSON.stringify(config, null, 2)

      // Write to temp file first
      const tempPath = `/tmp/xray-config-${Date.now()}.json`
      await this.ssh.execCommand(`echo '${configJson.replace(/'/g, "'\\''")}' > ${tempPath}`)

      // Move to actual config location
      await this.ssh.execCommand(`sudo mv ${tempPath} ${configPath}`)

      // Reload Xray service
      await this.ssh.execCommand("sudo systemctl reload xray || docker restart xray-server")

      await this.ssh.dispose()
      console.log(`[v0] Xray config updated successfully on ${server.name}`)
    } catch (error) {
      await this.ssh.dispose()
      console.error("[v0] Error writing Xray config:", error.message)
      throw error
    }
  }

  async addUserToConfig(server, protocol, user) {
    try {
      const config = await this.readConfig(server)

      const inboundTag = protocol === "vless" ? "vless-in" : "vmess-in"
      const inbound = config.inbounds.find((i) => i.tag === inboundTag)

      if (!inbound) {
        throw new Error(`Inbound ${inboundTag} not found in config`)
      }

      const existingUser = inbound.settings.clients.find((c) => c.id === user.uuid || c.email === user.email)

      if (existingUser) {
        console.log(`[v0] User ${user.email} already exists in config`)
        return false
      }

      const clientConfig = {
        id: user.uuid,
        email: user.email,
        level: 0,
      }

      if (protocol === "vmess") {
        clientConfig.alterId = user.alterId || 0
      }

      inbound.settings.clients.push(clientConfig)

      await this.writeConfig(server, config)

      console.log(`[v0] Added user ${user.email} to ${server.name} config file`)
      return true
    } catch (error) {
      console.error("[v0] Error adding user to config:", error.message)
      throw error
    }
  }

  async removeUserFromConfig(server, email) {
    try {
      const config = await this.readConfig(server)
      let removed = false

      for (const inbound of config.inbounds) {
        if (inbound.settings && inbound.settings.clients) {
          const initialLength = inbound.settings.clients.length
          inbound.settings.clients = inbound.settings.clients.filter((c) => c.email !== email)

          if (inbound.settings.clients.length < initialLength) {
            removed = true
            console.log(`[v0] Removed user ${email} from ${inbound.tag}`)
          }
        }
      }

      if (removed) {
        await this.writeConfig(server, config)
      }

      return removed
    } catch (error) {
      console.error("[v0] Error removing user from config:", error.message)
      throw error
    }
  }

  async syncAllUsersToConfig(server, users) {
    try {
      const config = await this.readConfig(server)

      for (const inbound of config.inbounds) {
        if (inbound.tag === "vless-in" || inbound.tag === "vmess-in") {
          inbound.settings.clients = []
        }
      }

      for (const user of users) {
        const inboundTag = "vless-in"
        const inbound = config.inbounds.find((i) => i.tag === inboundTag)

        if (inbound) {
          inbound.settings.clients.push({
            id: user.uuid,
            email: user.email,
            level: 0,
          })
        }
      }

      await this.writeConfig(server, config)
      console.log(`[v0] Synced ${users.length} users to ${server.name} config file`)

      return true
    } catch (error) {
      console.error("[v0] Error syncing users to config:", error.message)
      throw error
    }
  }
}

export default new ConfigPersistenceService()
