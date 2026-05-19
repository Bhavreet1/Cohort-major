const app = require('./src/app');
const { connectDB } = require('./src/db/db');
const dotenv = require('dotenv');

dotenv.config();
connectDB();

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});