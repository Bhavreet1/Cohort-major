const express = require('express');
const cookieParser = require('cookie-parser');
const productRoutes = require("./routes/products.routes")
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use("/api/product",productRoutes)
module.exports = app;