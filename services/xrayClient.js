import { XtlsApi } from '@remnawave/xtls-sdk';

class XrayClient {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.api = new XtlsApi(host, port.toString());
  }


  async addVlessUser(tag, user) {
    try {
      console.log('[v0] Adding VLESS user:', { tag, username: user.email, uuid: user.uuid });
      
      const result = await this.api.handler.addVlessUser({
        tag: tag,
        username: user.email,  // SDK uses 'username' not 'email'
        uuid: user.uuid,
        flow: user.flow || '', // flow can be empty for standard VLESS
        level: 0
      });

      if (!result.isOk) {
        throw new Error(result.message || 'Failed to add VLESS user');
      }

      console.log('[v0] VLESS user added successfully');
      return result.data;
    } catch (error) {
      console.error('[v0] Error adding VLESS user:', error);
      throw error;
    }
  }

  async addInboundUser(tag, user) {
    return this.addVlessUser(tag, user);
  }

  // Remove user from inbound
  async removeInboundUser(tag, email) {
    try {
      console.log('[v0] Removing user:', { tag, email });
      
      const result = await this.api.handler.removeUser(tag, email);
      console.log(result)
      if (!result.isOk) {
        throw new Error(result.message || 'Failed to remove user');
      }

      console.log('[v0] User removed successfully');
      return result.data;
    } catch (error) {
      console.error('[v0] Error removing user:', error);
      throw error;
    }
  }

  async queryUserStats(email, reset = false) {
    try {
      const result = await this.api.stats.getUserStats(email, reset);

      if (!result.isOk) {
        throw new Error(result.message || 'Failed to get user stats');
      }

      // Extract stats from result.data.user object
      const userStats = result.data?.user || {};
      
      return {
        uplink: parseInt(userStats.uplink) || 0,
        downlink: parseInt(userStats.downlink) || 0,
        total: (parseInt(userStats.uplink) || 0) + (parseInt(userStats.downlink) || 0)
      };
    } catch (error) {
      console.error('[v0] Error querying user stats:', error);
      throw error;
    }
  }

  // Get system stats
  async getSystemStats() {
    try {
      // Try to get handler service status by listing users
      const result = await this.api.handler.getInboundUsers('');
      
      if (result.isOk !== undefined) {
        return { healthy: result.isOk, data: result.data };
      }
      
      return { healthy: true, data: {} };
    } catch (error) {
      console.error('[v0] Error getting system stats:', error);
      throw error;
    }
  }

  // Get all users stats
  async getAllUsersStats() {
    try {
      const result = await this.api.stats.queryStats('user>>>', false);

      if (!result.isOk) {
        throw new Error(result.message || 'Failed to get all users stats');
      }

      const userStats = {};
      const stats = result.data?.stat || [];

      stats.forEach((s) => {
        const parts = s.name.split('>>>');
        if (parts.length >= 4) {
          const email = parts[1];
          const type = parts[3];

          if (!userStats[email]) {
            userStats[email] = { uplink: 0, downlink: 0, total: 0 };
          }

          const value = parseInt(s.value) || 0;
          if (type === 'uplink') {
            userStats[email].uplink = value;
          } else if (type === 'downlink') {
            userStats[email].downlink = value;
          }
        }
      });

      // Calculate totals
      Object.keys(userStats).forEach((email) => {
        userStats[email].total = userStats[email].uplink + userStats[email].downlink;
      });

      return userStats;
    } catch (error) {
      console.error('[v0] Error getting all users stats:', error);
      throw error;
    }
  }

  // Get inbound users list
  async getInboundUsers(tag) {
    try {
      const result = await this.api.handler.getInboundUsers(tag);

      if (!result.isOk) {
        console.log('[v0] Could not get inbound users, returning empty array');
        return [];
      }

      return result.data || [];
    } catch (error) {
      console.log('[v0] Error getting inbound users, returning empty array:', error.message);
      return [];
    }
  }
}

export default XrayClient;
