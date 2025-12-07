import express from "express"
import User from "../models/User.js"

const router = express.Router()

// Get all users
router.get("/", async (req, res) => {
  try {
    const users = await User.find()
    res.json(users)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get user by ID
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }
    res.json({ user })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// These endpoints are now handled by subscription-specific routes in subscriptions.js
// router.post("/", async (req, res) => { ... })
// router.delete("/:id", async (req, res) => { ... })
// router.post("/:id/select-server/:serverId", async (req, res) => { ... })
// router.get("/:id/stats", async (req, res) => { ... })
// router.get("/:id/config", async (req, res) => { ... })
// router.get("/:id/subscription", async (req, res) => { ... })
// router.post("/bulk", async (req, res) => { ... })

export default router
