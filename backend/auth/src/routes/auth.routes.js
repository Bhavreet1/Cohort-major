const express = require('express');
const { registerUser, loginUser, getCurrentUser, logoutUser } = require('../controllers/auth.controller');
const validators = require('../middlewares/validator.middleware');
const {authMiddleware} = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/register', validators.registerUserValidations, registerUser);

//
router.post('/login',validators.loginUserValidations,loginUser);


// GET /api/auth/me
router.get('/me',authMiddleware,getCurrentUser);
router.post('/logout',authMiddleware,logoutUser);

module.exports = router;
