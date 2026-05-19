const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth.routes');
const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/auth', authRoutes);
app.use((req,res)=>{
    res.status(404).json({message:"Welcome to the app. Path Not Found"});
})

module.exports = app;