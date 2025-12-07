import mongoose from "mongoose"

const serverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    host: {
      type: String,
      required: true,
    },
    grpcPort: {
      type: Number,
      required: true,
      default: 8080,
    },
    location: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance", "offline"],
      default: "active",
    },
    maxUsers: {
      type: Number,
      default: 1000,
    },
    currentUsers: {
      type: Number,
      default: 0,
    },
    protocols: [
      {
        type: String,
        enum: ["vmess", "vless"],
      },
    ],
    vmessPort: {
      type: Number,
      default: 443,
    },
    vlessPort: {
      type: Number,
      default: 8443,
    },
    domain: {
      type: String,
    },
    lastChecked: {
      type: Date,
    },
    tags: [
      {
        type: String,
      },
    ],
    bandwidthLimit: {
      type: Number,
      default: 10995116277760,
    },
    bandwidthUsed: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
)

serverSchema.index({ status: 1, location: 1 })

export default mongoose.model("Server", serverSchema)
