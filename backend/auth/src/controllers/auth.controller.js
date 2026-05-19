const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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

        const comparePassword= await bcrypt.compare(password,user.password);

        if(!comparePassword){
            return res.status(401).json({message:"Invalid Password"});
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
        return res.status(500).json({message:"Internal server error"});
    }
}

module.exports = {
    registerUser,
    loginUser
};
