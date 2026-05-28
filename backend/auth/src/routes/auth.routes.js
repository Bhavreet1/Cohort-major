const express = require('express');
const { registerUser, loginUser, getCurrentUser, logoutUser, getUserAddress, addAddress, deleteAddress } = require('../controllers/auth.controller');
const validators = require('../middlewares/validator.middleware');
const {authMiddleware} = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/register', validators.registerUserValidations, registerUser);

//
router.post('/login',validators.loginUserValidations,loginUser);


// GET /api/auth/me
router.get('/me',authMiddleware,getCurrentUser);
router.post('/logout', authMiddleware, logoutUser);
router.get("/users/me/address", authMiddleware, getUserAddress);
router.post("/users/me/address", authMiddleware, validators.addAddressValidations, addAddress);
router.delete("/users/me/address/:addressId", authMiddleware, deleteAddress);


module.exports = router;
