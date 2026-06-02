const mongoose = require('mongoose');
async function connectDB() {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}`);
        console.log("Connected to MongoDB successfully");
    } catch (err) {
        console.log("MongoDB connection error:", err);
    }
}
module.exports = connectDB;