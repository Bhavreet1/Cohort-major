const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const { cookie } = require('express-validator');
const jwt = require('jsonwebtoken');
const redis = require('../db/redis');
const mongoose = require('mongoose');

const registerUser = async (req, res) => {
    try {
        const { username, email, password, fullName, role, addresses } = req.body;

        if (!username || !email || !password || !fullName || !fullName.firstName || !fullName.lastName) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            fullName,
            role: role || 'user',
            addresses: addresses || []
        });

        await newUser.save();

        const accessToken = jwt.sign(
            {
                _id: newUser._id,
                email: newUser.email,
                username: newUser.username,
                role: newUser.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '3d' }
        );

        const userResponse = newUser.toObject();
        delete userResponse.password;

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: true, // only send over HTTPS
            sameSite: 'strict', // prevent CSRF
            maxAge: 3 * 24 * 60 * 60 * 1000 // 3 days in milliseconds
        });

        res.status(201).json({ message: 'User registered successfully', user: userResponse });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username) {
            return res.status(400).json({ message: 'Username is required' });
        }
        if (!password) {
            return res.status(400).json({ message: 'Password is required' });
        }

        const user = await User.findOne({ username }).select('+password');

        if (!user) {
            return res.status(404).json({ message: "User not found" })
        }

        const comparePassword = await bcrypt.compare(password, user.password);

        if (!comparePassword) {
            return res.status(401).json({ message: "Invalid Password" });
        }

        const accessToken = jwt.sign(
            {
                _id: user._id,
                email: user.email,
                username: user.username,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '3d' }
        );

        const userResponse = user.toObject();
        delete userResponse.password;

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: true, // only send over HTTPS
            sameSite: 'strict', // prevent CSRF
            maxAge: 3 * 24 * 60 * 60 * 1000 // 3 days in milliseconds
        });

        return res.status(200).json({ message: 'User logged in successfully', user: userResponse });


    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

const getCurrentUser = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(404).json({ message: "User not found" })
        }
        const userResponse = user.toObject();
        delete userResponse.password;
        return res.status(200).json({ message: "User found successfully", user: userResponse })
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

const logoutUser = async (req, res) => {
    try {
        const token = req.cookies.accessToken;

        if (token) {
            await redis.set(`blacklisted:${token}`, true, 'EX', 3 * 24 * 60 * 60);
        }

        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'strict'
        });

        return res.status(200).json({ message: 'User logged out successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getUserAddress = async (req, res) => {
    try {
        const id = req.user.id;
        const user = await User.findById(id).select("addresses");
        if (!user) {
            return res.status(404).json({ message: "User not found" })
        }
        return res.status(200).json({ message: "User address found successfully", address: user.addresses })
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Internal server error" });
    }
}

const addAddress = async (req, res) => {
    try {
        const { street, city, state, zipCode, country } = req.body;
        const user = req.user;

        user.addresses.push({ street, city, state, zipCode, country });
        await user.save();

        return res.status(200).json({
            message: "Address added successfully",
            address: user.addresses[user.addresses.length - 1],
            addresses: user.addresses
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = req.user;

        if (!mongoose.Types.ObjectId.isValid(addressId)) {
            return res.status(400).json({ message: "Invalid Address ID format" });
        }

        let address;
        try {
            address = user.addresses.id(addressId);
        } catch (err) {
            return res.status(400).json({ message: "Invalid Address ID format" });
        }

        if (!address) {
            return res.status(404).json({ message: "Address not found" });
        }

        user.addresses.pull(addressId);
        await user.save();

        return res.status(200).json({
            message: "Address deleted successfully",
            addresses: user.addresses
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getCurrentUser,
    logoutUser,
    getUserAddress,
    addAddress,
    deleteAddress
};
