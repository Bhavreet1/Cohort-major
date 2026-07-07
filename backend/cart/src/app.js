const express = require('express');
const cookieParser = require("cookie-parser");
const app = express();
const cartRoutes = require("./routes/cart.routes");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


app.use("/api/cart", cartRoutes);

module.exports= app;
