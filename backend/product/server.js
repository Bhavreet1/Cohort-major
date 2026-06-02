const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("./src/db/db");
connectDB();

const app = require("./src/app");

app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});
