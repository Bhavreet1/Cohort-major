const app = require("./src/app");
const connectDB = require("./src/db/db");
require("dotenv").config();


const PORT = process.env.PORT || 3002;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(err => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
});