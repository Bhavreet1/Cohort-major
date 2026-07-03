const app = require("./src/app");
const connectDB = require("./src/db/db");
require("dotenv").config();


const PORT = process.env.PORT || 3002;

connectDB()
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});