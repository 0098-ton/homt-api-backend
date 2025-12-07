import express from "express"
import jwt from "jsonwebtoken"
import { v4 as uuidv4 } from "uuid"
import User from "../models/User.js"
import axios from "axios"
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router()

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" })
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" })
    }

    // Generate UUID for VPN
    const uuid = uuidv4()

    // Create user
    const user = new User({
      email,
      password,
      name,
      uuid,
      trafficLimit: 0, // No traffic until they purchase
      status: "suspended", // Suspended until they purchase traffic
    })

    await user.save({ validateBeforeSave: false })

    try {
      const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || "http://localhost:3002"
      const walletResponse = await axios.post(`${paymentServiceUrl}/api/wallets/create`, {
        userId: user._id.toString(),
      })

      if (walletResponse.data.success) {
        user.ethWalletAddress = walletResponse.data.address
        console.log(user)
        await user.save({ validateBeforeSave: false })
        console.log(`[v0] Created ETH wallet for user ${user._id}: ${walletResponse.data.address}`)
      }
    } catch (walletError) {
      console.error("[v0] Error creating wallet for user:", walletError)
      // Don't fail registration if wallet creation fails
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id.toString(), // Convert ObjectId to string
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET || "your-secret-key-change-in-production",
      { expiresIn: "7d" },
    )

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id.toString(), // Return _id as string, not id
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    // Find user with password field
    const user = await User.findOne({ email }).select("+password")
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id.toString(), // Convert ObjectId to string
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET || "your-secret-key-change-in-production",
      { expiresIn: "7d" },
    )

    res.json({
      success: true,
      token,
      user: {
        _id: user._id.toString(), // Return _id as string, not id
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/me", async (req, res) => {
  try {
    // Extract token from header
    const token = req.headers.authorization?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({ error: "No token provided" })
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key-change-in-production")

    // Get user
    const user = await User.findById(decoded.userId).populate("currentServer subscription")
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      success: true,
      user: {
        _id: user._id.toString(), // Return _id as string, not id
        email: user.email,
        name: user.name,
        role: user.role,
        uuid: user.uuid,
        currentServer: user.currentServer,
        subscription: user.subscription,
        trafficLimit: user.trafficLimit,
        trafficUsed: user.trafficUsed,
        status: user.status,
        ethWalletAddress: user.ethWalletAddress, // Include ETH wallet address in response
      },
    })
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" })
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" })
    }
    res.status(500).json({ error: error.message })
  }
})

export default router
