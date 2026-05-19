const express = require('express');
const { registerUser , loginUser } = require('../controllers/auth.controller');
const validators = require('../middlewares/validator.middleware');

const router = express.Router();

router.post('/register', validators.registerUserValidations, registerUser);
router.post('/login',validators.loginUserValidations,loginUser);

module.exports = router;
