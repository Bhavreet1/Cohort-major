const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const redis = require("../db/redis");

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies.accessToken;
        if (!token) {
            return res.status(401).json({ message: "Unauthorized" })
        }

        // Check if token is in blacklist
        const isBlacklisted = await redis.get(`blacklisted:${token}`);
        if (isBlacklisted) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decodedToken._id || decodedToken.id;
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User Not Found" })
        }
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "Unauthorized" });
        }
        return res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { authMiddleware }