import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Don't return password by default
    },
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    uuid: {
      type: String,
      required: false, // Made optional
      unique: false, // Made non-unique
    },
    alterId: {
      type: Number,
      default: 0,
    },
    ethWalletAddress: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "expired"],
      default: "active",
    },
    expiresAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastConnection: {
      type: Date,
    },
  },
  { timestamps: true },
)

userSchema.index({ email: 1 })
userSchema.index({ status: 1, expiresAt: 1 })
userSchema.index({ uuid: 1 })

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()

  try {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password)
  } catch (error) {
    return false
  }
}

export default mongoose.model("User", userSchema)
