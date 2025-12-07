import mongoose from "mongoose"
import { v4 as uuidv4 } from "uuid"

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uuid: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    alterId: {
      type: Number,
      default: 0,
    },
    packageName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    trafficLimit: {
      type: Number, // in bytes
      required: true,
    },
    trafficUsed: {
      type: [Number],
      default: [],
    },
    currentServer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Server",
    },
    lastServerChange: {
      type: Date,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "depleted", "expired", "suspended"],
      default: "active",
    },
    expiresAt: {
      type: Date,
    },
    trafficUsedAtPurchase: {
      type: Number,
      default: 0,
    },
    nickname: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
)

subscriptionSchema.index({ user: 1, status: 1 })
subscriptionSchema.index({ uuid: 1 })
subscriptionSchema.index({ status: 1, expiresAt: 1 })

subscriptionSchema.virtual("trafficUsagePercent").get(function () {
  if (this.trafficLimit === 0) return 0
  const totalUsed = this.trafficUsed.reduce((sum, val) => sum + val, 0)
  return (totalUsed / this.trafficLimit) * 100
})

subscriptionSchema.methods.canChangeServer = function () {
  if (!this.lastServerChange) return true

  const oneDayAgo = new Date()
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)

  return this.lastServerChange < oneDayAgo
}

subscriptionSchema.methods.hasTrafficRemaining = function () {
  const totalUsed = this.trafficUsed.reduce((sum, val) => sum + val, 0)
  return totalUsed < this.trafficLimit
}

subscriptionSchema.methods.getTotalTrafficUsed = function () {
  return this.trafficUsed.reduce((sum, val) => sum + val, 0)
}

subscriptionSchema.methods.getXrayEmail = function () {
  // Get first 8 chars of subscription ID to keep email readable
  const subId = this._id.toString().substring(0, 8)
  return `${this.user.email.split("@")[0]}_${subId}@${this.user.email.split("@")[1]}`
}

export default mongoose.model("Subscription", subscriptionSchema)
