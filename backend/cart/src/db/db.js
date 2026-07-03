const mongoose = require("mongoose");

async function connectDB(){
    try{
        const connectionInstance = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`MongoDB connected at ${connectionInstance.connection.host}`);
    }catch(error){
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
}

module.exports = connectDB;