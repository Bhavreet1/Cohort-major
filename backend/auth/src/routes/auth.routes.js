const express = require('express');
const { registerUser , loginUser } = require('../controllers/auth.controller');
const validators = require('../middlewares/validator.middleware');
const {authMiddleware} = require('../middlewares/auth.middleware');
const { getCurrentUser } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', validators.registerUserValidations, registerUser);

//
router.post('/login',validators.loginUserValidations,loginUser);


// GET /api/auth/me
router.get('/me',authMiddleware,getCurrentUser);
router.post('/logout',authMiddleware,loginUser);

module.exports = router;
